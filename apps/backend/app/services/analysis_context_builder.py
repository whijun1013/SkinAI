from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.models.behavior import DailyBehaviorLog
from app.models.cosmetic import CosmeticProduct, UserCosmetic
from app.models.diet import DietLog, DietLogItem
from app.models.environment import EnvironmentLog
from app.models.medication import Medication, UserMedication
from app.models.period import PeriodLog
from app.models.skin_log import SkinLog
from app.models.user import User
from app.services import context_builder as existing_context_builder
from app.services.aggregation import select_confirmed_skin_logs, select_daily_representatives
from app.services.analysis_candidate_signals import build_candidate_signals
from app.services.analysis_exceptions import AnalysisContextError, SkinLogNotFoundError
from app.services.analysis_readiness import check_continuous_log
from app.services.medgemma_service import build_medgemma_handoff_payload
from app.services.medgemma_trend_service import build_medgemma_visual_trends, build_primary_visual_context
from app.services.period_cycle_service import build_period_cycle_snapshot
from app.services.skin_impact import adapt_food_skin_factors_for_context


LOOKBACK_DAYS = 14


def _as_float(value):
    if isinstance(value, Decimal):
        return float(value)
    return value


def _average(values: list) -> float | None:
    usable_values = [float(value) for value in values if value is not None]
    return sum(usable_values) / len(usable_values) if usable_values else None


def _date_range(end_date: date, lookback_days: int = LOOKBACK_DAYS) -> list[date]:
    start_date = end_date - timedelta(days=lookback_days - 1)
    return [start_date + timedelta(days=offset) for offset in range(lookback_days)]


def _build_diet_by_date(
    db: Session, user_id: int, start_date: date, end_date: date
) -> tuple[dict[date, list[dict]], int]:
    logs = (
        db.query(DietLog)
        .options(selectinload(DietLog.items).selectinload(DietLogItem.food_item))
        .filter(
            DietLog.user_id == user_id,
            func.date(DietLog.logged_at) >= start_date,
            func.date(DietLog.logged_at) <= end_date,
        )
        .order_by(DietLog.logged_at.asc(), DietLog.id.asc())
        .all()
    )
    result = defaultdict(list)
    for log in logs:
        foods = []
        for item in log.items:
            food_item = item.food_item
            food_name = food_item.name if food_item is not None else item.custom_food_name
            if not food_name:
                continue
            if food_item is not None:
                impact = adapt_food_skin_factors_for_context(food_item)
                foods.append(
                    {
                        "name": food_name,
                        "skin_tags": impact["tags"],
                        "flags": impact["flags"],
                        "skin_factors": impact["skin_factors"],
                        "skin_factor_details": impact["details"],
                    }
                )
            else:
                foods.append(
                    {
                        "name": food_name,
                        "skin_tags": [],
                        "flags": [],
                        "skin_factors": [],
                        "skin_factor_details": [],
                    }
                )
        result[log.logged_at.date()].append(
            {
                "meal": log.meal_type,
                "foods": foods,
            }
        )
    return result, len(result)


def _build_environment_by_date(
    db: Session, user_id: int, start_date: date, end_date: date
) -> tuple[dict[date, dict], int]:
    rows = (
        db.query(EnvironmentLog)
        .filter(
            EnvironmentLog.user_id == user_id,
            EnvironmentLog.logged_at >= start_date,
            EnvironmentLog.logged_at <= end_date,
        )
        .order_by(EnvironmentLog.logged_at.asc(), EnvironmentLog.id.asc())
        .all()
    )
    grouped_rows = defaultdict(list)
    for row in rows:
        grouped_rows[row.logged_at].append(row)
    result = {}
    for logged_at, entries in grouped_rows.items():
        result[logged_at] = {
            "temperature": _average([entry.temperature for entry in entries]),
            "humidity": _average([entry.humidity for entry in entries]),
            "pm10": (lambda v: _average(v) if v else None)([entry.pm10 for entry in entries if entry.pm10 is not None]),
            "pm25": _average([entry.pm25 for entry in entries]),
            "uv": _average([entry.uv_index for entry in entries]),
        }
    return result, len(result)


def _build_current_cosmetics(db: Session, user_id: int) -> list[dict]:
    rows = (
        db.query(UserCosmetic)
        .options(selectinload(UserCosmetic.product).selectinload(CosmeticProduct.ingredients_list))
        .filter(UserCosmetic.user_id == user_id, UserCosmetic.is_current.is_(True))
        .order_by(UserCosmetic.product_id.asc(), UserCosmetic.id.asc())
        .all()
    )
    result = []
    for row in rows:
        if row.product is None or row.product.product_name is None:
            continue
        result.append(
            {
                "user_cosmetic_id": row.id,
                "product_name": row.product.product_name,
                "started_at": row.started_at.isoformat() if row.started_at else None,
                "irritant_ingredients": sorted(
                    {
                        ingredient.name
                        for ingredient in row.product.ingredients_list
                        if ingredient.is_irritant is True and ingredient.name is not None
                    }
                ),
            }
        )
    return sorted(
        result,
        key=lambda item: (
            item["product_name"],
            item["started_at"] or "",
            item["irritant_ingredients"],
        ),
    )


def _build_current_medications(db: Session, user_id: int) -> list[dict]:
    rows = (
        db.query(UserMedication)
        .options(selectinload(UserMedication.medication).selectinload(Medication.ingredients_list))
        .filter(UserMedication.user_id == user_id, UserMedication.is_current.is_(True))
        .order_by(UserMedication.medication_id.asc(), UserMedication.id.asc())
        .all()
    )
    result = []
    for row in rows:
        if row.medication is None or row.medication.name is None:
            continue
        result.append(
            {
                "user_medication_id": row.id,
                "medication_name": row.medication.name,
                "skin_relevant_ingredients": sorted(
                    {
                        ingredient.name
                        for ingredient in row.medication.ingredients_list
                        if ingredient.is_skin_relevant is True and ingredient.name is not None
                    }
                ),
            }
        )
    return sorted(
        result,
        key=lambda item: (
            item["medication_name"],
            item["skin_relevant_ingredients"],
        ),
    )


def _build_period_logs(db: Session, user_id: int, start_date: date, end_date: date) -> list[dict]:
    rows = (
        db.query(PeriodLog)
        .filter(
            PeriodLog.user_id == user_id,
            PeriodLog.started_at >= start_date,
            PeriodLog.started_at <= end_date,
        )
        .order_by(PeriodLog.started_at.asc())
        .all()
    )
    return [{"started_at": row.started_at.isoformat()} for row in rows]


def _build_period_cycle_context(
    db: Session,
    user_id: int,
    target_date: date,
) -> dict | None:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        return None

    snapshot = build_period_cycle_snapshot(db, user, target_date)
    return {
        key: value.isoformat() if isinstance(value, date) else value
        for key, value in snapshot.items()
    }


def build_analysis_context(
    db: Session,
    user_id: int,
    skin_log_id: int,
    lookback_days: int = LOOKBACK_DAYS,
    medgemma_handoffs: dict[int, dict] | None = None,
) -> dict:
    try:
        trigger_skin_log = (
            db.query(SkinLog)
            .filter(
                SkinLog.id == skin_log_id,
                SkinLog.user_id == user_id,
                SkinLog.overall_score.isnot(None),
            )
            .first()
        )
        if trigger_skin_log is None:
            raise SkinLogNotFoundError("skin log not found for the current user")
        end_date = trigger_skin_log.logged_at
        days = _date_range(end_date, lookback_days)
        start_date = days[0]
        skin_rows = select_confirmed_skin_logs(db, user_id, lookback_days, end_date)
        behavior_rows = select_daily_representatives(
            db, DailyBehaviorLog, user_id, lookback_days, end_date
        )
        skin_by_date = {row.logged_at: row for row in skin_rows}
        behavior_by_date = {row.logged_at: row for row in behavior_rows}
        diet_by_date, diet_days = _build_diet_by_date(db, user_id, start_date, end_date)
        environment_by_date, env_days = _build_environment_by_date(
            db, user_id, start_date, end_date
        )
        readiness = check_continuous_log(db, user_id, end_date)
        summary = existing_context_builder.build_analysis_context(
            db=db,
            user_id=user_id,
            lookback_days=lookback_days,
            end_date=end_date,
        )

        timeline = []
        medgemma_handoffs = medgemma_handoffs or {}
        medgemma_trend_input = []
        for logged_at in days:
            skin = skin_by_date.get(logged_at)
            behavior = behavior_by_date.get(logged_at)
            medgemma = (
                build_medgemma_handoff_payload(medgemma_handoffs.get(skin.id))
                if skin is not None and skin.id in medgemma_handoffs
                else None
            )
            skin_payload = None
            if skin is not None:
                skin_payload = {
                    "overall_score": skin.overall_score,
                    "tags": skin.condition_tags or [],
                    "note": skin.note[:200] if skin.note else None,
                }
                if medgemma is not None:
                    skin_payload["medgemma"] = medgemma

                    trend_item = dict(medgemma)
                    trend_item["date"] = logged_at.isoformat()
                    medgemma_trend_input.append(trend_item)
            timeline.append(
                {
                    "date": logged_at.isoformat(),
                    "skin": skin_payload,
                    "diet": diet_by_date.get(logged_at, []),
                    "environment": environment_by_date.get(logged_at),
                    "behavior": (
                        {
                            "sleep_hours": _as_float(behavior.sleep_hours),
                            "stress_level": behavior.stress_level,
                            "alcohol": behavior.alcohol_yn,
                        }
                        if behavior is not None
                        else None
                    ),
                }
            )

        period_cycle_snapshot = _build_period_cycle_context(db, user_id, end_date)
        current_context = {
            "current_cosmetics": _build_current_cosmetics(db, user_id),
            "current_medications": _build_current_medications(db, user_id),
            "period_logs": _build_period_logs(db, user_id, start_date, end_date),
        }
        if period_cycle_snapshot is not None:
            current_context["period_cycle_snapshot"] = period_cycle_snapshot

        result = {
            "meta": {
                "trigger_date": end_date.isoformat(),
                "trigger_score": trigger_skin_log.overall_score,
                "trigger_tags": trigger_skin_log.condition_tags or [],
                "lookback_days": lookback_days,
                "data_coverage": {
                    "skin_days": len(skin_by_date),
                    "behavior_days": len(behavior_by_date),
                    "diet_days": diet_days,
                    "env_days": env_days,
                },
                "data_quality": {
                    "skin_behavior_overlap_days": readiness["recorded_days"],
                    "has_sufficient_overlap": readiness["is_ready"],
                },
            },
            "daily_timeline": timeline,
            "context": current_context,
            "summary": summary,
        }
        result["candidate_signals"] = build_candidate_signals(result)

        trend_timeline = [
            {"date": t["date"], "score": t["skin"]["overall_score"]}
            for t in timeline if t.get("skin")
        ]
        visual_trends = build_medgemma_visual_trends(trend_timeline, medgemma_trend_input)
        if visual_trends:
            result["visual_observation_trends"] = visual_trends

        primary_visual_context = build_primary_visual_context(trend_timeline, medgemma_trend_input)
        if primary_visual_context:
            result["primary_visual_context"] = primary_visual_context

        return result
    except (AnalysisContextError, SkinLogNotFoundError):
        raise
    except Exception as exc:
        raise AnalysisContextError("failed to build analysis context") from exc
