from sqlalchemy import Column, BigInteger, Integer, String, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.sql import func
from app.database import Base

class ActionRecommendationFeedback(Base):
    __tablename__ = "action_recommendation_feedback"
    __table_args__ = (
        CheckConstraint("feedback IN ('done', 'skipped', 'not_helpful')", name="chk_action_feedback"),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    analysis_request_id = Column(BigInteger, ForeignKey("analysis_request.id", ondelete="CASCADE"), nullable=False, index=True)
    action_key = Column(String(100), nullable=False)
    factor_key = Column(String(100), nullable=False)
    feedback = Column(String(20), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
