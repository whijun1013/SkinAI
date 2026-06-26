import os
import sys
import unittest
from datetime import date, timedelta
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import BigInteger, create_engine
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.skin_log import SkinLog
from app.models.behavior import DailyBehaviorLog
from app.models.diet import DietLog, DietLogItem, FoodItem
from app.services.analysis_context_builder import build_analysis_context
from app.services.pattern_discovery import discover_patterns
from app.models.analysis import AnalysisRequest

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

class TestAnalysisContextPatternMedgemmaIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self.db = TestingSessionLocal()
        self.end_date = date(2026, 6, 14)
        self.user_id = 1
        self.trigger_log = None

    def tearDown(self):
        self.db.rollback()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()
        self.db.close()

    def _setup_14_day_timeline(self, exposure_offsets, low_score_offsets, trigger_offset=13):
        start = self.end_date - timedelta(days=13)
        logs = []
        medgemma_handoffs = {}
        
        sugar_food = FoodItem(name="Sugar", skin_factors={"high_gl_candidate": [{}]})
        self.db.add(sugar_food)
        self.db.flush()

        for offset in range(14):
            logged_at = start + timedelta(days=offset)
            score = 1 if offset in low_score_offsets else 5
            skin_log = SkinLog(user_id=self.user_id, logged_at=logged_at, overall_score=score)
            self.db.add(skin_log)
            self.db.flush()
            
            if offset == trigger_offset:
                self.trigger_log = skin_log

            # Add Diet/Behavior
            if offset in exposure_offsets:
                meal = DietLog(user_id=self.user_id, logged_at=logged_at, meal_type="점심", input_method="manual")
                self.db.add(meal)
                self.db.flush()
                self.db.add(DietLogItem(diet_log_id=meal.id, food_item_id=sugar_food.id))
                
                behavior = DailyBehaviorLog(user_id=self.user_id, logged_at=logged_at, sleep_hours=4.0)
                self.db.add(behavior)
            else:
                behavior = DailyBehaviorLog(user_id=self.user_id, logged_at=logged_at, sleep_hours=8.0)
                self.db.add(behavior)
                
            logs.append(skin_log)

        self.analysis_request = AnalysisRequest(id=1, user_id=self.user_id, skin_log_id=self.trigger_log.id, status="pending")
        self.db.add(self.analysis_request)
        
        self.db.commit()
        return logs, medgemma_handoffs

    @patch("app.services.analysis_context_builder.existing_context_builder.build_analysis_context", return_value={})
    @patch("app.services.analysis_context_builder.check_continuous_log", return_value={"recorded_days": 14, "is_ready": True})
    def test_pattern_discovery_works_with_medgemma_visual_context(self, mock_check, mock_existing):
        exposure_offsets = {0, 4, 8}
        low_score_offsets = {1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 13}
        logs, medgemma_handoffs = self._setup_14_day_timeline(exposure_offsets, low_score_offsets)
        
        # Add MedGemma results to some logs
        medgemma_handoffs[logs[13].id] = {
            "source": "medgemma",
            "recommendation": "use",
            "usable": True,
            "confidence": "high",
            "signals": {
                "active_lesion": "moderate",
                "redness": "none",
                "barrier": "none",
            },
            "visual_assessment_role": "primary_skin_visual_interpretation",
            "primary_visual_summary": "Acne spots detected."
        }
        
        context = build_analysis_context(
            self.db, self.user_id, self.trigger_log.id, 14, medgemma_handoffs
        )
        
        self.assertIn("daily_timeline", context)
        self.assertIn("visual_observation_trends", context)
        self.assertIn("primary_visual_context", context)
        
        patterns = discover_patterns(context)
        self.assertGreaterEqual(len(patterns), 1)
        
        
        # Verify MedGemma is not in factor_type
        self.assertTrue(all(p["factor_type"] != "medgemma" for p in patterns))
        
        # Verify there is at least one food pattern
        self.assertTrue(any(p["factor_type"] == "food" for p in patterns))
        
    @patch("app.services.analysis_context_builder.existing_context_builder.build_analysis_context", return_value={})
    @patch("app.services.analysis_context_builder.check_continuous_log", return_value={"recorded_days": 14, "is_ready": True})
    def test_pattern_discovery_works_without_medgemma_context(self, mock_check, mock_existing):
        exposure_offsets = {0, 4, 8}
        low_score_offsets = {1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 13}
        logs, _ = self._setup_14_day_timeline(exposure_offsets, low_score_offsets)
        
        context = build_analysis_context(
            self.db, self.user_id, self.trigger_log.id, 14, {}
        )
        
        self.assertNotIn("visual_observation_trends", context)
        self.assertNotIn("primary_visual_context", context)
        
        patterns = discover_patterns(context)
        self.assertIsInstance(patterns, list)
        self.assertGreaterEqual(len(patterns), 1)

    @patch("app.services.analysis_context_builder.existing_context_builder.build_analysis_context", return_value={})
    @patch("app.services.analysis_context_builder.check_continuous_log", return_value={"recorded_days": 14, "is_ready": True})
    def test_rejected_medgemma_is_excluded_but_pattern_discovery_still_runs(self, mock_check, mock_existing):
        exposure_offsets = {0, 4, 8}
        low_score_offsets = {1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 13}
        logs, medgemma_handoffs = self._setup_14_day_timeline(exposure_offsets, low_score_offsets)
        
        medgemma_handoffs[logs[13].id] = {
            "source": "medgemma",
            "recommendation": "reject",
            "usable": False,
            "confidence": "low",
            "signals": {
                "active_lesion": "none",
                "redness": "severe",
                "barrier": "none",
            },
        }
        
        context = build_analysis_context(
            self.db, self.user_id, self.trigger_log.id, 14, medgemma_handoffs
        )
        
        self.assertNotIn("primary_visual_context", context)
        patterns = discover_patterns(context)
        self.assertIsInstance(patterns, list)
        self.assertGreaterEqual(len(patterns), 1)

    @patch("app.services.analysis_context_builder.existing_context_builder.build_analysis_context", return_value={})
    @patch("app.services.analysis_context_builder.check_continuous_log", return_value={"recorded_days": 14, "is_ready": True})
    def test_medgemma_visual_signals_do_not_create_experiment_factor(self, mock_check, mock_existing):
        # No behavior or diet exposure
        logs, medgemma_handoffs = self._setup_14_day_timeline(set(), {10, 11, 12, 13})
        
        medgemma_handoffs[logs[13].id] = {
            "source": "medgemma",
            "recommendation": "use",
            "usable": True,
            "confidence": "high",
            "signals": {
                "active_lesion": "none",
                "redness": "severe",
                "barrier": "none",
            },
            "visual_assessment_role": "primary_skin_visual_interpretation",
            "primary_visual_summary": "Redness detected."
        }
        
        context = build_analysis_context(
            self.db, self.user_id, self.trigger_log.id, 14, medgemma_handoffs
        )
        
        patterns = discover_patterns(context)
        self.assertTrue(all(p["factor_type"] != "medgemma" for p in patterns))
        self.assertFalse(any("MedGemma" in p.get("label", "") for p in patterns))

if __name__ == "__main__":
    unittest.main()
