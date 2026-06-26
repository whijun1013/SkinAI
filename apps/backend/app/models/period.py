from sqlalchemy import Column, BigInteger, Integer, Date, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class PeriodLog(Base):
    __tablename__ = "period_log"

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    started_at = Column(Date, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
