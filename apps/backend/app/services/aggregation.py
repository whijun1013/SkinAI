from collections import Counter, defaultdict
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.behavior import DailyBehaviorLog
from app.models.cosmetic import (
    CosmeticIngredient,
    UserCosmetic,
    cosmetic_ingredient_map,
)
from app.models.diet import DietLog, DietLogItem, FoodItem
from app.models.environment import EnvironmentLog
from app.models.medication import (
    MedicationIngredient,
    UserMedication,
    medication_ingredient_map,
)
from app.models.skin_log import SkinLog
from app.services.cosmetic_risk import summarize_cosmetic_ingredients


def get_date_range(days: int, end_date: date) -> tuple[date, date]:
    if days < 1:
        raise ValueError("days must be at least 1")
    return end_date - timedelta(days=days - 1), end_date


def select_daily_representatives(
    db: Session, model, user_id: int, days: int, end_date: date
) -> list:
    start_date, end_date = get_date_range(days, end_date)
    rows = (
        db.query(model)
        .filter(
            model.user_id == user_id,
            model.logged_at >= start_date,
            model.logged_at <= end_date,
        )
        .order_by(model.logged_at.asc(), model.created_at.desc(), model.id.desc())
        .all()
    )
    representatives = {}
    for row in rows:
        representatives.setdefault(row.logged_at, row)
    return list(representatives.values())


def select_confirmed_skin_logs(
    db: Session, user_id: int, days: int, end_date: date
) -> list[SkinLog]:
    start_date, end_date = get_date_range(days, end_date)
    rows = (
        db.query(SkinLog)
        .filter(
            SkinLog.user_id == user_id,
            SkinLog.logged_at >= start_date,
            SkinLog.logged_at <= end_date,
            SkinLog.overall_score.isnot(None),
        )
        .order_by(SkinLog.logged_at.asc(), SkinLog.created_at.desc(), SkinLog.id.desc())
        .all()
    )
    representatives = {}
    for row in rows:
        representatives.setdefault(row.logged_at, row)
    return list(representatives.values())


def _average(values: list) -> float | None:
    values = [value for value in values if value is not None]
    return float(sum(values) / len(values)) if values else None


def aggregate_skin_log(db: Session, user_id: int, days: int, end_date: date) -> dict:
    rows = select_confirmed_skin_logs(db, user_id, days, end_date)
    scores = [row.overall_score for row in rows]
    min_score = min(scores) if scores else None
    worst_date = (
        min(row.logged_at for row in rows if row.overall_score == min_score)
        if min_score is not None
        else None
    )
    tag_frequency = Counter()
    for row in rows:
        tag_frequency.update(row.condition_tags or [])
    return {
        "avg_score": _average(scores),
        "min_score": min_score,
        "worst_date": worst_date.isoformat() if worst_date else None,
        "tag_frequency": dict(sorted(tag_frequency.items())),
        "record_count": len(rows),
    }


def aggregate_behavior_log(db: Session, user_id: int, days: int, end_date: date) -> dict:
    rows = select_daily_representatives(db, DailyBehaviorLog, user_id, days, end_date)
    return {
        "avg_sleep_hours": _average([row.sleep_hours for row in rows]),
        "avg_stress_level": _average([row.stress_level for row in rows]),
        "stress_high_days": sum(row.stress_level is not None and row.stress_level >= 4 for row in rows),
        "avg_water_intake_ml": _average([row.water_intake_ml for row in rows]),
        "exercise_count": sum(row.exercise_yn is True for row in rows),
        "alcohol_count": sum(row.alcohol_yn is True for row in rows),
        "smoking_count": sum(row.smoking_yn is True for row in rows),
        "record_count": len(rows),
    }


def aggregate_diet_log(db: Session, user_id: int, days: int, end_date: date) -> dict:
    start_date, end_date = get_date_range(days, end_date)
    rows = (
        db.query(DietLog.logged_at, DietLogItem.id, FoodItem)
        .join(DietLogItem, DietLogItem.diet_log_id == DietLog.id)
        .join(FoodItem, FoodItem.id == DietLogItem.food_item_id)
        .filter(
            DietLog.user_id == user_id,
            func.date(DietLog.logged_at) >= start_date,
            func.date(DietLog.logged_at) <= end_date,
        )
        .all()
    )
    daily_sugar = defaultdict(lambda: Decimal("0"))
    daily_sodium = defaultdict(lambda: Decimal("0"))
    category_frequency = Counter()
    high_gi_count = 0
    dairy_count = 0
    for logged_at, _, food_item in rows:
        logged_date = logged_at.date()
        daily_sugar[logged_date] += food_item.sugar or 0
        daily_sodium[logged_date] += food_item.sodium or 0
        if food_item.category:
            category_frequency[food_item.category] += 1

        factors = food_item.skin_factors or {}
        if isinstance(factors, dict):
            is_high_gi = "high_gl_candidate" in factors
            is_dairy = "dairy_confirmed" in factors
        else:
            is_high_gi = any(f.get("key") == "high_gl_candidate" for f in factors)
            is_dairy = any(f.get("key") == "dairy_confirmed" for f in factors)

        if is_high_gi:
            high_gi_count += 1
        if is_dairy:
            dairy_count += 1
    return {
        "avg_sugar": _average(list(daily_sugar.values())),
        "avg_sodium": _average(list(daily_sodium.values())),
        "high_gi_count": high_gi_count,
        "dairy_count": dairy_count,
        "category_frequency": dict(sorted(category_frequency.items())),
        "matched_record_count": len(rows),
    }


def aggregate_environment_log(db: Session, user_id: int, days: int, end_date: date) -> dict:
    start_date, end_date = get_date_range(days, end_date)
    rows = (
        db.query(EnvironmentLog)
        .filter(
            EnvironmentLog.user_id == user_id,
            EnvironmentLog.logged_at >= start_date,
            EnvironmentLog.logged_at <= end_date,
        )
        .all()
    )
    daily_rows = defaultdict(list)
    for row in rows:
        daily_rows[row.logged_at].append(row)
    daily_humidity = [
        average
        for entries in daily_rows.values()
        if (average := _average([row.humidity for row in entries])) is not None
    ]
    return {
        "avg_humidity": _average(daily_humidity),
        "pm10_bad_days": sum(any(row.pm10 is not None and row.pm10 >= 80 for row in entries) for entries in daily_rows.values()),
        "pm25_bad_days": sum(any(row.pm25 is not None and row.pm25 >= 35 for row in entries) for entries in daily_rows.values()),
        "uv_high_days": sum(any(row.uv_index is not None and row.uv_index >= 6 for row in entries) for entries in daily_rows.values()),
        "record_count": len(daily_rows),
    }


def aggregate_cosmetic_risk(db: Session, user_id: int) -> dict:
    ingredients = (
        db.query(CosmeticIngredient)
        .join(cosmetic_ingredient_map, cosmetic_ingredient_map.c.ingredient_id == CosmeticIngredient.id)
        .join(UserCosmetic, UserCosmetic.product_id == cosmetic_ingredient_map.c.product_id)
        .filter(UserCosmetic.user_id == user_id, UserCosmetic.is_current.is_(True))
        .all()
    )
    risk = summarize_cosmetic_ingredients(ingredients)
    return {
        "irritant_ingredients": risk["irritant_ingredients"],
        "high_comedogenic": risk["high_comedogenic"],
        "banned_ingredients": risk["banned_ingredients"],
    }


def aggregate_medication_risk(db: Session, user_id: int) -> dict:
    names = (
        db.query(MedicationIngredient.name)
        .join(
            medication_ingredient_map,
            medication_ingredient_map.c.ingredient_id == MedicationIngredient.id,
        )
        .join(
            UserMedication,
            UserMedication.medication_id == medication_ingredient_map.c.medication_id,
        )
        .filter(
            UserMedication.user_id == user_id,
            UserMedication.is_current.is_(True),
            MedicationIngredient.is_skin_relevant.is_(True),
        )
        .all()
    )
    return {"skin_relevant_medications": sorted({name for (name,) in names})}


def extract_worst_context(db: Session, user_id: int, worst_date: date | None) -> dict:
    result = {"date": None, "sleep": None, "stress": None, "pm25": None, "diet_category": None}
    if worst_date is None:
        return result

    behavior = select_daily_representatives(db, DailyBehaviorLog, user_id, 1, worst_date)
    env_rows = (
        db.query(EnvironmentLog)
        .filter(EnvironmentLog.user_id == user_id, EnvironmentLog.logged_at == worst_date)
        .all()
    )
    categories = (
        db.query(FoodItem.category)
        .join(DietLogItem, DietLogItem.food_item_id == FoodItem.id)
        .join(DietLog, DietLog.id == DietLogItem.diet_log_id)
        .filter(DietLog.user_id == user_id, func.date(DietLog.logged_at) == worst_date)
        .all()
    )
    category_counts = Counter(category for (category,) in categories if category)
    result["date"] = worst_date.isoformat()
    if behavior:
        result["sleep"] = float(behavior[0].sleep_hours) if behavior[0].sleep_hours is not None else None
        result["stress"] = behavior[0].stress_level
    pm25_values = [row.pm25 for row in env_rows if row.pm25 is not None]
    result["pm25"] = max(pm25_values) if pm25_values else None
    if category_counts:
        result["diet_category"] = min(category_counts, key=lambda category: (-category_counts[category], category))
    return result
