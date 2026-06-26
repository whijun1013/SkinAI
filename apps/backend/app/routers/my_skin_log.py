import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from app.database import get_db

logger = logging.getLogger("skin_log")
from app.models.user import User
from app.models.skin_log import SkinLog
from app.schemas.skin_log import SkinLogCreate, SkinLogUpdate, SkinLogResponse
from app.deps.auth import get_current_user
from app.services.blob_storage import normalize_blob_storage_url, sign_blob_read_url
from app.services.analysis_readiness import check_analysis_ready_skin_logs
from app.services.notification_sender import send_notification_event
from app.services.medgemma_queue_service import get_medgemma_task_status

router = APIRouter(prefix="/users/me/skin-log", tags=["피부 기록"])


def _to_skin_log_response(log: SkinLog) -> SkinLogResponse:
    response = SkinLogResponse.model_validate(log)
    response.photo_url = sign_blob_read_url(response.photo_url)
    return response


async def _attach_medgemma_status(response: SkinLogResponse, user_id: int) -> SkinLogResponse:
    """사진이 있는 기록에 한해 MongoDB 상태를 인라인으로 첨부."""
    if not response.photo_url:
        return response
    try:
        status = await get_medgemma_task_status(skin_log_id=response.id, user_id=user_id)
        if status and status.get("status") not in (None, "none", "not_requested"):
            response.medgemma_status = status
    except Exception:
        pass
    return response


def _send_analysis_ready_notification_if_ready(
    db: Session,
    *,
    user_id: int,
    base_date: date,
) -> None:
    try:
        readiness = check_analysis_ready_skin_logs(db, user_id, base_date)
        if not readiness["is_ready"]:
            return

        base_date_value = base_date.isoformat()
        send_notification_event(
            db,
            user_id=user_id,
            notification_type="analysis_ready",
            dedupe_key=f"analysis_ready:{user_id}:{base_date_value}",
            title="참고 인사이트를 만들 수 있어요",
            body="최근 기록이 충분히 쌓였어요. 내 피부 흐름을 확인해보세요.",
            target_type="skin_log",
            target_id=None,
            data={
                "type": "analysis_ready",
                "screen": "report",
                "base_date": base_date_value,
            },
        )
    except Exception:
        db.rollback()
        logger.warning(
            "analysis ready notification failed",
            extra={"user_id": user_id, "base_date": base_date.isoformat()},
        )


@router.get("/today", response_model=Optional[SkinLogResponse])
async def get_today_skin_log(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    log = db.query(SkinLog).filter(
        SkinLog.user_id == current_user.id,
        SkinLog.logged_at == date.today()
    ).first()
    if not log:
        return None
    return await _attach_medgemma_status(_to_skin_log_response(log), current_user.id)


@router.get("", response_model=List[SkinLogResponse])
async def get_skin_logs(
    limit: int = 30,
    target_date: Optional[date] = Query(None, alias="date", description="특정 날짜 필터 (YYYY-MM-DD)"),
    from_date: Optional[date] = Query(None, description="이 날짜 이후 로그만 반환 (YYYY-MM-DD, 포함). limit과 함께 사용 가능."),
    include_medgemma: bool = Query(True, description="MedGemma 큐 상태 포함 여부. Report 탭 등 상태 불필요 시 false로 요청하면 MongoDB 조회를 생략해 응답이 빠릅니다."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(SkinLog).filter(SkinLog.user_id == current_user.id)
    if target_date:
        query = query.filter(SkinLog.logged_at == target_date)
    if from_date:
        query = query.filter(SkinLog.logged_at >= from_date)
    logs = query.order_by(SkinLog.logged_at.desc()).limit(limit).all()
    base_responses = [_to_skin_log_response(log) for log in logs]
    if not include_medgemma:
        return base_responses
    import asyncio
    enriched = await asyncio.gather(*[
        _attach_medgemma_status(resp, current_user.id) for resp in base_responses
    ])
    return list(enriched)


@router.post("", response_model=SkinLogResponse)
def create_skin_log(
    log_in: SkinLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing = db.query(SkinLog).filter(
        SkinLog.user_id == current_user.id,
        SkinLog.logged_at == log_in.logged_at
    ).first()

    if existing:
        # 같은 날짜 row가 이미 있으면 upsert: 전달된 필드만 덮어씀
        logger.info(
            "[skin-save] upsert existing id=%s user_id=%s logged_at=%s",
            existing.id, current_user.id, log_in.logged_at,
        )
        update_values = log_in.model_dump(exclude_none=True)
        update_values.pop("logged_at", None)
        for field, value in update_values.items():
            if field == "photo_url" and value:
                value = normalize_blob_storage_url(value)
            setattr(existing, field, value)
        try:
            db.commit()
            db.refresh(existing)
        except SQLAlchemyError as exc:
            db.rollback()
            logger.exception("[skin-save] upsert db error id=%s: %s", existing.id, exc)
            raise HTTPException(status_code=500, detail="피부 기록 저장 중 데이터베이스 오류가 발생했습니다.") from exc
        _send_analysis_ready_notification_if_ready(db, user_id=current_user.id, base_date=existing.logged_at)
        return _to_skin_log_response(existing)

    logger.info(
        "[skin-save] user_id=%s logged_at=%s score=%s photo=%s",
        current_user.id,
        log_in.logged_at,
        log_in.overall_score,
        "yes" if log_in.photo_url else "no",
    )
    photo_url = (
        normalize_blob_storage_url(log_in.photo_url) if log_in.photo_url else None
    )
    new_log = SkinLog(
        user_id=current_user.id,
        logged_at=log_in.logged_at,
        overall_score=log_in.overall_score,
        condition_tags=log_in.condition_tags,
        photo_url=photo_url,
        note=log_in.note,
        quality_check_passed=log_in.quality_check_passed,
        quality_warning=log_in.quality_warning,
    )
    try:
        db.add(new_log)
        db.commit()
        db.refresh(new_log)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("[skin-save] db error user_id=%s: %s", current_user.id, exc)
        raise HTTPException(
            status_code=500,
            detail="피부 기록 저장 중 데이터베이스 오류가 발생했습니다.",
        ) from exc

    logger.info("[skin-save] ok id=%s photo_url=%s", new_log.id, (new_log.photo_url or "")[:80])
    _send_analysis_ready_notification_if_ready(
        db,
        user_id=current_user.id,
        base_date=new_log.logged_at,
    )
    return _to_skin_log_response(new_log)


@router.put("/{log_id}", response_model=SkinLogResponse)
def update_skin_log(
    log_id: int,
    log_in: SkinLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    log = db.query(SkinLog).filter(
        SkinLog.id == log_id,
        SkinLog.user_id == current_user.id
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="피부 기록을 찾을 수 없습니다.")

    update_values = log_in.model_dump(exclude_none=True)

    for field, value in update_values.items():
        if field == "photo_url" and value:
            value = normalize_blob_storage_url(value)
        setattr(log, field, value)

    try:
        db.commit()
        db.refresh(log)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("[skin-save] update db error id=%s: %s", log_id, exc)
        raise HTTPException(
            status_code=500,
            detail="피부 기록 수정 중 데이터베이스 오류가 발생했습니다.",
        ) from exc

    logger.info("[skin-save] updated id=%s score=%s", log.id, log.overall_score)
    _send_analysis_ready_notification_if_ready(
        db,
        user_id=current_user.id,
        base_date=log.logged_at,
    )
    return _to_skin_log_response(log)
