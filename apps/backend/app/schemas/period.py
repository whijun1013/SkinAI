from pydantic import BaseModel
from datetime import date, datetime
from typing import Literal, Optional

class PeriodLogCreate(BaseModel):
    started_at: date

class PeriodLogResponse(BaseModel):
    id: int
    started_at: date
    created_at: datetime

    class Config:
        from_attributes = True


class PeriodCycleResponse(BaseModel):
    target_date: date
    applicable: bool
    last_period_start: Optional[date] = None
    cycle_day: Optional[int] = None
    cycle_length_used: Optional[int] = None
    cycle_length_source: Optional[Literal["user", "estimated", "default"]] = None
    estimated_cycle_length: Optional[int] = None
    phase: Literal["menstrual", "follicular", "ovulation", "luteal", "unknown"]
    phase_label_ko: str
    cycle_regularity_reported: Optional[str] = None
    cycle_regularity_inferred: Literal["regular", "irregular", "unknown"]
    confidence: Literal["high", "medium", "low"]
    message: Optional[str] = None
