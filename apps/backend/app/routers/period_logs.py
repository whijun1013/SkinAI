from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from datetime import date
from app.database import get_db
from app.deps.auth import get_current_user
from app.models.user import User
from app.models.period import PeriodLog
from app.schemas.period import PeriodLogCreate, PeriodLogResponse, PeriodCycleResponse
from app.services.period_cycle_service import build_period_cycle_snapshot

router = APIRouter(prefix="/users/me/period-logs", tags=["생리 기록"])
cycle_router = APIRouter(prefix="/users/me/period-cycle", tags=["생리 주기"])

@router.post("", response_model=PeriodLogResponse)
def create_period_log(
    log_in: PeriodLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 중복 검사 (같은 날짜의 생리 시작일이 있으면 기존 것 반환)
    existing = db.query(PeriodLog).filter(
        PeriodLog.user_id == current_user.id,
        PeriodLog.started_at == log_in.started_at
    ).first()
    if existing:
        return existing

    new_log = PeriodLog(
        user_id=current_user.id,
        started_at=log_in.started_at
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)

    _update_avg_cycle_length(db, current_user)

    return new_log


def _update_avg_cycle_length(db: Session, user: User) -> None:
    from app.services.period_cycle_service import _list_period_starts, _valid_intervals
    from statistics import median

    starts = _list_period_starts(db, user.id)
    intervals = _valid_intervals(starts)
    if len(intervals) < 1:
        return

    new_avg = int(round(median(intervals)))
    db.query(User).filter(User.id == user.id).update({"avg_cycle_length": new_avg})
    db.commit()

@router.get("", response_model=List[PeriodLogResponse])
def get_period_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(PeriodLog).filter(
        PeriodLog.user_id == current_user.id
    ).order_by(PeriodLog.started_at.desc()).all()

@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_period_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    log = db.query(PeriodLog).filter(
        PeriodLog.id == log_id,
        PeriodLog.user_id == current_user.id
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="생리 기록을 찾을 수 없습니다.")
    db.delete(log)
    db.commit()

    _update_avg_cycle_length(db, current_user)


@cycle_router.get("", response_model=PeriodCycleResponse)
def get_period_cycle(
    query_date: date | None = Query(None, alias="date", description="주기를 계산할 기준 날짜 (YYYY-MM-DD). 기본값: 오늘"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target_date = query_date or date.today()
    return build_period_cycle_snapshot(db, current_user, target_date)
