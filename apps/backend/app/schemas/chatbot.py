from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


# 요청 (유저가 보내는 것)
class ChatMessageRequest(BaseModel):
    session_id: Optional[int] = None  # 없으면 새 세션 생성
    content: str                       # 유저 메시지


# 응답 (서버가 돌려주는 것)
class ChatMessageResponse(BaseModel):
    session_id: int
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class ChatSessionResponse(BaseModel):
    id: int
    user_id: int
    created_at: datetime
    messages: List[ChatMessageResponse] = []

    class Config:
        from_attributes = True
