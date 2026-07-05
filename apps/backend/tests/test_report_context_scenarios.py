import os
import sys
import json
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import BigInteger, create_engine
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.user import User
from app.models.skin_log import SkinLog
from app.models.diet import DietLog, DietLogItem, FoodItem
from app.models.behavior import DailyBehaviorLog
from app.models.analysis import AnalysisRequest
from app.services.report_context_builder import build_report_context

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

class TestReportContextScenarios(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        fixture_path = Path(__file__).parent / "fixtures" / "report_context_scenarios.json"
        cls.scenarios = json.loads(fixture_path.read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self.db = TestingSessionLocal()
        self.user_id = 1
        self.end_date = date(2026, 6, 14)
        
        user = User(id=self.user_id, email="test@example.com", name="test", hashed_password="pw")
        self.db.add(user)
        self.db.commit()

        # Add food items for testing
        self.dairy_food = FoodItem(name="Milk", skin_factors={"dairy_confirmed": [{"level": "high", "confidence": "high"}]})
        self.sugar_food = FoodItem(name="Sugar", skin_factors={"high_gl_candidate": [{"level": "high", "confidence": "high"}]})
        self.db.add(self.dairy_food)
        self.db.add(self.sugar_food)
        self.db.commit()

    def tearDown(self):
        self.db.rollback()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()
        self.db.close()

    def _seed_scenario(self, scenario):
        timeline = scenario["timeline"]
        start = self.end_date - timedelta(days=13)
        trigger_log = None
        trigger_day = timeline.get("trigger_day", 13)

        for offset in range(14):
            logged_at = start + timedelta(days=offset)
            score = 1 if offset in timeline.get("low_score_days", []) else 5
            
            skin_log = SkinLog(user_id=self.user_id, logged_at=logged_at, overall_score=score)
            self.db.add(skin_log)
            self.db.flush()
            
            if offset == trigger_day:
                trigger_log = skin_log

            # Add behavior
            if offset in timeline.get("exposure_days", []) and "behavior" in timeline:
                sleep_hours = timeline["behavior"].get("sleep_hours", 8.0)
            else:
                sleep_hours = 8.0
            behavior = DailyBehaviorLog(user_id=self.user_id, logged_at=logged_at, sleep_hours=sleep_hours)
            self.db.add(behavior)

            # Add diet
            if offset in timeline.get("exposure_days", []):
                flags = timeline.get("diet_flags", [])
                if flags:
                    meal = DietLog(user_id=self.user_id, logged_at=logged_at, meal_type=None, input_method="manual")
                    self.db.add(meal)
                    self.db.flush()
                    
                    if "dairy" in flags:
                        self.db.add(DietLogItem(diet_log_id=meal.id, food_item_id=self.dairy_food.id))
                    if "high_sugar" in flags:
                        self.db.add(DietLogItem(diet_log_id=meal.id, food_item_id=self.sugar_food.id))
                        
        self.db.commit()
        return trigger_log

    def test_report_context_scenarios(self):
        for scenario in self.scenarios:
            with self.subTest(scenario=scenario["id"]):
                # Clean up previous scenario data except user and foods
                self.db.execute(AnalysisRequest.__table__.delete())
                self.db.execute(DailyBehaviorLog.__table__.delete())
                self.db.execute(DietLogItem.__table__.delete())
                self.db.execute(DietLog.__table__.delete())
                self.db.execute(SkinLog.__table__.delete())
                self.db.commit()
                self.db.expunge_all()
                self.db.add(self.dairy_food)
                self.db.add(self.sugar_food)

                trigger_log = self._seed_scenario(scenario)
                medgemma_data = scenario["timeline"]["medgemma"]

                with patch("app.services.report_context_builder._get_medgemma_handoffs") as mock_handoffs:
                    mock_handoffs.return_value = {trigger_log.id: medgemma_data} if medgemma_data else {}

                    context = build_report_context(
                        db=self.db,
                        user_id=self.user_id,
                        report_type="triggered",
                        trigger_skin_log_id=trigger_log.id
                    )

                expected = scenario["expected"]

                # Base checks
                self.assertEqual(context["meta"]["report_type"], "triggered")
                self.assertIn("analysis_context", context)
                self.assertIn("patterns", context)
                self.assertNotIn("experiment_candidates", context)

                # Primary visual context check
                has_primary = "primary_visual_context" in context["analysis_context"]
                self.assertEqual(has_primary, expected["has_primary_visual_context"])

                # Visual observation trends check
                has_trends = "visual_observation_trends" in context["analysis_context"]
                self.assertEqual(has_trends, expected["has_visual_observation_trends"])

                # Pattern factor type check
                pattern_factor_types = {p["factor_type"] for p in context["patterns"]}
                for expected_type in expected.get("expected_current_pattern_factor_types", []):
                    self.assertIn(expected_type, pattern_factor_types)

                # MedGemma abuse checks
                self.assertNotIn("medgemma", pattern_factor_types)
                self.assertTrue(all(p["factor_type"] != "medgemma" for p in context["patterns"]))

if __name__ == "__main__":
    unittest.main()
