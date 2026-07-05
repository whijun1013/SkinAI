import os
import sys
import unittest
from datetime import date, timedelta
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.deps.auth import get_current_user
from app.models.notification import NotificationLog, NotificationSettings, NotificationToken
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


class TestAnalysisReadyNotification(unittest.TestCase):
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
        self.db.query(NotificationLog).delete()
        self.db.query(NotificationToken).delete()
        self.db.query(NotificationSettings).delete()
        self.db.query(SkinLog).delete()
        self.db.commit()
        self.db.close()
        self._restore_override(get_current_user, self._previous_current_user_override)
        self._restore_override(get_db, self._previous_get_db_override)

    def test_skin_log_create_with_less_than_7_recent_score_days_does_not_send(self):
        target = date(2026, 6, 16)
        self._seed_skin_logs(target - timedelta(days=1), days=5)

        with patch("app.routers.my_skin_log.send_notification_event") as mock_send:
            response = self.client.post(
                "/users/me/skin-log",
                json={"logged_at": target.isoformat(), "overall_score": 3},
            )

        self.assertEqual(response.status_code, 200)
        mock_send.assert_not_called()

    def test_skin_log_create_with_7_recent_score_days_sends_analysis_ready(self):
        target = date(2026, 6, 16)
        self._seed_skin_logs(target - timedelta(days=1), days=6)

        with patch("app.routers.my_skin_log.send_notification_event") as mock_send:
            response = self.client.post(
                "/users/me/skin-log",
                json={"logged_at": target.isoformat(), "overall_score": 3},
            )

        self.assertEqual(response.status_code, 200)
        mock_send.assert_called_once()
        kwargs = mock_send.call_args.kwargs
        self.assertEqual(kwargs["notification_type"], "analysis_ready")
        self.assertEqual(kwargs["dedupe_key"], "analysis_ready:1:2026-06-16")
        self.assertEqual(kwargs["title"], "참고 인사이트를 만들 수 있어요")
        self.assertEqual(kwargs["body"], "최근 기록이 충분히 쌓였어요. 내 피부 흐름을 확인해보세요.")
        self.assertEqual(
            kwargs["data"],
            {
                "type": "analysis_ready",
                "screen": "report",
                "base_date": "2026-06-16",
            },
        )

    def test_analysis_ready_uses_dedupe_key_for_same_user_and_base_date(self):
        target = date(2026, 6, 16)
        self._seed_skin_logs(target - timedelta(days=1), days=6)

        create_response = self.client.post(
            "/users/me/skin-log",
            json={"logged_at": target.isoformat(), "overall_score": 3},
        )
        self.assertEqual(create_response.status_code, 200)
        log_id = create_response.json()["id"]

        update_response = self.client.put(
            f"/users/me/skin-log/{log_id}",
            json={"note": "updated"},
        )

        self.assertEqual(update_response.status_code, 200)
        logs = self.db.query(NotificationLog).filter(
            NotificationLog.dedupe_key == "analysis_ready:1:2026-06-16"
        ).all()
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].notification_type, "analysis_ready")
        self.assertEqual(logs[0].status, "skipped")

    def test_analysis_ready_disabled_setting_records_skipped_without_send(self):
        target = date(2026, 6, 16)
        self._seed_skin_logs(target - timedelta(days=1), days=6)
        self.db.add(
            NotificationSettings(
                user_id=1,
                analysis_ready_enabled=False,
            )
        )
        self.db.commit()

        response = self.client.post(
            "/users/me/skin-log",
            json={"logged_at": target.isoformat(), "overall_score": 3},
        )

        self.assertEqual(response.status_code, 200)
        notification_log = self.db.query(NotificationLog).one()
        self.assertEqual(notification_log.notification_type, "analysis_ready")
        self.assertEqual(notification_log.dedupe_key, "analysis_ready:1:2026-06-16")
        self.assertEqual(notification_log.status, "skipped")
        self.assertEqual(notification_log.error_message, "Notification disabled by user setting")

    def test_analysis_ready_send_failure_does_not_break_skin_log_save(self):
        target = date(2026, 6, 16)
        self._seed_skin_logs(target - timedelta(days=1), days=6)

        with patch(
            "app.routers.my_skin_log.send_notification_event",
            side_effect=RuntimeError("send failed"),
        ):
            response = self.client.post(
                "/users/me/skin-log",
                json={"logged_at": target.isoformat(), "overall_score": 3},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.db.query(SkinLog).filter(SkinLog.logged_at == target).count(),
            1,
        )

    def _seed_skin_logs(self, target_date, days):
        for offset in range(days):
            self.db.add(
                SkinLog(
                    user_id=1,
                    logged_at=target_date - timedelta(days=offset),
                    overall_score=3,
                )
            )
        self.db.commit()

    def _restore_override(self, dependency, previous):
        if previous is None:
            app.dependency_overrides.pop(dependency, None)
        else:
            app.dependency_overrides[dependency] = previous


if __name__ == "__main__":
    unittest.main()
