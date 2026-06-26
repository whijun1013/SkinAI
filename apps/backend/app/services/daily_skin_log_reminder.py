from datetime import date, datetime
from typing import Any, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.notification import NotificationLog, NotificationSettings
from app.models.skin_log import SkinLog
from app.services.notification_sender import EXPO_PROVIDER, send_notification_event


NOTIFICATION_TYPE = "daily_skin_log_reminder"
REMINDER_TITLE = "오늘 피부 기록을 남겨볼까요?"
REMINDER_BODY = "짧게 기록해두면 내 피부 흐름을 더 잘 확인할 수 있어요."
DEFAULT_TIMEZONE = "Asia/Seoul"


def send_daily_skin_log_reminder_for_user(
    db: Session,
    *,
    user_id: int,
    target_date: Optional[date] = None,
) -> dict[str, Any]:
    settings = _get_notification_settings(db, user_id)
    reminder_date = target_date or _today_for_settings(settings)
    reminder_date_value = reminder_date.isoformat()
    dedupe_key = f"{NOTIFICATION_TYPE}:{user_id}:{reminder_date_value}"

    existing_log = _get_existing_log(db, dedupe_key)
    if existing_log is not None:
        return _result(existing_log, reminder_date, "deduped")

    notification_data = {
        "type": NOTIFICATION_TYPE,
        "screen": "record",
        "target_date": reminder_date_value,
    }

    if _has_skin_log_for_date(db, user_id, reminder_date):
        log = _create_log(
            db,
            user_id=user_id,
            dedupe_key=dedupe_key,
            status="skipped",
            error_message="Skin log already exists for target date",
            data=notification_data,
        )
        return _result(log, reminder_date, "skin_log_exists")

    try:
        log = send_notification_event(
            db,
            user_id=user_id,
            notification_type=NOTIFICATION_TYPE,
            dedupe_key=dedupe_key,
            title=REMINDER_TITLE,
            body=REMINDER_BODY,
            target_type="skin_log",
            target_id=None,
            data=notification_data,
        )
        return _result(log, reminder_date, _reason_for_log(log))
    except Exception:
        db.rollback()
        log = _create_log(
            db,
            user_id=user_id,
            dedupe_key=dedupe_key,
            status="failed",
            error_message="Daily skin log reminder send failed",
            data=notification_data,
        )
        return _result(log, reminder_date, "send_failed")


def _get_notification_settings(db: Session, user_id: int) -> Optional[NotificationSettings]:
    return (
        db.query(NotificationSettings)
        .filter(NotificationSettings.user_id == user_id)
        .first()
    )


def _today_for_settings(settings: Optional[NotificationSettings]) -> date:
    timezone_name = settings.timezone if settings and settings.timezone else DEFAULT_TIMEZONE
    try:
        timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        timezone = ZoneInfo(DEFAULT_TIMEZONE)
    return datetime.now(timezone).date()


def _has_skin_log_for_date(db: Session, user_id: int, target_date: date) -> bool:
    return (
        db.query(SkinLog.id)
        .filter(
            SkinLog.user_id == user_id,
            SkinLog.logged_at == target_date,
        )
        .first()
        is not None
    )


def _get_existing_log(db: Session, dedupe_key: str) -> Optional[NotificationLog]:
    return (
        db.query(NotificationLog)
        .filter(NotificationLog.dedupe_key == dedupe_key)
        .first()
    )


def _create_log(
    db: Session,
    *,
    user_id: int,
    dedupe_key: str,
    status: str,
    error_message: Optional[str],
    data: Optional[dict[str, Any]] = None,
) -> NotificationLog:
    log = NotificationLog(
        user_id=user_id,
        notification_type=NOTIFICATION_TYPE,
        target_type="skin_log",
        target_id=None,
        dedupe_key=dedupe_key,
        title=REMINDER_TITLE,
        body=REMINDER_BODY,
        data=data,
        status=status,
        provider=EXPO_PROVIDER,
        error_message=error_message,
    )
    db.add(log)
    try:
        db.commit()
        db.refresh(log)
        return log
    except IntegrityError:
        db.rollback()
        existing_log = _get_existing_log(db, dedupe_key)
        if existing_log is not None:
            return existing_log
        raise


def _reason_for_log(log: NotificationLog) -> str:
    if log.status == "sent":
        return "sent"
    if log.status == "skipped":
        return "skipped"
    if log.status == "failed":
        return "failed"
    return log.status


def _result(log: NotificationLog, target_date: date, reason: str) -> dict[str, Any]:
    return {
        "notification_type": NOTIFICATION_TYPE,
        "target_date": target_date.isoformat(),
        "status": log.status,
        "reason": reason,
        "dedupe_key": log.dedupe_key,
        "log_id": log.id,
    }
