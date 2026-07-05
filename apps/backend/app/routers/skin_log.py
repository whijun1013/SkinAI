import logging
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.skin_log import SkinLog
from app.models.user import User
from app.schemas.skin_log import (
    SkinLogResponse,
    SkinPhotoAnalyzeResponse,
    SkinAnalysisStatusResponse,
    MedGemmaTaskStatusResponse,  # backward-compat alias
)
from app.services.blob_storage import read_blob_bytes
from app.services.medgemma_queue_service import get_medgemma_task_status as get_skin_analysis_status


logger = logging.getLogger("skin_log")

router = APIRouter(prefix="/skin", tags=["skin"])


async def should_skip_analysis_for_quality(existing: SkinLog) -> bool:
    """Return True when a lightweight quality check says skin analysis should be skipped."""
    if existing.quality_check_passed is False:
        logger.info("[skin-analysis] skip: %s", existing.quality_warning)
        return True
    if existing.quality_warning:
        logger.info("[skin-analysis] warning: %s", existing.quality_warning)
    return False


# ── 사진 분석 ────────────────────────────────────────────────────────────────

@router.post("/logs/analyze-photo", response_model=SkinPhotoAnalyzeResponse)
async def analyze_photo(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(SkinLog).filter(
        SkinLog.user_id == current_user.id,
        SkinLog.logged_at == date.today(),
    ).first()
    if not existing:
        raise HTTPException(status_code=404, detail="오늘 등록된 피부 사진이 없습니다.")
    if not existing.photo_url:
        raise HTTPException(status_code=404, detail="분석할 사진이 없습니다.")
    if existing.overall_score is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="확정된 피부 기록은 다시 분석할 수 없습니다.",
        )

    should_skip = await should_skip_analysis_for_quality(existing)

    if not should_skip:
        image_bytes = read_blob_bytes(existing.photo_url)
        if image_bytes:
            import asyncio
            from app.services.medgemma_service import analyze_skin_photo
            from app.mongo import update_skin_analysis_result

            result = await asyncio.to_thread(analyze_skin_photo, image_bytes)
            await update_skin_analysis_result(
                skin_log_id=existing.id,
                user_id=current_user.id,
                analysis=result,
            )

    return SkinPhotoAnalyzeResponse(photo_url=existing.photo_url)


# ── 피부 기록 단건 조회 ───────────────────────────────────────────────────────

@router.get("/logs/{log_id}", response_model=SkinLogResponse)
def get_skin_log(
    log_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.query(SkinLog).filter(
        SkinLog.id == log_id,
        SkinLog.user_id == current_user.id,
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="피부 기록을 찾을 수 없습니다.")
    return log


# ── 피부 분석 상태 조회 ──────────────────────────────────────────────────────

@router.get("/logs/{log_id}/analysis-status", response_model=SkinAnalysisStatusResponse)
async def get_skin_log_analysis_status(
    log_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.query(SkinLog).filter(
        SkinLog.id == log_id,
        SkinLog.user_id == current_user.id,
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="피부 기록을 찾을 수 없습니다.")

    return await get_skin_analysis_status(skin_log_id=log_id, user_id=current_user.id)


# Deprecated alias — keep for mobile backward compatibility
@router.get("/logs/{log_id}/medgemma-status", response_model=SkinAnalysisStatusResponse, deprecated=True)
async def get_skin_log_medgemma_status(
    log_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.query(SkinLog).filter(
        SkinLog.id == log_id,
        SkinLog.user_id == current_user.id,
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="피부 기록을 찾을 수 없습니다.")

    return await get_skin_analysis_status(skin_log_id=log_id, user_id=current_user.id)


# ── 피부 기록 삭제 ────────────────────────────────────────────────────────────

@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_skin_log(
    log_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.query(SkinLog).filter(
        SkinLog.id == log_id,
        SkinLog.user_id == current_user.id,
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="피부 기록을 찾을 수 없습니다.")
    from app.services.blob_storage import delete_blobs
    blob_urls = [log.photo_url, log.masked_photo_url, log.left_photo_url, log.right_photo_url]
    db.delete(log)
    db.commit()
    delete_blobs([u for u in blob_urls if u])
