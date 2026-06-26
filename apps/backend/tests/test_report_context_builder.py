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
from app.models.user import User
from app.models.skin_log import SkinLog
from app.services.report_context_builder import build_report_context, ReportContextError

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

class TestReportContextBuilder(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self.db = TestingSessionLocal()
        self.user_id = 1
        
        user = User(id=self.user_id, email="test@example.com", name="test", hashed_password="pw")
        self.db.add(user)
        self.db.commit()
        
        self.today = date.today()

    def tearDown(self):
        self.db.rollback()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()
        self.db.close()

    def _create_skin_log(self, offset_days: int, score: int = 3):
        logged_at = self.today + timedelta(days=offset_days)
        log = SkinLog(user_id=self.user_id, logged_at=logged_at, overall_score=score)
        self.db.add(log)
        self.db.commit()
        return log

    @patch("app.services.report_context_builder.build_analysis_context", return_value={"dummy": "context"})
    @patch("app.services.report_context_builder.discover_patterns", return_value=[{"factor_type": "food", "factor_key": "dairy", "label": "유제품", "evidence_level": "moderate"}])
    def test_build_triggered_report_context_includes_analysis_patterns(self, mock_discover, mock_build):
        log = self._create_skin_log(0)

        context = build_report_context(
            self.db,
            self.user_id,
            report_type="triggered",
            trigger_skin_log_id=log.id,
            include_medgemma=False,
        )

        self.assertEqual(context["meta"]["report_type"], "triggered")
        self.assertIn("analysis_context", context)
        self.assertIn("patterns", context)
        self.assertTrue(all(p["factor_type"] != "medgemma" for p in context["patterns"]))

    @patch("app.services.report_context_builder.build_analysis_context", return_value={})
    @patch("app.services.report_context_builder.discover_patterns", return_value=[])
    def test_build_weekly_report_context_uses_latest_skin_log_in_period(self, mock_discover, mock_build):
        # Create a log 2 days ago and another 10 days ago
        self._create_skin_log(-10)
        latest = self._create_skin_log(-2)
        
        context = build_report_context(
            self.db, 
            self.user_id, 
            report_type="weekly",
            include_medgemma=False,
        )
        
        self.assertEqual(context["meta"]["trigger_skin_log_id"], latest.id)
        self.assertEqual(context["meta"]["report_type"], "weekly")
        
        start_date = date.fromisoformat(context["meta"]["period_start"])
        end_date = date.fromisoformat(context["meta"]["period_end"])
        self.assertEqual((end_date - start_date).days, 6)

    @patch("app.services.report_context_builder.build_analysis_context", return_value={})
    @patch("app.services.report_context_builder.discover_patterns", return_value=[])
    def test_build_monthly_report_context_uses_30_day_default_period(self, mock_discover, mock_build):
        latest = self._create_skin_log(0)
        
        context = build_report_context(
            self.db, 
            self.user_id, 
            report_type="monthly",
            include_medgemma=False,
        )
        
        self.assertEqual(context["meta"]["report_type"], "monthly")
        
        start_date = date.fromisoformat(context["meta"]["period_start"])
        end_date = date.fromisoformat(context["meta"]["period_end"])
        self.assertEqual((end_date - start_date).days, 29)

    def test_user_requested_report_requires_start_and_end_date(self):
        with self.assertRaises(ReportContextError):
            build_report_context(self.db, self.user_id, report_type="user_requested")
            
        with self.assertRaises(ReportContextError):
            build_report_context(self.db, self.user_id, report_type="user_requested", start_date=self.today)

    def test_report_context_raises_when_no_skin_log_in_period(self):
        with self.assertRaises(ReportContextError):
            build_report_context(self.db, self.user_id, report_type="weekly", include_medgemma=False)

    def test_triggered_report_requires_owned_skin_log(self):
        other_user = User(id=2, email="other@example.com", name="other", hashed_password="pw")
        self.db.add(other_user)
        self.db.commit()
        other_log = SkinLog(user_id=2, logged_at=self.today, overall_score=3)
        self.db.add(other_log)
        self.db.commit()

        with self.assertRaises(ReportContextError):
            build_report_context(
                self.db,
                self.user_id,
                report_type="triggered",
                trigger_skin_log_id=other_log.id,
                include_medgemma=False,
            )

    @patch("app.services.report_context_builder.build_analysis_context", return_value={"primary_visual_context": "Acne spotted."})
    @patch("app.services.report_context_builder.discover_patterns", return_value=[
        {"factor_type": "medgemma", "factor_key": "redness", "evidence_level": "strong"}
    ])
    def test_report_context_patterns_do_not_include_medgemma_type(self, mock_discover, mock_build):
        log = self._create_skin_log(0)

        context = build_report_context(
            self.db,
            self.user_id,
            report_type="triggered",
            trigger_skin_log_id=log.id,
            include_medgemma=False,
        )

        self.assertIn("primary_visual_context", context["analysis_context"])
        self.assertNotIn("experiment_candidates", context)

    @patch("app.services.report_context_builder._get_medgemma_handoffs")
    @patch("app.services.report_context_builder.build_analysis_context", return_value={})
    @patch("app.services.report_context_builder.discover_patterns", return_value=[])
    def test_report_context_passes_medgemma_handoffs_to_analysis_context(self, mock_discover, mock_build, mock_handoffs):
        log = self._create_skin_log(0)
        mock_handoffs.return_value = {
            log.id: {
                "source": "medgemma",
                "recommendation": "use",
                "usable": True,
                "confidence": "high",
            }
        }

        build_report_context(
            self.db,
            self.user_id,
            report_type="triggered",
            trigger_skin_log_id=log.id,
        )

        self.assertEqual(mock_handoffs.call_args.args[0], [log.id])
        self.assertEqual(
            mock_build.call_args.kwargs["medgemma_handoffs"],
            mock_handoffs.return_value,
        )

if __name__ == "__main__":
    unittest.main()
