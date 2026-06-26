import argparse
import asyncio
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.models.analysis  # noqa: F401
import app.models.behavior  # noqa: F401
import app.models.cosmetic  # noqa: F401
import app.models.diet  # noqa: F401
import app.models.environment  # noqa: F401
import app.models.medication  # noqa: F401
import app.models.period  # noqa: F401
import app.models.skin_log  # noqa: F401
import app.models.user  # noqa: F401
from app.auth.security import get_password_hash
from app.database import SessionLocal, get_mongo_db
from app.models.analysis import (
    AgentResult,
    AnalysisRequest,
    AnalysisResult,
    UserBaseline,
    UserChangepoint,
    UserFactorSensitivity,
)
from app.models.behavior import DailyBehaviorLog
from app.models.cosmetic import (
    CosmeticIngredient,
    CosmeticProduct,
    UserCosmetic,
    cosmetic_ingredient_map,
)
from app.models.diet import DietLog, DietLogItem, FoodItem
from app.models.environment import EnvironmentLog
from app.models.medication import (
    Medication,
    MedicationIngredient,
    UserMedication,
    medication_ingredient_map,
)
from app.models.period import PeriodLog
from app.models.skin_log import SkinLog
from app.models.user import User


FIXTURE_PATH = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "gpt_head_dummy_scenarios.json"
DEFAULT_PASSWORD = "DummyPass123!"


def _load_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def _select_scenarios(fixture: dict[str, Any], cohort: str) -> list[dict[str, Any]]:
    scenarios = fixture["scenarios"]
    if cohort == "all":
        return scenarios
    return [scenario for scenario in scenarios if scenario["cohort"] == cohort]


def _dummy_email(team_prefix: str, scenario_id: str) -> str:
    safe_prefix = team_prefix.lower().replace("_", "-")
    return f"gpt-head-{safe_prefix}-{scenario_id}@example.test"


def _reset_dummy_data(db, team_prefix: str) -> None:
    like_pattern = f"gpt-head-{team_prefix.lower().replace('_', '-')}-%@example.test"
    users = db.query(User).filter(User.email.like(like_pattern)).all()
    for user in users:
        db.delete(user)
    db.commit()

    db.query(FoodItem).filter(FoodItem.api_food_code.like("gpt_head_dummy:%")).delete(
        synchronize_session=False
    )
    db.commit()


def _get_or_create_user(db, team_prefix: str, scenario: dict[str, Any], password_hash: str) -> User:
    email = _dummy_email(team_prefix, scenario["scenario_id"])
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(email=email, name=f"Dummy {scenario['scenario_id']}", hashed_password=password_hash)
        db.add(user)
        db.flush()
    user.is_onboarded = True
    user.status = "active"
    user.raw_concern_text = scenario.get("raw_concern_text") or "Dummy analysis test user."
    user.skin_concerns = scenario.get("skin_concerns") or ["dummy_test"]
    return user


def _clear_existing_user_data(db, user_id: int) -> None:
    request_ids = [row[0] for row in db.query(AnalysisRequest.id).filter(AnalysisRequest.user_id == user_id).all()]
    if request_ids:
        db.query(AgentResult).filter(AgentResult.request_id.in_(request_ids)).delete(synchronize_session=False)
        db.query(AnalysisResult).filter(AnalysisResult.request_id.in_(request_ids)).delete(synchronize_session=False)
    db.query(AnalysisRequest).filter(AnalysisRequest.user_id == user_id).delete(synchronize_session=False)

    diet_ids = [row[0] for row in db.query(DietLog.id).filter(DietLog.user_id == user_id).all()]
    if diet_ids:
        db.query(DietLogItem).filter(DietLogItem.diet_log_id.in_(diet_ids)).delete(synchronize_session=False)
    db.query(DietLog).filter(DietLog.user_id == user_id).delete(synchronize_session=False)

    db.query(EnvironmentLog).filter(EnvironmentLog.user_id == user_id).delete(synchronize_session=False)
    db.query(DailyBehaviorLog).filter(DailyBehaviorLog.user_id == user_id).delete(synchronize_session=False)
    db.query(SkinLog).filter(SkinLog.user_id == user_id).delete(synchronize_session=False)
    db.query(UserCosmetic).filter(UserCosmetic.user_id == user_id).delete(synchronize_session=False)
    db.query(UserMedication).filter(UserMedication.user_id == user_id).delete(synchronize_session=False)
    db.query(PeriodLog).filter(PeriodLog.user_id == user_id).delete(synchronize_session=False)
    db.query(UserChangepoint).filter(UserChangepoint.user_id == user_id).delete(synchronize_session=False)
    db.query(UserFactorSensitivity).filter(UserFactorSensitivity.user_id == user_id).delete(synchronize_session=False)
    db.query(UserBaseline).filter(UserBaseline.user_id == user_id).delete(synchronize_session=False)
    db.flush()


def _skin_factor(key: str, label: str) -> dict[str, Any]:
    source = "nutrition_rule"
    if key in {"dairy_confirmed", "possible_dairy"}:
        source = "raw_material_dictionary"
    if key in {"processed_meat", "fried_or_high_ages", "alcohol_histamine"}:
        source = "keyword_rule"
    return {
        "key": key,
        "label": label,
        "level": "high",
        "confidence": "high",
        "source": source,
        "evidence": [f"dummy:{key}"],
    }


def _get_or_create_food(db, scenario_id: str, skin_factor_key: str, label: str) -> FoodItem:
    code = f"gpt_head_dummy:{scenario_id}:{skin_factor_key}"
    item = db.query(FoodItem).filter(FoodItem.api_food_code == code).first()
    if item is None:
        item = FoodItem(api_food_code=code, name=f"Dummy {label}", source="gpt_head_dummy")
        db.add(item)
        db.flush()
    item.category = "dummy"
    item.calories = 350
    item.carbohydrate = 50
    item.sugar = 20 if skin_factor_key == "high_sugar" else 5
    item.fat = 16 if skin_factor_key in {"high_fat", "high_saturated_fat", "trans_fat_present"} else 5
    item.saturated_fat = 8 if skin_factor_key == "high_saturated_fat" else 1
    item.trans_fat = 0.5 if skin_factor_key == "trans_fat_present" else 0
    item.sodium = 900 if skin_factor_key == "high_sodium" else 120
    item.raw_material_text = "dummy raw material"
    item.allergen_text = "milk" if skin_factor_key == "dairy_confirmed" else None
    item.skin_factors = [_skin_factor(skin_factor_key, label)]
    return item


def _get_or_create_cosmetic(db, scenario_id: str, factor_key: str, label: str) -> CosmeticProduct:
    ingredient = db.query(CosmeticIngredient).filter(CosmeticIngredient.name == factor_key).first()
    if ingredient is None:
        ingredient = CosmeticIngredient(name=factor_key, english_name=label, is_irritant=True)
        db.add(ingredient)
        db.flush()

    product = (
        db.query(CosmeticProduct)
        .filter(CosmeticProduct.brand == "GPT Dummy", CosmeticProduct.product_name == label)
        .first()
    )
    if product is None:
        product = CosmeticProduct(
            brand="GPT Dummy",
            product_name=label,
            category="dummy",
            ingredients=factor_key,
        )
        db.add(product)
        db.flush()

    existing = db.execute(
        cosmetic_ingredient_map.select().where(
            cosmetic_ingredient_map.c.product_id == product.id,
            cosmetic_ingredient_map.c.ingredient_id == ingredient.id,
        )
    ).first()
    if existing is None:
        db.execute(
            cosmetic_ingredient_map.insert().values(
                product_id=product.id,
                ingredient_id=ingredient.id,
            )
        )
    return product


def _get_or_create_medication(db, factor_key: str, label: str) -> Medication:
    ingredient = db.query(MedicationIngredient).filter(MedicationIngredient.name == factor_key).first()
    if ingredient is None:
        ingredient = MedicationIngredient(name=factor_key, drug_class="dummy", is_skin_relevant=True)
        db.add(ingredient)
        db.flush()

    medication = db.query(Medication).filter(Medication.name == label).first()
    if medication is None:
        medication = Medication(name=label, form="dummy")
        db.add(medication)
        db.flush()

    existing = db.execute(
        medication_ingredient_map.select().where(
            medication_ingredient_map.c.medication_id == medication.id,
            medication_ingredient_map.c.ingredient_id == ingredient.id,
        )
    ).first()
    if existing is None:
        db.execute(
            medication_ingredient_map.insert().values(
                medication_id=medication.id,
                ingredient_id=ingredient.id,
            )
        )
    return medication


def _scores_for(scenario: dict[str, Any], days: int, exposure_offsets: list[int]) -> list[int]:
    if scenario["cause"]["domain"] == "control":
        return [4 for _ in range(days)]
    low_offsets = {min(offset + 1, days - 1) for offset in exposure_offsets}
    low_offsets.add(days - 1)
    if scenario.get("medgemma_profile") == "mild":
        return [2 if idx in low_offsets else 4 for idx in range(days)]
    return [2 if idx in low_offsets else 5 for idx in range(days)]


def _seed_skin_and_logs(
    db,
    user: User,
    scenario: dict[str, Any],
    end_date: date,
    exposure_offsets: list[int],
    days: int,
) -> dict[int, SkinLog]:
    cause = scenario["cause"]
    start_date = end_date - timedelta(days=days - 1)
    scores = _scores_for(scenario, days, exposure_offsets)
    skin_by_offset = {}

    for offset in range(days):
        logged_at = start_date + timedelta(days=offset)
        skin = SkinLog(
            user_id=user.id,
            logged_at=logged_at,
            overall_score=scores[offset],
            condition_tags=["dummy"],
            note=f"{scenario['scenario_id']} day {offset}",
            photo_url=f"https://example.test/{scenario['scenario_id']}/{offset}.jpg",
            quality_check_passed=True,
        )
        db.add(skin)
        db.flush()
        skin_by_offset[offset] = skin

        behavior = _behavior_for(cause, offset in exposure_offsets)
        db.add(DailyBehaviorLog(user_id=user.id, logged_at=logged_at, **behavior))

        env = _environment_for(cause, offset in exposure_offsets)
        db.add(
            EnvironmentLog(
                user_id=user.id,
                logged_at=logged_at,
                captured_at=datetime.combine(logged_at, datetime.min.time()),
                source="manual",
                location_name="Dummy Lab",
                **env,
            )
        )

    combo_keys = set(cause.get("factor_keys", []))
    diet_keys = {"high_sugar", "high_fat", "high_sodium", "dairy_confirmed", "fried_or_high_ages", "alcohol"}
    diet_key = cause.get("factor_key") or cause.get("skin_factor_key") or next((k for k in combo_keys if k in diet_keys), None)
    
    if "diet" not in scenario.get("missing", []) and _needs_food(cause) and diet_key:
        food = _get_or_create_food(db, scenario["scenario_id"], diet_key, cause.get("label", diet_key))
        for offset in exposure_offsets:
            logged_at = datetime.combine(start_date + timedelta(days=offset), datetime.min.time())
            diet = DietLog(user_id=user.id, logged_at=logged_at, meal_type=None, input_method="manual")
            db.add(diet)
            db.flush()
            db.add(DietLogItem(diet_log_id=diet.id, food_item_id=food.id, amount=1, unit="serving"))

    cosmetic_keys = {"retinol", "fragrance", "cosmetic_irritant"}
    cosmetic_key = cause.get("factor_key") or next((k for k in combo_keys if k in cosmetic_keys), None)
    if cause["domain"] == "cosmetic" or cosmetic_key:
        factor_key = cosmetic_key or cause.get("factor_key")
        label = cause.get("label") or factor_key
        product = _get_or_create_cosmetic(db, scenario["scenario_id"], factor_key, label)
        db.add(
            UserCosmetic(
                user_id=user.id,
                product_id=product.id,
                is_current=True,
                started_at=start_date + timedelta(days=exposure_offsets[0]),
            )
        )

    med_keys = {"medication_new", "steroid", "lithium"}
    med_key = cause.get("factor_key") or next((k for k in combo_keys if k in med_keys), None)
    if cause["domain"] == "medication" or med_key:
        factor_key = med_key or cause.get("factor_key")
        label = cause.get("label") or factor_key
        medication = _get_or_create_medication(db, factor_key, label)
        db.add(
            UserMedication(
                user_id=user.id,
                medication_id=medication.id,
                is_current=True,
                started_at=start_date + timedelta(days=exposure_offsets[0]),
            )
        )

    if cause["domain"] == "period":
        db.add(PeriodLog(user_id=user.id, started_at=start_date + timedelta(days=exposure_offsets[1])))

    return skin_by_offset


def _needs_food(cause: dict[str, Any]) -> bool:
    diet_keys = {"high_sugar", "high_fat", "high_sodium", "dairy_confirmed", "fried_or_high_ages", "alcohol"}
    return cause["domain"] == "diet" or (
        cause["domain"] == "combo" and bool(diet_keys.intersection(cause.get("factor_keys", [])))
    )


def _behavior_for(cause: dict[str, Any], exposed: bool) -> dict[str, Any]:
    sleep_hours = 7.5
    stress_level = 2
    alcohol_yn = False
    keys = set(cause.get("factor_keys", []))
    key = cause.get("factor_key")
    if exposed and (key == "sleep_shortage" or "sleep_shortage" in keys):
        sleep_hours = 4.5
    if exposed and (key == "stress_high" or "stress_high" in keys):
        stress_level = 5
    if exposed and key == "alcohol":
        alcohol_yn = True
        sleep_hours = 5.5
    return {
        "sleep_hours": sleep_hours,
        "sleep_quality": 3,
        "stress_level": stress_level,
        "water_intake_ml": 1500,
        "exercise_yn": False,
        "alcohol_yn": alcohol_yn,
        "smoking_yn": False,
    }


def _environment_for(cause: dict[str, Any], exposed: bool) -> dict[str, Any]:
    values = {
        "temperature": 22,
        "humidity": 45,
        "pm10": 20,
        "pm25": 10,
        "uv_index": 2,
        "weather": "clear",
    }
    if not exposed:
        return values
    key = cause.get("factor_key")
    keys = set(cause.get("factor_keys", []))
    if key == "pm25":
        values["pm25"] = 55
    if key == "pm10":
        values["pm10"] = 100
    if key == "uv_high" or "uv_high" in keys:
        values["uv_index"] = 8
    if key == "humidity_high":
        values["humidity"] = 75
    if key == "humidity_low" or "humidity_low" in keys:
        values["humidity"] = 20
    return values


def _seed_personal_context(db, user: User, scenario: dict[str, Any], end_date: date) -> None:
    baseline_data = scenario.get("baseline") or {}
    baseline = db.query(UserBaseline).filter(UserBaseline.user_id == user.id).first()
    if baseline is None:
        baseline = UserBaseline(user_id=user.id, analysis_count=baseline_data.get("analysis_count", 0))
        db.add(baseline)
    baseline.analysis_count = baseline_data.get("analysis_count", baseline.analysis_count or 0)
    baseline.skin_tendency = baseline_data.get("skin_tendency", baseline.skin_tendency)

    for item in scenario.get("existing_personal_patterns") or []:
        row = (
            db.query(UserFactorSensitivity)
            .filter(
                UserFactorSensitivity.user_id == user.id,
                UserFactorSensitivity.factor_type == item["factor_type"],
                UserFactorSensitivity.factor_key == item["factor_key"],
            )
            .first()
        )
        if row is None:
            row = UserFactorSensitivity(
                user_id=user.id,
                factor_type=item["factor_type"],
                factor_key=item["factor_key"],
            )
            db.add(row)
        row.sensitivity_score = item["score"]
        row.trigger_count = item.get("trigger_count", 1)
        row.last_triggered_at = end_date

    for item in scenario.get("changepoints") or []:
        cp_date = end_date - timedelta(days=(13 - item.get("offset", 7)))
        db.add(
            UserChangepoint(
                user_id=user.id,
                detected_at=date.today(),
                window_start_date=end_date - timedelta(days=13),
                changepoint_date=cp_date,
                factor_key=item["factor_key"],
                analysis_method=item["analysis_method"],
            )
        )

    db.add(
        UserChangepoint(
            user_id=user.id,
            detected_at=date.today(),
            window_start_date=end_date - timedelta(days=13),
            changepoint_date=None,
            factor_key=f"window_marker_{scenario['scenario_id']}",
            analysis_method=None,
        )
    )


def _build_mongo_docs(scenario: dict[str, Any], user: User, skin_by_offset: dict[int, SkinLog]) -> list[dict[str, Any]]:
    profile = scenario.get("medgemma_profile")
    if profile == "mild":
        signals = {"active_lesion": "none", "redness": "mild", "barrier": "none"}
    elif profile == "severe":
        signals = {"active_lesion": "moderate", "redness": "moderate", "barrier": "mild"}
    else:
        signals = {"active_lesion": "moderate", "redness": "mild", "barrier": "none"}

    docs = []
    for offset, skin in skin_by_offset.items():
        if offset not in {8, 11, 13}:
            continue
        docs.append(
            {
                "skin_log_id": skin.id,
                "user_id": user.id,
                "date": skin.logged_at.isoformat(),
                "signals": signals,
                "source": "gpt_head_dummy",
                "model_version": "gpt-head-dummy-medgemma",
                "prompt_version": "dummy",
                "created_at": datetime.now(timezone.utc),
                "raw_analysis": {},
            }
        )
    return docs


async def _write_mongo_docs(delete_user_ids: list[int], docs: list[dict[str, Any]]) -> None:
    db = get_mongo_db()
    user_ids = list({*(delete_user_ids or []), *(doc["user_id"] for doc in docs)})
    await db["skin_ai_results"].delete_many({"source": "gpt_head_dummy"})
    if user_ids:
        await db["skin_ai_results"].delete_many(
            {"user_id": {"$in": user_ids}, "source": "gpt_head_dummy"}
        )
    if docs:
        await db["skin_ai_results"].insert_many(docs)


def seed(cohort: str, team_prefix: str, reset_dummy: bool, skip_mongo: bool) -> dict[str, Any]:
    fixture = _load_fixture()
    defaults = fixture["defaults"]
    scenarios = _select_scenarios(fixture, cohort)
    days = int(defaults["days"])
    exposure_offsets = list(defaults["exposure_offsets"])
    end_date = date.today()
    password_hash = get_password_hash(defaults.get("password") or DEFAULT_PASSWORD)

    db = SessionLocal()
    seeded_users: list[User] = []
    delete_mongo_user_ids: list[int] = []
    mongo_docs: list[dict[str, Any]] = []
    try:
        if reset_dummy:
            delete_mongo_user_ids = [
                row[0]
                for row in db.query(User.id)
                .filter(User.email.like(f"gpt-head-{team_prefix.lower().replace('_', '-')}-%@example.test"))
                .all()
            ]
            _reset_dummy_data(db, team_prefix)

        for scenario in scenarios:
            user = _get_or_create_user(db, team_prefix, scenario, password_hash)
            _clear_existing_user_data(db, user.id)
            _seed_personal_context(db, user, scenario, end_date)
            skin_by_offset = _seed_skin_and_logs(db, user, scenario, end_date, exposure_offsets, days)
            db.commit()
            if not skip_mongo:
                mongo_docs.extend(_build_mongo_docs(scenario, user, skin_by_offset))
            seeded_users.append(user)

        if not skip_mongo:
            asyncio.run(_write_mongo_docs(delete_mongo_user_ids, mongo_docs))

        return {
            "cohort": cohort,
            "team_prefix": team_prefix,
            "scenario_count": len(scenarios),
            "user_count": len(seeded_users),
            "password": defaults.get("password") or DEFAULT_PASSWORD,
        }
    finally:
        db.close()


def seed_mongo_only(cohort: str, team_prefix: str) -> dict[str, Any]:
    fixture = _load_fixture()
    scenarios = _select_scenarios(fixture, cohort)
    db = SessionLocal()
    try:
        delete_user_ids = []
        mongo_docs = []
        missing = []
        for scenario in scenarios:
            user = (
                db.query(User)
                .filter(User.email == _dummy_email(team_prefix, scenario["scenario_id"]))
                .first()
            )
            if user is None:
                missing.append(scenario["scenario_id"])
                continue
            skin_logs = (
                db.query(SkinLog)
                .filter(SkinLog.user_id == user.id, SkinLog.overall_score.isnot(None))
                .order_by(SkinLog.logged_at.asc(), SkinLog.id.asc())
                .all()
            )
            skin_by_offset = {idx: row for idx, row in enumerate(skin_logs[-14:])}
            delete_user_ids.append(user.id)
            mongo_docs.extend(_build_mongo_docs(scenario, user, skin_by_offset))

        asyncio.run(_write_mongo_docs(delete_user_ids, mongo_docs))
        return {
            "cohort": cohort,
            "team_prefix": team_prefix,
            "users": len(delete_user_ids),
            "mongo_docs": len(mongo_docs),
            "missing": missing,
        }
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cohort", choices=["pilot", "main", "all"], default="pilot")
    parser.add_argument("--team-prefix", default="shared")
    parser.add_argument("--reset-dummy", action="store_true")
    parser.add_argument("--skip-mongo", action="store_true")
    parser.add_argument("--mongo-only", action="store_true")
    args = parser.parse_args()

    if args.mongo_only:
        result = seed_mongo_only(cohort=args.cohort, team_prefix=args.team_prefix)
    else:
        result = seed(
            cohort=args.cohort,
            team_prefix=args.team_prefix,
            reset_dummy=args.reset_dummy,
            skip_mongo=args.skip_mongo,
        )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
