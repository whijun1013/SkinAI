from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date, timedelta
from app.database import get_db
from app.models.user import User
from app.models.behavior import DailyBehaviorLog
from app.schemas.behavior import DailyBehaviorLogCreate, DailyBehaviorLogUpdate, DailyBehaviorLogResponse
from app.deps.auth import get_current_user

router = APIRouter(prefix="/users/me/behavior", tags=["행동 기록"])


@router.get("/today", response_model=Optional[DailyBehaviorLogResponse])
def get_today_behavior(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    today = date.today()
    log = db.query(DailyBehaviorLog).filter(
        DailyBehaviorLog.user_id == current_user.id,
        DailyBehaviorLog.logged_at == today
    ).first()

    if log:
        result = DailyBehaviorLogResponse.model_validate(log)
        result.is_today = True
        return result

    yesterday = today - timedelta(days=1)
    log = db.query(DailyBehaviorLog).filter(
        DailyBehaviorLog.user_id == current_user.id,
        DailyBehaviorLog.logged_at == yesterday
    ).first()

    if log:
        result = DailyBehaviorLogResponse.model_validate(log)
        result.is_today = False
        return result

    return None


@router.get("/by-date", response_model=Optional[DailyBehaviorLogResponse])
def get_behavior_by_date(
    target_date: date = Query(..., alias="date", description="조회할 날짜 (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    log = db.query(DailyBehaviorLog).filter(
        DailyBehaviorLog.user_id == current_user.id,
        DailyBehaviorLog.logged_at == target_date
    ).first()

    if not log:
        return None

    result = DailyBehaviorLogResponse.model_validate(log)
    result.is_today = (target_date == date.today())
    return result


@router.post("", response_model=DailyBehaviorLogResponse)
def create_behavior_log(
    log_in: DailyBehaviorLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if db.query(DailyBehaviorLog).filter(
        DailyBehaviorLog.user_id == current_user.id,
        DailyBehaviorLog.logged_at == log_in.logged_at
    ).first():
        raise HTTPException(status_code=400, detail="해당 날짜의 기록이 이미 존재합니다. PUT으로 수정하세요.")

    new_log = DailyBehaviorLog(user_id=current_user.id, **log_in.model_dump())
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    return new_log


@router.put("/{log_id}", response_model=DailyBehaviorLogResponse)
def update_behavior_log(
    log_id: int,
    log_in: DailyBehaviorLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    log = db.query(DailyBehaviorLog).filter(
        DailyBehaviorLog.id == log_id,
        DailyBehaviorLog.user_id == current_user.id
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다.")

    data = log_in.model_dump(exclude_unset=True)

    if data.get("exercise_yn") is False:
        data.setdefault("exercise_duration_min", None)
        data.setdefault("exercise_type", None)

    for field, value in data.items():
        setattr(log, field, value)

    db.commit()
    db.refresh(log)
    return log
