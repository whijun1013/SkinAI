import os
import sys
import unittest
from datetime import datetime
from unittest.mock import patch

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
from app.services.skin_tendency_updater import update_skin_tendency_if_needed


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


class TestSkinTendencyUpdater(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self.db = TestingSessionLocal()
        self.user_id = 1
        self.db.add(
            User(
                id=self.user_id,
                email="skin-tendency-updater@example.com",
                name="Skin Tendency Updater",
                hashed_password="hashed",
                terms_agreed_at=datetime(2026, 1, 1),
            )
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

    def test_analysis_count_less_than_3_does_not_call_llm(self):
        self.db.add(UserBaseline(user_id=self.user_id, analysis_count=2))
        self._add_sensitivity("ingredient", "retinol", 0.5, 3)
        self.db.commit()

        with patch("app.services.skin_tendency_updater.get_skin_tendency") as mock_llm:
            updated = update_skin_tendency_if_needed(
                self.db,
                self.user_id,
                [{"factor_type": "ingredient", "factor_key": "retinol", "delta": 0.2}],
            )

        self.assertFalse(updated)
        mock_llm.assert_not_called()

    def test_delta_less_than_0_2_does_not_call_llm(self):
        self.db.add(UserBaseline(user_id=self.user_id, analysis_count=3))
        self._add_sensitivity("ingredient", "retinol", 0.5, 3)
        self.db.commit()

        with patch("app.services.skin_tendency_updater.get_skin_tendency") as mock_llm:
            updated = update_skin_tendency_if_needed(
                self.db,
                self.user_id,
                [{"factor_type": "ingredient", "factor_key": "retinol", "delta": 0.199}],
            )

        self.assertFalse(updated)
        mock_llm.assert_not_called()

    def test_today_last_calibrated_at_does_not_call_llm(self):
        self.db.add(
            UserBaseline(
                user_id=self.user_id,
                analysis_count=3,
                last_calibrated_at=datetime.now(),
            )
        )
        self._add_sensitivity("ingredient", "retinol", 0.5, 3)
        self.db.commit()

        with patch("app.services.skin_tendency_updater.get_skin_tendency") as mock_llm:
            updated = update_skin_tendency_if_needed(
                self.db,
                self.user_id,
                [{"factor_type": "ingredient", "factor_key": "retinol", "delta": 0.2}],
            )

        self.assertFalse(updated)
        mock_llm.assert_not_called()

    def test_matching_conditions_update_skin_tendency(self):
        self.db.add(UserBaseline(user_id=self.user_id, analysis_count=3))
        self._add_sensitivity("ingredient", "retinol", 0.9, 4)
        self._add_sensitivity("behavior", "sleep_shortage", 0.8, 3)
        self._add_sensitivity("food", "dairy", 0.7, 2)
        self._add_sensitivity("environment", "dry_air", 0.6, 5)
        self._add_sensitivity("medication", "steroid", 0.5, 1)
        self._add_sensitivity("food", "spicy_food", 0.4, 6)
        self.db.commit()

        with patch(
            "app.services.skin_tendency_updater.get_skin_tendency",
            return_value="retinol tendency",
        ) as mock_llm:
            updated = update_skin_tendency_if_needed(
                self.db,
                self.user_id,
                [{"factor_type": "ingredient", "factor_key": "retinol", "delta": 0.2}],
            )

        self.assertTrue(updated)
        baseline = self.db.query(UserBaseline).filter(UserBaseline.user_id == self.user_id).one()
        self.assertEqual(baseline.skin_tendency, "retinol tendency")
        self.assertIsNotNone(baseline.last_calibrated_at)
        mock_llm.assert_called_once()
        _, called_user_id, factor_sensitivities = mock_llm.call_args.args
        self.assertEqual(called_user_id, self.user_id)
        self.assertEqual(len(factor_sensitivities), 5)
        self.assertEqual(factor_sensitivities[0]["factor_key"], "retinol")
        self.assertNotIn(
            "spicy_food",
            {item["factor_key"] for item in factor_sensitivities},
        )
        self.assertEqual(
            set(factor_sensitivities[0].keys()),
            {"factor_type", "factor_key", "sensitivity_score", "trigger_count"},
        )

    def _add_sensitivity(self, factor_type, factor_key, score, trigger_count):
        self.db.add(
            UserFactorSensitivity(
                user_id=self.user_id,
                factor_type=factor_type,
                factor_key=factor_key,
                sensitivity_score=score,
                trigger_count=trigger_count,
            )
        )


if __name__ == "__main__":
    unittest.main()
