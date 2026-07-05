import os
import sys
import unittest
from datetime import date, datetime
from decimal import Decimal

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import BigInteger, create_engine
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.analysis import UserBaseline, UserFactorSensitivity
from app.models.cosmetic import UserCosmetic  # noqa: F401
from app.models.medication import UserMedication  # noqa: F401
from app.models.skin_log import SkinLog  # noqa: F401
from app.models.user import User
from app.services.profile_updater import update_user_profile_from_agent_results


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


MOCK_AGENT_RESULTS = [
    {
        "agent_type": "cosmetic",
        "suspicious_items": [
            {
                "factor_type": "ingredient",
                "factor_key": "retinol",
                "label": "레티놀",
                "confidence": 0.82,
            }
        ],
        "reason": "레티놀 자극 가능성",
        "confidence": 0.82,
    },
    {
        "agent_type": "diet",
        "suspicious_items": [
            {
                "factor_type": "food",
                "factor_key": "dairy",
                "label": "유제품",
                "confidence": 0.55,
            },
            {
                "factor_type": "food",
                "factor_key": "spicy_food",
                "label": "매운 음식",
                "confidence": 0.49,
            },
        ],
        "reason": "일부 식단 변화 관찰",
        "confidence": 0.55,
    },
    {
        "agent_type": "environment",
        "suspicious_items": [],
        "reason": "이상 없음",
        "confidence": None,
    },
    {
        "agent_type": "behavior",
        "suspicious_items": [
            {
                "factor_type": "behavior",
                "factor_key": "sleep_shortage",
                "label": "수면 부족",
                "confidence": 0.65,
            }
        ],
        "reason": "수면 부족 반복",
        "confidence": 0.65,
    },
    {
        "agent_type": "medication",
        "suspicious_items": [],
        "reason": "피부 관련 약물 없음",
        "confidence": None,
    },
]


class TestProfileUpdater(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self.db = TestingSessionLocal()
        self.user_id = 1
        self.logged_at = date(2026, 6, 2)
        self.db.add(
            User(
                id=self.user_id,
                email="profile-updater@example.com",
                name="Profile Updater",
                hashed_password="hashed",
                terms_agreed_at=datetime(2026, 1, 1),
            )
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

    def test_creates_high_confidence_factors_and_baseline_without_commit(self):
        result = update_user_profile_from_agent_results(
            self.db,
            user_id=self.user_id,
            agent_results=MOCK_AGENT_RESULTS,
            skin_log_logged_at=self.logged_at,
        )

        rows = self._sensitivity_rows()
        self.assertEqual(
            set(rows.keys()),
            {
                ("ingredient", "retinol"),
                ("food", "dairy"),
                ("behavior", "sleep_shortage"),
            },
        )
        self.assertNotIn(("food", "spicy_food"), rows)

        self.assertAlmostEqual(float(rows[("ingredient", "retinol")].sensitivity_score), 0.25)
        self.assertAlmostEqual(float(rows[("food", "dairy")].sensitivity_score), 0.17)
        self.assertAlmostEqual(
            float(rows[("behavior", "sleep_shortage")].sensitivity_score),
            0.20,
        )
        for row in rows.values():
            self.assertEqual(row.trigger_count, 1)
            self.assertEqual(row.last_triggered_at, self.logged_at)

        baseline = self.db.query(UserBaseline).filter(UserBaseline.user_id == self.user_id).one()
        self.assertEqual(baseline.analysis_count, 1)

        self.assertEqual(len(result), 3)
        self.assertEqual(
            {
                (item["factor_type"], item["factor_key"])
                for item in result
            },
            {
                ("ingredient", "retinol"),
                ("food", "dairy"),
                ("behavior", "sleep_shortage"),
            },
        )
        retinol_result = self._find_updated_factor(result, "ingredient", "retinol")
        dairy_result = self._find_updated_factor(result, "food", "dairy")
        sleep_result = self._find_updated_factor(result, "behavior", "sleep_shortage")
        self.assertAlmostEqual(retinol_result["old_score"], 0.0)
        self.assertAlmostEqual(retinol_result["new_score"], 0.246)
        self.assertAlmostEqual(retinol_result["delta"], 0.246)
        self.assertEqual(retinol_result["trigger_count"], 1)
        self.assertAlmostEqual(dairy_result["new_score"], 0.165)
        self.assertAlmostEqual(sleep_result["new_score"], 0.195)

    def test_updates_existing_factor_and_existing_baseline(self):
        existing = UserFactorSensitivity(
            user_id=self.user_id,
            factor_type="ingredient",
            factor_key="retinol",
            sensitivity_score=0.25,
            trigger_count=1,
            last_triggered_at=date(2026, 6, 1),
        )
        self.db.add(existing)
        self.db.add(UserBaseline(user_id=self.user_id, analysis_count=4))
        self.db.flush()
        existing.sensitivity_score = Decimal("0.246")

        result = update_user_profile_from_agent_results(
            self.db,
            user_id=self.user_id,
            agent_results=[
                {
                    "agent_type": "cosmetic",
                    "suspicious_items": [
                        {
                            "factor_type": "ingredient",
                            "factor_key": "retinol",
                            "label": "레티놀",
                            "confidence": 0.75,
                        }
                    ],
                }
            ],
            skin_log_logged_at=self.logged_at,
        )

        row = (
            self.db.query(UserFactorSensitivity)
            .filter(
                UserFactorSensitivity.user_id == self.user_id,
                UserFactorSensitivity.factor_type == "ingredient",
                UserFactorSensitivity.factor_key == "retinol",
            )
            .one()
        )
        expected_score = 0.246 * 0.7 + 0.75 * 0.3
        self.assertAlmostEqual(float(row.sensitivity_score), expected_score)
        self.assertEqual(row.trigger_count, 2)
        self.assertEqual(row.last_triggered_at, self.logged_at)

        baseline = self.db.query(UserBaseline).filter(UserBaseline.user_id == self.user_id).one()
        self.assertEqual(baseline.analysis_count, 5)

        self.assertEqual(len(result), 1)
        updated = result[0]
        self.assertAlmostEqual(updated["old_score"], 0.246)
        self.assertAlmostEqual(updated["new_score"], expected_score)
        self.assertAlmostEqual(updated["delta"], expected_score - 0.246)
        self.assertEqual(updated["trigger_count"], 2)

    def test_empty_or_low_confidence_results_only_increment_analysis_count(self):
        self.db.add(UserBaseline(user_id=self.user_id, analysis_count=2))
        self.db.commit()

        result = update_user_profile_from_agent_results(
            self.db,
            user_id=self.user_id,
            agent_results=[
                {
                    "agent_type": "diet",
                    "suspicious_items": [
                        {
                            "factor_type": "food",
                            "factor_key": "spicy_food",
                            "confidence": 0.49,
                        }
                    ],
                },
                {"agent_type": "environment", "suspicious_items": []},
            ],
            skin_log_logged_at=datetime(2026, 6, 3, 12, 0),
        )

        self.assertEqual(self.db.query(UserFactorSensitivity).count(), 0)
        baseline = self.db.query(UserBaseline).filter(UserBaseline.user_id == self.user_id).one()
        self.assertEqual(baseline.analysis_count, 3)
        self.assertEqual(result, [])

    def _sensitivity_rows(self):
        rows = self.db.query(UserFactorSensitivity).all()
        return {(row.factor_type, row.factor_key): row for row in rows}

    def _find_updated_factor(self, result, factor_type, factor_key):
        for item in result:
            if item["factor_type"] == factor_type and item["factor_key"] == factor_key:
                return item
        self.fail(f"missing updated factor: {factor_type}/{factor_key}")


if __name__ == "__main__":
    unittest.main()
