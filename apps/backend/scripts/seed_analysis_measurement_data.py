from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
load_dotenv(BACKEND_ROOT / ".env")

from app.database import SessionLocal
from app.models.behavior import DailyBehaviorLog
from app.models.cosmetic import CosmeticIngredient, CosmeticProduct, UserCosmetic
from app.models.diet import DietLog, DietLogItem, FoodItem
from app.models.environment import EnvironmentLog
from app.models.medication import Medication, MedicationIngredient, UserMedication
from app.models.skin_log import SkinLog
from app.models.user import User


DEFAULT_EMAIL = "analysis.measurement@example.com"
DEFAULT_PASSWORD_HASH = "measurement-password-placeholder-hash-000000000000000000000"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create one measurement user plus skin, diet, behavior, environment, "
            "cosmetic, and medication data for analysis_orchestrator latency tests."
        )
    )
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--name", default="Analysis Measurement User")
    parser.add_argument(
        "--end-date",
        default=date.today().isoformat(),
        help="Last logged_at date for the seven-day seed window, YYYY-MM-DD.",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=7,
        help="Number of scored skin_log rows to create. Must be at least 7.",
    )
    parser.add_argument(
        "--score-pattern",
        default="5,4,4,3,3,2,2",
        help=(
            "Comma-separated scores applied oldest-to-newest. Values must be 1-5. "
            "The final row is printed as the target skin_log_id."
        ),
    )
    parser.add_argument(
        "--skin-type",
        default="민감성",
        choices=("건성", "지성", "복합성", "민감성", "중성"),
    )
    parser.add_argument("--birth-year", type=int, default=1995)
    parser.add_argument("--gender", default="여", choices=("남", "여"))
    return parser.parse_args()


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise SystemExit("--end-date must use YYYY-MM-DD") from exc


def _parse_scores(value: str, days: int) -> list[int]:
    try:
        scores = [int(part.strip()) for part in value.split(",") if part.strip()]
    except ValueError as exc:
        raise SystemExit("--score-pattern must contain comma-separated integers") from exc
    if not scores:
        raise SystemExit("--score-pattern must contain at least one score")
    if any(score < 1 or score > 5 for score in scores):
        raise SystemExit("--score-pattern values must be between 1 and 5")
    while len(scores) < days:
        scores.append(scores[-1])
    return scores[:days]


def _get_or_create_user(db, args: argparse.Namespace) -> User:
    user = db.query(User).filter(User.email == args.email).first()
    if user is not None:
        return user

    user = User(
        email=args.email,
        name=args.name,
        hashed_password=DEFAULT_PASSWORD_HASH,
        skin_type=args.skin_type,
        birth_year=args.birth_year,
        gender=args.gender,
        avg_cycle_length=28,
        is_onboarded=True,
        is_admin=False,
        status="active",
        session_version=1,
        terms_agreed_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _get_or_create_food_item(
    db,
    *,
    api_food_code: str,
    name: str,
    category: str,
    skin_factors: list = None,
) -> FoodItem:
    food = db.query(FoodItem).filter(FoodItem.api_food_code == api_food_code).first()
    if food is not None:
        return food
    food = FoodItem(
        api_food_code=api_food_code,
        name=name,
        category=category,
        calories=350,
        carbohydrate=55,
        sugar=18,
        protein=12,
        fat=8,
        sodium=420,
        skin_factors=skin_factors or [],
        source="seed",
    )
    db.add(food)
    db.flush()
    return food


def _seed_food_items(db) -> dict[str, FoodItem]:
    return {
        "milk": _get_or_create_food_item(
            db,
            api_food_code="MEASUREMENT_MILK",
            name="측정용 우유",
            category="유제품",
            skin_factors=[{"key": "dairy_confirmed"}],
        ),
        "cake": _get_or_create_food_item(
            db,
            api_food_code="MEASUREMENT_CAKE",
            name="측정용 케이크",
            category="디저트",
            skin_factors=[{"key": "high_gl_candidate"}],
        ),
        "salad": _get_or_create_food_item(
            db,
            api_food_code="MEASUREMENT_SALAD",
            name="측정용 샐러드",
            category="채소",
        ),
    }


def _seed_diet_logs(db, user: User, days: list[date], foods: dict[str, FoodItem]) -> list[DietLog]:
    logs = []
    for index, logged_on in enumerate(days):
        log = DietLog(
            user_id=user.id,
            logged_at=datetime.combine(logged_on, datetime.min.time()).replace(hour=12),
            meal_type="점심",
            input_method="manual",
            captured_location_name="AML 측정 위치",
            note="Measurement seed diet log.",
        )
        db.add(log)
        db.flush()

        primary_food = foods["milk"] if index % 2 == 0 else foods["cake"]
        secondary_food = foods["salad"]
        db.add_all(
            [
                DietLogItem(
                    diet_log_id=log.id,
                    food_item_id=primary_food.id,
                    amount=1,
                    unit="serving",
                ),
                DietLogItem(
                    diet_log_id=log.id,
                    food_item_id=secondary_food.id,
                    amount=1,
                    unit="serving",
                ),
            ]
        )
        logs.append(log)
    return logs


def _seed_behavior_logs(db, user: User, days: list[date]) -> list[DailyBehaviorLog]:
    logs = []
    for index, logged_on in enumerate(days):
        log = DailyBehaviorLog(
            user_id=user.id,
            logged_at=logged_on,
            sleep_hours=5.5 if index >= len(days) - 3 else 7.0,
            sleep_quality=2 if index >= len(days) - 3 else 4,
            stress_level=4 if index >= len(days) - 3 else 2,
            water_intake_ml=1100 if index >= len(days) - 3 else 1800,
            exercise_yn=index % 3 == 0,
            exercise_type="걷기" if index % 3 == 0 else None,
            exercise_duration_min=30 if index % 3 == 0 else None,
            alcohol_yn=index == len(days) - 2,
            smoking_yn=False,
            custom_behaviors=["measurement_seed", "late_sleep"] if index >= len(days) - 3 else ["measurement_seed"],
        )
        db.add(log)
        logs.append(log)
    return logs


def _seed_environment_logs(db, user: User, days: list[date]) -> list[EnvironmentLog]:
    logs = []
    for index, logged_on in enumerate(days):
        log = EnvironmentLog(
            user_id=user.id,
            logged_at=logged_on,
            lat=37.5665,
            lng=126.9780,
            location_name="서울 측정 위치",
            temperature=26.5 + (index % 3),
            humidity=70 if index >= len(days) - 3 else 45,
            pm10=65 if index >= len(days) - 3 else 25,
            pm25=38 if index >= len(days) - 3 else 12,
            uv_index=7 if index >= len(days) - 3 else 3,
            weather="흐림" if index >= len(days) - 3 else "맑음",
            source="manual",
            captured_at=datetime.combine(logged_on, datetime.min.time()).replace(hour=13),
        )
        db.add(log)
        logs.append(log)
    return logs


def _get_or_create_cosmetic_ingredient(
    db,
    *,
    name: str,
    english_name: str,
    is_irritant: bool,
    comedogenic: int | None = None,
) -> CosmeticIngredient:
    ingredient = db.query(CosmeticIngredient).filter(CosmeticIngredient.name == name).first()
    if ingredient is not None:
        return ingredient
    ingredient = CosmeticIngredient(
        name=name,
        english_name=english_name,
        is_irritant=is_irritant,
        is_banned=False,
        comedogenic=comedogenic,
        comedogenic_source="measurement_seed" if comedogenic is not None else None,
    )
    db.add(ingredient)
    db.flush()
    return ingredient


def _seed_current_cosmetic(db, user: User, start_date: date) -> UserCosmetic:
    retinol = _get_or_create_cosmetic_ingredient(
        db,
        name="측정용 레티놀",
        english_name="Retinol",
        is_irritant=True,
        comedogenic=2,
    )
    fragrance = _get_or_create_cosmetic_ingredient(
        db,
        name="측정용 향료",
        english_name="Fragrance",
        is_irritant=True,
    )
    product = (
        db.query(CosmeticProduct)
        .filter(
            CosmeticProduct.brand == "Measurement Brand",
            CosmeticProduct.product_name == "Measurement Retinol Cream",
        )
        .first()
    )
    if product is None:
        product = CosmeticProduct(
            brand="Measurement Brand",
            product_name="Measurement Retinol Cream",
            ingredients="측정용 레티놀, 측정용 향료",
            category="크림",
        )
        db.add(product)
        db.flush()
    for ingredient in (retinol, fragrance):
        if ingredient not in product.ingredients_list:
            product.ingredients_list.append(ingredient)

    user_cosmetic = (
        db.query(UserCosmetic)
        .filter(
            UserCosmetic.user_id == user.id,
            UserCosmetic.product_id == product.id,
            UserCosmetic.is_current.is_(True),
        )
        .first()
    )
    if user_cosmetic is not None:
        return user_cosmetic
    user_cosmetic = UserCosmetic(
        user_id=user.id,
        product_id=product.id,
        is_current=True,
        started_at=start_date,
    )
    db.add(user_cosmetic)
    return user_cosmetic


def _get_or_create_medication_ingredient(
    db,
    *,
    name: str,
    drug_class: str,
    is_skin_relevant: bool,
) -> MedicationIngredient:
    ingredient = db.query(MedicationIngredient).filter(MedicationIngredient.name == name).first()
    if ingredient is not None:
        return ingredient
    ingredient = MedicationIngredient(
        name=name,
        drug_class=drug_class,
        is_skin_relevant=is_skin_relevant,
    )
    db.add(ingredient)
    db.flush()
    return ingredient


def _seed_current_medication(db, user: User, start_date: date) -> UserMedication:
    ingredient = _get_or_create_medication_ingredient(
        db,
        name="측정용 스테로이드 성분",
        drug_class="corticosteroid",
        is_skin_relevant=True,
    )
    medication = db.query(Medication).filter(Medication.name == "Measurement Steroid Tablet").first()
    if medication is None:
        medication = Medication(
            name="Measurement Steroid Tablet",
            form="tablet",
        )
        db.add(medication)
        db.flush()
    if ingredient not in medication.ingredients_list:
        medication.ingredients_list.append(ingredient)

    user_medication = (
        db.query(UserMedication)
        .filter(
            UserMedication.user_id == user.id,
            UserMedication.medication_id == medication.id,
            UserMedication.is_current.is_(True),
        )
        .first()
    )
    if user_medication is not None:
        return user_medication
    user_medication = UserMedication(
        user_id=user.id,
        medication_id=medication.id,
        is_current=True,
        started_at=start_date,
    )
    db.add(user_medication)
    return user_medication


def main() -> int:
    args = parse_args()
    if args.days < 7:
        raise SystemExit("--days must be at least 7 for analysis readiness")

    end_date = _parse_date(args.end_date)
    scores = _parse_scores(args.score_pattern, args.days)
    start_date = end_date - timedelta(days=args.days - 1)
    days = [start_date + timedelta(days=offset) for offset in range(args.days)]

    db = SessionLocal()
    try:
        user = _get_or_create_user(db, args)
        foods = _seed_food_items(db)
        _seed_current_cosmetic(db, user, start_date)
        _seed_current_medication(db, user, start_date)
        logs: list[SkinLog] = []
        for logged_at, score in zip(days, scores):
            log = SkinLog(
                user_id=user.id,
                logged_at=logged_at,
                overall_score=score,
                condition_tags=["measurement_seed"],
                note=(
                    "Measurement seed skin log. "
                    "Safe to discard with the temporary AML MySQL database."
                ),
            )
            db.add(log)
            logs.append(log)

        diet_logs = _seed_diet_logs(db, user, days, foods)
        behavior_logs = _seed_behavior_logs(db, user, days)
        environment_logs = _seed_environment_logs(db, user, days)

        db.commit()
        for log in logs:
            db.refresh(log)

        target = logs[-1]
        print("analysis measurement seed created")
        print(f"user_id={user.id}")
        print(f"user_email={user.email}")
        print(f"start_date={start_date.isoformat()}")
        print(f"end_date={end_date.isoformat()}")
        print(f"created_skin_log_count={len(logs)}")
        print(f"created_diet_log_count={len(diet_logs)}")
        print(f"created_behavior_log_count={len(behavior_logs)}")
        print(f"created_environment_log_count={len(environment_logs)}")
        print("current_cosmetic=Measurement Retinol Cream")
        print("current_medication=Measurement Steroid Tablet")
        print(f"target_skin_log_id={target.id}")
        print("")
        print("next command:")
        print(
            "python apps/backend/scripts/measure_analysis_latency.py "
            f"--user-id {user.id} "
            f"--skin-log-id {target.id} "
            "--trigger-type worse "
            "--pretty "
            "--output outputs/analysis-latency-001.json"
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
