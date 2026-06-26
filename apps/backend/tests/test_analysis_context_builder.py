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
from app.models.location import UserLocation
from app.models.medication import Medication, MedicationIngredient, UserMedication
from app.models.period import PeriodLog
from app.models.skin_log import SkinLog
from app.models.user import User
from app.services.analysis_context_builder import build_analysis_context
from app.services.context_builder import build_analysis_context as build_stats_context
from app.services.analysis_exceptions import AnalysisContextError, SkinLogNotFoundError


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


class TestAnalysisContextBuilder(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self.db = TestingSessionLocal()
        self.end_date = date(2026, 6, 1)
        self.user_id = 1

    def tearDown(self):
        self.db.rollback()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()
        self.db.close()

    def _skin_log(self, logged_at, user_id=1, **kwargs):
        if "overall_score" not in kwargs:
            kwargs["overall_score"] = 3
        row = SkinLog(user_id=user_id, logged_at=logged_at, **kwargs)
        self.db.add(row)
        self.db.flush()
        return row

    def _build(self, trigger_log, **kwargs):
        self.db.commit()
        return build_analysis_context(
            self.db,
            self.user_id,
            trigger_log.id,
            kwargs.pop("lookback_days", 14),
        )

    def test_rejects_missing_other_user_and_invalid_days(self):
        other_log = self._skin_log(self.end_date, user_id=2)
        self.db.commit()
        with self.assertRaises(SkinLogNotFoundError):
            build_analysis_context(self.db, 1, other_log.id)
        with self.assertRaises(SkinLogNotFoundError):
            build_analysis_context(self.db, 1, 9999)
        with self.assertRaises(AnalysisContextError):
            build_analysis_context(self.db, 1, other_log.id, 7)

    def test_timeline_uses_trigger_date_has_fourteen_days_and_empty_shape(self):
        trigger = self._skin_log(self.end_date, overall_score=2, condition_tags=["dry"])
        result = self._build(trigger)
        timeline = result["daily_timeline"]
        self.assertEqual(len(timeline), 14)
        self.assertEqual(timeline[0]["date"], "2026-05-19")
        self.assertEqual(timeline[-1]["date"], "2026-06-01")
        self.assertEqual(
            timeline[0],
            {
                "date": "2026-05-19",
                "skin": None,
                "diet": [],
                "environment": None,
                "behavior": None,
            },
        )
        self.assertEqual(result["meta"]["trigger_date"], "2026-06-01")
        self.assertEqual(result["meta"]["data_coverage"]["skin_days"], 1)

    def test_period_cycle_snapshot_uses_latest_start_before_analysis_window(self):
        self.db.add(
            User(
                id=self.user_id,
                email="cycle-context@nuvo.test",
                name="Cycle Context",
                hashed_password="hash",
                gender="여",
                avg_cycle_length=30,
                cycle_regularity="규칙적",
            )
        )
        self.db.add(
            PeriodLog(
                user_id=self.user_id,
                started_at=date(2026, 6, 5),
            )
        )
        trigger = self._skin_log(date(2026, 6, 23), overall_score=3)

        result = self._build(trigger)

        self.assertEqual(result["context"]["period_logs"], [])
        self.assertEqual(
            result["context"]["period_cycle_snapshot"],
            {
                "target_date": "2026-06-23",
                "applicable": True,
                "last_period_start": "2026-06-05",
                "cycle_day": 19,
                "cycle_length_used": 30,
                "cycle_length_source": "user",
                "estimated_cycle_length": None,
                "phase": "luteal",
                "phase_label_ko": "황체기",
                "cycle_regularity_reported": "규칙적",
                "cycle_regularity_inferred": "unknown",
                "confidence": "medium",
                "message": None,
            },
        )

    def test_golden_json_includes_existing_summary(self):
        trigger = self._skin_log(self.end_date, overall_score=2, condition_tags=["dry"])
        summary = {"personal": {}, "stats": {}, "worst_day": {}}
        with patch(
            "app.services.analysis_context_builder.existing_context_builder.build_analysis_context",
            return_value=summary,
        ) as existing_builder:
            with patch(
                "app.services.analysis_context_builder.check_continuous_log",
                return_value={"recorded_days": 0, "is_ready": False},
            ):
                result = self._build(trigger)
        empty_days = [
            {
                "date": (date(2026, 5, 19) + timedelta(days=offset)).isoformat(),
                "skin": None,
                "diet": [],
                "environment": None,
                "behavior": None,
            }
            for offset in range(13)
        ]
        self.assertEqual(
            result,
            {
                "meta": {
                    "trigger_date": "2026-06-01",
                    "trigger_score": 2,
                    "trigger_tags": ["dry"],
                    "lookback_days": 14,
                    "data_coverage": {
                        "skin_days": 1,
                        "behavior_days": 0,
                        "diet_days": 0,
                        "env_days": 0,
                    },
                    "data_quality": {
                        "skin_behavior_overlap_days": 0,
                        "has_sufficient_overlap": False,
                    },
                },
                "daily_timeline": empty_days
                + [
                    {
                        "date": "2026-06-01",
                        "skin": {
                            "overall_score": 2,
                            "tags": ["dry"],
                            "note": None,
                        },
                        "diet": [],
                        "environment": None,
                        "behavior": None,
                    }
                ],
                "context": {
                    "current_cosmetics": [],
                    "current_medications": [],
                },
                "summary": summary,
                "candidate_signals": [],
            },
        )
        existing_builder.assert_called_once_with(
            db=self.db,
            user_id=1,
            lookback_days=14,
            end_date=self.end_date,
        )

    def test_past_trigger_excludes_future_rows(self):
        trigger = self._skin_log(date(2026, 5, 10), overall_score=3)
        self._skin_log(date(2026, 6, 1), overall_score=1)
        result = self._build(trigger)
        self.assertEqual(result["daily_timeline"][-1]["date"], "2026-05-10")
        self.assertEqual(result["meta"]["data_coverage"]["skin_days"], 1)

    def test_skin_and_behavior_use_daily_representatives_and_truncate_note(self):
        old_skin = self._skin_log(self.end_date, overall_score=4, note="old")
        new_skin = self._skin_log(
            self.end_date,
            overall_score=2,
            note="x" * 220,
        )
        old_skin.created_at = datetime(2026, 6, 1, 9)
        new_skin.created_at = datetime(2026, 6, 1, 10)
        old_behavior = DailyBehaviorLog(
            user_id=1, logged_at=self.end_date, stress_level=1
        )
        new_behavior = DailyBehaviorLog(
            user_id=1,
            logged_at=self.end_date,
            stress_level=5,
            sleep_hours=6.5,
            alcohol_yn=True,
            exercise_yn=False,
        )
        self.db.add_all([old_behavior, new_behavior])
        self.db.flush()
        old_behavior.created_at = datetime(2026, 6, 1, 9)
        new_behavior.created_at = datetime(2026, 6, 1, 10)
        result = self._build(new_skin)
        day = result["daily_timeline"][-1]
        self.assertEqual(day["skin"]["overall_score"], 2)
        self.assertEqual(day["skin"]["note"], "x" * 200)
        self.assertEqual(day["behavior"]["stress_level"], 5)
        self.assertEqual(day["behavior"]["sleep_hours"], 6.5)
        self.assertEqual(result["candidate_signals"][0]["factor_key"], "stress_high")
        self.assertEqual(result["candidate_signals"][0]["label"], "높은 스트레스")

    def test_draft_skin_logs_are_excluded_from_context(self):
        trigger = self._skin_log(self.end_date, overall_score=2)
        self._skin_log(
            self.end_date - timedelta(days=1),
            overall_score=None,
            condition_tags=["draft-only"],
        )

        result = self._build(trigger)

        self.assertEqual(result["meta"]["data_coverage"]["skin_days"], 1)
        draft_day = result["daily_timeline"][-2]
        self.assertIsNone(draft_day["skin"])

    def test_medgemma_handoff_is_included_without_raw_scores(self):
        trigger = self._skin_log(self.end_date, overall_score=2)
        self.db.commit()

        result = build_analysis_context(
            self.db,
            self.user_id,
            trigger.id,
            "worse",
            medgemma_handoffs={
                trigger.id: {
                    "source": "medgemma",
                    "model": "google/medgemma-4b-it",
                    "prompt_version": "medgemma_face_observation_prompt_v2",
                    "usable_for_skin_observation": True,
                    "recommendation": "use",
                    "confidence": "medium",
                    "capture_quality": {"lighting_quality": "good"},
                    "observations": {
                        "redness": {
                            "level": "mild",
                            "regions": ["left_cheek"],
                            "evidence": "Diffuse pink tone on left cheek.",
                            "uncertainty": "medium",
                            "raw_score": 61,
                        }
                    },
                    "summary_for_report_model": "Visible cheek redness only.",
                }
            },
        )

        medgemma = result["daily_timeline"][-1]["skin"]["medgemma"]
        self.assertEqual(medgemma["source"], "medgemma")
        self.assertEqual(medgemma["observations"]["redness"]["level"], "mild")
        self.assertNotIn("raw_score", medgemma["observations"]["redness"])

    def test_medgemma_handoff_is_excluded_if_rejected_or_unusable(self):
        trigger = self._skin_log(self.end_date, overall_score=2)
        self.db.commit()

        # Rejected recommendation
        result_rejected = build_analysis_context(
            self.db, self.user_id, trigger.id, "worse",
            medgemma_handoffs={
                trigger.id: {
                    "source": "medgemma",
                    "recommendation": "reject",
                    "usable": True,
                    "observations": {"redness": {"level": "mild"}},
                }
            },
        )
        self.assertNotIn("medgemma", result_rejected["daily_timeline"][-1]["skin"])

        # Unusable
        result_unusable = build_analysis_context(
            self.db, self.user_id, trigger.id, "worse",
            medgemma_handoffs={
                trigger.id: {
                    "source": "medgemma",
                    "recommendation": "review",
                    "usable_for_skin_observation": False,
                    "observations": {"redness": {"level": "mild"}},
                }
            },
        )
        self.assertNotIn("medgemma", result_unusable["daily_timeline"][-1]["skin"])

    def test_diet_environment_coverage_flags_and_external_api_non_use(self):
        trigger = self._skin_log(self.end_date)
        rice = FoodItem(
            name="Rice",
            skin_factors=[
                {
                    "key": "high_gl_candidate",
                    "label": "고혈당지수(추정)",
                    "source": "mixed_rule",
                    "evidence": ["탄수화물/당류 동반"],
                }
            ],
        )
        milk = FoodItem(
            name="Milk",
            skin_factors=[
                {
                    "key": "dairy_confirmed",
                    "label": "유제품",
                    "source": "raw_material_dictionary",
                    "evidence": ["raw_material:우유"],
                }
            ],
        )
        meal = DietLog(
            user_id=1,
            logged_at=datetime(2026, 6, 1, 12),
            meal_type="점심",
            input_method="manual",
        )
        self.db.add_all([rice, milk, meal])
        self.db.flush()
        self.db.add_all(
            [
                DietLogItem(diet_log_id=meal.id, food_item_id=rice.id),
                DietLogItem(diet_log_id=meal.id, food_item_id=milk.id),
                DietLogItem(diet_log_id=meal.id, custom_food_name="Custom"),
                DietLogItem(diet_log_id=meal.id),
                EnvironmentLog(
                    user_id=1,
                    logged_at=self.end_date,
                    temperature=20,
                    humidity=40,
                    pm25=None,
                    uv_index=2,
                    source="manual",
                    captured_at=datetime(2026, 6, 1, 10),
                ),
                EnvironmentLog(
                    user_id=1,
                    logged_at=self.end_date,
                    temperature=24,
                    humidity=None,
                    pm25=30,
                    uv_index=4,
                    source="manual",
                    captured_at=datetime(2026, 6, 1, 11),
                ),
            ]
        )
        with patch("app.services.environment_service.fetch_kma_weather_data") as weather:
            with patch("app.services.environment_service.fetch_airkorea_pm") as air:
                result = self._build(trigger)
        day = result["daily_timeline"][-1]
        foods = day["diet"][0]["foods"]
        self.assertEqual([f["name"] for f in foods], ["Rice", "Milk", "Custom"])
        rice_food = next(f for f in foods if f["name"] == "Rice")
        milk_food = next(f for f in foods if f["name"] == "Milk")
        self.assertIn("고혈당지수(추정)", rice_food["flags"])
        self.assertIn("유제품", milk_food["flags"])
        self.assertEqual(rice_food["skin_factors"][0]["source"], "mixed_rule")
        self.assertEqual(milk_food["skin_factors"][0]["source"], "raw_material_dictionary")
        self.assertIn("raw_material:우유", milk_food["skin_factors"][0]["evidence"])
        self.assertEqual(
            day["environment"],
            {"temperature": 22.0, "humidity": 40.0, "pm25": 30.0, "uv": 3.0},
        )
        self.assertEqual(
            result["meta"]["data_coverage"],
            {"skin_days": 1, "behavior_days": 0, "diet_days": 1, "env_days": 1},
        )
        signal_keys = {signal["factor_key"] for signal in result["candidate_signals"]}
        self.assertIn("high_gi", signal_keys)
        self.assertIn("dairy", signal_keys)
        weather.assert_not_called()
        air.assert_not_called()

    def test_current_cosmetics_medications_summary_and_data_quality(self):
        trigger = self._skin_log(self.end_date)
        for offset in range(5):
            logged_at = self.end_date - timedelta(days=offset)
            if offset:
                self._skin_log(logged_at)
            self.db.add(DailyBehaviorLog(user_id=1, logged_at=logged_at))
        irritant = CosmeticIngredient(name="AHA", is_irritant=True)
        safe = CosmeticIngredient(name="Water", is_irritant=False)
        current_product = CosmeticProduct(brand="Brand", product_name="Current")
        current_product.ingredients_list = [safe, irritant]
        old_product = CosmeticProduct(brand="Brand", product_name="Old")
        medication_ingredient = MedicationIngredient(
            name="Relevant", is_skin_relevant=True
        )
        irrelevant_ingredient = MedicationIngredient(
            name="Irrelevant", is_skin_relevant=False
        )
        medication = Medication(name="Current medication")
        medication.ingredients_list = [irrelevant_ingredient, medication_ingredient]
        old_medication = Medication(name="Old medication")
        self.db.add_all([current_product, old_product, medication, old_medication])
        self.db.flush()
        self.db.add_all(
            [
                UserCosmetic(
                    user_id=1,
                    product_id=current_product.id,
                    is_current=True,
                    started_at=date(2026, 5, 20),
                ),
                UserCosmetic(user_id=1, product_id=old_product.id, is_current=False),
                UserCosmetic(user_id=1, product_id=old_product.id, is_current=None),
                UserMedication(user_id=1, medication_id=medication.id, is_current=True),
                UserMedication(user_id=1, medication_id=old_medication.id, is_current=False),
                UserMedication(user_id=1, medication_id=old_medication.id, is_current=None),
            ]
        )
        result = self._build(trigger)
        cosmetics = result["context"]["current_cosmetics"]
        self.assertEqual(len(cosmetics), 1)
        self.assertEqual(cosmetics[0]["product_name"], "Current")
        self.assertEqual(cosmetics[0]["started_at"], "2026-05-20")
        self.assertEqual(cosmetics[0]["irritant_ingredients"], ["AHA"])
        self.assertIn("user_cosmetic_id", cosmetics[0])

        medications = result["context"]["current_medications"]
        self.assertEqual(len(medications), 1)
        self.assertEqual(medications[0]["medication_name"], "Current medication")
        self.assertEqual(medications[0]["skin_relevant_ingredients"], ["Relevant"])
        self.assertIn("user_medication_id", medications[0])
        self.assertEqual(
            result["meta"]["data_quality"],
            {"skin_behavior_overlap_days": 5, "has_sufficient_overlap": True},
        )
        self.assertEqual(
            set(result),
            {"meta", "daily_timeline", "context", "summary", "candidate_signals"},
        )
        self.assertEqual(
            set(result["summary"]),
            {"personal", "stats", "worst_day", "meta"},
        )
        self.assertEqual(
            [(signal["factor_key"], signal["label"]) for signal in result["candidate_signals"]],
            [("aha", "AHA"), ("relevant", "Relevant")],
        )

    def test_context_includes_visual_trends_and_primary_context(self):
        trigger = self._skin_log(self.end_date, overall_score=2)
        past_log = self._skin_log(self.end_date - timedelta(days=1), overall_score=5)
        self.db.commit()

        result_none = self._build(trigger)
        self.assertNotIn("visual_observation_trends", result_none)
        self.assertNotIn("primary_visual_context", result_none)
        self.assertIn("candidate_signals", result_none)

        handoffs = {
            past_log.id: {
                "source": "medgemma",
                "recommendation": "use",
                "usable": True,
                "confidence": "high",
                "observations": {"dryness": {"level": "none"}}
            },
            trigger.id: {
                "source": "medgemma",
                "recommendation": "use",
                "usable": True,
                "confidence": "high",
                "observations": {"dryness": {"level": "high"}},
                "visual_assessment_role": "primary_skin_visual_interpretation",
                "primary_visual_summary": "Test primary summary"
            }
        }
        import os
        os.environ["MEDGEMMA_PRIMARY_VISUAL_MIN_CONFIDENCE"] = "medium"
        result_valid = build_analysis_context(
            self.db, self.user_id, trigger.id, "worse", medgemma_handoffs=handoffs
        )
        self.assertIn("visual_observation_trends", result_valid)
        trends = result_valid["visual_observation_trends"]
        self.assertEqual(trends["worsened_signals"], ["dryness"])
        self.assertIn("dryness", trends["score_drop_overlap_signals"])

        self.assertIn("primary_visual_context", result_valid)
        primary = result_valid["primary_visual_context"]
        self.assertEqual(primary["source"], "medgemma")
        self.assertEqual(primary["role"], "primary_skin_visual_interpretation")
        self.assertEqual(primary["confidence"], "high")

class TestContextBuilder(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self.db = TestingSessionLocal()
        self.end_date = date(2026, 6, 1)

    def tearDown(self):
        self.db.rollback()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()
        self.db.close()

    def test_personal_fields_with_concerns(self):
        user = User(
            id=1, 
            email="test1@example.com",
            name="Test1",
            hashed_password="hash",
            skin_type="지성",
            raw_concern_text="모공이 고민입니다",
            skin_concerns=["모공", "피지"]
        )
        self.db.add(user)
        self.db.commit()

        # Cold start (0 analysis)
        context = build_stats_context(self.db, 1, 14, self.end_date)
        personal = context["personal"]
        
        self.assertEqual(personal["onboarding_concern_text"], "모공이 고민입니다")
        self.assertEqual(personal["survey_concerns"], ["모공", "피지"])
        self.assertEqual(personal["skin_type_fallback"], "지성")
        self.assertTrue(personal["is_personalization_cold_start"])

    def test_personal_fields_defaults_without_concerns(self):
        user = User(
            id=2, 
            email="test2@example.com",
            name="Test2",
            hashed_password="hash",
            skin_type="건성"
        )
        baseline = UserBaseline(
            user_id=2,
            analysis_count=5
        )
        self.db.add(user)
        self.db.add(baseline)
        self.db.commit()

        # Not cold start (5 analysis)
        context = build_stats_context(self.db, 2, 14, self.end_date)
        personal = context["personal"]
        
        self.assertIsNone(personal["onboarding_concern_text"])
        self.assertEqual(personal["survey_concerns"], [])
        self.assertIsNone(personal["skin_type_fallback"])
        self.assertFalse(personal["is_personalization_cold_start"])

if __name__ == "__main__":
    unittest.main()
