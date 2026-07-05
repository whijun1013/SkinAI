from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime, date

class EnvironmentLogBase(BaseModel):
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)
    location_name: Optional[str] = None
    temperature: Optional[float] = Field(None, ge=-60, le=60)
    humidity: Optional[int] = Field(None, ge=0, le=100)
    pm10: Optional[int] = Field(None, ge=0)
    pm25: Optional[int] = Field(None, ge=0)
    uv_index: Optional[int] = Field(None, ge=0, le=15)
    weather: Optional[str] = None
    source: Literal["app_camera", "exif", "manual", "retroactive"] = Field(..., description="app_camera, exif, manual, or retroactive")
    captured_at: datetime

class EnvironmentLogCreate(BaseModel):
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)
    location_name: Optional[str] = None
    source: Literal["app_camera", "exif", "manual", "retroactive"] = Field(..., description="app_camera, exif, manual, or retroactive")
    captured_at: datetime

class EnvironmentLogResponse(EnvironmentLogBase):
    id: int
    user_id: int
    logged_at: date
    diet_log_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
