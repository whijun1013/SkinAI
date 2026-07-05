from datetime import date

from sqlalchemy.orm import Session

from app.models.behavior import DailyBehaviorLog
from app.services.aggregation import select_confirmed_skin_logs, select_daily_representatives


ANALYSIS_READY_LOOKBACK_DAYS = 14
ANALYSIS_READY_REQUIRED_SKIN_DAYS = 7


def check_continuous_log(db: Session, user_id: int, end_date: date) -> dict:
    skin_days = {
        row.logged_at
        for row in select_confirmed_skin_logs(db, user_id, 7, end_date)
    }
    behavior_days = {
        row.logged_at
        for row in select_daily_representatives(db, DailyBehaviorLog, user_id, 7, end_date)
    }
    recorded_days = len(skin_days & behavior_days)
    required_days = 5
    return {
        "is_ready": recorded_days >= required_days,
        "recorded_days": recorded_days,
        "required_days": required_days,
        "remaining_days": max(required_days - recorded_days, 0),
    }


def check_analysis_ready_skin_logs(db: Session, user_id: int, end_date: date) -> dict:
    skin_days = {
        row.logged_at
        for row in select_confirmed_skin_logs(
            db, user_id, ANALYSIS_READY_LOOKBACK_DAYS, end_date
        )
    }
    recorded_days = len(skin_days)
    return {
        "is_ready": recorded_days >= ANALYSIS_READY_REQUIRED_SKIN_DAYS,
        "recorded_days": recorded_days,
        "required_days": ANALYSIS_READY_REQUIRED_SKIN_DAYS,
        "remaining_days": max(ANALYSIS_READY_REQUIRED_SKIN_DAYS - recorded_days, 0),
        "lookback_days": ANALYSIS_READY_LOOKBACK_DAYS,
        "base_date": end_date,
    }
