import os
import sys
import unittest
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import BigInteger, create_engine
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.notification import NotificationLog, NotificationToken
from app.models.user import User  # noqa: F401
from app.services.notification_sender import NotificationSender


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


class TestNotificationSenderData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self.db = TestingSessionLocal()
        self.sender = NotificationSender()

    def tearDown(self):
        self.db.query(NotificationLog).delete()
        self.db.query(NotificationToken).delete()
        self.db.commit()
        self.db.close()

    def test_sent_log_stores_same_data_as_expo_payload(self):
        self.db.add(
            NotificationToken(
                user_id=1,
                expo_push_token="ExpoPushToken[test-token]",
                is_active=True,
            )
        )
        self.db.commit()
        captured_payloads = []

        def fake_send(payloads):
            captured_payloads.extend(payloads)
            return [{"status": "ok", "id": "ticket-1"}]

        with patch.object(self.sender, "_send_expo_push", side_effect=fake_send):
            log = self.sender.send_notification_event(
                self.db,
                user_id=1,
                notification_type="analysis_complete",
                dedupe_key="analysis_complete:101",
                title="title",
                body="body",
                target_type="analysis_request",
                target_id=101,
                data={
                    "type": "analysis_complete",
                    "screen": "report",
                    "analysis_request_id": 101,
                    "analysis_result_id": 202,
                },
            )

        self.assertEqual(log.status, "sent")
        self.assertEqual(captured_payloads[0]["data"], log.data)
        self.assertIsInstance(log.data, dict)
        self.assertEqual(log.data["notification_log_id"], log.id)
        self.assertEqual(captured_payloads[0]["data"]["notification_log_id"], log.id)
        self.assertEqual(log.data["screen"], "report")
        self.assertEqual(log.data["analysis_request_id"], 101)
        self.assertEqual(log.data["analysis_result_id"], 202)
        self.assertEqual(log.data["target_type"], "analysis_request")
        self.assertEqual(log.data["target_id"], 101)

    def test_skipped_log_stores_data_when_no_active_token(self):
        cases = [
            (
                "analysis_ready",
                "analysis_ready:1:2026-06-16",
                "skin_log",
                None,
                {"type": "analysis_ready", "screen": "report", "base_date": "2026-06-16"},
            ),
            (
                "daily_skin_log_reminder",
                "daily_skin_log_reminder:1:2026-06-16",
                "skin_log",
                None,
                {
                    "type": "daily_skin_log_reminder",
                    "screen": "record",
                    "target_date": "2026-06-16",
                },
            ),
        ]

        for notification_type, dedupe_key, target_type, target_id, data in cases:
            with self.subTest(notification_type=notification_type):
                log = self.sender.send_notification_event(
                    self.db,
                    user_id=1,
                    notification_type=notification_type,
                    dedupe_key=dedupe_key,
                    title="title",
                    body="body",
                    target_type=target_type,
                    target_id=target_id,
                    data=data,
                )

                self.assertEqual(log.status, "skipped")
                self.assertIsInstance(log.data, dict)
                self.assertEqual(log.data["notification_log_id"], log.id)
                self.assertEqual(log.data["screen"], data["screen"])
                self.assertEqual(log.data["target_type"], target_type)

    def test_failed_log_keeps_same_data_as_expo_payload(self):
        self.db.add(
            NotificationToken(
                user_id=1,
                expo_push_token="ExpoPushToken[test-token]",
                is_active=True,
            )
        )
        self.db.commit()
        captured_payloads = []
        notification_data = {
            "type": "analysis_failed",
            "screen": "report",
            "analysis_request_id": 303,
        }

        def fake_send(payloads):
            captured_payloads.extend(payloads)
            return [{"status": "error", "message": "failed"}]

        with patch.object(
            self.sender,
            "_send_expo_push",
            side_effect=fake_send,
        ):
            log = self.sender.send_notification_event(
                self.db,
                user_id=1,
                notification_type="analysis_failed",
                dedupe_key="analysis_failed:303",
                title="title",
                body="body",
                target_type="analysis_request",
                target_id=303,
                data=notification_data,
            )

        self.assertEqual(log.status, "failed")
        self.assertEqual(captured_payloads[0]["data"], log.data)
        self.assertIsInstance(log.data, dict)
        self.assertEqual(log.data["notification_log_id"], log.id)
        self.assertEqual(log.data["screen"], "report")
        self.assertEqual(log.data["analysis_request_id"], 303)
        self.assertEqual(log.data["target_type"], "analysis_request")
        self.assertEqual(log.data["target_id"], 303)

    def test_existing_dedupe_log_is_not_backfilled_with_notification_log_id(self):
        existing = NotificationLog(
            user_id=1,
            notification_type="analysis_ready",
            dedupe_key="analysis_ready:1:2026-06-16",
            title="title",
            body="body",
            target_type="skin_log",
            target_id=None,
            status="sent",
            provider="expo",
            data={
                "type": "analysis_ready",
                "screen": "report",
                "base_date": "2026-06-16",
            },
        )
        self.db.add(existing)
        self.db.commit()
        self.db.refresh(existing)

        log = self.sender.send_notification_event(
            self.db,
            user_id=1,
            notification_type="analysis_ready",
            dedupe_key="analysis_ready:1:2026-06-16",
            title="title",
            body="body",
            target_type="skin_log",
            target_id=None,
            data={"type": "analysis_ready", "screen": "report", "base_date": "2026-06-16"},
        )

        self.assertEqual(log.id, existing.id)
        self.assertNotIn("notification_log_id", log.data)
