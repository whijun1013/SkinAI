from sqlalchemy import Column, BigInteger, Integer, String, Text, DateTime, Date, JSON, ForeignKey, CheckConstraint, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class SkinLog(Base):
    __tablename__ = "skin_log"
    __table_args__ = (
        CheckConstraint("overall_score BETWEEN 1 AND 5", name="chk_overall_score"),
        UniqueConstraint("user_id", "logged_at", name="uq_skin_log_user_date"),
    )
    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    logged_at = Column(Date, nullable=False, index=True)
    photo_url = Column(String(500), nullable=True)
    masked_photo_url = Column(String(500), nullable=True)
    left_photo_url = Column(String(500), nullable=True)
    right_photo_url = Column(String(500), nullable=True)
    condition_tags = Column(JSON, nullable=True)
    overall_score = Column(Integer, nullable=True)
    note = Column(Text, nullable=True)
    quality_check_passed = Column(Boolean, nullable=True)
    quality_warning = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())
