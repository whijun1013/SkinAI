from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class UserLocationCreate(BaseModel):
    location_type: Literal["home", "work"]
    location_name: Optional[str] = Field(None, max_length=100)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)

class UserLocationResponse(BaseModel):
    id: int
    user_id: int
    location_type: str
    location_name: Optional[str] = None
    lat: float
    lng: float
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
