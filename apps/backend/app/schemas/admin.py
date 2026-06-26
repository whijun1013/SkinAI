from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from app.schemas.user import UserResponse

class UserStatusUpdate(BaseModel):
    status: str = Field(..., description="active, suspended, banned, deleted 중 하나")

class AdminAuditLogResponse(BaseModel):
    id: int
    admin_user_id: Optional[int]
    action: str
    target_type: str
    target_id: Optional[str]
    before_json: Optional[str]
    after_json: Optional[str]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class DashboardStatsResponse(BaseModel):
    total_users: int
    new_users_today: int
    active_users_today: int
    skin_logs_count: int
    diet_logs_count: int
    behavior_logs_count: int
    ai_requests_count: int
    ai_failures_count: int

class AnalysisHistoryResponse(BaseModel):
    id: int
    user_id: int
    requested_at: datetime
    status: str

    class Config:
        from_attributes = True
