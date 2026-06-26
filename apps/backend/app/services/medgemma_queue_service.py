import os
import re
from datetime import datetime, timezone
from typing import Any

from app.database import get_mongo_db
from app.mongo import get_skin_ai_result
from app.services.medgemma_service import build_medgemma_display_summary, build_user_facing_observations
import logging

logger = logging.getLogger(__name__)


TASK_COLLECTION = "medgemma_analysis_tasks"
PENDING_STATUSES = {"pending", "running"}


def sanitize_medgemma_error(error: Any) -> str:
    """Return a short error safe for task documents, API responses, and logs."""
    text = str(error or "").split("\n")[0][:500]
    text = re.sub(r"https?://\S+", "[url omitted]", text)
    text = re.sub(r"mongodb(?:\+srv)?://\S+", "[mongo uri omitted]", text, flags=re.IGNORECASE)
    text = re.sub(r"hf_[A-Za-z0-9_\\-]+", "[hf token omitted]", text)
    return text[:200]


def is_medgemma_queue_enabled() -> bool:
    return os.getenv("MEDGEMMA_QUEUE_ENABLED", "false").lower() in {"1", "true", "yes", "on"}


async def enqueue_medgemma_analysis_task(
    *,
    skin_log_id: int,
    user_id: int,
    image_url: str,
    source: str = "skin_log.analyze_photo",
) -> str | None:
    try:
        db = get_mongo_db()
        collection = db[TASK_COLLECTION]
        now = datetime.now(timezone.utc)
        
        # Cancel any existing pending/running tasks for this skin_log_id (e.g. photo retake)
        await collection.update_many(
            {
                "skin_log_id": skin_log_id,
                "status": {"$in": list(PENDING_STATUSES)},
            },
            {"$set": {"status": "cancelled", "updated_at": now, "error": "superseded by new request"}}
        )

        now = datetime.now(timezone.utc)
        max_attempts = int(os.getenv("MEDGEMMA_WORKER_MAX_ATTEMPTS", "3"))
        
        result = await collection.insert_one(
            {
                "skin_log_id": skin_log_id,
                "user_id": user_id,
                "image_url": image_url,
                "source": source,
                "status": "pending",
                "attempts": 0,
                "max_attempts": max_attempts,
                "created_at": now,
                "updated_at": now,
            }
        )
        return str(result.inserted_id)
    except Exception as exc:
        logger.error(f"[MongoDB] Failed to enqueue MedGemma task for skin_log_id={skin_log_id}: {exc}")
        return None


async def cancel_medgemma_tasks_for_skin_log(skin_log_id: int) -> None:
    """피부 기록 삭제 시 MongoDB 태스크 전체 삭제 (진행 중 포함)."""
    try:
        result = await get_mongo_db()[TASK_COLLECTION].delete_many(
            {"skin_log_id": skin_log_id}
        )
        logger.info("[MongoDB] deleted %d task(s) for skin_log_id=%s", result.deleted_count, skin_log_id)
    except Exception as exc:
        logger.error("[MongoDB] delete tasks failed for skin_log_id=%s: %s", skin_log_id, exc)


async def claim_next_medgemma_analysis_task(
    *,
    worker_id: str,
    max_attempts: int = 3,
) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc)
    return await get_mongo_db()[TASK_COLLECTION].find_one_and_update(
        {
            "status": "pending",
            "attempts": {"$lt": max_attempts},
        },
        {
            "$set": {
                "status": "running",
                "worker_id": worker_id,
                "started_at": now,
                "updated_at": now,
            },
            "$inc": {"attempts": 1},
        },
        sort=[("created_at", 1)],
        return_document=True,
    )


async def mark_medgemma_analysis_task_done(
    *,
    task_id: Any,
    result: dict[str, Any],
    timings: dict[str, int] | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    set_fields = {
        "status": "done",
        "result": result,
        "finished_at": now,
        "updated_at": now,
    }
    if timings:
        set_fields["timings"] = timings
    if metadata:
        set_fields["metadata"] = metadata

    await get_mongo_db()[TASK_COLLECTION].update_one(
        {"_id": task_id},
        {
            "$set": set_fields,
            "$unset": {"error": ""},
        },
    )


async def mark_medgemma_analysis_task_failed(
    *,
    task_id: Any,
    error: str,
    retry: bool = True,
    error_code: str = "UNKNOWN_ERROR",
    timings: dict[str, int] | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    short_error = sanitize_medgemma_error(error)

    if retry:
        set_fields = {
            "status": "pending",
            "last_error": short_error,
            "error_code": error_code,
            "last_failed_at": now,
            "updated_at": now,
            "message_for_user": "보조 분석 재시도 대기 중입니다.",
        }
        unset_fields = {"worker_id": "", "started_at": ""}
    else:
        set_fields = {
            "status": "failed",
            "error": short_error,
            "error_code": error_code,
            "finished_at": now,
            "updated_at": now,
            "message_for_user": "보조 관찰 분석 실패, 기본 분석 결과는 정상 사용 가능합니다.",
        }
        unset_fields = {}

    if timings:
        set_fields["timings"] = timings
    if metadata:
        set_fields["metadata"] = metadata

    update_doc: dict[str, Any] = {"$set": set_fields}
    if unset_fields:
        update_doc["$unset"] = unset_fields

    await get_mongo_db()[TASK_COLLECTION].update_one(
        {"_id": task_id},
        update_doc,
    )


async def get_medgemma_task_status(skin_log_id: int, user_id: int) -> dict[str, Any]:
    def _normalize_capture_quality(val: Any) -> dict[str, Any]:
        if isinstance(val, str):
            return {"overall_quality": val}
        if isinstance(val, dict):
            return val
        return {}

    def _iso(dt: Any) -> str | None:
        return dt.isoformat() if hasattr(dt, "isoformat") else dt

    try:
        collection = get_mongo_db()[TASK_COLLECTION]
        task = await collection.find_one(
            {"skin_log_id": skin_log_id, "user_id": user_id},
            sort=[("created_at", -1)],
        )
        if not task:
            # Fallback: check if medgemma result exists in skin_ai_results
            skin_ai = await get_skin_ai_result(skin_log_id=skin_log_id)
            if skin_ai and skin_ai.get("signals"):
                return {
                    "status": "done",
                    "skin_log_id": skin_log_id,
                    "photo_quality": skin_ai.get("photo_quality"),
                    "confidence": skin_ai.get("confidence"),
                    "display_summary": build_medgemma_display_summary(skin_ai),
                    "observations": build_user_facing_observations(skin_ai),
                }
            return {"status": "not_requested", "skin_log_id": skin_log_id}

        status = task.get("status", "pending")
        response = {
            "status": status,
            "skin_log_id": task.get("skin_log_id"),
            "requested_at": _iso(task.get("created_at")),
            "started_at": _iso(task.get("started_at")),
            "finished_at": _iso(task.get("finished_at")),
            "updated_at": _iso(task.get("updated_at")),
            "attempts": task.get("attempts"),
            "max_attempts": task.get("max_attempts"),
            "worker_id": task.get("worker_id"),
            "error": task.get("error") if status in ("failed", "cancelled") else None,
            "error_code": task.get("error_code"),
            "message_for_user": task.get("message_for_user"),
        }

        if status == "done" and "result" in task:
            result = task["result"]
            response["photo_quality"] = result.get("photo_quality")
            response["confidence"] = result.get("confidence")
            response["display_summary"] = build_medgemma_display_summary(result)
            response["observations"] = build_user_facing_observations(result)

        return {k: v for k, v in response.items() if v is not None}
    except Exception as exc:
        logger.error("[MongoDB] Failed to get MedGemma task status for skin_log_id=%s: %s", skin_log_id, exc)
        return {"status": "unknown", "skin_log_id": skin_log_id}


async def heartbeat_medgemma_task(*, task_id: Any, worker_id: str) -> bool:
    """추론 진행 중 태스크가 살아있음을 MongoDB에 알림 (updated_at 갱신).

    stale requeue가 활성 추론 태스크를 pending으로 되돌리지 않도록 방지한다.
    task_id + worker_id가 일치하는 running 태스크만 갱신하여 안전하게 동작.
    """
    try:
        now = datetime.now(timezone.utc)
        result = await get_mongo_db()[TASK_COLLECTION].update_one(
            {"_id": task_id, "status": "running", "worker_id": worker_id},
            {"$set": {"updated_at": now, "last_heartbeat_at": now}},
        )
        return result.modified_count > 0
    except Exception as exc:
        logger.warning("[heartbeat] MongoDB update failed for task %s: %s", task_id, exc)
        return False


async def requeue_stale_running_tasks(timeout_minutes: int = 60) -> int:
    try:
        from datetime import timedelta
        collection = get_mongo_db()[TASK_COLLECTION]
        now = datetime.now(timezone.utc)
        stale_threshold = now - timedelta(minutes=timeout_minutes)

        stale_tasks = await collection.find(
            {
                "status": "running",
                "updated_at": {"$lt": stale_threshold},
            }
        ).to_list(length=None)

        modified = 0
        for task in stale_tasks:
            await collection.update_one(
                {"_id": task["_id"]},
                {
                    "$set": {
                        "status": "pending",
                        "updated_at": now,
                        "stale_requeued_at": now,
                        "previous_worker_id": task.get("worker_id"),
                    },
                    "$unset": {"worker_id": ""},
                }
            )
            modified += 1
            
        return modified
    except Exception as exc:
        logger.error(f"[MongoDB] Failed to requeue stale MedGemma tasks: {exc}")
        return 0
