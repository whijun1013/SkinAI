import os
import sys
import unittest
import json
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.deps.auth import get_current_user
from app.models.notification import NotificationLog


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


class TestNotificationLogsApi(unittest.TestCase):
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
        self.db.commit()
        self.db.close()
        self._restore_override(get_current_user, self._previous_current_user_override)
        self._restore_override(get_db, self._previous_get_db_override)

    def test_logs_returns_only_current_user_sent_logs_with_payload(self):
        now = datetime(2026, 6, 16, 12, 0, 0)
        self._add_log(
            user_id=1,
            notification_type="daily_skin_log_reminder",
            dedupe_key="daily_skin_log_reminder:1:2026-06-16",
            status="sent",
            sent_at=now,
            data={
                "type": "daily_skin_log_reminder",
                "screen": "record",
                "target_date": "2026-06-16",
            },
        )
        self._add_log(
            user_id=1,
            notification_type="analysis_ready",
            dedupe_key="analysis_ready:1:2026-06-15",
            status="skipped",
            sent_at=now + timedelta(minutes=1),
        )
        self._add_log(
            user_id=2,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:99",
            status="sent",
            sent_at=now + timedelta(minutes=2),
        )

        response = self.client.get("/notifications/logs")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["notification_type"], "daily_skin_log_reminder")
        self.assertEqual(data[0]["status"], "sent")
        self.assertIsNone(data[0]["read_at"])
        self.assertEqual(
            data[0]["data"],
            {
                "type": "daily_skin_log_reminder",
                "screen": "record",
                "target_date": "2026-06-16",
            },
        )
        self.assertNotIn("provider_message_id", data[0])
        self.assertNotIn("error_message", data[0])

    def test_logs_orders_by_sent_at_with_created_at_fallback(self):
        older = datetime(2026, 6, 16, 9, 0, 0)
        newer = datetime(2026, 6, 16, 10, 0, 0)
        self._add_log(
            user_id=1,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:1",
            status="sent",
            sent_at=older,
            created_at=older,
            target_id=1,
            data={"type": "analysis_complete", "screen": "report", "analysis_request_id": 1},
        )
        self._add_log(
            user_id=1,
            notification_type="analysis_failed",
            dedupe_key="analysis_failed:2",
            status="sent",
            sent_at=None,
            created_at=newer,
            target_id=2,
            data={"type": "analysis_failed", "screen": "report", "analysis_request_id": 2},
        )

        response = self.client.get("/notifications/logs")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual([item["target_id"] for item in data], [2, 1])
        self.assertEqual(data[0]["data"]["screen"], "report")
        self.assertEqual(data[0]["data"]["analysis_request_id"], 2)

    def test_logs_returns_empty_object_for_null_data(self):
        self._add_log(
            user_id=1,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:legacy",
            status="sent",
            sent_at=datetime(2026, 6, 16, 12, 0, 0),
            data=None,
        )

        response = self.client.get("/notifications/logs")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["data"], {})

    def test_logs_parses_string_data_fallback(self):
        self._add_log(
            user_id=1,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:string",
            status="sent",
            sent_at=datetime(2026, 6, 16, 12, 0, 0),
            data=json.dumps({"type": "analysis_complete", "screen": "report"}),
        )

        response = self.client.get("/notifications/logs")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()[0]["data"],
            {"type": "analysis_complete", "screen": "report"},
        )

    def test_logs_does_not_rebuild_data_from_dedupe_key(self):
        self._add_log(
            user_id=1,
            notification_type="daily_skin_log_reminder",
            dedupe_key="daily_skin_log_reminder:1:2026-06-16",
            status="sent",
            sent_at=datetime(2026, 6, 16, 12, 0, 0),
            data=None,
        )

        response = self.client.get("/notifications/logs")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["data"], {})

    def test_logs_clamps_limit_to_50(self):
        now = datetime(2026, 6, 16, 12, 0, 0)
        for index in range(55):
            self._add_log(
                user_id=1,
                notification_type="analysis_complete",
                dedupe_key=f"analysis_complete:{index}",
                status="sent",
                sent_at=now + timedelta(minutes=index),
                target_id=index,
            )

        response = self.client.get("/notifications/logs?limit=100")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 50)

    def test_logs_default_limit_returns_20(self):
        now = datetime(2026, 6, 16, 12, 0, 0)
        for index in range(25):
            self._add_log(
                user_id=1,
                notification_type="analysis_complete",
                dedupe_key=f"analysis_complete:default-limit:{index}",
                status="sent",
                sent_at=now + timedelta(minutes=index),
                target_id=index,
            )

        response = self.client.get("/notifications/logs")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 20)

    def test_logs_supports_offset_pagination(self):
        now = datetime(2026, 6, 16, 12, 0, 0)
        for index in range(25):
            self._add_log(
                user_id=1,
                notification_type="analysis_complete",
                dedupe_key=f"analysis_complete:offset:{index}",
                status="sent",
                sent_at=now + timedelta(minutes=index),
                target_id=index,
            )

        first_response = self.client.get("/notifications/logs?limit=20&offset=0")
        second_response = self.client.get("/notifications/logs?limit=20&offset=20")

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(len(first_response.json()), 20)
        self.assertEqual(len(second_response.json()), 5)
        self.assertEqual(first_response.json()[0]["target_id"], 24)
        self.assertEqual(second_response.json()[0]["target_id"], 4)

    def test_logs_clamps_negative_offset_to_zero(self):
        now = datetime(2026, 6, 16, 12, 0, 0)
        for index in range(3):
            self._add_log(
                user_id=1,
                notification_type="analysis_complete",
                dedupe_key=f"analysis_complete:negative-offset:{index}",
                status="sent",
                sent_at=now + timedelta(minutes=index),
                target_id=index,
            )

        default_response = self.client.get("/notifications/logs?limit=2&offset=0")
        negative_response = self.client.get("/notifications/logs?limit=2&offset=-10")

        self.assertEqual(default_response.status_code, 200)
        self.assertEqual(negative_response.status_code, 200)
        self.assertEqual(negative_response.json(), default_response.json())

    def test_logs_rejects_invalid_limit_and_offset_types(self):
        limit_response = self.client.get("/notifications/logs?limit=abc")
        offset_response = self.client.get("/notifications/logs?offset=abc")

        self.assertEqual(limit_response.status_code, 422)
        self.assertEqual(offset_response.status_code, 422)

    def test_logs_filters_analysis_category_with_sent_current_user_logs(self):
        now = datetime(2026, 6, 16, 12, 0, 0)
        self._add_log(
            user_id=1,
            notification_type="analysis_ready",
            dedupe_key="analysis_ready:category",
            status="sent",
            sent_at=now,
            target_id=1,
        )
        self._add_log(
            user_id=1,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:category",
            status="sent",
            sent_at=now + timedelta(minutes=1),
            target_id=2,
        )
        self._add_log(
            user_id=1,
            notification_type="analysis_failed",
            dedupe_key="analysis_failed:category",
            status="sent",
            sent_at=now + timedelta(minutes=2),
            target_id=3,
        )
        self._add_log(
            user_id=1,
            notification_type="daily_skin_log_reminder",
            dedupe_key="daily_skin_log_reminder:category",
            status="sent",
            sent_at=now + timedelta(minutes=3),
            target_id=4,
        )
        self._add_log(
            user_id=2,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:other-category",
            status="sent",
            sent_at=now + timedelta(minutes=4),
            target_id=5,
        )
        self._add_log(
            user_id=1,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:skipped-category",
            status="skipped",
            sent_at=now + timedelta(minutes=5),
            target_id=6,
        )

        response = self.client.get("/notifications/logs?category=analysis")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertEqual([item["notification_type"] for item in data], ["analysis_complete", "analysis_ready"])
        self.assertEqual([item["target_id"] for item in data], [2, 1])

    def test_logs_filters_record_category(self):
        now = datetime(2026, 6, 16, 12, 0, 0)
        self._add_log(
            user_id=1,
            notification_type="daily_skin_log_reminder",
            dedupe_key="daily_skin_log_reminder:record-category",
            status="sent",
            sent_at=now,
            target_id=1,
        )
        self._add_log(
            user_id=1,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:record-category",
            status="sent",
            sent_at=now + timedelta(minutes=1),
            target_id=2,
        )

        response = self.client.get("/notifications/logs?category=record")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["notification_type"], "daily_skin_log_reminder")

    def test_logs_filters_failed_category_but_only_sent_status(self):
        now = datetime(2026, 6, 16, 12, 0, 0)
        self._add_log(
            user_id=1,
            notification_type="analysis_failed",
            dedupe_key="analysis_failed:sent-category",
            status="sent",
            sent_at=now,
            target_id=1,
            read_at=now,
        )
        self._add_log(
            user_id=1,
            notification_type="analysis_failed",
            dedupe_key="analysis_failed:failed-category",
            status="failed",
            sent_at=now + timedelta(minutes=1),
            target_id=2,
        )
        self._add_log(
            user_id=1,
            notification_type="analysis_failed",
            dedupe_key="analysis_failed:pending-category",
            status="pending",
            sent_at=now + timedelta(minutes=2),
            target_id=3,
        )

        response = self.client.get("/notifications/logs?category=failed")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["notification_type"], "analysis_failed")
        self.assertEqual(data[0]["status"], "sent")
        self.assertIsNotNone(data[0]["read_at"])

    def test_logs_category_filter_works_with_pagination(self):
        now = datetime(2026, 6, 16, 12, 0, 0)
        for index in range(5):
            self._add_log(
                user_id=1,
                notification_type="analysis_complete",
                dedupe_key=f"analysis_complete:category-page:{index}",
                status="sent",
                sent_at=now + timedelta(minutes=index),
                target_id=index,
            )
        self._add_log(
            user_id=1,
            notification_type="daily_skin_log_reminder",
            dedupe_key="daily_skin_log_reminder:category-page",
            status="sent",
            sent_at=now + timedelta(minutes=10),
            target_id=99,
        )

        response = self.client.get("/notifications/logs?category=analysis&limit=2&offset=2")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 2)
        self.assertEqual([item["target_id"] for item in data], [2, 1])

    def test_logs_rejects_unknown_category(self):
        response = self.client.get("/notifications/logs?category=unknown")

        self.assertEqual(response.status_code, 400)

    def test_logs_without_auth_is_rejected(self):
        self._restore_override(get_current_user, self._previous_current_user_override)

        response = self.client.get("/notifications/logs")

        self.assertIn(response.status_code, {401, 403})

    def test_unread_count_counts_only_current_user_sent_unread_logs(self):
        now = datetime(2026, 6, 16, 12, 0, 0)
        self._add_log(
            user_id=1,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:unread",
            status="sent",
            sent_at=now,
            read_at=None,
        )
        self._add_log(
            user_id=1,
            notification_type="analysis_ready",
            dedupe_key="analysis_ready:read",
            status="sent",
            sent_at=now,
            read_at=now,
        )
        self._add_log(
            user_id=1,
            notification_type="analysis_failed",
            dedupe_key="analysis_failed:failed",
            status="failed",
            sent_at=now,
            read_at=None,
        )
        self._add_log(
            user_id=2,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:other",
            status="sent",
            sent_at=now,
            read_at=None,
        )

        response = self.client.get("/notifications/unread-count")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"unread_count": 1})

    def test_mark_all_read_updates_current_user_sent_unread_logs(self):
        now = datetime(2026, 6, 16, 12, 0, 0)
        unread = self._add_log(
            user_id=1,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:unread",
            status="sent",
            sent_at=now,
            read_at=None,
        )
        already_read = self._add_log(
            user_id=1,
            notification_type="analysis_ready",
            dedupe_key="analysis_ready:read",
            status="sent",
            sent_at=now,
            read_at=now,
        )
        failed = self._add_log(
            user_id=1,
            notification_type="analysis_failed",
            dedupe_key="analysis_failed:failed",
            status="failed",
            sent_at=now,
            read_at=None,
        )
        other_user = self._add_log(
            user_id=2,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:other",
            status="sent",
            sent_at=now,
            read_at=None,
        )

        response = self.client.patch("/notifications/logs/read-all")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"updated_count": 1})
        self.db.refresh(unread)
        self.db.refresh(already_read)
        self.db.refresh(failed)
        self.db.refresh(other_user)
        self.assertIsNotNone(unread.read_at)
        self.assertEqual(already_read.read_at, now)
        self.assertIsNone(failed.read_at)
        self.assertIsNone(other_user.read_at)

    def test_mark_log_read_updates_current_user_sent_log(self):
        log = self._add_log(
            user_id=1,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:read-one",
            status="sent",
            sent_at=datetime(2026, 6, 16, 12, 0, 0),
            read_at=None,
        )

        response = self.client.patch(f"/notifications/logs/{log.id}/read")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], log.id)
        self.assertIsNotNone(data["read_at"])
        self.db.refresh(log)
        self.assertIsNotNone(log.read_at)

    def test_mark_log_read_is_idempotent_for_already_read_log(self):
        read_at = datetime(2026, 6, 16, 12, 0, 0)
        log = self._add_log(
            user_id=1,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:already-read",
            status="sent",
            sent_at=read_at,
            read_at=read_at,
        )

        response = self.client.patch(f"/notifications/logs/{log.id}/read")

        self.assertEqual(response.status_code, 200)
        self.db.refresh(log)
        self.assertEqual(log.read_at, read_at)

    def test_mark_log_read_rejects_missing_other_user_and_non_sent_logs(self):
        other_user = self._add_log(
            user_id=2,
            notification_type="analysis_complete",
            dedupe_key="analysis_complete:other-user",
            status="sent",
            sent_at=datetime(2026, 6, 16, 12, 0, 0),
        )
        failed = self._add_log(
            user_id=1,
            notification_type="analysis_failed",
            dedupe_key="analysis_failed:non-sent",
            status="failed",
            sent_at=datetime(2026, 6, 16, 12, 0, 0),
        )

        missing_response = self.client.patch("/notifications/logs/999999/read")
        other_response = self.client.patch(f"/notifications/logs/{other_user.id}/read")
        failed_response = self.client.patch(f"/notifications/logs/{failed.id}/read")

        self.assertEqual(missing_response.status_code, 404)
        self.assertEqual(other_response.status_code, 404)
        self.assertEqual(failed_response.status_code, 404)

    def test_read_all_route_does_not_conflict_with_log_id_route(self):
        response = self.client.patch("/notifications/logs/read-all")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"updated_count": 0})

    def _add_log(
        self,
        *,
        user_id,
        notification_type,
        dedupe_key,
        status,
        sent_at,
        created_at=None,
        target_id=None,
        data=None,
        read_at=None,
    ):
        log = NotificationLog(
            user_id=user_id,
            notification_type=notification_type,
            target_type="skin_log" if notification_type == "daily_skin_log_reminder" else "analysis_request",
            target_id=target_id,
            dedupe_key=dedupe_key,
            title="알림 제목",
            body="알림 본문",
            status=status,
            provider="expo",
            data=data,
            sent_at=sent_at,
            read_at=read_at,
            created_at=created_at or sent_at or datetime.utcnow(),
        )
        self.db.add(log)
        self.db.commit()
        return log

    def _restore_override(self, dependency, previous):
        if previous is None:
            app.dependency_overrides.pop(dependency, None)
        else:
            app.dependency_overrides[dependency] = previous


if __name__ == "__main__":
    unittest.main()
