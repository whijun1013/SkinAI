import os
from datetime import datetime, date, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.ai_usage import AIUsageLog
import logging

logger = logging.getLogger(__name__)

def check_user_daily_limit(db: Session, user_id: int, feature: str, limit: int) -> bool:
    """Check if the user has exceeded their daily limit for a feature."""
    if limit <= 0:
        return True # if limit is 0 or negative, it means no limit or disabled, handled by caller

    today = date.today()
    start_of_day = datetime(today.year, today.month, today.day)

    count = db.query(func.count(AIUsageLog.id)).filter(
        AIUsageLog.user_id == user_id,
        AIUsageLog.feature == feature,
        AIUsageLog.created_at >= start_of_day,
        AIUsageLog.status.in_(["success", "fallback"]) # do not count failed or limited
    ).scalar() or 0

    return count < limit

def check_monthly_budget(db: Session, feature: str, budget_usd: float) -> bool:
    """Check if the global monthly budget for a feature has been exceeded."""
    if budget_usd <= 0.0:
        return True

    today = date.today()
    start_of_month = datetime(today.year, today.month, 1)

    total_cost = db.query(func.sum(AIUsageLog.estimated_cost_usd)).filter(
        AIUsageLog.feature == feature,
        AIUsageLog.created_at >= start_of_month
    ).scalar() or 0.0

    return float(total_cost) < float(budget_usd)

def record_ai_usage(
    db: Session,
    user_id: int,
    feature: str,
    provider: str,
    input_units: int,
    output_units: int,
    estimated_cost_usd: float,
    latency_ms: Optional[int],
    status: str,
    error_code: Optional[str] = None
):
    """Record an AI usage log entry."""
    # Sanitize error code to not include secrets/tokens
    sanitized_error = error_code
    if sanitized_error:
        # Very basic redaction if needed, assuming caller does mostly, but we ensure no keys
        if "sk-" in sanitized_error:
            sanitized_error = "<redacted-key>"

    log_entry = AIUsageLog(
        user_id=user_id,
        feature=feature,
        provider=provider,
        input_units=input_units,
        output_units=output_units,
        estimated_cost_usd=estimated_cost_usd,
        latency_ms=latency_ms,
        status=status,
        error_code=sanitized_error
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry
