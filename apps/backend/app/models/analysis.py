from sqlalchemy import Column, BigInteger, Integer, String, Text, DateTime, Date, JSON, Numeric, ForeignKey, UniqueConstraint, CheckConstraint, Index  # noqa: F401 (Date/JSON kept for potential future use)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class AnalysisRequest(Base):
    __tablename__ = "analysis_request"
    __table_args__ = (
        CheckConstraint("status IN ('pending','processing','done','failed')", name="chk_status"),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    skin_log_id = Column(BigInteger, ForeignKey("skin_log.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_at = Column(DateTime, nullable=False, server_default=func.now())
    lookback_days = Column(Integer, nullable=False, default=14)
    concern_note = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    agent_results = relationship("AgentResult", back_populates="request", cascade="all, delete-orphan")
    analysis_result = relationship("AnalysisResult", back_populates="request", uselist=False, cascade="all, delete-orphan")
    skin_log = relationship("SkinLog", foreign_keys=[skin_log_id], lazy="select")


class AgentResult(Base):
    __tablename__ = "agent_result"
    __table_args__ = (
        CheckConstraint("agent_type IN ('cosmetic','medication','diet','environment','behavior')", name="chk_agent_type"),       
    )

    id = Column(BigInteger, primary_key=True, index=True)
    request_id = Column(BigInteger, ForeignKey("analysis_request.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_type = Column(String(20), nullable=False)
    suspicious_items = Column(JSON, nullable=True)
    reason = Column(Text, nullable=True)
    confidence = Column(Numeric(3, 2), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    request = relationship("AnalysisRequest", back_populates="agent_results")


class AnalysisResult(Base):
    __tablename__ = "analysis_result"
    __table_args__ = (
        UniqueConstraint("request_id", name="uq_analysis_result_request_id"),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    request_id = Column(BigInteger, ForeignKey("analysis_request.id", ondelete="CASCADE"), nullable=False)
    primary_cause = Column(Text, nullable=True)
    contributing_factors = Column(JSON, nullable=True)
    report_text = Column(Text, nullable=True)
    concern_verdicts = Column(JSON, nullable=True)
    discovered_patterns = Column(JSON, nullable=True)
    confidence_score = Column(Numeric(3, 2), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    request = relationship("AnalysisRequest", back_populates="analysis_result")


class UserBaseline(Base):
    __tablename__ = "user_baseline"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_baseline_user_id"),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    skin_tendency = Column(Text, nullable=True)
    avg_reaction_delay = Column(
        Integer,
        nullable=True,
        comment="Reserved; excluded from analysis context until evidence-date inference exists.",
    )
    analysis_count = Column(Integer, nullable=False, default=0)
    last_calibrated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())


class UserFactorSensitivity(Base):
    __tablename__ = "user_factor_sensitivity"
    __table_args__ = (
        UniqueConstraint("user_id", "factor_type", "factor_key", name="uq_user_factor"),
        CheckConstraint("factor_type IN ('ingredient','food','environment','medication','behavior')", name="chk_factor_type"),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    factor_type = Column(String(20), nullable=False)
    factor_key = Column(String(255), nullable=False)
    sensitivity_score = Column(Numeric(3, 2), nullable=False, default=0.00)
    trigger_count = Column(Integer, nullable=False, default=0)
    last_triggered_at = Column(Date, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())


class UserChangepoint(Base):
    __tablename__ = "user_changepoint"
    __table_args__ = (
        CheckConstraint(
            "analysis_method IN ('daily_correlation', 'before_after')",
            name="chk_analysis_method",
        ),
        Index("ix_user_changepoint_user_detected", "user_id", "detected_at"),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    detected_at = Column(Date, nullable=False)
    window_start_date = Column(Date, nullable=False)
    changepoint_date = Column(Date, nullable=True)
    signal = Column(String(50), nullable=True)
    factor_key = Column(String(100), nullable=True)
    analysis_method = Column(String(20), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


