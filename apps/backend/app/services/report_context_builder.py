import asyncio
import logging
from datetime import date, timedelta
from typing import Literal, Any

from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import disconnect_mongo
from app.models.skin_log import SkinLog
from app.mongo import get_multiple_skin_ai_results
from app.services.analysis_context_builder import build_analysis_context
from app.services.pattern_discovery import discover_patterns

ReportType = Literal["triggered", "weekly", "monthly", "user_requested"]
logger = logging.getLogger(__name__)

class ReportContextError(Exception):
    pass

def build_report_context(
    db: Session,
    user_id: int,
    report_type: ReportType,
    *,
    trigger_skin_log_id: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    include_medgemma: bool = True,
    include_patterns: bool = True,
) -> dict[str, Any]:
    """
    여러 종류의 리포트가 공통으로 사용할 수 있는 통합 context를 빌드한다.
    """
    actual_start_date = start_date
    actual_end_date = end_date
    actual_trigger_id = trigger_skin_log_id
    
    if report_type == "triggered":
        if trigger_skin_log_id is None:
            raise ReportContextError("triggered report requires trigger_skin_log_id")
        
        trigger_log = (
            db.query(SkinLog)
            .filter(
                SkinLog.id == trigger_skin_log_id,
                SkinLog.user_id == user_id,
                SkinLog.overall_score.isnot(None),
            )
            .first()
        )
        if not trigger_log:
            raise ReportContextError(f"SkinLog {trigger_skin_log_id} not found")
            
        actual_end_date = trigger_log.logged_at
        actual_start_date = actual_end_date - timedelta(days=13)
        
    elif report_type in {"weekly", "monthly", "user_requested"}:
        if report_type == "weekly":
            actual_end_date = end_date or date.today()
            actual_start_date = start_date or (actual_end_date - timedelta(days=6))
        elif report_type == "monthly":
            actual_end_date = end_date or date.today()
            actual_start_date = start_date or (actual_end_date - timedelta(days=29))
        elif report_type == "user_requested":
            if not start_date or not end_date:
                raise ReportContextError("user_requested report requires start_date and end_date")
            actual_start_date = start_date
            actual_end_date = end_date
            
        latest_log = (
            db.query(SkinLog)
            .filter(
                SkinLog.user_id == user_id,
                SkinLog.logged_at >= actual_start_date,
                SkinLog.logged_at <= actual_end_date,
                SkinLog.overall_score.isnot(None)
            )
            .order_by(desc(SkinLog.logged_at))
            .first()
        )
        
        if not latest_log:
            raise ReportContextError("no skin log found for report period")
            
        actual_trigger_id = latest_log.id
    else:
        raise ReportContextError(f"unsupported report_type: {report_type}")

    # build_analysis_context 호출 (현재는 기본 14일 분석)
    medgemma_handoffs = {}
    if include_medgemma:
        medgemma_handoffs = _get_medgemma_handoffs(
            _get_context_skin_log_ids(db, user_id, actual_end_date, lookback_days=14)
        )

    analysis_context = build_analysis_context(
        db=db,
        user_id=user_id,
        skin_log_id=actual_trigger_id,
        medgemma_handoffs=medgemma_handoffs,
    )
    
    patterns = []
    if include_patterns:
        patterns = discover_patterns(analysis_context)

    return {
        "meta": {
            "context_version": "report_context_v1",
            "report_type": report_type,
            "user_id": user_id,
            "period_start": actual_start_date.isoformat() if actual_start_date else None,
            "period_end": actual_end_date.isoformat() if actual_end_date else None,
            "trigger_skin_log_id": actual_trigger_id,
        },
        "analysis_context": analysis_context,
        "patterns": patterns,
    }


def _get_context_skin_log_ids(
    db: Session,
    user_id: int,
    end_date: date,
    lookback_days: int,
) -> list[int]:
    start_date = end_date - timedelta(days=lookback_days - 1)
    rows = (
        db.query(SkinLog.id)
        .filter(
            SkinLog.user_id == user_id,
            SkinLog.logged_at >= start_date,
            SkinLog.logged_at <= end_date,
            SkinLog.overall_score.isnot(None),
        )
        .all()
    )
    return [row[0] for row in rows]


def _get_medgemma_handoffs(skin_log_ids: list[int]) -> dict[int, dict]:
    if not skin_log_ids:
        return {}

    async def _fetch_docs(ids: list[int]):
        try:
            return await get_multiple_skin_ai_results(ids)
        finally:
            await disconnect_mongo()

    try:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor(1) as pool:
                docs = pool.submit(asyncio.run, _fetch_docs(skin_log_ids)).result()
        else:
            docs = asyncio.run(_fetch_docs(skin_log_ids))
    except Exception as exc:
        logger.exception("failed to fetch MedGemma report handoffs: %s", exc)
        return {}

    result = {}
    for skin_log_id, doc in docs.items():
        if doc and doc.get("signals"):
            result[skin_log_id] = {
                "signals": doc["signals"],
                "model_version": doc.get("model_version"),
            }
    return result
