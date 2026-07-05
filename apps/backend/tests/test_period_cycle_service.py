import unittest
from datetime import date
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.cosmetic import UserCosmetic  # noqa: F401
from app.models.medication import UserMedication  # noqa: F401
from app.models.period import PeriodLog
from app.services.period_cycle_service import build_period_cycle_snapshot


class TestPeriodCycleService(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:")
        cls.SessionLocal = sessionmaker(bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

    def setUp(self):
        self.db = self.SessionLocal()
        self.user = SimpleNamespace(
            id=1,
            gender="여",
            avg_cycle_length=28,
            cycle_regularity="규칙적",
        )

    def tearDown(self):
        self.db.query(PeriodLog).delete()
        self.db.commit()
        self.db.close()

    def test_cycle_day_and_phase_from_user_cycle_length(self):
        self.db.add(PeriodLog(id=1, user_id=1, started_at=date(2026, 6, 1)))
        self.db.commit()

        snapshot = build_period_cycle_snapshot(self.db, self.user, date(2026, 6, 12))

        self.assertTrue(snapshot["applicable"])
        self.assertEqual(snapshot["last_period_start"], date(2026, 6, 1))
        self.assertEqual(snapshot["cycle_day"], 12)
        self.assertEqual(snapshot["cycle_length_used"], 28)
        self.assertEqual(snapshot["cycle_length_source"], "user")
        self.assertEqual(snapshot["phase"], "follicular")
        self.assertEqual(snapshot["phase_label_ko"], "여포기")
        self.assertEqual(snapshot["cycle_regularity_reported"], "규칙적")

    def test_estimated_cycle_length_ignores_short_interval(self):
        user = SimpleNamespace(
            id=1,
            gender="여",
            avg_cycle_length=None,
            cycle_regularity=None,
        )
        self.db.add(PeriodLog(id=1, user_id=1, started_at=date(2026, 1, 1)))
        self.db.add(PeriodLog(id=2, user_id=1, started_at=date(2026, 1, 10)))
        self.db.add(PeriodLog(id=3, user_id=1, started_at=date(2026, 2, 7)))
        self.db.add(PeriodLog(id=4, user_id=1, started_at=date(2026, 3, 7)))
        self.db.commit()

        snapshot = build_period_cycle_snapshot(self.db, user, date(2026, 2, 20))

        self.assertEqual(snapshot["estimated_cycle_length"], 28)
        self.assertEqual(snapshot["cycle_length_source"], "estimated")
        self.assertEqual(snapshot["cycle_regularity_inferred"], "regular")

    def test_not_applicable_for_male_user(self):
        user = SimpleNamespace(
            id=1,
            gender="남",
            avg_cycle_length=28,
            cycle_regularity="규칙적",
        )

        snapshot = build_period_cycle_snapshot(self.db, user, date(2026, 6, 12))

        self.assertFalse(snapshot["applicable"])
        self.assertEqual(snapshot["phase"], "unknown")
        self.assertIsNotNone(snapshot["message"])


if __name__ == "__main__":
    unittest.main()
