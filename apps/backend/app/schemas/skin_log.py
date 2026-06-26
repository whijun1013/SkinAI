from datetime import date, datetime
from typing import Any, List, Optional, Union

from pydantic import BaseModel, Field, field_validator


class SkinLogCreate(BaseModel):
    logged_at: date = Field(default_factory=date.today)
    overall_score: Optional[int] = Field(None, ge=1, le=5)
    condition_tags: Optional[Union[List[str], dict[str, Any]]] = None
    photo_url: Optional[str] = None
    note: Optional[str] = Field(None, max_length=1000)
    quality_check_passed: Optional[bool] = None
    quality_warning: Optional[str] = None

    @field_validator("note")
    @classmethod
    def strip_note(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        return stripped if stripped else None


class SkinLogUpdate(BaseModel):
    overall_score: Optional[int] = Field(None, ge=1, le=5)
    condition_tags: Optional[Union[List[str], dict[str, Any]]] = None
    photo_url: Optional[str] = None
    note: Optional[str] = Field(None, max_length=1000)
    quality_check_passed: Optional[bool] = None
    quality_warning: Optional[str] = None

    @field_validator("note")
    @classmethod
    def strip_note(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        return stripped if stripped else None


class SkinLogResponse(BaseModel):
    id: int
    user_id: int
    logged_at: date
    overall_score: Optional[int] = None
    condition_tags: Optional[Union[List[str], dict[str, Any]]] = None
    photo_url: Optional[str] = None
    note: Optional[str] = None
    quality_check_passed: Optional[bool] = None
    quality_warning: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    medgemma_status: Optional[dict[str, Any]] = None  # MongoDB 분석 결과 인라인

    class Config:
        from_attributes = True


class SkinPhotoAnalyzeResponse(BaseModel):
    photo_url: str
    queued: bool = False           # MedGemma 분석이 실제로 큐에 등록됐는지
    skip_reason: Optional[str] = None  # queued=False 이유 (quality_skip / queue_disabled / url_sign_failed)


class MedGemmaTaskStatusResponse(BaseModel):
    status: str
    skin_log_id: int
    requested_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    attempts: Optional[int] = None
    max_attempts: Optional[int] = None
    worker_id: Optional[str] = None
    recommendation: Optional[str] = None
    confidence: Optional[str] = None
    summary_for_report_model: Optional[str] = None
    display_summary: Optional[str] = None
    visual_assessment_role: Optional[str] = None
    role: Optional[str] = None
    primary_visual_summary: Optional[str] = None
    dominant_signals: Optional[list[str]] = None
    observations: Optional[dict[str, Any]] = None
    limitations: Optional[list[str]] = None
    capture_quality: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    message_for_user: Optional[str] = None
