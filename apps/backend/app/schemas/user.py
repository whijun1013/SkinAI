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
    skin_condition_chips: Optional[list[str]] = Field(None, max_length=5)


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
    is_social_only: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    @classmethod
    def from_orm_with_computed(cls, user):
        data = {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "skin_type": user.skin_type,
            "skin_concerns": user.skin_concerns,
            "raw_concern_text": user.raw_concern_text,
            "birth_year": user.birth_year,
            "gender": user.gender,
            "avg_cycle_length": user.avg_cycle_length,
            "cycle_regularity": user.cycle_regularity,
            "push_token": user.push_token,
            "is_onboarded": user.is_onboarded,
            "is_admin": user.is_admin,
            "is_social_only": bool(getattr(user, "social_accounts", [])),
            "created_at": user.created_at,
            "updated_at": user.updated_at,
        }
        return cls(**data)

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
