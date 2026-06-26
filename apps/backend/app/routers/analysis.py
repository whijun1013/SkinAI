import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.analysis import AgentResult
from app.models.user import User
from app.schemas.analysis import (
    AgentResultResponse,
    AnalysisCreateRequest,
    AnalysisDetailResponse,
    AnalysisListResponse,
    AnalysisProgressResponse,
    AnalysisResponse,
    AnalysisResultDetailResponse,
    AnalysisResultResponse,
    SuspiciousItemResponse,
)
from app.services.analysis_exceptions import (
    DuplicateAnalysisRequestError,
    InsufficientSkinLogError,
    ReanalysisLockedError,
    SkinLogNotFoundError,
)
from app.services.analysis_orchestrator import (
    create_analysis_request,
    get_analysis_progress,
    get_analysis_request,
    list_analysis_requests,
    process_analysis_request_by_id,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users/me/analysis", tags=["analysis"])


@router.post("", response_model=AnalysisResponse, status_code=status.HTTP_202_ACCEPTED)
def create_analysis(
    payload: AnalysisCreateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        request = create_analysis_request(
            db,
            user_id=current_user.id,
            skin_log_id=payload.skin_log_id,
            concern_note=payload.concern_note,
        )
        background_tasks.add_task(process_analysis_request_by_id, request.id)
        return _to_response(request)
    except SkinLogNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skin log not found")
    except ReanalysisLockedError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc))
    except (DuplicateAnalysisRequestError, InsufficientSkinLogError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception:
        logger.exception("Unexpected analysis request creation failure")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="analysis failed")


@router.get("", response_model=AnalysisListResponse)
def get_analysis_list(
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = list_analysis_requests(db, current_user.id, limit)
    return AnalysisListResponse(items=[_to_response(item) for item in items], limit=limit)


@router.get("/{id}", response_model=AnalysisDetailResponse)
def get_analysis_detail(
    id: int = Path(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        request = get_analysis_request(db, current_user.id, id)
        return _to_detail_response(request, db)
    except SkinLogNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="analysis request not found")


@router.get("/{id}/progress", response_model=AnalysisProgressResponse)
def get_analysis_progress_detail(
    id: int = Path(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return AnalysisProgressResponse(**get_analysis_progress(db, current_user.id, id))
    except SkinLogNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="analysis request not found")


def _get_base_date(request):
    """analysis_request의 skin_log.logged_at을 안전하게 date로 반환한다."""
    try:
        logged_at = request.skin_log.logged_at
        if logged_at is None:
            return None
        return logged_at.date() if hasattr(logged_at, "date") else logged_at
    except Exception:
        return None


def _to_response(request) -> AnalysisResponse:
    result = None
    completed_at = None
    if request.analysis_result is not None:
        completed_at = request.analysis_result.created_at
        result = AnalysisResultResponse(
            primary_cause=request.analysis_result.primary_cause,
            contributing_factors=request.analysis_result.contributing_factors or [],
            report_text=request.analysis_result.report_text,
            confidence_score=(
                float(request.analysis_result.confidence_score)
                if request.analysis_result.confidence_score is not None
                else None
            ),
        )
    return AnalysisResponse(
        request_id=request.id,
        skin_log_id=request.skin_log_id,
        lookback_days=request.lookback_days,
        status=request.status,
        requested_at=request.requested_at,
        completed_at=completed_at,
        base_date=_get_base_date(request),
        result=result,
    )


def _to_detail_response(request, db: Session) -> AnalysisDetailResponse:
    result = None
    completed_at = None
    if request.analysis_result is not None:
        completed_at = request.analysis_result.created_at
        agent_results = (
            db.query(AgentResult)
            .filter(AgentResult.request_id == request.id)
            .order_by(AgentResult.id.asc())
            .all()
        )
        result = AnalysisResultDetailResponse(
            primary_cause=request.analysis_result.primary_cause,
            contributing_factors=request.analysis_result.contributing_factors or [],
            report_text=request.analysis_result.report_text,
            concern_verdicts=request.analysis_result.concern_verdicts or [],
            discovered_patterns=request.analysis_result.discovered_patterns or [],
            confidence_score=(
                float(request.analysis_result.confidence_score)
                if request.analysis_result.confidence_score is not None
                else None
            ),
            agent_results=[_to_agent_result_response(ar) for ar in agent_results],
        )
    return AnalysisDetailResponse(
        request_id=request.id,
        skin_log_id=request.skin_log_id,
        lookback_days=request.lookback_days,
        status=request.status,
        requested_at=request.requested_at,
        completed_at=completed_at,
        base_date=_get_base_date(request),
        result=result,
    )


def _to_agent_result_response(agent_result: AgentResult) -> AgentResultResponse:
    suspicious_items = agent_result.suspicious_items or []
    if not isinstance(suspicious_items, list):
        suspicious_items = []

    return AgentResultResponse(
        agent_type=agent_result.agent_type,
        suspicious_items=[
            SuspiciousItemResponse(**item)
            for item in suspicious_items
            if isinstance(item, dict)
        ],
        reason=agent_result.reason,
        confidence=float(agent_result.confidence) if agent_result.confidence is not None else None,
    )
