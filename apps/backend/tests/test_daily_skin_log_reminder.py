import os
import sys
import unittest
from datetime import date
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import BigInteger, create_engine
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.cosmetic import UserCosmetic  # noqa: F401
from app.models.medication import UserMedication  # noqa: F401
from app.models.notification import NotificationLog, NotificationSettings
from app.models.skin_log import SkinLog
from app.models.user import User  # noqa: F401
from app.services.daily_skin_log_reminder import send_daily_skin_log_reminder_for_user


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


class TestDailySkinLogReminder(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self.db = TestingSessionLocal()
        self.target_date = date(2026, 6, 16)

    def tearDown(self):
        self.db.query(NotificationLog).delete()
        self.db.query(NotificationSettings).delete()
        self.db.query(SkinLog).delete()
        self.db.commit()
        self.db.close()

    def test_today_skin_log_exists_skips_reminder(self):
        self.db.add(SkinLog(user_id=1, logged_at=self.target_date, overall_score=3))
        self.db.commit()

        with patch("app.services.daily_skin_log_reminder.send_notification_event") as mock_send:
            result = send_daily_skin_log_reminder_for_user(
                self.db,
                user_id=1,
                target_date=self.target_date,
            )

        mock_send.assert_not_called()
        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["reason"], "skin_log_exists")
        notification_log = self.db.query(NotificationLog).one()
        self.assertEqual(notification_log.notification_type, "daily_skin_log_reminder")
        self.assertEqual(notification_log.dedupe_key, "daily_skin_log_reminder:1:2026-06-16")

    def test_no_today_skin_log_sends_reminder(self):
        with patch("app.services.daily_skin_log_reminder.send_notification_event") as mock_send:
            mock_send.return_value = NotificationLog(
                id=1,
                user_id=1,
                notification_type="daily_skin_log_reminder",
                dedupe_key="daily_skin_log_reminder:1:2026-06-16",
                title="오늘 피부 기록을 남겨볼까요?",
                body="짧게 기록해두면 내 피부 흐름을 더 잘 확인할 수 있어요.",
                status="sent",
            )

            result = send_daily_skin_log_reminder_for_user(
                self.db,
                user_id=1,
                target_date=self.target_date,
            )

        mock_send.assert_called_once()
        kwargs = mock_send.call_args.kwargs
        self.assertEqual(kwargs["notification_type"], "daily_skin_log_reminder")
        self.assertEqual(kwargs["dedupe_key"], "daily_skin_log_reminder:1:2026-06-16")
        self.assertEqual(kwargs["title"], "오늘 피부 기록을 남겨볼까요?")
        self.assertEqual(kwargs["body"], "짧게 기록해두면 내 피부 흐름을 더 잘 확인할 수 있어요.")
        self.assertEqual(
            kwargs["data"],
            {
                "type": "daily_skin_log_reminder",
                "screen": "record",
                "target_date": "2026-06-16",
            },
        )
        self.assertEqual(result["status"], "sent")

    def test_disabled_setting_uses_sender_skip(self):
        self.db.add(NotificationSettings(user_id=1, daily_log_reminder_enabled=False))
        self.db.commit()

        result = send_daily_skin_log_reminder_for_user(
            self.db,
            user_id=1,
            target_date=self.target_date,
        )

        self.assertEqual(result["status"], "skipped")
        notification_log = self.db.query(NotificationLog).one()
        self.assertEqual(notification_log.error_message, "Notification disabled by user setting")

    def test_dedupe_returns_existing_log(self):
        self.db.add(
            NotificationLog(
                user_id=1,
                notification_type="daily_skin_log_reminder",
                dedupe_key="daily_skin_log_reminder:1:2026-06-16",
                title="오늘 피부 기록을 남겨볼까요?",
                body="짧게 기록해두면 내 피부 흐름을 더 잘 확인할 수 있어요.",
                status="skipped",
            )
        )
        self.db.commit()

        with patch("app.services.daily_skin_log_reminder.send_notification_event") as mock_send:
            result = send_daily_skin_log_reminder_for_user(
                self.db,
                user_id=1,
                target_date=self.target_date,
            )

        mock_send.assert_not_called()
        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["reason"], "deduped")
        self.assertEqual(self.db.query(NotificationLog).count(), 1)


if __name__ == "__main__":
    unittest.main()
