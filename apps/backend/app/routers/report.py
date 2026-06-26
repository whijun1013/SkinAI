from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.user import User
from app.schemas.report import DailyFeatureSummaryResponse
from app.services.report_summary import build_daily_feature_summary


router = APIRouter(prefix="/users/me/report", tags=["report"])


@router.get("/daily-feature-summary", response_model=DailyFeatureSummaryResponse)
def get_daily_feature_summary(
    target_date: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return build_daily_feature_summary(db, current_user.id, target_date)
