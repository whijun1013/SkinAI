from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from typing import List

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.user import User
from app.schemas.report import DailyFeatureSummaryResponse, WeeklyDietNutrientSummaryResponse
from app.services.report_summary import build_daily_feature_summary, build_weekly_diet_nutrient_summary, build_timeline_summary


router = APIRouter(prefix="/users/me/report", tags=["report"])


@router.get("/daily-feature-summary", response_model=DailyFeatureSummaryResponse)
def get_daily_feature_summary(
    target_date: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return build_daily_feature_summary(db, current_user.id, target_date)

@router.get("/weekly-nutrient-summary", response_model=WeeklyDietNutrientSummaryResponse)
def get_weekly_nutrient_summary(
    target_date: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    주간 누적 영양소 통계 (target_date 기준 과거 7일)
    """
    return build_weekly_diet_nutrient_summary(db, current_user.id, target_date)

@router.get("/timeline", response_model=List[DailyFeatureSummaryResponse])
def get_timeline_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    지정 기간 통합 타임라인
    """
    return build_timeline_summary(db, current_user.id, start_date, end_date)
