from datetime import datetime, time
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


VALID_REMINDER_DAYS = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"}
VALID_PLATFORMS = {"ios", "android", "web"}


class NotificationSettingsResponse(BaseModel):
    id: int
    user_id: int
    skin_reminder_enabled: bool
    skin_reminder_time: Optional[time] = None
    skin_reminder_days: Optional[List[str]] = None
    daily_log_reminder_enabled: bool
    daily_log_reminder_time: Optional[time] = None
    analysis_ready_enabled: bool
    analysis_complete_enabled: bool
    inactive_reminder_enabled: bool
    inactive_days_threshold: int
    timezone: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NotificationSettingsUpdate(BaseModel):
    skin_reminder_enabled: Optional[bool] = None
    skin_reminder_time: Optional[time] = None
    skin_reminder_days: Optional[List[str]] = None
    daily_log_reminder_enabled: Optional[bool] = None
    daily_log_reminder_time: Optional[time] = None
    analysis_ready_enabled: Optional[bool] = None
    analysis_complete_enabled: Optional[bool] = None
    inactive_reminder_enabled: Optional[bool] = None
    inactive_days_threshold: Optional[int] = Field(None, ge=1)
    timezone: Optional[str] = None

    @field_validator("skin_reminder_days")
    @classmethod
    def validate_skin_reminder_days(cls, value):
        if value is None:
            return value
        invalid_days = [day for day in value if day not in VALID_REMINDER_DAYS]
        if invalid_days:
            raise ValueError("skin_reminder_days contains invalid day code")
        return value

    @field_validator("timezone")
    @classmethod
    def normalize_timezone(cls, value):
        if value is None:
            return value
        normalized = value.strip()
        return normalized or "Asia/Seoul"


class NotificationTokenCreate(BaseModel):
    expo_push_token: str
    device_id: Optional[str] = None
    platform: Optional[str] = None

    @field_validator("expo_push_token")
    @classmethod
    def validate_expo_push_token(cls, value):
        token = value.strip()
        if not token:
            raise ValueError("expo_push_token must not be empty")
        if not (token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")):
            raise ValueError("expo_push_token must be an Expo push token")
        return token

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, value):
        if value is None:
            return value
        platform = value.strip().lower()
        if platform not in VALID_PLATFORMS:
            raise ValueError("platform must be one of ios, android, web")
        return platform


class NotificationTokenDelete(BaseModel):
    expo_push_token: str

    @field_validator("expo_push_token")
    @classmethod
    def validate_expo_push_token(cls, value):
        token = value.strip()
        if not token:
            raise ValueError("expo_push_token must not be empty")
        return token


class NotificationTokenResponse(BaseModel):
    id: int
    user_id: int
    expo_push_token: str
    device_id: Optional[str] = None
    platform: Optional[str] = None
    is_active: bool
    last_seen_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NotificationLogResponse(BaseModel):
    id: int
    notification_type: str
    title: str
    body: str
    status: str
    data: Dict[str, Any] = Field(default_factory=dict)
    target_type: Optional[str] = None
    target_id: Optional[int] = None
    created_at: datetime
    sent_at: Optional[datetime] = None
    read_at: Optional[datetime] = None


class NotificationUnreadCountResponse(BaseModel):
    unread_count: int


class NotificationMarkReadResponse(BaseModel):
    id: int
    read_at: Optional[datetime] = None


class NotificationMarkAllReadResponse(BaseModel):
    updated_count: int
