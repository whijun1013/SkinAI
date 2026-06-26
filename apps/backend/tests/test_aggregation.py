import os
import sys
import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import BigInteger, create_engine
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.analysis import UserBaseline, UserFactorSensitivity
from app.models.behavior import DailyBehaviorLog
from app.models.cosmetic import CosmeticIngredient, CosmeticProduct, UserCosmetic
from app.models.diet import DietLog, DietLogItem, FoodItem
from app.models.environment import EnvironmentLog
from app.models.medication import Medication, MedicationIngredient, UserMedication
from app.models.skin_log import SkinLog
from app.models.user import User
from app.services.aggregation import (
    aggregate_behavior_log,
    aggregate_cosmetic_risk,
    aggregate_diet_log,
    aggregate_environment_log,
    aggregate_medication_risk,
    aggregate_skin_log,
    extract_worst_context,
)
from app.services.analysis_readiness import check_continuous_log
from app.services.context_builder import build_analysis_context
from app.services.cosmetic_risk import summarize_cosmetic_ingredients


@compiles(TINYINT, "sqlite")
def compile_tinyint_sqlite(type_, compiler, **kw):
    return "INTEGER"


@compiles(BigInteger, "sqlite")
def compile_bigint_sqlite(type_, compiler, **kw):
    return "INTEGER"


engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class TestAggregation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self.db = TestingSessionLocal()
        self.db.add(
            User(
                id=1,
                email="aggregation@example.com",
                name="Aggregation",
                hashed_password="hashed",
                terms_agreed_at=datetime(2026, 1, 1),
            )
        )
        self.db.commit()
        self.end_date = date(2026, 6, 1)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

    def test_empty_data_returns_fixed_structures(self):
        self.assertEqual(
            aggregate_skin_log(self.db, 1, 14, self.end_date),
            {
                "avg_score": None,
                "min_score": None,
                "worst_date": None,
                "tag_frequency": {},
                "record_count": 0,
            },
        )
        self.assertEqual(aggregate_behavior_log(self.db, 1, 14, self.end_date)["record_count"], 0)
        self.assertEqual(aggregate_diet_log(self.db, 1, 14, self.end_date)["matched_record_count"], 0)
        self.assertEqual(aggregate_environment_log(self.db, 1, 14, self.end_date)["record_count"], 0)
        self.assertEqual(
            aggregate_cosmetic_risk(self.db, 1),
            {"irritant_ingredients": [], "high_comedogenic": [], "banned_ingredients": []},
        )
        self.assertEqual(aggregate_medication_risk(self.db, 1), {"skin_relevant_medications": []})
        self.assertEqual(
            extract_worst_context(self.db, 1, None),
            {"date": None, "sleep": None, "stress": None, "pm25": None, "diet_category": None},
        )
        self.assertEqual(
            build_analysis_context(self.db, 1, 14, self.end_date)["personal"],
            {
                "skin_tendency": None,
                "skin_type_fallback": None,
                "top_sensitivities": [],
                "analysis_count": 0,
                "is_personalization_cold_start": True,
            },
        )

    def test_daily_representatives_boundaries_and_readiness(self):
        old_created = datetime(2026, 6, 1, 8)
        new_created = datetime(2026, 6, 1, 9)
        rows = [
            SkinLog(user_id=1, logged_at=date(2026, 5, 19), overall_score=5),
            SkinLog(user_id=1, logged_at=date(2026, 5, 20), overall_score=1, condition_tags=["건조함"]),
            SkinLog(user_id=1, logged_at=date(2026, 5, 21), overall_score=1),
            SkinLog(user_id=1, logged_at=date(2026, 5, 27), overall_score=1, condition_tags=["이전"], created_at=old_created),
            SkinLog(user_id=1, logged_at=date(2026, 5, 27), overall_score=4, condition_tags=["최신"], created_at=new_created),
        ]
        for offset in range(5):
            logged_at = self.end_date - timedelta(days=offset)
            rows.append(SkinLog(user_id=1, logged_at=logged_at, overall_score=3))
            rows.append(DailyBehaviorLog(user_id=1, logged_at=logged_at, sleep_hours=7))
        rows.append(
            SkinLog(
                user_id=1,
                logged_at=date(2026, 5, 26),
                overall_score=None,
                condition_tags=["draft"],
            )
        )
        rows.append(DailyBehaviorLog(user_id=1, logged_at=date(2026, 5, 26), sleep_hours=7))
        self.db.add_all(rows)
        self.db.commit()

        result = aggregate_skin_log(self.db, 1, 13, self.end_date)
        self.assertEqual(result["worst_date"], "2026-05-20")
        self.assertNotIn("이전", result["tag_frequency"])
        self.assertNotIn("draft", result["tag_frequency"])
        self.assertEqual(result["tag_frequency"]["최신"], 1)
        self.assertEqual(result["record_count"], 8)
        self.assertEqual(check_continuous_log(self.db, 1, self.end_date)["recorded_days"], 5)
        self.assertTrue(check_continuous_log(self.db, 1, self.end_date)["is_ready"])

    @patch("app.services.environment_service.fetch_airkorea_pm")
    @patch("app.services.environment_service.fetch_kma_living_uv_index")
    @patch("app.services.environment_service.fetch_kma_weather_data")
    def test_environment_uses_saved_rows_only_and_deduplicates_days(self, weather, uv, pm):
        self.db.add_all(
            [
                EnvironmentLog(
                    user_id=1, logged_at=self.end_date, humidity=40, pm10=79, pm25=34,
                    uv_index=5, source="manual", captured_at=datetime(2026, 6, 1, 8),
                ),
                EnvironmentLog(
                    user_id=1, logged_at=self.end_date, humidity=60, pm10=80, pm25=35,
                    uv_index=6, source="manual", captured_at=datetime(2026, 6, 1, 9),
                ),
                EnvironmentLog(
                    user_id=1, logged_at=date(2026, 5, 31), humidity=100, pm10=20, pm25=20,
                    uv_index=1, source="manual", captured_at=datetime(2026, 5, 31, 8),
                ),
            ]
        )
        self.db.commit()

        result = aggregate_environment_log(self.db, 1, 2, self.end_date)
        self.assertEqual(result, {
            "avg_humidity": 75.0,
            "pm10_bad_days": 1,
            "pm25_bad_days": 1,
            "uv_high_days": 1,
            "record_count": 2,
        })
        weather.assert_not_called()
        uv.assert_not_called()
        pm.assert_not_called()

    def test_diet_worst_context_and_matched_items(self):
        rice = FoodItem(name="Rice", category="한식", sugar=10, sodium=100, skin_factors=[{"key": "high_gl_candidate"}])
        milk = FoodItem(name="Milk", category="유제품", sugar=20, sodium=300, skin_factors=[{"key": "dairy_confirmed"}])
        self.db.add_all([rice, milk])
        self.db.flush()
        first = DietLog(user_id=1, logged_at=datetime(2026, 6, 1, 8))
        second = DietLog(user_id=1, logged_at=datetime(2026, 5, 31, 8))
        self.db.add_all([first, second])
        self.db.flush()
        self.db.add_all([
            DietLogItem(diet_log_id=first.id, food_item_id=rice.id),
            DietLogItem(diet_log_id=first.id, food_item_id=rice.id),
            DietLogItem(diet_log_id=first.id, custom_food_name="미매칭"),
            DietLogItem(diet_log_id=second.id, food_item_id=milk.id),
        ])
        self.db.add_all([
            DailyBehaviorLog(user_id=1, logged_at=self.end_date, sleep_hours=4, stress_level=5),
            EnvironmentLog(
                user_id=1, logged_at=self.end_date, pm25=92, source="manual",
                captured_at=datetime(2026, 6, 1, 8),
            ),
        ])
        self.db.commit()

        result = aggregate_diet_log(self.db, 1, 2, self.end_date)
        self.assertEqual(result["avg_sugar"], 20.0)
        self.assertEqual(result["avg_sodium"], 250.0)
        self.assertEqual(result["matched_record_count"], 3)
        self.assertEqual(result["high_gi_count"], 2)
        self.assertEqual(result["dairy_count"], 1)
        self.assertEqual(extract_worst_context(self.db, 1, self.end_date)["diet_category"], "한식")

    def test_cosmetic_medication_and_context_builder(self):
        low = CosmeticIngredient(name="Low", comedogenic=1)
        high = CosmeticIngredient(name="High", comedogenic=3, is_irritant=True, is_banned=True)
        product = CosmeticProduct(brand="Brand", product_name="Product", ingredients_list=[low, high])
        medication_ingredient = MedicationIngredient(name="Relevant", is_skin_relevant=True)
        medication = Medication(name="Medication", ingredients_list=[medication_ingredient])
        self.db.add_all([product, medication])
        self.db.flush()
        self.db.add_all([
            UserCosmetic(user_id=1, product_id=product.id, is_current=True),
            UserMedication(user_id=1, medication_id=medication.id, is_current=True),
            UserBaseline(user_id=1, skin_tendency="민감성", analysis_count=4),
            UserFactorSensitivity(user_id=1, factor_type="food", factor_key="B", sensitivity_score=0.8),
            UserFactorSensitivity(user_id=1, factor_type="ingredient", factor_key="A", sensitivity_score=0.8),
        ])
        self.db.commit()

        product_risk = summarize_cosmetic_ingredients([low, high])
        self.assertEqual(product_risk["comedogenic_count"], 2)
        self.assertEqual(aggregate_cosmetic_risk(self.db, 1)["high_comedogenic"], ["High"])
        self.assertEqual(aggregate_medication_risk(self.db, 1)["skin_relevant_medications"], ["Relevant"])
        context = build_analysis_context(self.db, 1, 14, self.end_date)
        self.assertFalse(context["personal"]["is_personalization_cold_start"])
        self.assertEqual(
            context["personal"]["top_sensitivities"],
            [
                {"factor_type": "food", "factor_key": "B", "score": 0.8},
                {"factor_type": "ingredient", "factor_key": "A", "score": 0.8},
            ],
        )
        self.assertEqual(context["meta"]["lookback_days"], 14)

    def test_cold_start_threshold_is_4(self):
        self.db.add(UserBaseline(user_id=1, analysis_count=3))
        self.db.commit()

        context = build_analysis_context(self.db, 1, 14, self.end_date)
        self.assertTrue(context["personal"]["is_personalization_cold_start"])

        baseline = self.db.query(UserBaseline).filter(UserBaseline.user_id == 1).one()
        baseline.analysis_count = 4
        self.db.commit()

        context = build_analysis_context(self.db, 1, 14, self.end_date)
        self.assertFalse(context["personal"]["is_personalization_cold_start"])

    def test_skin_type_fallback_only_set_during_cold_start(self):
        user = self.db.query(User).filter(User.id == 1).one()
        user.skin_type = "지성"
        self.db.add(UserBaseline(user_id=1, analysis_count=3))
        self.db.commit()

        context = build_analysis_context(self.db, 1, 14, self.end_date)
        self.assertEqual(context["personal"]["skin_type_fallback"], "지성")

        baseline = self.db.query(UserBaseline).filter(UserBaseline.user_id == 1).one()
        baseline.analysis_count = 4
        self.db.commit()

        context = build_analysis_context(self.db, 1, 14, self.end_date)
        self.assertIsNone(context["personal"]["skin_type_fallback"])


if __name__ == "__main__":
    unittest.main()
