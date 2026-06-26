from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, Time
from sqlalchemy.orm import backref, relationship

from app.database import Base


class NotificationSettings(Base):
    __tablename__ = "notification_settings"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    skin_reminder_enabled = Column(Boolean, nullable=False, default=True)
    skin_reminder_time = Column(Time, nullable=True)
    skin_reminder_days = Column(JSON, nullable=True)
    daily_log_reminder_enabled = Column(Boolean, nullable=False, default=True)
    daily_log_reminder_time = Column(Time, nullable=True)
    analysis_ready_enabled = Column(Boolean, nullable=False, default=True)
    analysis_complete_enabled = Column(Boolean, nullable=False, default=True)
    inactive_reminder_enabled = Column(Boolean, nullable=False, default=False)
    inactive_days_threshold = Column(Integer, nullable=False, default=3)
    timezone = Column(String(50), nullable=False, default="Asia/Seoul")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref=backref("notification_settings", uselist=False))


class NotificationToken(Base):
    __tablename__ = "notification_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expo_push_token = Column(String(255), nullable=False, unique=True, index=True)
    device_id = Column(String(255), nullable=True)
    platform = Column(String(30), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="notification_tokens")


class NotificationLog(Base):
    __tablename__ = "notification_logs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    notification_type = Column(String(50), nullable=False, index=True)
    target_type = Column(String(50), nullable=True)
    target_id = Column(BigInteger, nullable=True)
    dedupe_key = Column(String(255), nullable=False, unique=True, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    data = Column(JSON, nullable=True)
    status = Column(String(30), nullable=False, default="pending", index=True)
    provider = Column(String(50), nullable=True)
    provider_message_id = Column(String(255), nullable=True)
    error_message = Column(Text, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="notification_logs")
