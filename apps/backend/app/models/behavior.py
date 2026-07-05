from sqlalchemy import Column, BigInteger, Integer, String, DateTime, Date, Numeric, Boolean, JSON, SmallInteger, ForeignKey, CheckConstraint
from sqlalchemy.sql import func
from app.database import Base


class DailyBehaviorLog(Base):
    __tablename__ = "daily_behavior_log"
    __table_args__ = (
        CheckConstraint("sleep_quality BETWEEN 1 AND 5", name="chk_sleep_quality"),
        CheckConstraint("stress_level BETWEEN 1 AND 5", name="chk_stress_level"),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    logged_at = Column(Date, nullable=False, index=True)
    sleep_hours = Column(Numeric(3, 1), nullable=True)
    sleep_quality = Column(Integer, nullable=True)
    stress_level = Column(Integer, nullable=True)
    water_intake_ml = Column(SmallInteger, nullable=True)
    exercise_yn = Column(Boolean, nullable=True)
    exercise_type = Column(String(50), nullable=True)
    exercise_duration_min = Column(SmallInteger, nullable=True)
    alcohol_yn = Column(Boolean, nullable=True)
    smoking_yn = Column(Boolean, nullable=True)
    custom_behaviors = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

