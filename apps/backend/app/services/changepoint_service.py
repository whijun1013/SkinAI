import asyncio
import logging
import math
import os
from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.analysis import UserChangepoint
from app.models.behavior import DailyBehaviorLog
from app.models.cosmetic import UserCosmetic
from app.models.environment import EnvironmentLog
from app.models.medication import UserMedication
from app.models.user import User
from app.mongo import get_multiple_skin_ai_results
from app.models.skin_log import SkinLog
from app.services.medgemma_service import ordinal_signal_to_score

logger = logging.getLogger(__name__)

# CUSUM 파라미터
_CUSUM_K = float(os.getenv("CUSUM_K", "0.5"))           # allowance (slack)
_CUSUM_H = float(os.getenv("CUSUM_H", "4.0"))           # decision threshold
_SKIN_CUSUM_K = float(os.getenv("MEDGEMMA_CUSUM_K", "0.25"))
_SKIN_CUSUM_H = float(os.getenv("MEDGEMMA_CUSUM_H", "1.5"))
# 행동/환경 연속형 요인용 별도 임계값: 피부 신호보다 노이즈가 많으므로 더 보수적으로 설정
# 일시적 등락(2~3일 저조 후 회복 등)이 오탐으로 before_after 모드를 트리거하지 않도록 H를 높게 유지
_FACTOR_CUSUM_K = float(os.getenv("FACTOR_CUSUM_K", "1.0"))
_FACTOR_CUSUM_H = float(os.getenv("FACTOR_CUSUM_H", "6.0"))
_MIN_DATA_DAYS = int(os.getenv("CHANGEPOINT_MIN_DAYS", "7"))
_MIN_SEGMENT_DAYS = int(os.getenv("CHANGEPOINT_MIN_SEGMENT_DAYS", "3"))
_DEFAULT_LOOKBACK = int(os.getenv("CHANGEPOINT_LOOKBACK_DAYS", "14"))

SKIN_SIGNALS = ("active_lesion", "redness", "barrier")

# 연속형 요인 컬럼 매핑: factor_key → (모델, 컬럼 속성)
_BEHAVIOR_FACTORS: dict[str, Any] = {
    "sleep_hours": DailyBehaviorLog.sleep_hours,
    "stress_level": DailyBehaviorLog.stress_level,
}
_ENVIRONMENT_FACTORS: dict[str, Any] = {
    "uv_index": EnvironmentLog.uv_index,
    "pm10": EnvironmentLog.pm10,
    "pm25": EnvironmentLog.pm25,
}


# ---------------------------------------------------------------------------
# CUSUM (후향적 양방향 변화점 감지)
# ---------------------------------------------------------------------------

def _standardize(series: list[float]) -> list[float]:
    mean = sum(series) / len(series)
    variance = sum((value - mean) ** 2 for value in series) / len(series)
    stddev = math.sqrt(variance)
    if stddev == 0:
        return [0.0] * len(series)
    return [(value - mean) / stddev for value in series]


def _cusum(
    series: list[float],
    k: float = _CUSUM_K,
    h: float = _CUSUM_H,
    *,
    standardize: bool = False,
) -> int | None:
    """
    전체 평균 기준 누적합의 최대 이탈 지점으로 변화 시작 인덱스를 찾는다.

    후보 경계의 전·후 구간이 각각 최소 3일이어야 하며, 평균 차이가 k 이상이고
    누적 이탈량이 h를 초과해야 한다. 상승과 하강을 모두 감지한다.
    """
    if len(series) < _MIN_DATA_DAYS:
        return None

    values = _standardize(series) if standardize else [float(value) for value in series]
    total = sum(values)
    mean = total / len(values)
    running_sum = 0.0
    best_split: int | None = None
    best_magnitude = 0.0
    best_running_sum = 0.0

    for split, value in enumerate(values[:-1], start=1):
        running_sum += value
        cumulative = running_sum - split * mean
        magnitude = abs(cumulative)
        if magnitude > best_magnitude:
            best_split = split
            best_magnitude = magnitude
            best_running_sum = running_sum

    if best_split is None:
        return None
    if (
        best_split < _MIN_SEGMENT_DAYS
        or len(values) - best_split < _MIN_SEGMENT_DAYS
    ):
        return None

    left_mean = best_running_sum / best_split
    right_mean = (total - best_running_sum) / (len(values) - best_split)
    mean_shift = abs(left_mean - right_mean)
    if mean_shift < k or best_magnitude <= h:
        return None

    return best_split


# ---------------------------------------------------------------------------
# 피부 신호 변화점
# ---------------------------------------------------------------------------

async def _detect_skin_changepoints(
    db: Session,
    user_id: int,
    until: date,
) -> dict[str, date]:
    """
    신호별 변화점 날짜 반환. 감지되지 않으면 해당 키 없음.
    MongoDB에서 skin_ai_results를 읽어 CUSUM 적용.
    """
    start = until - timedelta(days=_DEFAULT_LOOKBACK * 2)

    rows = (
        db.query(SkinLog.id, SkinLog.logged_at)
        .filter(
            SkinLog.user_id == user_id,
            SkinLog.logged_at >= start,
            SkinLog.logged_at < until,
        )
        .order_by(SkinLog.logged_at)
        .all()
    )
    if not rows:
        return {}

    skin_log_ids = [r.id for r in rows]
    dates = [r.logged_at for r in rows]

    docs = await get_multiple_skin_ai_results(skin_log_ids)

    result: dict[str, date] = {}
    for signal in SKIN_SIGNALS:
        series: list[float] = []
        series_dates: list[date] = []
        for sid, d in zip(skin_log_ids, dates):
            doc = docs.get(sid)
            if doc and doc.get("signals"):
                score = ordinal_signal_to_score(doc["signals"].get(signal))
                if score is not None:
                    series.append(float(score))
                    series_dates.append(d)

        idx = _cusum(series, k=_SKIN_CUSUM_K, h=_SKIN_CUSUM_H)
        if idx is not None:
            result[signal] = series_dates[idx]

    return result


# ---------------------------------------------------------------------------
# 연속형 요인 변화점 (MySQL)
# ---------------------------------------------------------------------------

def _fetch_factor_series(
    db: Session,
    user_id: int,
    until: date,
    model_cls: Any,
    col: Any,
) -> tuple[list[float], list[date]]:
    start = until - timedelta(days=_DEFAULT_LOOKBACK * 2)
    rows = (
        db.query(model_cls.logged_at, col)
        .filter(
            model_cls.user_id == user_id,
            model_cls.logged_at >= start,
            model_cls.logged_at < until,
            col.isnot(None),
        )
        .order_by(model_cls.logged_at)
        .all()
    )
    dates = [r[0] for r in rows]
    values = [float(r[1]) for r in rows]
    return values, dates


def _detect_continuous_factor_changepoints(
    db: Session,
    user_id: int,
    until: date,
) -> dict[str, tuple[date, str]]:
    """
    연속형 요인별 (변화점 날짜, analysis_method) 반환.
    변화점 있으면 before_after, 없으면 daily_correlation.
    """
    result: dict[str, tuple[date, str]] = {}

    all_factors = {
        **{k: (DailyBehaviorLog, v) for k, v in _BEHAVIOR_FACTORS.items()},
        **{k: (EnvironmentLog, v) for k, v in _ENVIRONMENT_FACTORS.items()},
    }

    for factor_key, (model_cls, col) in all_factors.items():
        values, dates = _fetch_factor_series(db, user_id, until, model_cls, col)
        if not values:
            continue

        idx = _cusum(
            values,
            k=_FACTOR_CUSUM_K,
            h=_FACTOR_CUSUM_H,
            standardize=True,
        )
        if idx is not None:
            result[factor_key] = (dates[idx], "before_after")
        else:
            # 데이터가 충분하면 daily_correlation으로 등록
            if len(values) >= _MIN_DATA_DAYS:
                result[factor_key] = (dates[-1], "daily_correlation")

    return result


# ---------------------------------------------------------------------------
# 이벤트형 요인 (화장품/약품 started_at)
# ---------------------------------------------------------------------------

def _detect_event_changepoints(
    db: Session,
    user_id: int,
) -> dict[str, date]:
    """
    화장품·약품 started_at을 변화점 날짜로 반환.
    factor_key = "cosmetic_{id}" / "medication_{id}"
    """
    result: dict[str, date] = {}

    cosmetics = (
        db.query(UserCosmetic.id, UserCosmetic.started_at)
        .filter(
            UserCosmetic.user_id == user_id,
            UserCosmetic.started_at.isnot(None),
        )
        .all()
    )
    for uc_id, started_at in cosmetics:
        result[f"cosmetic_{uc_id}"] = started_at

    medications = (
        db.query(UserMedication.id, UserMedication.started_at)
        .filter(
            UserMedication.user_id == user_id,
            UserMedication.started_at.isnot(None),
        )
        .all()
    )
    for um_id, started_at in medications:
        result[f"medication_{um_id}"] = started_at

    return result


# ---------------------------------------------------------------------------
# window_start_date 결정
# ---------------------------------------------------------------------------

def _determine_window_start(
    skin_changepoints: dict[str, date],
    today: date,
) -> date:
    """
    피부 신호 변화점이 있으면 가장 최근 날짜, 없으면 기본 14일 전.
    """
    if skin_changepoints:
        return max(skin_changepoints.values())
    return today - timedelta(days=_DEFAULT_LOOKBACK)


# ---------------------------------------------------------------------------
# 사용자 단위 실행
# ---------------------------------------------------------------------------

async def run_changepoint_detection_for_user(db: Session, user_id: int) -> None:
    today = date.today()
    until = today  # 전날까지 = logged_at < today

    try:
        # 기존 row 전체 삭제
        db.query(UserChangepoint).filter(UserChangepoint.user_id == user_id).delete()
        db.flush()

        skin_cps = await _detect_skin_changepoints(db, user_id, until)
        window_start = _determine_window_start(skin_cps, today)

        rows: list[UserChangepoint] = []

        # 피부 신호 변화점 row
        if skin_cps:
            for signal, cp_date in skin_cps.items():
                rows.append(UserChangepoint(
                    user_id=user_id,
                    detected_at=today,
                    window_start_date=window_start,
                    changepoint_date=cp_date,
                    signal=signal,
                    factor_key=None,
                    analysis_method=None,
                ))
        else:
            # 변화점 없음 — null row 1개 저장 (fallback 14일)
            rows.append(UserChangepoint(
                user_id=user_id,
                detected_at=today,
                window_start_date=window_start,
                changepoint_date=None,
                signal=None,
                factor_key=None,
                analysis_method=None,
            ))

        # 연속형 요인 변화점 row
        continuous_cps = _detect_continuous_factor_changepoints(db, user_id, until)
        for factor_key, (cp_date, method) in continuous_cps.items():
            rows.append(UserChangepoint(
                user_id=user_id,
                detected_at=today,
                window_start_date=window_start,
                changepoint_date=cp_date,
                signal=None,
                factor_key=factor_key,
                analysis_method=method,
            ))

        # 이벤트형 요인 row (화장품/약품)
        event_cps = _detect_event_changepoints(db, user_id)
        for factor_key, cp_date in event_cps.items():
            rows.append(UserChangepoint(
                user_id=user_id,
                detected_at=today,
                window_start_date=window_start,
                changepoint_date=cp_date,
                signal=None,
                factor_key=factor_key,
                analysis_method="before_after",
            ))

        db.bulk_save_objects(rows)
        db.commit()
        logger.info("[changepoint] user_id=%d rows=%d window_start=%s", user_id, len(rows), window_start)

    except Exception:
        db.rollback()
        logger.exception("[changepoint] 실패 user_id=%d", user_id)


# ---------------------------------------------------------------------------
# 전체 사용자 대상 일괄 실행 (스케줄러 진입점)
# ---------------------------------------------------------------------------

def run_daily_changepoint_detection() -> None:
    """APScheduler에서 동기적으로 호출되는 진입점."""
    db = SessionLocal()
    try:
        user_ids = [row[0] for row in db.query(User.id).all()]
    except Exception:
        logger.exception("[changepoint] 사용자 목록 조회 실패")
        db.close()
        return

    logger.info("[changepoint] 일별 변화점 감지 시작 — 대상 %d명", len(user_ids))

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    for user_id in user_ids:
        try:
            loop.run_until_complete(run_changepoint_detection_for_user(db, user_id))
        except Exception:
            logger.exception("[changepoint] user_id=%d 처리 중 예외", user_id)

    db.close()
    logger.info("[changepoint] 일별 변화점 감지 완료")


# ---------------------------------------------------------------------------
# P2/P3에서 변화점 결과 조회
# ---------------------------------------------------------------------------

def get_user_changepoint_summary(db: Session, user_id: int) -> dict:
    """
    오늘 감지 결과에서 신호별/요인별 변화점과 요인별 분석 방법을 반환한다.

    window_start_date는 기존 소비자 호환을 위해 유지하지만 분석 창 제어에는
    사용하지 않는다. 분석 요청의 증거 범위는 항상 기준일 포함 최근 14일이다.
    """
    today = date.today()
    rows = (
        db.query(UserChangepoint)
        .filter(
            UserChangepoint.user_id == user_id,
            UserChangepoint.detected_at == today,
        )
        .all()
    )

    if not rows:
        return {
            "window_start_date": today - timedelta(days=_DEFAULT_LOOKBACK),
            "signal_changepoints": {},
            "factor_methods": {},
            "factor_changepoints": {},
        }

    window_start = rows[0].window_start_date
    signal_changepoints: dict[str, date] = {}
    factor_methods: dict[str, str] = {}
    factor_changepoints: dict[str, date] = {}
    for row in rows:
        if row.signal and row.changepoint_date:
            signal_changepoints[row.signal] = row.changepoint_date
        if row.factor_key and row.analysis_method:
            factor_methods[row.factor_key] = row.analysis_method
            if row.changepoint_date:
                factor_changepoints[row.factor_key] = row.changepoint_date

    return {
        "window_start_date": window_start,
        "signal_changepoints": signal_changepoints,
        "factor_methods": factor_methods,
        "factor_changepoints": factor_changepoints,
    }
