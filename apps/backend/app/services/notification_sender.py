import logging
from datetime import datetime
from typing import Any, Optional

import httpx
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.notification import NotificationLog, NotificationSettings, NotificationToken


logger = logging.getLogger("notification_sender")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_PROVIDER = "expo"
INVALID_TOKEN_ERRORS = {"DeviceNotRegistered", "InvalidPushToken"}


class NotificationSender:
    def __init__(self, timeout_seconds: float = 10.0):
        self.timeout_seconds = timeout_seconds

    def send_push_to_user(
        self,
        db: Session,
        *,
        user_id: int,
        notification_type: str,
        dedupe_key: str,
        title: str,
        body: str,
        target_type: Optional[str] = None,
        target_id: Optional[int] = None,
        data: Optional[dict[str, Any]] = None,
    ) -> NotificationLog:
        return self.send_notification_event(
            db,
            user_id=user_id,
            notification_type=notification_type,
            dedupe_key=dedupe_key,
            title=title,
            body=body,
            target_type=target_type,
            target_id=target_id,
            data=data,
        )

    def send_notification_event(
        self,
        db: Session,
        *,
        user_id: int,
        notification_type: str,
        dedupe_key: str,
        title: str,
        body: str,
        target_type: Optional[str] = None,
        target_id: Optional[int] = None,
        data: Optional[dict[str, Any]] = None,
    ) -> NotificationLog:
        existing_log = self._get_existing_log(db, dedupe_key)
        if existing_log is not None:
            return existing_log

        payload_data = self._build_payload_data(
            notification_type=notification_type,
            target_type=target_type,
            target_id=target_id,
            data=data,
        )

        if not self._is_notification_enabled(db, user_id, notification_type):
            log = self._create_log(
                db,
                user_id=user_id,
                notification_type=notification_type,
                dedupe_key=dedupe_key,
                title=title,
                body=body,
                target_type=target_type,
                target_id=target_id,
                data=payload_data,
                status="skipped",
                provider=EXPO_PROVIDER,
                error_message="Notification disabled by user setting",
            )
            return self._attach_notification_log_id(db, log)

        tokens = self._get_active_tokens(db, user_id)
        if not tokens:
            log = self._create_log(
                db,
                user_id=user_id,
                notification_type=notification_type,
                dedupe_key=dedupe_key,
                title=title,
                body=body,
                target_type=target_type,
                target_id=target_id,
                data=payload_data,
                status="skipped",
                provider=EXPO_PROVIDER,
                error_message="No active push token",
            )
            return self._attach_notification_log_id(db, log)

        log = self._create_log(
            db,
            user_id=user_id,
            notification_type=notification_type,
            dedupe_key=dedupe_key,
            title=title,
            body=body,
            target_type=target_type,
            target_id=target_id,
            data=payload_data,
            status="pending",
            provider=EXPO_PROVIDER,
        )
        if log.status != "pending":
            return log
        payload_data = self._attach_notification_log_id(db, log).data

        payloads = [
            self._build_expo_payload(
                token=token.expo_push_token,
                title=title,
                body=body,
                notification_type=notification_type,
                target_type=target_type,
                target_id=target_id,
                data=payload_data,
            )
            for token in tokens
        ]

        try:
            tickets = self._send_expo_push(payloads)
            self._apply_expo_result(db, log, tokens, tickets)
            db.commit()
            db.refresh(log)
            return log
        except (httpx.HTTPError, ValueError) as exc:
            db.rollback()
            log = self._get_existing_log(db, dedupe_key)
            if log is None:
                raise
            log.status = "failed"
            log.error_message = self._safe_error_message(exc)
            log.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(log)
            return log

    def _attach_notification_log_id(self, db: Session, log: NotificationLog) -> NotificationLog:
        data = log.data if isinstance(log.data, dict) else {}
        log.data = {**data, "notification_log_id": log.id}
        log.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(log)
        return log

    def _get_existing_log(self, db: Session, dedupe_key: str) -> Optional[NotificationLog]:
        return (
            db.query(NotificationLog)
            .filter(NotificationLog.dedupe_key == dedupe_key)
            .first()
        )

    def _get_active_tokens(self, db: Session, user_id: int) -> list[NotificationToken]:
        return (
            db.query(NotificationToken)
            .filter(
                NotificationToken.user_id == user_id,
                NotificationToken.is_active.is_(True),
            )
            .all()
        )

    def _is_notification_enabled(self, db: Session, user_id: int, notification_type: str) -> bool:
        settings = (
            db.query(NotificationSettings)
            .filter(NotificationSettings.user_id == user_id)
            .first()
        )
        if settings is None:
            return self._default_enabled(notification_type)

        setting_field = self._setting_field_for_type(notification_type)
        if setting_field is None:
            return True
        return bool(getattr(settings, setting_field))

    def _setting_field_for_type(self, notification_type: str) -> Optional[str]:
        return {
            "analysis_complete": "analysis_complete_enabled",
            "analysis_failed": "analysis_complete_enabled",
            "analysis_ready": "analysis_ready_enabled",
            "skin_reminder": "skin_reminder_enabled",
            "daily_log_reminder": "daily_log_reminder_enabled",
            "daily_skin_log_reminder": "daily_log_reminder_enabled",
            "inactive_reminder": "inactive_reminder_enabled",
        }.get(notification_type)

    def _default_enabled(self, notification_type: str) -> bool:
        if notification_type == "inactive_reminder":
            return False
        return True

    def _create_log(
        self,
        db: Session,
        *,
        user_id: int,
        notification_type: str,
        dedupe_key: str,
        title: str,
        body: str,
        target_type: Optional[str],
        target_id: Optional[int],
        data: Optional[dict[str, Any]],
        status: str,
        provider: Optional[str] = None,
        provider_message_id: Optional[str] = None,
        error_message: Optional[str] = None,
        sent_at: Optional[datetime] = None,
    ) -> NotificationLog:
        log = NotificationLog(
            user_id=user_id,
            notification_type=notification_type,
            target_type=target_type,
            target_id=target_id,
            dedupe_key=dedupe_key,
            title=title,
            body=body,
            data=data,
            status=status,
            provider=provider,
            provider_message_id=provider_message_id,
            error_message=error_message,
            sent_at=sent_at,
        )
        db.add(log)
        try:
            db.commit()
            db.refresh(log)
            return log
        except IntegrityError:
            db.rollback()
            existing_log = self._get_existing_log(db, dedupe_key)
            if existing_log is not None:
                return existing_log
            raise

    def _build_expo_payload(
        self,
        *,
        token: str,
        title: str,
        body: str,
        notification_type: str,
        target_type: Optional[str],
        target_id: Optional[int],
        data: Optional[dict[str, Any]],
    ) -> dict[str, Any]:
        payload_data = data or self._build_payload_data(
            notification_type=notification_type,
            target_type=target_type,
            target_id=target_id,
            data=None,
        )

        return {
            "to": token,
            "title": title,
            "body": body,
            "data": payload_data.copy(),
        }

    def _build_payload_data(
        self,
        *,
        notification_type: str,
        target_type: Optional[str],
        target_id: Optional[int],
        data: Optional[dict[str, Any]],
    ) -> dict[str, Any]:
        payload_data = {
            "type": notification_type,
            "target_type": target_type,
            "target_id": target_id,
        }
        if data:
            payload_data.update(data)
        return payload_data

    def _send_expo_push(self, payloads: list[dict[str, Any]]) -> list[dict[str, Any]]:
        with httpx.Client(timeout=self.timeout_seconds) as client:
            response = client.post(EXPO_PUSH_URL, json=payloads)
            response.raise_for_status()
            response_data = response.json()

        tickets = response_data.get("data", [])
        if isinstance(tickets, dict):
            return [tickets]
        if isinstance(tickets, list):
            return [ticket for ticket in tickets if isinstance(ticket, dict)]
        return []

    def _apply_expo_result(
        self,
        db: Session,
        log: NotificationLog,
        tokens: list[NotificationToken],
        tickets: list[dict[str, Any]],
    ) -> None:
        now = datetime.utcnow()
        ok_ids: list[str] = []
        errors: list[str] = []

        for token, ticket in zip(tokens, tickets):
            status = ticket.get("status")
            if status == "ok":
                ticket_id = ticket.get("id")
                if ticket_id:
                    ok_ids.append(str(ticket_id))
                continue

            message = ticket.get("message") or "Expo push failed"
            details = ticket.get("details") if isinstance(ticket.get("details"), dict) else {}
            error_code = details.get("error")
            errors.append(self._format_ticket_error(message, error_code))

            if error_code in INVALID_TOKEN_ERRORS:
                token.is_active = False
                token.updated_at = now

        if len(tickets) < len(tokens):
            errors.append("Expo push response did not include tickets for all tokens")

        if ok_ids:
            log.status = "sent"
            log.sent_at = now
            log.provider_message_id = self._truncate(", ".join(ok_ids), 255)
            log.error_message = self._truncate("; ".join(errors), 1000) if errors else None
        else:
            log.status = "failed"
            if not errors and not tickets:
                errors.append("Expo push response did not include tickets")
            log.error_message = self._truncate("; ".join(errors), 1000)

        log.updated_at = now

    def _format_ticket_error(self, message: str, error_code: Optional[str]) -> str:
        if error_code:
            return f"{error_code}: {message}"
        return message

    def _safe_error_message(self, exc: Exception) -> str:
        message = str(exc) or exc.__class__.__name__
        return self._truncate(message, 1000)

    def _truncate(self, value: str, max_length: int) -> str:
        if len(value) <= max_length:
            return value
        return value[:max_length]


def send_notification_event(db: Session, **kwargs: Any) -> NotificationLog:
    return NotificationSender().send_notification_event(db, **kwargs)


def send_push_to_user(db: Session, **kwargs: Any) -> NotificationLog:
    return NotificationSender().send_push_to_user(db, **kwargs)
