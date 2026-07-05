from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from app.database import get_db
from app.deps.auth import get_current_user
from app.models.user import User
from app.models.environment import EnvironmentLog
from app.schemas.environment_logs import EnvironmentLogCreate, EnvironmentLogResponse
from app.services.environment_service import create_environment_log_from_capture

router = APIRouter(
    prefix="/users/me/environment-logs",
    tags=["Environment Logs"]
)

@router.post("", response_model=EnvironmentLogResponse)
def create_environment_log(
    env_data: EnvironmentLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    valid_sources = {"app_camera", "exif", "manual", "retroactive"}
    if env_data.source not in valid_sources:
        raise HTTPException(status_code=400, detail=f"source must be one of {valid_sources}")
        
    env_log = create_environment_log_from_capture(
        db=db,
        user_id=current_user.id,
        source=env_data.source,
        captured_at=env_data.captured_at,
        lat=env_data.lat,
        lng=env_data.lng,
        location_name=env_data.location_name
    )
    db.commit()
    db.refresh(env_log)
    return env_log

@router.get("", response_model=List[EnvironmentLogResponse])
def get_environment_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
    target_date: Optional[date] = Query(None, alias="date", description="특정 날짜 필터 (YYYY-MM-DD)"),
):
    query = db.query(EnvironmentLog).filter(EnvironmentLog.user_id == current_user.id)
    if target_date:
        query = query.filter(EnvironmentLog.logged_at == target_date)
    logs = query.order_by(EnvironmentLog.logged_at.desc()).offset(skip).limit(limit).all()
    return logs
