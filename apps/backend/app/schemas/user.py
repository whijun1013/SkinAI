from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import date, datetime
from typing import Literal, Optional

SexCode = Literal["M", "F", "O", "U"]
BaselineStatus = Literal["collecting", "ready"]
PlatformCode = Literal["local", "google", "kakao", "naver"]


class UserBase(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=50)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("이름은 공백만으로 구성될 수 없습니다.")
        return stripped


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)
    skin_type: Optional[Literal["건성", "지성", "복합성", "민감성", "중성"]] = None
    birth_year: Optional[int] = Field(None, ge=1900, le=2100)
    gender: Optional[Literal["남", "여"]] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("비밀번호는 공백만으로 구성될 수 없습니다.")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOnboardingProfileUpdate(BaseModel):
    skin_type: Literal["건성", "지성", "복합성", "민감성", "중성"]
    birth_year: int = Field(..., ge=1900, le=date.today().year)
    gender: Literal["남", "여"]
    avg_cycle_length: Optional[int] = Field(None, ge=10, le=100)
    cycle_regularity: Optional[Literal["규칙적", "불규칙", "잘 모르겠어요"]] = None
    raw_concern_text: Optional[str] = Field(None, max_length=500)


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    skin_type: Optional[str] = None
    skin_concerns: Optional[list[str]] = None
    raw_concern_text: Optional[str] = None
    birth_year: Optional[int] = None
    gender: Optional[str] = None
    avg_cycle_length: Optional[int] = None
    cycle_regularity: Optional[str] = None
    push_token: Optional[str] = None
    is_onboarded: bool = False
    is_admin: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenData(BaseModel):
    email: Optional[str] = None


class PushTokenUpdate(BaseModel):
    push_token: Optional[str] = Field(None, max_length=200)

class AdminUserListItem(BaseModel):
    id: int
    email: str
    name: str
    is_admin: bool
    is_onboarded: bool
    created_at: datetime

    class Config:
        from_attributes = True
