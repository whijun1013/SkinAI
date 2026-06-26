import logging
import asyncio
from datetime import date, datetime, timedelta
from numbers import Real
from typing import Any, Dict, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.concern_note import normalize_concern_note
from app.database import SessionLocal, disconnect_mongo
from app.models.behavior import DailyBehaviorLog
from app.models.cosmetic import UserCosmetic
from app.models.diet import DietLog
from app.models.environment import EnvironmentLog
from app.models.medication import UserMedication
from app.models.analysis import AgentResult, AnalysisRequest, AnalysisResult
from app.models.skin_log import SkinLog
from app.mongo import get_skin_ai_result, get_multiple_skin_ai_results
from app.services.analysis_context_builder import build_analysis_context
from app.services.analysis_llm_service import analyze_with_llm
from app.services.analysis_exceptions import (
    AnalysisLLMResponseError,
    DuplicateAnalysisRequestError,
    InsufficientSkinLogError,
    ReanalysisLockedError,
    SkinTendencyLLMError,
    SkinTendencyLLMResponseError,
    SkinLogNotFoundError,
)
from app.services.aggregation import select_confirmed_skin_logs
from app.services.changepoint_service import get_user_changepoint_summary
from app.services.profile_updater import update_user_profile_from_agent_results
from app.services.skin_tendency_updater import update_skin_tendency_if_needed
from app.services.notification_sender import send_notification_event

logger = logging.getLogger(__name__)

DISCLAIMER = "이 결과는 의학적 진단이 아닌 참고용 관찰 정보입니다."
# done은 중복 차단 대상에서 제외 — stale 기록 기준 재분석 허용
ACTIVE_STATUSES = ("pending", "processing")
BASE_ANALYSIS_LOOKBACK_DAYS = 14


def run_analysis(
    db: Session,
    user_id: int,
    skin_log_id: int,
    lookback_days: int | None = None,
    concern_note: str | None = None,
) -> AnalysisRequest:
    request = create_analysis_request(
        db,
        user_id=user_id,
        skin_log_id=skin_log_id,
        lookback_days=lookback_days,
        concern_note=concern_note,
    )
    process_analysis_request(db, request.id)
    db.refresh(request)
    return request


def create_analysis_request(
    db: Session,
    user_id: int,
    skin_log_id: int,
    lookback_days: int | None = None,
    concern_note: str | None = None,
) -> AnalysisRequest:
    skin_log = _get_owned_skin_log(db, user_id, skin_log_id)
    _ensure_no_duplicate_request(db, user_id, skin_log_id)
    concern_note = normalize_concern_note(concern_note)

    # P2/P3와 LLM은 기준일을 포함한 최근 14일을 공통 증거 범위로 사용한다.
    # CUSUM 변화점은 분석 창을 자르지 않고 신호 변화 시점 메타데이터로만 전달한다.
    lookback_days = BASE_ANALYSIS_LOOKBACK_DAYS

    _ensure_enough_skin_log_days(
        db,
        user_id,
        skin_log.logged_at,
        BASE_ANALYSIS_LOOKBACK_DAYS,
    )
    _ensure_reanalysis_cooldown(db, user_id, skin_log.logged_at)

    request = AnalysisRequest(
        user_id=user_id,
        skin_log_id=skin_log_id,
        lookback_days=lookback_days,
        concern_note=concern_note,
        status="pending",
    )
    db.add(request)
    db.commit()
    # selectinload로 재조회해서 skin_log 관계를 즉시 로드 → _get_base_date가 올바른 날짜 반환
    request = (
        db.query(AnalysisRequest)
        .options(selectinload(AnalysisRequest.skin_log))
        .filter(AnalysisRequest.id == request.id)
        .first()
    )
    return request


def process_analysis_request_by_id(request_id: int) -> None:
    db = SessionLocal()
    try:
        process_analysis_request(db, request_id)
    except Exception:
        logger.exception("background analysis processing failed", extra={"request_id": request_id})
    finally:
        db.close()


from app.services.concern_factor_extractor import extract_concern_factors
from app.services.concern_verdict_service import evaluate_concern_verdicts
from app.services.pattern_discovery import discover_patterns


def _resolve_analysis_window_start(
    target_date: date | datetime,
    candidate_start: date | datetime | None,
) -> date:
    """호환용 헬퍼: 변화점과 무관하게 기준일 포함 최근 14일의 시작일을 반환한다."""
    if isinstance(target_date, datetime):
        target_date = target_date.date()
    return target_date - timedelta(days=BASE_ANALYSIS_LOOKBACK_DAYS - 1)

def process_analysis_request(db: Session, request_id: int) -> AnalysisRequest:
    request = db.query(AnalysisRequest).filter(AnalysisRequest.id == request_id).first()
    if request is None:
        raise SkinLogNotFoundError("analysis request not found")
    skin_log = _get_owned_skin_log(db, request.user_id, request.skin_log_id)
    request_id = request.id
    updated_factors = []

    try:
        request.status = "processing"
        db.commit()

        recent_log_ids = _get_recent_skin_log_ids(
            db,
            request.user_id,
            skin_log.logged_at,
            BASE_ANALYSIS_LOOKBACK_DAYS,
        )
        medgemma_handoffs = _get_medgemma_handoffs(recent_log_ids)

        context = build_analysis_context(
            db,
            request.user_id,
            request.skin_log_id,
            lookback_days=BASE_ANALYSIS_LOOKBACK_DAYS,
            medgemma_handoffs=medgemma_handoffs,
        )

        # 요인별 분석 방법과 변화점 날짜는 유지하되 분석 창은 최근 14일로 고정한다.
        cp_summary = get_user_changepoint_summary(db, request.user_id)
        context["factor_methods"] = cp_summary["factor_methods"]
        context["factor_changepoints"] = cp_summary["factor_changepoints"]
        context["signal_changepoints"] = cp_summary.get("signal_changepoints", {})
        context["lookback_days"] = BASE_ANALYSIS_LOOKBACK_DAYS
        context["analysis_window_start_date"] = (
            skin_log.logged_at - timedelta(days=BASE_ANALYSIS_LOOKBACK_DAYS - 1)
        ).isoformat()
        if normalized_concern_note := normalize_concern_note(request.concern_note):
            context["concern_note"] = normalized_concern_note

        # P2: Extract factors from concern note and compute verdicts
        extracted_factors = extract_concern_factors(normalized_concern_note)
        concern_verdicts = evaluate_concern_verdicts(extracted_factors, context)
        context["concern_verdicts"] = concern_verdicts

        # P3: Discover hidden patterns, excluding factor keys already covered by P2
        p2_factor_keys = {v["factor_key"] for v in concern_verdicts if v.get("factor_key")}
        discovered_patterns = discover_patterns(context, excluded_factor_keys=p2_factor_keys)
        context["discovered_patterns"] = discovered_patterns

        llm_result = analyze_with_llm(context)

        llm_result["concern_verdicts"] = concern_verdicts
        llm_result["discovered_patterns"] = discovered_patterns
        result = _build_result(request_id, llm_result)
        db.add(result)
        
        agent_results = _build_agent_results(request_id, llm_result.get("agent_results") or [])
        db.add_all(agent_results)
        if agent_results:
            updated_factors = update_user_profile_from_agent_results(
                db=db,
                user_id=request.user_id,
                agent_results=llm_result.get("agent_results") or [],
                skin_log_logged_at=skin_log.logged_at,
            )

        request.status = "done"
        db.commit()
        _send_analysis_complete_notification(db, request, result, skin_log.logged_at)
    except Exception:
        db.rollback()
        failed_request = db.query(AnalysisRequest).filter(AnalysisRequest.id == request_id).first()
        if failed_request is not None:
            failed_request.status = "failed"
            db.commit()
            _send_analysis_failed_notification(db, failed_request, skin_log.logged_at)
        raise

    try:
        updated = update_skin_tendency_if_needed(db, request.user_id, updated_factors)
        if updated:
            db.commit()
    except (SkinTendencyLLMError, SkinTendencyLLMResponseError):
        db.rollback()
        logger.exception("skin_tendency update failed")
    except Exception:
        db.rollback()
        logger.exception("unexpected skin_tendency update failed")

    db.refresh(request)
    return request


def get_analysis_request(db: Session, user_id: int, request_id: int) -> AnalysisRequest:
    request = (
        db.query(AnalysisRequest)
        .filter(AnalysisRequest.id == request_id, AnalysisRequest.user_id == user_id)
        .first()
    )
    if request is None:
        raise SkinLogNotFoundError("analysis request not found")
    return request


def list_analysis_requests(db: Session, user_id: int, limit: int):
    return (
        db.query(AnalysisRequest)
        .options(
            selectinload(AnalysisRequest.analysis_result),
            selectinload(AnalysisRequest.skin_log),
        )
        .filter(AnalysisRequest.user_id == user_id)
        .order_by(AnalysisRequest.requested_at.desc(), AnalysisRequest.id.desc())
        .limit(limit)
        .all()
    )


def get_analysis_progress(db: Session, user_id: int, request_id: int) -> dict[str, Any]:
    request = get_analysis_request(db, user_id, request_id)
    skin_log = _get_owned_skin_log(db, user_id, request.skin_log_id)
    end_date = skin_log.logged_at
    lookback_days = request.lookback_days or 14
    start_date = end_date - timedelta(days=lookback_days - 1)

    skin_rows = select_confirmed_skin_logs(db, user_id, lookback_days, end_date)
    skin_dates = {row.logged_at for row in skin_rows}

    diet_dates = {
        row[0]
        for row in (
            db.query(func.date(DietLog.logged_at))
            .filter(
                DietLog.user_id == user_id,
                func.date(DietLog.logged_at) >= start_date,
                func.date(DietLog.logged_at) <= end_date,
            )
            .distinct()
            .all()
        )
    }
    behavior_dates = {
        row[0]
        for row in (
            db.query(DailyBehaviorLog.logged_at)
            .filter(
                DailyBehaviorLog.user_id == user_id,
                DailyBehaviorLog.logged_at >= start_date,
                DailyBehaviorLog.logged_at <= end_date,
            )
            .distinct()
            .all()
        )
    }
    environment_dates = {
        row[0]
        for row in (
            db.query(EnvironmentLog.logged_at)
            .filter(
                EnvironmentLog.user_id == user_id,
                EnvironmentLog.logged_at >= start_date,
                EnvironmentLog.logged_at <= end_date,
            )
            .distinct()
            .all()
        )
    }

    return {
        "request_id": request.id,
        "status": request.status,
        "lookback_days": lookback_days,
        "summary": {
            "skin_days": len(skin_dates),
            "diet_days": len(diet_dates),
            "behavior_days": len(behavior_dates),
            "environment_days": len(environment_dates),
            "current_cosmetics": db.query(UserCosmetic)
            .filter(UserCosmetic.user_id == user_id, UserCosmetic.is_current.is_(True))
            .count(),
            "current_medications": db.query(UserMedication)
            .filter(UserMedication.user_id == user_id, UserMedication.is_current.is_(True))
            .count(),
        },
        "skin_timeline": [
            {
                "date": row.logged_at.isoformat(),
                "score": row.overall_score,
            }
            for row in skin_rows
        ],
    }


def _send_analysis_complete_notification(
    db: Session,
    request: AnalysisRequest,
    result: AnalysisResult,
    base_date,
) -> None:
    try:
        send_notification_event(
            db,
            user_id=request.user_id,
            notification_type="analysis_complete",
            dedupe_key=f"analysis_complete:{request.id}",
            title="AI 분석이 완료됐어요",
            body="최근 기록을 바탕으로 참고 인사이트가 준비됐어요.",
            target_type="analysis_request",
            target_id=request.id,
            data={
                "type": "analysis_complete",
                "screen": "report",
                "analysis_request_id": request.id,
                "analysis_result_id": result.id,
                "base_date": base_date.isoformat(),
            },
        )
    except Exception:
        db.rollback()
        logger.warning(
            "analysis complete notification failed",
            extra={"request_id": request.id},
        )


def _send_analysis_failed_notification(db: Session, request: AnalysisRequest, base_date) -> None:
    try:
        send_notification_event(
            db,
            user_id=request.user_id,
            notification_type="analysis_failed",
            dedupe_key=f"analysis_failed:{request.id}",
            title="분석 생성이 완료되지 않았어요",
            body="다시 시도해볼 수 있어요.",
            target_type="analysis_request",
            target_id=request.id,
            data={
                "type": "analysis_failed",
                "screen": "report",
                "analysis_request_id": request.id,
                "base_date": base_date.isoformat(),
            },
        )
    except Exception:
        db.rollback()
        logger.warning(
            "analysis failed notification failed",
            extra={"request_id": request.id},
        )


def _get_owned_skin_log(db: Session, user_id: int, skin_log_id: int) -> SkinLog:
    skin_log = (
        db.query(SkinLog)
        .filter(
            SkinLog.id == skin_log_id,
            SkinLog.user_id == user_id,
            SkinLog.overall_score.isnot(None),
        )
        .first()
    )
    if skin_log is None:
        raise SkinLogNotFoundError("skin log not found")
    return skin_log


def _ensure_no_duplicate_request(db: Session, user_id: int, skin_log_id: int) -> None:
    existing = (
        db.query(AnalysisRequest)
        .filter(
            AnalysisRequest.user_id == user_id,
            AnalysisRequest.skin_log_id == skin_log_id,
            AnalysisRequest.status.in_(ACTIVE_STATUSES),
        )
        .first()
    )
    if existing is not None:
        raise DuplicateAnalysisRequestError("analysis request already exists")


REANALYSIS_COOLDOWN_DAYS = 7


def _ensure_enough_skin_log_days(
    db: Session,
    user_id: int,
    target_date,
    lookback_days: int,
) -> None:
    start_date = target_date - timedelta(days=lookback_days - 1)
    logged_dates = (
        db.query(SkinLog.logged_at)
        .filter(
            SkinLog.user_id == user_id,
            SkinLog.logged_at >= start_date,
            SkinLog.logged_at <= target_date,
            SkinLog.overall_score.isnot(None),
        )
        .distinct()
        .all()
    )
    if len({row[0] for row in logged_dates}) < 7:
        raise InsufficientSkinLogError("at least 7 skin log days are required")


def _ensure_reanalysis_cooldown(
    db: Session,
    user_id: int,
    new_base_date,
) -> None:
    """직전 완료 분석 기준일 이후 새 점수 입력일이 REANALYSIS_COOLDOWN_DAYS 미만이면 재분석 거부."""
    from app.models.analysis import AnalysisResult

    if isinstance(new_base_date, datetime):
        new_base_date = new_base_date.date()

    last = (
        db.query(AnalysisRequest)
        .join(AnalysisResult, AnalysisResult.request_id == AnalysisRequest.id)
        .filter(
            AnalysisRequest.user_id == user_id,
            AnalysisRequest.status == "done",
        )
        .order_by(AnalysisRequest.id.desc())
        .first()
    )
    if last is None:
        return

    last_base_date = last.skin_log.logged_at
    if isinstance(last_base_date, datetime):
        last_base_date = last_base_date.date()

    # 과거 날짜 분석 요청은 락 미적용 (이전 분석 기준일보다 이전이면 다른 데이터 구간)
    if new_base_date <= last_base_date:
        return

    new_days_count = (
        db.query(SkinLog.logged_at)
        .filter(
            SkinLog.user_id == user_id,
            SkinLog.logged_at > last_base_date,
            SkinLog.overall_score.isnot(None),
        )
        .distinct()
        .count()
    )

    if new_days_count < REANALYSIS_COOLDOWN_DAYS:
        raise ReanalysisLockedError(
            f"reanalysis locked: need {REANALYSIS_COOLDOWN_DAYS} new days, have {new_days_count}"
        )

def _get_recent_skin_log_ids(
    db: Session,
    user_id: int,
    target_date,
    lookback_days: int,
) -> list[int]:
    start_date = target_date - timedelta(days=lookback_days - 1)
    rows = (
        db.query(SkinLog.id)
        .filter(
            SkinLog.user_id == user_id,
            SkinLog.logged_at >= start_date,
            SkinLog.logged_at <= target_date,
            SkinLog.overall_score.isnot(None),
        )
        .all()
    )
    return [row[0] for row in rows]


def _get_medgemma_handoffs(skin_log_ids: list[int] | int) -> dict[int, dict]:
    if isinstance(skin_log_ids, int):
        skin_log_ids = [skin_log_ids]
    if not skin_log_ids:
        return {}
        
    async def _fetch_docs(ids: list[int]):
        # 로컬 클라이언트를 직접 생성해 global _mongo_client 이벤트 루프 바인딩 문제를 회피한다.
        from motor.motor_asyncio import AsyncIOMotorClient
        from app.database import MONGO_URL, MONGO_DB_NAME
        from app.mongo import _migrate_legacy_signals
        from datetime import timezone

        client = AsyncIOMotorClient(MONGO_URL)
        try:
            db = client[MONGO_DB_NAME]
            cursor = db["skin_ai_results"].find(
                {"skin_log_id": {"$in": ids}}, {"_id": 0}
            )
            docs = await cursor.to_list(length=None)
            results: dict[int, dict] = {}
            for doc in sorted(
                docs,
                key=lambda x: x.get("created_at") or datetime.min.replace(tzinfo=timezone.utc),
                reverse=True,
            ):
                sid = doc["skin_log_id"]
                if sid not in results:
                    results[sid] = _migrate_legacy_signals(doc)
            return results
        finally:
            client.close()

    try:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
            
        if loop and loop.is_running():
            logger.warning("[medgemma-handoff] Active event loop detected in sync _get_medgemma_handoffs. Attempting fallback via ThreadPoolExecutor.")
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(1) as pool:
                docs = pool.submit(asyncio.run, _fetch_docs(skin_log_ids)).result()
        else:
            docs = asyncio.run(_fetch_docs(skin_log_ids))
    except RuntimeError as e:
        logger.exception(f"[medgemma-handoff] RuntimeError in fetching MedGemma handoff (event loop issue): {e}")
        return {}
    except Exception as e:
        logger.exception(f"[medgemma-handoff] Exception in fetching MedGemma handoff: {e}")
        return {}
        
    result = {}
    for sid, doc in docs.items():
        if doc and doc.get("signals"):
            result[sid] = {
                "signals": doc["signals"],
                "photo_quality": doc.get("photo_quality", "pass"),
                "confidence": doc.get("confidence"),
                "model_version": doc.get("model_version"),
            }
    return result


def _build_result(request_id: int, llm_result: Dict[str, Any]) -> AnalysisResult:
    confidence_score = _validate_confidence_score(llm_result.get("confidence_score"))
    report_text = _normalize_report_text(llm_result.get("report_text"))

    return AnalysisResult(
        request_id=request_id,
        primary_cause=llm_result.get("primary_cause"),
        contributing_factors=llm_result.get("contributing_factors") or [],
        report_text=report_text,
        concern_verdicts=llm_result.get("concern_verdicts") or [],
        discovered_patterns=llm_result.get("discovered_patterns") or [],
        confidence_score=confidence_score,
    )


def _build_agent_results(request_id: int, agent_results: list[dict[str, Any]]) -> list[AgentResult]:
    return [
        AgentResult(
            request_id=request_id,
            agent_type=agent_result.get("agent_type"),
            suspicious_items=agent_result.get("suspicious_items") or [],
            reason=agent_result.get("reason"),
            confidence=agent_result.get("confidence"),
        )
        for agent_result in agent_results
    ]


def _validate_confidence_score(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, Real):
        raise AnalysisLLMResponseError("confidence_score must be a number")
    score = float(value)
    if score < 0.0 or score > 1.0:
        raise AnalysisLLMResponseError("confidence_score must be between 0.0 and 1.0")
    return score


_REPORT_TERM_KO: dict[str, str] = {
    "overall_score": "피부 종합 점수",
    "confirmed": "확인됨",
    "inconclusive": "불분명",
    "before_after": "전후 비교",
    "daily_correlation": "일별 상관",
}


def _normalize_report_text(value: Optional[str]) -> str:
    report_text = value or ""
    for en, ko in _REPORT_TERM_KO.items():
        report_text = report_text.replace(en, ko)
    report_text = report_text.replace(DISCLAIMER, "").strip()
    if report_text:
        return f"{report_text}\n\n{DISCLAIMER}"
    return DISCLAIMER
