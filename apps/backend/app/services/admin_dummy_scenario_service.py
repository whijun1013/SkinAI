import random
from datetime import date, datetime, timedelta
from decimal import Decimal

from app.models.behavior import DailyBehaviorLog
from app.models.cosmetic import CosmeticIngredient, CosmeticProduct, UserCosmetic
from app.models.diet import DietLog, DietLogItem, FoodItem
from app.models.environment import EnvironmentLog
from app.models.medication import Medication, MedicationIngredient, UserMedication
from app.models.period import PeriodLog
from app.models.skin_log import SkinLog
from app.models.user import User


LOOKBACK_DAYS = 14
DEFAULT_REPETITIONS = 5
DEFAULT_END_DATE = date.today()
DUMMY_EMAIL_PREFIX = "dummy_"
DUMMY_EMAIL_DOMAIN = "@nuvo.test"
DEFAULT_PASSWORD_HASH = "$2b$12$abcdefghijklmnopqrstuuJkq2s75xzu6G5g1mIMrX2V2m7x3x8xW"

SCENARIOS = {
    "Worse_Diet_Dairy": {"id": 1, "gender": "여", "type": "worse"},
    "Worse_Diet_HighGI": {"id": 2, "gender": "남", "type": "worse"},
    "Worse_Behavior_SleepStress": {"id": 3, "gender": "여", "type": "worse"},
    "Worse_Behavior_Alcohol": {"id": 4, "gender": "남", "type": "worse"},
    "Worse_Environment_PM25_UV": {"id": 5, "gender": "여", "type": "worse"},
    "Worse_Cosmetic_Irritant": {"id": 6, "gender": "여", "type": "worse"},
    "Worse_Female_Period": {"id": 7, "gender": "여", "type": "worse"},
    "Worse_Male_Shaving": {"id": 8, "gender": "남", "type": "worse"},
    "Better_Diet_Clean": {"id": 9, "gender": "여", "type": "better"},
    "Better_Behavior_SleepExercise": {"id": 10, "gender": "남", "type": "better"},
    "Better_Environment_Optimal": {"id": 11, "gender": "여", "type": "better"},
    "Better_Cosmetic_StoppedIrritant": {"id": 12, "gender": "여", "type": "better"},
    "Better_Medication_Skin": {"id": 13, "gender": "남", "type": "better"},
    "Better_Female_PostPeriod": {"id": 14, "gender": "여", "type": "better"},
}


FOOD_FIXTURES = {
    "milk": {
        "api_food_code": "dummy_milk",
        "name": "우유",
        "category": "유제품",
        "calories": 130,
        "carbohydrate": 10,
        "sugar": 10,
        "protein": 7,
        "fat": 5,
        "sodium": 100,
        "skin_factors": [{"key": "dairy_confirmed"}],
    },
    "cheesecake": {
        "api_food_code": "dummy_cheesecake",
        "name": "치즈케이크",
        "category": "디저트",
        "calories": 320,
        "carbohydrate": 36,
        "sugar": 28,
        "protein": 6,
        "fat": 18,
        "sodium": 250,
        "skin_factors": [{"key": "dairy_confirmed"}, {"key": "high_gl_candidate"}],
    },
    "ramen": {
        "api_food_code": "dummy_ramen",
        "name": "라면",
        "category": "고GI",
        "calories": 500,
        "carbohydrate": 75,
        "sugar": 4,
        "protein": 10,
        "fat": 16,
        "sodium": 1700,
        "skin_factors": [{"key": "high_gl_candidate"}],
    },
    "white_bread": {
        "api_food_code": "dummy_white_bread",
        "name": "흰빵",
        "category": "고GI",
        "calories": 260,
        "carbohydrate": 48,
        "sugar": 6,
        "protein": 8,
        "fat": 4,
        "sodium": 420,
        "skin_factors": [{"key": "high_gl_candidate"}],
    },
    "salad": {
        "api_food_code": "dummy_salad",
        "name": "샐러드",
        "category": "채소",
        "calories": 120,
        "carbohydrate": 12,
        "sugar": 5,
        "protein": 5,
        "fat": 6,
        "sodium": 160,
        "skin_factors": [],
    },
    "brown_rice": {
        "api_food_code": "dummy_brown_rice",
        "name": "현미밥",
        "category": "저GI",
        "calories": 300,
        "carbohydrate": 64,
        "sugar": 1,
        "protein": 6,
        "fat": 2,
        "sodium": 5,
        "skin_factors": [],
    },
}


def _decimal(value):
    return Decimal(str(value))


def _dummy_email(scenario_name: str, rep: int) -> str:
    return f"{DUMMY_EMAIL_PREFIX}{scenario_name}_{rep}{DUMMY_EMAIL_DOMAIN}"


def get_base_behavior() -> dict:
    return {
        "sleep_hours": _decimal(round(random.uniform(6.5, 8.0), 1)),
        "sleep_quality": random.randint(3, 4),
        "stress_level": random.randint(2, 3),
        "water_intake_ml": random.randint(1200, 2000),
        "exercise_yn": random.choice([True, False]),
        "exercise_type": None,
        "exercise_duration_min": None,
        "alcohol_yn": False,
        "smoking_yn": False,
        "custom_behaviors": [],
    }


def get_base_environment() -> dict:
    return {
        "lat": _decimal("37.566500"),
        "lng": _decimal("126.978000"),
        "location_name": "서울 중구",
        "temperature": _decimal(round(random.uniform(15.0, 25.0), 1)),
        "humidity": random.randint(40, 60),
        "pm10": random.randint(20, 50),
        "pm25": random.randint(10, 30),
        "uv_index": random.randint(2, 5),
        "weather": "맑음",
    }


def _get_or_create_food(db, fixture_key: str) -> FoodItem:
    fixture = FOOD_FIXTURES[fixture_key]
    food = db.query(FoodItem).filter(FoodItem.api_food_code == fixture["api_food_code"]).first()
    if food is None:
        food = FoodItem(source="dummy", **fixture)
        db.add(food)
        db.flush()
    return food


def _get_or_create_ingredient(db, name: str, *, is_irritant=False, comedogenic=None):
    ingredient = db.query(CosmeticIngredient).filter(CosmeticIngredient.name == name).first()
    if ingredient is None:
        ingredient = CosmeticIngredient(
            name=name,
            is_irritant=is_irritant,
            is_banned=False,
            comedogenic=comedogenic,
            comedogenic_source="dummy",
        )
        db.add(ingredient)
        db.flush()
    else:
        ingredient.is_irritant = ingredient.is_irritant or is_irritant
        if ingredient.comedogenic is None:
            ingredient.comedogenic = comedogenic
            ingredient.comedogenic_source = "dummy" if comedogenic is not None else ingredient.comedogenic_source
    return ingredient


def _get_or_create_cosmetic_product(db, *, brand: str, product_name: str, ingredient_specs: list[dict]):
    product = (
        db.query(CosmeticProduct)
        .filter(CosmeticProduct.brand == brand, CosmeticProduct.product_name == product_name)
        .first()
    )
    if product is None:
        product = CosmeticProduct(
            brand=brand,
            product_name=product_name,
            category="dummy",
            ingredients=", ".join(spec["name"] for spec in ingredient_specs),
        )
        db.add(product)
        db.flush()

    existing_ids = {ingredient.id for ingredient in product.ingredients_list}
    for spec in ingredient_specs:
        ingredient = _get_or_create_ingredient(db, **spec)
        if ingredient.id not in existing_ids:
            product.ingredients_list.append(ingredient)
            existing_ids.add(ingredient.id)
    db.flush()
    return product


def _get_or_create_medication(db, *, name: str, form: str, ingredient_name: str, drug_class: str):
    medication = db.query(Medication).filter(Medication.name == name, Medication.form == form).first()
    if medication is None:
        medication = Medication(name=name, form=form)
        db.add(medication)
        db.flush()

    ingredient = (
        db.query(MedicationIngredient)
        .filter(MedicationIngredient.name == ingredient_name)
        .first()
    )
    if ingredient is None:
        ingredient = MedicationIngredient(
            name=ingredient_name,
            drug_class=drug_class,
            is_skin_relevant=True,
        )
        db.add(ingredient)
        db.flush()
    else:
        ingredient.drug_class = ingredient.drug_class or drug_class
        ingredient.is_skin_relevant = True

    if ingredient.id not in {item.id for item in medication.ingredients_list}:
        medication.ingredients_list.append(ingredient)
        db.flush()
    return medication


def _add_diet_log(db, user_id: int, logged_at: datetime, food_keys: list[str], note: str):
    if not food_keys:
        return
    log = DietLog(
        user_id=user_id,
        logged_at=logged_at,
        meal_type="점심",
        input_method="manual",
        note=note,
    )
    db.add(log)
    db.flush()
    for food_key in food_keys:
        food = _get_or_create_food(db, food_key)
        db.add(
            DietLogItem(
                diet_log_id=log.id,
                food_item_id=food.id,
                amount=_decimal("1.0"),
                unit="serving",
            )
        )


def _add_user_cosmetics(db, user_id: int, scenario_name: str, start_date: date, current_date: date):
    if scenario_name == "Worse_Cosmetic_Irritant":
        product = _get_or_create_cosmetic_product(
            db,
            brand="DummyLab",
            product_name="Irritant Toner",
            ingredient_specs=[
                {"name": "Alcohol Denat.", "is_irritant": True, "comedogenic": 1},
                {"name": "Fragrance", "is_irritant": True, "comedogenic": 2},
            ],
        )
        db.add(UserCosmetic(user_id=user_id, product_id=product.id, is_current=True, started_at=start_date))
    elif scenario_name == "Better_Cosmetic_StoppedIrritant":
        stopped = _get_or_create_cosmetic_product(
            db,
            brand="DummyLab",
            product_name="Stopped Irritant Cream",
            ingredient_specs=[
                {"name": "Isopropyl Myristate", "is_irritant": True, "comedogenic": 5},
            ],
        )
        gentle = _get_or_create_cosmetic_product(
            db,
            brand="DummyLab",
            product_name="Gentle Barrier Lotion",
            ingredient_specs=[
                {"name": "Glycerin", "is_irritant": False, "comedogenic": 0},
                {"name": "Panthenol", "is_irritant": False, "comedogenic": 0},
            ],
        )
        db.add(
            UserCosmetic(
                user_id=user_id,
                product_id=stopped.id,
                is_current=False,
                started_at=start_date - timedelta(days=21),
                ended_at=start_date + timedelta(days=3),
            )
        )
        db.add(
            UserCosmetic(
                user_id=user_id,
                product_id=gentle.id,
                is_current=True,
                started_at=start_date + timedelta(days=4),
            )
        )


def _add_user_medications(db, user_id: int, scenario_name: str, start_date: date):
    if scenario_name != "Better_Medication_Skin":
        return
    medication = _get_or_create_medication(
        db,
        name="Dummy Acne Support Tablet",
        form="tablet",
        ingredient_name="Doxycycline",
        drug_class="tetracycline_antibiotic",
    )
    db.add(
        UserMedication(
            user_id=user_id,
            medication_id=medication.id,
            is_current=True,
            started_at=start_date + timedelta(days=3),
            expected_end_at=start_date + timedelta(days=30),
        )
    )


def _reset_dummy_users(db) -> int:
    users = db.query(User).filter(User.email.like(f"{DUMMY_EMAIL_PREFIX}%{DUMMY_EMAIL_DOMAIN}")).all()
    count = len(users)
    for user in users:
        db.delete(user)
    db.flush()
    return count


def _apply_scenario(
    scenario_name: str,
    scenario_type: str,
    day_index: int,
    behavior_data: dict,
    env_data: dict,
) -> tuple[int, list[str], list[str]]:
    is_worse_phase = scenario_type == "worse" and day_index >= 9
    is_better_phase = scenario_type == "better" and day_index >= 4

    skin_score = random.randint(3, 4) if scenario_type == "worse" else random.randint(1, 2)
    tags: list[str] = []
    food_keys: list[str] = []

    if scenario_name == "Worse_Diet_Dairy" and is_worse_phase:
        food_keys = ["milk", "cheesecake"]
        skin_score = random.randint(1, 2)
        tags = ["트러블", "유분기"]
    elif scenario_name == "Worse_Diet_HighGI" and is_worse_phase:
        food_keys = ["ramen", "white_bread"]
        skin_score = random.randint(1, 2)
        tags = ["트러블", "유분기"]
    elif scenario_name == "Worse_Behavior_SleepStress" and is_worse_phase:
        behavior_data["sleep_hours"] = _decimal(round(random.uniform(3.0, 4.5), 1))
        behavior_data["sleep_quality"] = 1
        behavior_data["stress_level"] = 5
        skin_score = random.randint(1, 2)
        tags = ["트러블", "건조함", "피로"]
    elif scenario_name == "Worse_Behavior_Alcohol" and is_worse_phase:
        behavior_data["alcohol_yn"] = True
        behavior_data["water_intake_ml"] = random.randint(400, 800)
        skin_score = random.randint(1, 2)
        tags = ["붉은기", "건조함", "트러블"]
    elif scenario_name == "Worse_Environment_PM25_UV" and is_worse_phase:
        env_data["pm10"] = random.randint(90, 140)
        env_data["pm25"] = random.randint(45, 85)
        env_data["uv_index"] = random.randint(7, 10)
        env_data["weather"] = "고농도 미세먼지"
        skin_score = random.randint(1, 2)
        tags = ["민감함", "붉은기", "트러블"]
    elif scenario_name == "Worse_Cosmetic_Irritant" and is_worse_phase:
        skin_score = random.randint(1, 2)
        tags = ["민감함", "붉은기", "따가움"]
    elif scenario_name == "Worse_Female_Period":
        if day_index >= 9:
            skin_score = random.randint(1, 2)
            tags = ["트러블", "유분기"]
    elif scenario_name == "Worse_Male_Shaving" and is_worse_phase:
        behavior_data["custom_behaviors"] = ["면도 자극"]
        skin_score = random.randint(1, 2)
        tags = ["자극", "붉은기", "건조함"]
    elif scenario_name == "Better_Diet_Clean" and is_better_phase:
        food_keys = ["salad", "brown_rice"]
        skin_score = random.randint(4, 5)
        tags = ["좋음", "맑음"]
    elif scenario_name == "Better_Behavior_SleepExercise" and is_better_phase:
        behavior_data["sleep_hours"] = _decimal(round(random.uniform(7.5, 8.5), 1))
        behavior_data["sleep_quality"] = 5
        behavior_data["stress_level"] = 1
        behavior_data["exercise_yn"] = True
        behavior_data["exercise_type"] = "가벼운 유산소"
        behavior_data["exercise_duration_min"] = random.randint(30, 60)
        skin_score = random.randint(4, 5)
        tags = ["좋음", "생기"]
    elif scenario_name == "Better_Environment_Optimal" and is_better_phase:
        env_data["temperature"] = _decimal(round(random.uniform(19.0, 23.0), 1))
        env_data["humidity"] = random.randint(45, 55)
        env_data["pm10"] = random.randint(5, 25)
        env_data["pm25"] = random.randint(3, 15)
        env_data["uv_index"] = random.randint(1, 3)
        env_data["weather"] = "쾌적"
        skin_score = random.randint(4, 5)
        tags = ["좋음", "편안함"]
    elif scenario_name == "Better_Cosmetic_StoppedIrritant" and is_better_phase:
        skin_score = random.randint(4, 5)
        tags = ["좋음", "진정"]
    elif scenario_name == "Better_Medication_Skin" and is_better_phase:
        skin_score = random.randint(4, 5)
        tags = ["좋음", "트러블 감소"]
    elif scenario_name == "Better_Female_PostPeriod":
        if day_index <= 2:
            skin_score = random.randint(1, 2)
            tags = ["트러블", "민감함"]
        elif is_better_phase:
            skin_score = random.randint(4, 5)
            tags = ["좋음", "진정"]

    return skin_score, tags, food_keys


def seed_scenarios(
    db,
    *,
    scenario_names: list[str],
    repetitions: int,
    end_date: date,
    dry_run: bool,
) -> list[dict]:
    created: list[dict] = []
    start_date = end_date - timedelta(days=LOOKBACK_DAYS - 1)

    for scenario_name in scenario_names:
        scenario = SCENARIOS[scenario_name]
        for rep in range(1, repetitions + 1):
            email = _dummy_email(scenario_name, rep)
            if db.query(User).filter(User.email == email).first() is not None:
                print(f"[skip] {email} already exists. Use --reset-dummy to recreate it.")
                continue

            print(f"[seed] {email}")
            user = User(
                email=email,
                name=f"Dummy {scenario['id']}-{rep}",
                hashed_password=DEFAULT_PASSWORD_HASH,
                skin_type=random.choice(["건성", "지성", "복합성", "민감성", "중성"]),
                gender=scenario["gender"],
                avg_cycle_length=28 if scenario["gender"] == "여" else None,
                birth_year=1995,
                is_onboarded=True,
                terms_agreed_at=datetime.now(),
            )
            db.add(user)
            db.flush()

            _add_user_cosmetics(db, user.id, scenario_name, start_date, end_date)
            _add_user_medications(db, user.id, scenario_name, start_date)

            last_skin_log_id = None
            for day_index in range(LOOKBACK_DAYS):
                current_date = start_date + timedelta(days=day_index)
                logged_at = datetime.combine(current_date, datetime.min.time())
                behavior_data = get_base_behavior()
                env_data = get_base_environment()
                skin_score, tags, food_keys = _apply_scenario(
                    scenario_name,
                    scenario["type"],
                    day_index,
                    behavior_data,
                    env_data,
                )

                skin_log = SkinLog(
                    user_id=user.id,
                    logged_at=current_date,
                    overall_score=skin_score,
                    condition_tags=tags,
                    note=f"{scenario_name} dummy scenario day {day_index + 1}",
                )
                db.add(skin_log)
                db.flush()
                last_skin_log_id = skin_log.id

                db.add(DailyBehaviorLog(user_id=user.id, logged_at=current_date, **behavior_data))
                db.add(
                    EnvironmentLog(
                        user_id=user.id,
                        logged_at=current_date,
                        source="manual",
                        captured_at=logged_at,
                        **env_data,
                    )
                )
                _add_diet_log(
                    db,
                    user.id,
                    logged_at,
                    food_keys,
                    note=f"{scenario_name} dummy diet signal",
                )

                if scenario_name == "Worse_Female_Period" and day_index == 13:
                    db.add(PeriodLog(user_id=user.id, started_at=current_date))
                elif scenario_name == "Better_Female_PostPeriod" and day_index == 0:
                    db.add(PeriodLog(user_id=user.id, started_at=current_date))

            created.append(
                {
                    "email": email,
                    "user_id": user.id,
                    "scenario": scenario_name,
                    "last_skin_log_id": last_skin_log_id,
                }
            )

    if dry_run:
        db.rollback()
    else:
        db.commit()
    return created
