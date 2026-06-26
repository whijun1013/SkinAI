from datetime import date, datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field, field_validator

from app.concern_note import MAX_CONCERN_NOTE_LENGTH, normalize_concern_note


class AnalysisCreateRequest(BaseModel):
    skin_log_id: int
    concern_note: Optional[str] = Field(None, max_length=MAX_CONCERN_NOTE_LENGTH)

    @field_validator("concern_note", mode="before")
    @classmethod
    def validate_concern_note(cls, value: Optional[str]) -> Optional[str]:
        return normalize_concern_note(value)


class ConcernVerdictResponse(BaseModel):
    factor_type: str
    factor_key: str
    label: str
    source: str
    mentioned_as: str
    signal: Optional[str] = None
    verdict: str
    effect_size: Optional[float] = None
    exposure_days: Optional[int] = None
    comparison_days: Optional[int] = None
    outcome_metric: Optional[str] = None
    confidence: Optional[float] = None
    analysis_method: Optional[str] = None


class AnalysisResultResponse(BaseModel):
    primary_cause: Optional[str] = None
    contributing_factors: List[Any] = Field(default_factory=list)
    report_text: Optional[str] = None
    confidence_score: Optional[float] = None


class SuspiciousItemResponse(BaseModel):
    factor_type: Optional[str] = None
    factor_key: Optional[str] = None
    label: Optional[str] = None
    confidence: Optional[float] = None


class AgentResultResponse(BaseModel):
    agent_type: Optional[str] = None
    suspicious_items: List[SuspiciousItemResponse] = Field(default_factory=list)
    reason: Optional[str] = None
    confidence: Optional[float] = None


class DiscoveredPatternResponse(BaseModel):
    factor_type: str
    factor_key: str
    label: str
    trigger_day: Optional[str] = None
    analysis_method: Optional[str] = None
    lag_min_days: Optional[int] = None
    lag_max_days: Optional[int] = None
    exposure_days: int
    comparison_days: int
    effect_size: float
    direction_consistency: Optional[float] = None
    confidence: Optional[float] = None
    evidence_level: str
    evidence: str
    pattern: str
    confounder_notes: Optional[str] = None
    affected_signal: Optional[str] = None
    affected_signal_label: Optional[str] = None


class AnalysisResultDetailResponse(AnalysisResultResponse):
    agent_results: List[AgentResultResponse] = Field(default_factory=list)
    concern_verdicts: List[ConcernVerdictResponse] = Field(default_factory=list)
    discovered_patterns: List[DiscoveredPatternResponse] = Field(default_factory=list)


class AnalysisResponse(BaseModel):
    request_id: int
    skin_log_id: int
    lookback_days: int
    status: str
    requested_at: datetime
    completed_at: Optional[datetime] = None
    base_date: Optional[date] = None
    result: Optional[AnalysisResultResponse] = None


class AnalysisDetailResponse(AnalysisResponse):
    result: Optional[AnalysisResultDetailResponse] = None


class AnalysisListResponse(BaseModel):
    items: List[AnalysisResponse]
    limit: int


class AnalysisProgressRecordSummary(BaseModel):
    skin_days: int = 0
    diet_days: int = 0
    behavior_days: int = 0
    environment_days: int = 0
    current_cosmetics: int = 0
    current_medications: int = 0


class AnalysisProgressSkinTimelineItem(BaseModel):
    date: str
    score: Optional[int] = None


class AnalysisProgressResponse(BaseModel):
    request_id: int
    status: str
    lookback_days: int
    summary: AnalysisProgressRecordSummary
    skin_timeline: List[AnalysisProgressSkinTimelineItem] = Field(default_factory=list)
