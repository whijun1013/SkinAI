from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.models.behavior import DailyBehaviorLog
from app.models.cosmetic import UserCosmetic
from app.models.diet import DietLog, DietLogItem
from app.models.environment import EnvironmentLog
from app.models.medication import UserMedication
from app.models.skin_log import SkinLog
from app.schemas.report import (
    DailyFeatureBehaviorSummary,
    DailyFeatureDietSummary,
    DailyFeatureEnvironmentSummary,
    DailyFeatureProductSummary,
    DailyFeatureSkinSummary,
    DailyFeatureSummaryResponse,
)


RECENT_WINDOW_DAYS = 14


def build_daily_feature_summary(db: Session, user_id: int, target_date: date) -> DailyFeatureSummaryResponse:
    return DailyFeatureSummaryResponse(
        date=target_date,
        skin=_build_skin_summary(db, user_id, target_date),
        diet=_build_diet_summary(db, user_id, target_date),
        behavior=_build_behavior_summary(db, user_id, target_date),
        environment=_build_environment_summary(db, user_id, target_date),
        cosmetics=_build_cosmetics_summary(db, user_id, target_date),
        medications=_build_medications_summary(db, user_id, target_date),
    )


def _build_skin_summary(db: Session, user_id: int, target_date: date) -> DailyFeatureSkinSummary:
    skin_log = (
        db.query(SkinLog)
        .filter(SkinLog.user_id == user_id, SkinLog.logged_at == target_date)
        .order_by(SkinLog.id.desc())
        .first()
    )
    if skin_log is None:
        return DailyFeatureSkinSummary()

    return DailyFeatureSkinSummary(
        score=skin_log.overall_score,
        tags=_normalize_tags(skin_log.condition_tags),
        has_photo=bool(skin_log.photo_url),
        note=skin_log.note,
    )


def _build_diet_summary(db: Session, user_id: int, target_date: date) -> DailyFeatureDietSummary:
    day_start = datetime.combine(target_date, time.min)
    day_end = datetime.combine(target_date, time.max)
    logs = (
        db.query(DietLog)
        .options(joinedload(DietLog.items).joinedload(DietLogItem.food_item))
        .filter(
            DietLog.user_id == user_id,
            DietLog.logged_at >= day_start,
            DietLog.logged_at <= day_end,
        )
        .order_by(DietLog.logged_at.asc(), DietLog.id.asc())
        .all()
    )

    item_count = 0
    high_gi_count = 0
    dairy_count = 0
    meal_types: list[str] = []
    for log in logs:
        if log.meal_type and log.meal_type not in meal_types:
            meal_types.append(log.meal_type)
        for item in log.items:
            item_count += 1
            if item.food_item:
                factors = item.food_item.skin_factors or {}
                if isinstance(factors, dict):
                    if "high_gl_candidate" in factors:
                        high_gi_count += 1
                    if "dairy_confirmed" in factors:
                        dairy_count += 1
                else:
                    if any(f.get("key") == "high_gl_candidate" for f in factors):
                        high_gi_count += 1
                    if any(f.get("key") == "dairy_confirmed" for f in factors):
                        dairy_count += 1

    signals = []
    if high_gi_count:
        signals.append(f"고당지수 후보 {high_gi_count}건")
    if dairy_count:
        signals.append(f"유제품 후보 {dairy_count}건")
    if len(logs) >= 3:
        signals.append("식사 기록 충분")

    return DailyFeatureDietSummary(
        meal_count=len(logs),
        item_count=item_count,
        high_gi_count=high_gi_count,
        dairy_count=dairy_count,
        meal_types=meal_types,
        signals=signals,
    )


def _build_behavior_summary(db: Session, user_id: int, target_date: date) -> DailyFeatureBehaviorSummary:
    log = (
        db.query(DailyBehaviorLog)
        .filter(DailyBehaviorLog.user_id == user_id, DailyBehaviorLog.logged_at == target_date)
        .order_by(DailyBehaviorLog.id.desc())
        .first()
    )
    if log is None:
        return DailyFeatureBehaviorSummary()

    sleep_hours = _as_float(log.sleep_hours)
    signals = []
    if sleep_hours is not None and sleep_hours < 6:
        signals.append("수면 부족")
    if log.stress_level is not None and log.stress_level >= 4:
        signals.append("스트레스 높음")
    if log.exercise_yn is True:
        signals.append("운동 기록")
    if log.alcohol_yn is True:
        signals.append("음주 기록")
    if log.smoking_yn is True:
        signals.append("흡연 기록")

    return DailyFeatureBehaviorSummary(
        sleep_hours=sleep_hours,
        sleep_quality=log.sleep_quality,
        stress_level=log.stress_level,
        water_intake_ml=log.water_intake_ml,
        exercise_yn=log.exercise_yn,
        exercise_type=log.exercise_type,
        exercise_duration_min=log.exercise_duration_min,
        alcohol_yn=log.alcohol_yn,
        smoking_yn=log.smoking_yn,
        signals=signals,
    )


def _build_environment_summary(db: Session, user_id: int, target_date: date) -> DailyFeatureEnvironmentSummary:
    logs = (
        db.query(EnvironmentLog)
        .filter(EnvironmentLog.user_id == user_id, EnvironmentLog.logged_at == target_date)
        .order_by(EnvironmentLog.captured_at.desc(), EnvironmentLog.id.desc())
        .all()
    )
    if not logs:
        return DailyFeatureEnvironmentSummary()

    latest = logs[0]
    temperature = _as_float(latest.temperature)
    signals = []
    if latest.pm25 is not None and latest.pm25 >= 35:
        signals.append("PM2.5 높음")
    if latest.pm10 is not None and latest.pm10 >= 80:
        signals.append("PM10 높음")
    if latest.humidity is not None and latest.humidity >= 70:
        signals.append("습도 높음")
    if latest.uv_index is not None and latest.uv_index >= 6:
        signals.append("UV 높음")

    return DailyFeatureEnvironmentSummary(
        log_count=len(logs),
        temperature=temperature,
        humidity=latest.humidity,
        pm10=latest.pm10,
        pm25=latest.pm25,
        uv_index=latest.uv_index,
        weather=latest.weather,
        location_name=latest.location_name,
        source=latest.source,
        signals=signals,
    )


def _build_cosmetics_summary(db: Session, user_id: int, target_date: date) -> DailyFeatureProductSummary:
    rows = (
        db.query(UserCosmetic)
        .options(joinedload(UserCosmetic.product))
        .filter(UserCosmetic.user_id == user_id)
        .all()
    )
    active_rows = [row for row in rows if _is_active_on(row, target_date)]
    recent_started = _count_recent_started(active_rows, target_date)
    return DailyFeatureProductSummary(
        current_count=len(active_rows),
        recent_started=recent_started,
        names=[
            row.product.product_name
            for row in active_rows[:3]
            if row.product is not None and row.product.product_name
        ],
    )


def _build_medications_summary(db: Session, user_id: int, target_date: date) -> DailyFeatureProductSummary:
    rows = (
        db.query(UserMedication)
        .options(joinedload(UserMedication.medication))
        .filter(UserMedication.user_id == user_id)
        .all()
    )
    active_rows = [row for row in rows if _is_active_on(row, target_date)]
    recent_started = _count_recent_started(active_rows, target_date)
    return DailyFeatureProductSummary(
        current_count=len(active_rows),
        recent_started=recent_started,
        names=[
            row.medication.name
            for row in active_rows[:3]
            if row.medication is not None and row.medication.name
        ],
    )


def _is_active_on(row: Any, target_date: date) -> bool:
    if row.started_at is not None and row.started_at > target_date:
        return False
    if row.ended_at is not None and row.ended_at < target_date:
        return False
    return row.is_current is not False


def _count_recent_started(rows: list[Any], target_date: date) -> int:
    start_date = target_date - timedelta(days=RECENT_WINDOW_DAYS - 1)
    return sum(1 for row in rows if row.started_at is not None and start_date <= row.started_at <= target_date)


def _normalize_tags(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if item is not None]
    if isinstance(value, dict):
        tags = value.get("tags")
        if isinstance(tags, list):
            return [str(item) for item in tags if item is not None]
        return [str(key) for key, enabled in value.items() if enabled is True]
    return []


def _as_float(value: Decimal | int | float | None) -> float | None:
    if value is None:
        return None
    return float(value)
