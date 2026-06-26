"""
MongoDB 컬렉션 저장 유틸리티

컬렉션 구조:
  analysis_contexts  — 분석 컨텍스트 스냅샷 + GPT 원본 응답
  skin_ai_results    — 피부 AI 분석 상세 결과
"""

import logging
from datetime import datetime, timezone
from typing import Any

from app.database import get_mongo_db
from app.services.medgemma_service import build_medgemma_handoff_payload

logger = logging.getLogger(__name__)


# ── 분석 컨텍스트 (피부 원인 분석) ───────────────────────────────────────────

async def save_analysis_context(
    *,
    analysis_request_id: int,
    user_id: int,
    context: dict,
    raw_gpt_response: str | None = None,
    llm_result: dict | None = None,
    token_usage: dict | None = None,
) -> str:
    """
    피부 원인 분석 컨텍스트와 GPT 원본 응답을 MongoDB에 저장.

    Returns:
        삽입된 도큐먼트의 _id (str)
    """
    db = get_mongo_db()
    doc = {
        "analysis_request_id": analysis_request_id,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
        "context_sent_to_gpt": context,
        "raw_gpt_response": raw_gpt_response,
        "llm_result": llm_result,
        "token_usage": token_usage,
    }
    result = await db["analysis_contexts"].insert_one(doc)
    return str(result.inserted_id)


async def get_analysis_context(analysis_request_id: int) -> dict | None:
    """analysis_request_id로 저장된 컨텍스트 조회"""
    db = get_mongo_db()
    doc = await db["analysis_contexts"].find_one(
        {"analysis_request_id": analysis_request_id},
        {"_id": 0},
    )
    return doc


# ── 피부 AI 분석 상세 ─────────────────────────────────────────────────────────

def _legacy_int_to_ordinal(score: Any) -> Any:
    if isinstance(score, bool) or not isinstance(score, int) or not 0 <= score <= 10:
        return score
    if score == 0:
        return "none"
    if score <= 3:
        return "mild"
    if score <= 6:
        return "moderate"
    return "severe"


def _migrate_legacy_signals(doc: dict | None) -> dict | None:
    if not doc:
        return doc
    signals = doc.get("signals")
    if not isinstance(signals, dict) or not signals:
        return doc
    migrated = dict(doc)
    migrated_signals = dict(signals)
    for key in ["active_lesion", "redness", "barrier"]:
        if key in migrated_signals:
            migrated_signals[key] = _legacy_int_to_ordinal(migrated_signals[key])
    migrated["signals"] = migrated_signals
    return migrated


async def get_skin_ai_result(skin_log_id: int) -> dict | None:
    """skin_log_id로 저장된 AI 분석 결과 조회"""
    db = get_mongo_db()
    cursor = (
        db["skin_ai_results"]
        .find({"skin_log_id": skin_log_id}, {"_id": 0})
        .sort("created_at", -1)
        .limit(1)
    )
    docs = await cursor.to_list(length=1)
    return _migrate_legacy_signals(docs[0]) if docs else None


async def get_multiple_skin_ai_results(skin_log_ids: list[int]) -> dict[int, dict]:
    """여러 skin_log_id에 대한 AI 분석 결과를 조회 (최신순 정렬)"""
    db = get_mongo_db()
    cursor = db["skin_ai_results"].find({"skin_log_id": {"$in": skin_log_ids}}, {"_id": 0})
    docs = await cursor.to_list(length=None)
    
    results = {}
    # created_at 기준 내림차순 정렬 후 딕셔너리에 넣으면 각 ID별 최신 문서가 유지됨
    for doc in sorted(docs, key=lambda x: x.get("created_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True):
        sid = doc["skin_log_id"]
        if sid not in results:
            results[sid] = _migrate_legacy_signals(doc)
    return results


async def update_skin_ai_result_medgemma(
    *,
    skin_log_id: int,
    user_id: int,
    medgemma: dict,
    date: str | None = None,
    model_version: str = "medgemma-v1",
    prompt_version: str | None = None,
    prompt_sha256: str | None = None,
    model_revision: str | None = None,
) -> str | None:
    """MedGemma 분석 결과를 skin_ai_results에 저장."""
    validated = build_medgemma_handoff_payload(medgemma)
    if validated is None:
        logger.warning("[MongoDB] invalid medgemma result skin_log_id=%s", skin_log_id)
        return None

    signals = validated["signals"]

    try:
        db = get_mongo_db()
        doc = {
            "skin_log_id": skin_log_id,
            "user_id": user_id,
            "date": date,
            "signals": signals,
            "model_version": model_version,
            "model_revision": model_revision,
            "prompt_version": prompt_version,
            "prompt_sha256": prompt_sha256,
            "created_at": datetime.now(timezone.utc),
            "raw_analysis": {},
        }
        result = await db["skin_ai_results"].insert_one(doc)
        return str(result.inserted_id)
    except Exception as exc:
        logger.warning(
            "[MongoDB] medgemma save failed skin_log_id=%s: %s",
            skin_log_id,
            exc,
        )
        return None
