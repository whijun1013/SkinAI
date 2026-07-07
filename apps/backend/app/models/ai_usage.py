from sqlalchemy import Column, BigInteger, Integer, String, DateTime, Numeric, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class AIUsageLog(Base):
    __tablename__ = "ai_usage_log"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    feature = Column(String(50), nullable=False, index=True)  # food_vision, cosmetic_ocr, skin_analysis, action_recommendation
    provider = Column(String(50), nullable=False)
    input_units = Column(Integer, nullable=False, default=0)
    output_units = Column(Integer, nullable=False, default=0)
    estimated_cost_usd = Column(Numeric(10, 6), nullable=False, default=0.0)
    latency_ms = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False)  # success, fallback, failed, limited
    error_code = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
