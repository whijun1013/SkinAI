from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List
from datetime import date
import os
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.user import User
from app.schemas.user import AdminUserListItem
from app.deps.auth import get_current_admin_user

from app.services.admin_dummy_scenario_service import SCENARIOS, seed_scenarios, _reset_dummy_users
from app.services.admin_audit_service import log_admin_action
from app.models.admin_audit_log import AdminAuditLog
from app.schemas.admin import UserStatusUpdate, AdminAuditLogResponse, DashboardStatsResponse, AnalysisHistoryResponse
from app.models.skin_log import SkinLog
from app.models.diet import DietLog
from app.models.behavior import DailyBehaviorLog
from app.models.analysis import AnalysisRequest
from app.auth.security import get_password_hash
import secrets

router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
    dependencies=[Depends(get_current_admin_user)]
)

class DummyGenerateRequest(BaseModel):
    scenarios: List[str] = Field(..., min_length=1)
    repetitions: int = Field(1, ge=1, le=10)
    apply: bool = False

@router.get("/users", response_model=List[AdminUserListItem])
def get_users(skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db)):
    """관리자 권한으로 전체 유저 목록 조회"""
    users = db.query(User).offset(skip).limit(limit).all()
    return users

@router.get("/users/{user_id}")
def get_user_detail(user_id: int, db: Session = Depends(get_db)):
    """특정 유저 상세 정보 조회"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.get("/users/{user_id}/records")
def get_user_records(user_id: int, db: Session = Depends(get_db)):
    """특정 유저의 기록 요약 조회"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    skin_logs = db.query(SkinLog).filter(SkinLog.user_id == user_id).order_by(SkinLog.logged_at.desc()).limit(10).all()
    diet_logs = db.query(DietLog).filter(DietLog.user_id == user_id).order_by(DietLog.logged_at.desc()).limit(10).all()
    behavior_logs = db.query(DailyBehaviorLog).filter(DailyBehaviorLog.user_id == user_id).order_by(DailyBehaviorLog.logged_at.desc()).limit(10).all()
    
    return {
        "skin_logs": skin_logs,
        "diet_logs": diet_logs,
        "behavior_logs": behavior_logs
    }

@router.patch("/users/{user_id}/status")
def update_user_status(user_id: int, payload: UserStatusUpdate, db: Session = Depends(get_db), current_admin: User = Depends(get_current_admin_user)):
    """유저 계정 상태 변경"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    old_status = user.status
    if payload.status not in ["active", "suspended", "banned", "deleted"]:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    user.status = payload.status
    
    # Audit log
    log_admin_action(db, current_admin.id, "UPDATE_USER_STATUS", "User", str(user_id), {"status": old_status}, {"status": payload.status})
    db.commit()
    return {"message": "Status updated successfully", "status": user.status}

@router.post("/users/{user_id}/force-logout")
def force_logout_user(user_id: int, db: Session = Depends(get_db), current_admin: User = Depends(get_current_admin_user)):
    """해당 유저의 모든 기존 토큰(세션) 무효화"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    old_version = user.session_version
    user.session_version += 1
    
    log_admin_action(db, current_admin.id, "FORCE_LOGOUT", "User", str(user_id), {"session_version": old_version}, {"session_version": user.session_version})
    db.commit()
    return {"message": "User sessions invalidated"}

@router.post("/users/{user_id}/password-reset")
def admin_reset_password(user_id: int, db: Session = Depends(get_db), current_admin: User = Depends(get_current_admin_user)):
    """임시 비밀번호 생성 후 반환"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    temp_password = secrets.token_urlsafe(12)
    user.hashed_password = get_password_hash(temp_password)
    user.session_version += 1 # 무효화
    
    log_admin_action(db, current_admin.id, "ADMIN_PASSWORD_RESET", "User", str(user_id), None, {"session_version": user.session_version})
    db.commit()
    return {"message": "임시 비밀번호가 생성되었습니다.", "temp_password": temp_password}

@router.get("/dummy-scenarios")
def get_dummy_scenarios():
    """생성 가능한 더미 시나리오 목록 반환"""
    return {
        "scenarios": [
            {
                "name": name,
                "id": data["id"],
                "gender": data["gender"],
                "type": data["type"]
            }
            for name, data in SCENARIOS.items()
        ]
    }

def check_dummy_tools_enabled():
    if os.getenv("ENABLE_ADMIN_DUMMY_TOOLS", "false").lower() != "true":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="더미데이터 관리 기능이 비활성화되어 있습니다. ENABLE_ADMIN_DUMMY_TOOLS 환경변수를 확인하세요."
        )

@router.post("/dummy-scenarios/generate")
def generate_dummy_scenarios(req: DummyGenerateRequest, db: Session = Depends(get_db)):
    """더미 데이터 생성 (기본 dry-run, apply=True일 때 실제 적용)"""
    check_dummy_tools_enabled()

    # 시나리오 이름 검증
    invalid_scenarios = [s for s in req.scenarios if s not in SCENARIOS]
    if invalid_scenarios:
        raise HTTPException(
            status_code=400,
            detail=f"유효하지 않은 시나리오: {invalid_scenarios}"
        )

    try:
        created = seed_scenarios(
            db,
            scenario_names=req.scenarios,
            repetitions=req.repetitions,
            end_date=date.today(),
            dry_run=not req.apply
        )
        return {
            "success": True,
            "mode": "apply" if req.apply else "dry-run",
            "actual_applied": req.apply,
            "count": len(created),
            "created": created
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"더미데이터 생성 중 오류: {str(e)}")

@router.post("/dummy-scenarios/reset")
def reset_dummy_users(db: Session = Depends(get_db), current_admin: User = Depends(get_current_admin_user)):
    """생성된 더미 유저 모두 삭제"""
    check_dummy_tools_enabled()
    try:
        count = _reset_dummy_users(db)
        log_admin_action(db, current_admin.id, "RESET_DUMMY", "Dummy", None, None, {"deleted_count": count})
        db.commit()
        return {"success": True, "deleted_count": count}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"더미데이터 초기화 중 오류: {str(e)}")

@router.get("/audit-logs", response_model=List[AdminAuditLogResponse])
def get_audit_logs(skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db)):
    """감사 로그 조회"""
    logs = db.query(AdminAuditLog).order_by(AdminAuditLog.id.desc()).offset(skip).limit(limit).all()
    return logs

@router.get("/dashboard", response_model=DashboardStatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """대시보드 주요 통계"""
    from datetime import date
    today = date.today()
    
    total_users = db.query(User).count()
    new_users_today = db.query(User).filter(User.created_at >= str(today)).count()
    active_users_today = 0 # DAU (액션 로그 기반이 아니면 측정 어려움, 임시 0)
    
    skin_logs_count = db.query(SkinLog).count()
    diet_logs_count = db.query(DietLog).count()
    behavior_logs_count = db.query(DailyBehaviorLog).count()
    
    ai_requests_count = db.query(AnalysisRequest).count()
    ai_failures_count = db.query(AnalysisRequest).filter(AnalysisRequest.status == "failed").count()
    
    return {
        "total_users": total_users,
        "new_users_today": new_users_today,
        "active_users_today": active_users_today,
        "skin_logs_count": skin_logs_count,
        "diet_logs_count": diet_logs_count,
        "behavior_logs_count": behavior_logs_count,
        "ai_requests_count": ai_requests_count,
        "ai_failures_count": ai_failures_count
    }

@router.get("/analysis-history", response_model=List[AnalysisHistoryResponse])
def get_analysis_history(skip: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db)):
    """AI 분석 기록 조회"""
    records = db.query(AnalysisRequest).order_by(AnalysisRequest.requested_at.desc()).offset(skip).limit(limit).all()
    return records
