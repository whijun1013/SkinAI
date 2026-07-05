import os
import sys
import unittest
from datetime import date, datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.deps.auth import get_current_user
from app.models.behavior import DailyBehaviorLog
from app.models.cosmetic import CosmeticProduct, UserCosmetic
from app.models.diet import DietLog, DietLogItem, FoodItem
from app.models.environment import EnvironmentLog
from app.models.medication import Medication, UserMedication
from app.models.skin_log import SkinLog


@compiles(BigInteger, "sqlite")
def compile_bigint_sqlite(type_, compiler, **kw):
    return "INTEGER"


@compiles(TINYINT, "sqlite")
def compile_tinyint_sqlite(type_, compiler, **kw):
    return "INTEGER"


SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


from main import app


mock_user = type("MockUser", (), {"id": 1, "email": "test@example.com", "name": "Test User"})()


def override_get_current_user():
    return mock_user


class TestReportAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self._previous_current_user_override = app.dependency_overrides.get(get_current_user)
        self._previous_get_db_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_current_user] = override_get_current_user
        app.dependency_overrides[get_db] = override_get_db
        self.db = TestingSessionLocal()
        self.client = TestClient(app)

    def tearDown(self):
        for model in [
            DietLogItem,
            DietLog,
            FoodItem,
            DailyBehaviorLog,
            EnvironmentLog,
            UserCosmetic,
            CosmeticProduct,
            UserMedication,
            Medication,
            SkinLog,
        ]:
            self.db.query(model).delete()
        self.db.commit()
        self.db.close()
        self._restore_override(get_current_user, self._previous_current_user_override)
        self._restore_override(get_db, self._previous_get_db_override)

    def test_daily_feature_summary_returns_day_inputs_and_signals(self):
        target = date(2026, 6, 14)
        self._seed_daily_records(target)

        response = self.client.get("/users/me/report/daily-feature-summary?date=2026-06-14")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["date"], "2026-06-14")
        self.assertEqual(data["skin"]["score"], 2)
        self.assertEqual(data["skin"]["tags"], ["붉음", "건조"])
        self.assertTrue(data["skin"]["has_photo"])

        self.assertEqual(data["diet"]["meal_count"], 2)
        self.assertEqual(data["diet"]["item_count"], 2)
        self.assertEqual(data["diet"]["high_gi_count"], 1)
        self.assertEqual(data["diet"]["dairy_count"], 1)
        self.assertIn("아침", data["diet"]["meal_types"])
        self.assertIn("고당지수 후보 1건", data["diet"]["signals"])
        self.assertIn("유제품 후보 1건", data["diet"]["signals"])

        self.assertEqual(data["behavior"]["sleep_hours"], 5.5)
        self.assertEqual(data["behavior"]["stress_level"], 4)
        self.assertIn("수면 부족", data["behavior"]["signals"])
        self.assertIn("스트레스 높음", data["behavior"]["signals"])

        self.assertEqual(data["environment"]["log_count"], 1)
        self.assertEqual(data["environment"]["pm25"], 38)
        self.assertEqual(data["environment"]["humidity"], 72)
        self.assertIn("PM2.5 높음", data["environment"]["signals"])
        self.assertIn("습도 높음", data["environment"]["signals"])

        self.assertEqual(data["cosmetics"]["current_count"], 1)
        self.assertEqual(data["cosmetics"]["recent_started"], 1)
        self.assertEqual(data["cosmetics"]["names"], ["Retinol Cream"])
        self.assertEqual(data["medications"]["current_count"], 1)
        self.assertEqual(data["medications"]["recent_started"], 1)
        self.assertEqual(data["medications"]["names"], ["Skin Pill"])

    def test_daily_feature_summary_returns_empty_sections_for_missing_records(self):
        response = self.client.get("/users/me/report/daily-feature-summary?date=2026-06-14")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["skin"]["score"], None)
        self.assertEqual(data["skin"]["tags"], [])
        self.assertEqual(data["diet"]["meal_count"], 0)
        self.assertEqual(data["behavior"]["signals"], [])
        self.assertEqual(data["environment"]["log_count"], 0)
        self.assertEqual(data["cosmetics"]["current_count"], 0)
        self.assertEqual(data["medications"]["current_count"], 0)

    def test_daily_feature_summary_requires_date_query(self):
        response = self.client.get("/users/me/report/daily-feature-summary")

        self.assertEqual(response.status_code, 422)

    def _seed_daily_records(self, target):
        self.db.add(
            SkinLog(
                user_id=1,
                logged_at=target,
                overall_score=2,
                condition_tags=["붉음", "건조"],
                photo_url="https://example.com/skin.jpg",
            )
        )

        high_gi_food = FoodItem(name="Cake", skin_factors=[{"key": "high_gl_candidate", "level": "high"}])
        dairy_food = FoodItem(name="Milk", skin_factors=[{"key": "dairy_confirmed", "level": "high"}])
        self.db.add_all([high_gi_food, dairy_food])
        self.db.flush()

        breakfast = DietLog(
            user_id=1,
            logged_at=datetime(2026, 6, 14, 8, 0, 0),
            meal_type="아침",
            input_method="manual",
        )
        snack = DietLog(
            user_id=1,
            logged_at=datetime(2026, 6, 14, 15, 0, 0),
            meal_type="간식",
            input_method="manual",
        )
        other_day = DietLog(
            user_id=1,
            logged_at=datetime(2026, 6, 13, 8, 0, 0),
            meal_type="아침",
            input_method="manual",
        )
        self.db.add_all([breakfast, snack, other_day])
        self.db.flush()
        self.db.add_all(
            [
                DietLogItem(diet_log_id=breakfast.id, food_item_id=high_gi_food.id),
                DietLogItem(diet_log_id=snack.id, food_item_id=dairy_food.id),
            ]
        )

        self.db.add(
            DailyBehaviorLog(
                user_id=1,
                logged_at=target,
                sleep_hours=5.5,
                sleep_quality=2,
                stress_level=4,
                water_intake_ml=1200,
                exercise_yn=True,
                exercise_type="walk",
                exercise_duration_min=20,
                alcohol_yn=False,
                smoking_yn=False,
            )
        )
        self.db.add(
            EnvironmentLog(
                user_id=1,
                logged_at=target,
                temperature=28.5,
                humidity=72,
                pm10=50,
                pm25=38,
                uv_index=7,
                weather="sunny",
                source="manual",
                captured_at=datetime(2026, 6, 14, 12, 0, 0),
            )
        )

        product = CosmeticProduct(brand="A", product_name="Retinol Cream")
        old_product = CosmeticProduct(brand="B", product_name="Old Cream")
        med = Medication(name="Skin Pill")
        self.db.add_all([product, old_product, med])
        self.db.flush()
        self.db.add_all(
            [
                UserCosmetic(user_id=1, product_id=product.id, is_current=True, started_at=target - timedelta(days=2)),
                UserCosmetic(user_id=1, product_id=old_product.id, is_current=False, started_at=target - timedelta(days=20)),
                UserMedication(user_id=1, medication_id=med.id, is_current=True, started_at=target - timedelta(days=1)),
            ]
        )
        self.db.commit()

    def _restore_override(self, dependency, previous):
        if previous is None:
            app.dependency_overrides.pop(dependency, None)
        else:
            app.dependency_overrides[dependency] = previous


if __name__ == "__main__":
    unittest.main()
