from calendar import monthrange
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.behavior import DailyBehaviorLog
from app.models.diet import DietLog
from app.models.skin_log import SkinLog
from app.models.user import User
from app.schemas.record_status import MonthRecordStatusResponse, RecordStatus

router = APIRouter(prefix="/users/me/records", tags=["기록 현황"])


@router.get("/month-status", response_model=MonthRecordStatusResponse)
def get_month_record_status(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """해당 월의 날짜별 기록 상태 (피부·생활·식단 기준).

    - complete: 3개 모두 기록
    - partial: 1~2개만 기록
    - none: 기록 없음
    """
    last_day = monthrange(year, month)[1]
    month_start = date(year, month, 1)
    month_end = date(year, month, last_day)

    skin_rows = (
        db.query(SkinLog.logged_at)
        .filter(
            SkinLog.user_id == current_user.id,
            SkinLog.logged_at >= month_start,
            SkinLog.logged_at <= month_end,
            SkinLog.overall_score.isnot(None),
        )
        .all()
    )
    skin_dates = {row[0] for row in skin_rows}

    behavior_rows = (
        db.query(DailyBehaviorLog.logged_at)
        .filter(
            DailyBehaviorLog.user_id == current_user.id,
            DailyBehaviorLog.logged_at >= month_start,
            DailyBehaviorLog.logged_at <= month_end,
        )
        .all()
    )
    behavior_dates = {row[0] for row in behavior_rows}

    diet_start = datetime.combine(month_start, datetime.min.time())
    diet_end = datetime.combine(month_end, datetime.max.time())
    diet_rows = (
        db.query(DietLog.logged_at)
        .filter(
            DietLog.user_id == current_user.id,
            DietLog.logged_at >= diet_start,
            DietLog.logged_at <= diet_end,
        )
        .all()
    )
    diet_dates = {row[0].date() for row in diet_rows}

    dates: dict[str, RecordStatus] = {}
    for day in range(1, last_day + 1):
        current = date(year, month, day)
        count = sum(
            [
                current in skin_dates,
                current in behavior_dates,
                current in diet_dates,
            ]
        )
        if count == 3:
            status: RecordStatus = "complete"
        elif count > 0:
            status = "partial"
        else:
            status = "none"

        dates[current.isoformat()] = status

    return MonthRecordStatusResponse(year=year, month=month, dates=dates)
