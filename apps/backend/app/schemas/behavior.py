from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import date, datetime
from decimal import Decimal


class DailyBehaviorLogCreate(BaseModel):
    logged_at: date = Field(default_factory=date.today)
    sleep_hours: Optional[Decimal] = Field(None, ge=0, le=24)
    sleep_quality: Optional[int] = Field(None, ge=1, le=5)
    stress_level: Optional[int] = Field(None, ge=1, le=5)
    water_intake_ml: Optional[int] = Field(None, ge=0, le=10_000)
    exercise_yn: Optional[bool] = None
    exercise_type: Optional[str] = Field(None, max_length=50)
    exercise_duration_min: Optional[int] = Field(None, ge=0, le=1440)
    alcohol_yn: Optional[bool] = None
    smoking_yn: Optional[bool] = None
    custom_behaviors: Optional[Any] = None


class DailyBehaviorLogUpdate(BaseModel):
    sleep_hours: Optional[Decimal] = Field(None, ge=0, le=24)
    sleep_quality: Optional[int] = Field(None, ge=1, le=5)
    stress_level: Optional[int] = Field(None, ge=1, le=5)
    water_intake_ml: Optional[int] = Field(None, ge=0, le=10_000)
    exercise_yn: Optional[bool] = None
    exercise_type: Optional[str] = Field(None, max_length=50)
    exercise_duration_min: Optional[int] = Field(None, ge=0, le=1440)
    alcohol_yn: Optional[bool] = None
    smoking_yn: Optional[bool] = None
    custom_behaviors: Optional[Any] = None


class DailyBehaviorLogResponse(BaseModel):
    id: int
    logged_at: date
    is_today: bool = True
    sleep_hours: Optional[Decimal] = None
    sleep_quality: Optional[int] = None
    stress_level: Optional[int] = None
    water_intake_ml: Optional[int] = None
    exercise_yn: Optional[bool] = None
    exercise_type: Optional[str] = None
    exercise_duration_min: Optional[int] = None
    alcohol_yn: Optional[bool] = None
    smoking_yn: Optional[bool] = None
    custom_behaviors: Optional[Any] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
