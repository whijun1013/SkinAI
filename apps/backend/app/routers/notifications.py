import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.notification import NotificationLog, NotificationSettings, NotificationToken
from app.models.user import User
from app.schemas.notification import (
    NotificationMarkAllReadResponse,
    NotificationMarkReadResponse,
    NotificationLogResponse,
    NotificationUnreadCountResponse,
    NotificationSettingsResponse,
    NotificationSettingsUpdate,
    NotificationTokenCreate,
    NotificationTokenDelete,
    NotificationTokenResponse,
)
from app.services.daily_skin_log_reminder import send_daily_skin_log_reminder_for_user


router = APIRouter(prefix="/notifications", tags=["notifications"])


NOTIFICATION_LOG_CATEGORY_TYPES = {
    "analysis": ("analysis_ready", "analysis_complete"),
    "record": ("daily_skin_log_reminder",),
    "failed": ("analysis_failed",),
}


def _get_or_create_settings(db: Session, user_id: int) -> NotificationSettings:
    settings = (
        db.query(NotificationSettings)
        .filter(NotificationSettings.user_id == user_id)
        .first()
    )
    if settings:
        return settings

    settings = NotificationSettings(
        user_id=user_id,
        skin_reminder_enabled=True,
        skin_reminder_time=None,
        skin_reminder_days=None,
        daily_log_reminder_enabled=True,
        daily_log_reminder_time=None,
        analysis_ready_enabled=True,
        analysis_complete_enabled=True,
        inactive_reminder_enabled=False,
        inactive_days_threshold=3,
        timezone="Asia/Seoul",
    )
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


@router.get("/logs", response_model=list[NotificationLogResponse])
def get_notification_logs(
    limit: int = 20,
    offset: int = 0,
    category: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    safe_limit = min(max(limit, 1), 50)
    safe_offset = max(offset, 0)
    query = (
        db.query(NotificationLog)
        .filter(
            NotificationLog.user_id == current_user.id,
            NotificationLog.status == "sent",
        )
    )

    if category:
        category_types = NOTIFICATION_LOG_CATEGORY_TYPES.get(category)
        if category_types is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid notification category")
        query = query.filter(NotificationLog.notification_type.in_(category_types))

    logs = (
        query.order_by(func.coalesce(NotificationLog.sent_at, NotificationLog.created_at).desc())
        .offset(safe_offset)
        .limit(safe_limit)
        .all()
    )

    return [
        NotificationLogResponse(
            id=log.id,
            notification_type=log.notification_type,
            title=log.title,
            body=log.body,
            status=log.status,
            data=_notification_log_data(log),
            target_type=log.target_type,
            target_id=log.target_id,
            created_at=log.created_at,
            sent_at=log.sent_at,
            read_at=log.read_at,
        )
        for log in logs
    ]


@router.get("/unread-count", response_model=NotificationUnreadCountResponse)
def get_notification_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    unread_count = (
        db.query(func.count(NotificationLog.id))
        .filter(
            NotificationLog.user_id == current_user.id,
            NotificationLog.status == "sent",
            NotificationLog.read_at.is_(None),
        )
        .scalar()
    )
    return NotificationUnreadCountResponse(unread_count=unread_count or 0)


@router.patch("/logs/read-all", response_model=NotificationMarkAllReadResponse)
def mark_all_notification_logs_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    updated_count = (
        db.query(NotificationLog)
        .filter(
            NotificationLog.user_id == current_user.id,
            NotificationLog.status == "sent",
            NotificationLog.read_at.is_(None),
        )
        .update(
            {
                NotificationLog.read_at: now,
                NotificationLog.updated_at: now,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    return NotificationMarkAllReadResponse(updated_count=updated_count)


@router.patch("/logs/{log_id}/read", response_model=NotificationMarkReadResponse)
def mark_notification_log_read(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log = (
        db.query(NotificationLog)
        .filter(
            NotificationLog.id == log_id,
            NotificationLog.user_id == current_user.id,
            NotificationLog.status == "sent",
        )
        .first()
    )
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="notification log not found")

    if log.read_at is None:
        now = datetime.utcnow()
        log.read_at = now
        log.updated_at = now
        db.commit()
        db.refresh(log)

    return NotificationMarkReadResponse(id=log.id, read_at=log.read_at)


@router.get("/settings", response_model=NotificationSettingsResponse)
def get_notification_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_or_create_settings(db, current_user.id)


@router.put("/settings", response_model=NotificationSettingsResponse)
def update_notification_settings(
    payload: NotificationSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = _get_or_create_settings(db, current_user.id)
    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(settings, field, value)

    db.commit()
    db.refresh(settings)
    return settings


@router.post("/token", response_model=NotificationTokenResponse)
def upsert_notification_token(
    payload: NotificationTokenCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    existing = (
        db.query(NotificationToken)
        .filter(NotificationToken.expo_push_token == payload.expo_push_token)
        .first()
    )

    if existing and existing.user_id != current_user.id:
        # 다른 사용자 소유 토큰 — 이전 사용자 비활성화 후 현재 사용자로 신규 등록
        # (같은 디바이스에서 계정 전환 시나리오)
        existing.is_active = False
        existing.updated_at = now
        db.flush()
        token = NotificationToken(
            user_id=current_user.id,
            expo_push_token=payload.expo_push_token,
            device_id=payload.device_id,
            platform=payload.platform,
            is_active=True,
            last_seen_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(token)
    elif existing:
        # 같은 사용자 — 갱신
        existing.device_id = payload.device_id
        existing.platform = payload.platform
        existing.is_active = True
        existing.last_seen_at = now
        existing.updated_at = now
        token = existing
    else:
        token = NotificationToken(
            user_id=current_user.id,
            expo_push_token=payload.expo_push_token,
            device_id=payload.device_id,
            platform=payload.platform,
            is_active=True,
            last_seen_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(token)

    db.commit()
    db.refresh(token)
    return token


@router.delete("/token")
def disable_notification_token(
    payload: NotificationTokenDelete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    token = (
        db.query(NotificationToken)
        .filter(
            NotificationToken.user_id == current_user.id,
            NotificationToken.expo_push_token == payload.expo_push_token,
            NotificationToken.is_active.is_(True),
        )
        .first()
    )
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="push token not found")

    now = datetime.utcnow()
    token.is_active = False
    token.last_seen_at = now
    token.updated_at = now
    db.commit()

    return {"message": "Push token disabled"}


@router.post("/test/daily-skin-log-reminder")
def send_daily_skin_log_reminder_test(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Development/test endpoint: sends the daily skin log reminder only to the authenticated user."""
    return send_daily_skin_log_reminder_for_user(db, user_id=current_user.id)


def _notification_log_data(log: NotificationLog) -> dict:
    data = getattr(log, "data", None)
    if isinstance(data, dict):
        return data
    if isinstance(data, str):
        try:
            parsed = json.loads(data)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}
