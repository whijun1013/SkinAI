import logging
import os
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.skin_log import SkinLog
from app.models.user import User
from app.schemas.skin_log import (
    MedGemmaTaskStatusResponse,
    SkinLogResponse,
    SkinPhotoAnalyzeResponse,
)
from app.services.blob_storage import sign_blob_read_url
from app.services.medgemma_queue_service import (
    cancel_medgemma_tasks_for_skin_log,
    enqueue_medgemma_analysis_task,
    get_medgemma_task_status,
    is_medgemma_queue_enabled,
)


MEDGEMMA_QUEUE_SIGNED_URL_EXPIRY_HOURS = int(os.getenv("MEDGEMMA_QUEUE_SIGNED_URL_EXPIRY_HOURS", "72"))
logger = logging.getLogger("skin_log")

router = APIRouter(prefix="/skin", tags=["skin"])


async def should_skip_medgemma_for_quality(existing: SkinLog) -> bool:
    """Return True when a lightweight quality check says MedGemma should be skipped."""
    if existing.quality_check_passed is False:
        logger.info("[medgemma-quality] skip medgemma: %s", existing.quality_warning)
        return True

    if existing.quality_check_passed is None:
        fail_closed = os.getenv("IMAGE_QUALITY_FAIL_CLOSED", "true").lower() in {
            "1", "true", "yes", "on"
        }
        if fail_closed:
            logger.info("[medgemma-quality] skip medgemma (fail_closed on unknown): %s", existing.quality_warning)
            return True

    if existing.quality_warning:
        logger.info("[medgemma-quality] warning: %s", existing.quality_warning)
    return False


# ── 사진 분석 ────────────────────────────────────────────────────────────────

@router.post("/logs/analyze-photo", response_model=SkinPhotoAnalyzeResponse)
async def analyze_photo(
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

    should_skip_medgemma = await should_skip_medgemma_for_quality(existing)

    if should_skip_medgemma:
        return SkinPhotoAnalyzeResponse(photo_url=existing.photo_url, queued=False, skip_reason="quality_skip")

    if not is_medgemma_queue_enabled():
        return SkinPhotoAnalyzeResponse(photo_url=existing.photo_url, queued=False, skip_reason="queue_disabled")

    medgemma_image_url = sign_blob_read_url(
        existing.photo_url,
        expiry_hours=MEDGEMMA_QUEUE_SIGNED_URL_EXPIRY_HOURS,
    )
    if not medgemma_image_url:
        logger.warning("[medgemma] sign_blob_read_url failed for skin_log_id=%s", existing.id)
        return SkinPhotoAnalyzeResponse(photo_url=existing.photo_url, queued=False, skip_reason="url_sign_failed")

    task_id = await enqueue_medgemma_analysis_task(
        skin_log_id=existing.id,
        user_id=current_user.id,
        image_url=medgemma_image_url,
    )
    if task_id is None:
        logger.warning("[medgemma] enqueue failed for skin_log_id=%s", existing.id)
        return SkinPhotoAnalyzeResponse(photo_url=existing.photo_url, queued=False, skip_reason="enqueue_failed")
    return SkinPhotoAnalyzeResponse(photo_url=existing.photo_url, queued=True)


@router.post("/logs/{log_id}/analyze-photo", response_model=SkinPhotoAnalyzeResponse)
async def analyze_photo_by_log_id(
    log_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """특정 피부 기록(log_id)에 대해 MedGemma 분석을 큐에 등록합니다.
    날짜/점수 저장 여부와 무관하게 동작합니다 (과거 기록 지원)."""
    existing = db.query(SkinLog).filter(
        SkinLog.id == log_id,
        SkinLog.user_id == current_user.id,
    ).first()
    if not existing:
        raise HTTPException(status_code=404, detail="피부 기록을 찾을 수 없습니다.")
    if not existing.photo_url:
        raise HTTPException(status_code=404, detail="분석할 사진이 없습니다.")

    # 이미 진행 중이거나 완료된 태스크가 있으면 재등록하지 않음
    try:
        current_task = await get_medgemma_task_status(skin_log_id=log_id, user_id=current_user.id)
        current_status = current_task.get("status") if current_task else None
        if current_status not in (None, "not_requested", "none", "failed", "cancelled"):
            return SkinPhotoAnalyzeResponse(
                photo_url=existing.photo_url, queued=False, skip_reason="already_queued"
            )
    except Exception:
        pass

    should_skip_quality = await should_skip_medgemma_for_quality(existing)
    if should_skip_quality:
        return SkinPhotoAnalyzeResponse(photo_url=existing.photo_url, queued=False, skip_reason="quality_skip")

    if not is_medgemma_queue_enabled():
        return SkinPhotoAnalyzeResponse(photo_url=existing.photo_url, queued=False, skip_reason="queue_disabled")

    medgemma_image_url = sign_blob_read_url(
        existing.photo_url,
        expiry_hours=MEDGEMMA_QUEUE_SIGNED_URL_EXPIRY_HOURS,
    )
    if not medgemma_image_url:
        logger.warning("[medgemma] sign_blob_read_url failed for skin_log_id=%s", existing.id)
        return SkinPhotoAnalyzeResponse(photo_url=existing.photo_url, queued=False, skip_reason="url_sign_failed")

    task_id = await enqueue_medgemma_analysis_task(
        skin_log_id=existing.id,
        user_id=current_user.id,
        image_url=medgemma_image_url,
    )
    if task_id is None:
        logger.warning("[medgemma] enqueue failed for skin_log_id=%s", existing.id)
        return SkinPhotoAnalyzeResponse(photo_url=existing.photo_url, queued=False, skip_reason="enqueue_failed")

    logger.info("[medgemma] queued for skin_log_id=%s (past record)", existing.id)
    return SkinPhotoAnalyzeResponse(photo_url=existing.photo_url, queued=True)


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


# ── MedGemma 큐 상태 조회 ───────────────────────────────────────────────────

@router.get("/logs/{log_id}/medgemma-status", response_model=MedGemmaTaskStatusResponse)
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

    try:
        result = await get_medgemma_task_status(skin_log_id=log_id, user_id=current_user.id)
        logger.info("[medgemma-status] log_id=%s status=%s", log_id, result.get("status"))
        return result
    except Exception as exc:
        logger.exception("[medgemma-status] 예외 발생 log_id=%s: %s", log_id, exc)
        raise HTTPException(status_code=500, detail=f"MedGemma 상태 조회 오류: {exc}") from exc


# ── 피부 기록 삭제 ────────────────────────────────────────────────────────────

@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skin_log(
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

    photo_urls = [log.photo_url, log.masked_photo_url, log.left_photo_url, log.right_photo_url]
    photo_urls = [u for u in photo_urls if u]

    db.delete(log)
    db.commit()
    await cancel_medgemma_tasks_for_skin_log(log_id)

    try:
        from app.database import get_mongo_db
        mongo_db = get_mongo_db()
        await mongo_db.skin_ai_results.delete_many({"skin_log_id": log_id})
    except Exception as exc:
        logger.warning(f"[skin-delete] failed to delete mongo ai results for log_id={log_id}: {exc}")

    try:
        if photo_urls:
            from app.services.blob_storage import delete_blobs
            delete_blobs(photo_urls)
    except Exception as exc:
        logger.warning(f"[skin-delete] failed to delete blobs for log_id={log_id}: {exc}")
