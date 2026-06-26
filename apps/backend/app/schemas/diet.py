from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ── DietLogItem ───────────────────────────────────────────────────────────────

class DietLogItemCreate(BaseModel):
    food_item_id: Optional[int] = None
    custom_food_name: Optional[str] = None
    amount: Optional[float] = Field(None, ge=0)
    unit: Optional[str] = Field(None, max_length=20)

    @field_validator("custom_food_name")
    @classmethod
    def validate_custom_food_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            return None
        if len(stripped) > 255:
            raise ValueError("음식명은 최대 255자까지 입력 가능합니다.")
        return stripped

    @model_validator(mode="after")
    def validate_food_item_or_custom_name(self):
        if not self.food_item_id and not self.custom_food_name:
            raise ValueError("food_item_id 또는 custom_food_name 중 하나는 필수입니다.")
        return self


class FoodItemResponse(BaseModel):
    id: int
    api_food_code: Optional[str] = None
    name: str
    category: Optional[str] = None
    calories: Optional[float] = None
    carbohydrate: Optional[float] = None
    sugar: Optional[float] = None
    protein: Optional[float] = None
    fat: Optional[float] = None
    saturated_fat: Optional[float] = None
    trans_fat: Optional[float] = None
    sodium: Optional[float] = None
    source: Optional[str] = None
    skin_factors: Optional[List[dict[str, Any]]] = Field(default_factory=list)
    raw_material_text: Optional[str] = Field(default=None, exclude=True)
    allergen_text: Optional[str] = Field(default=None, exclude=True)
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DietLogItemResponse(BaseModel):
    id: int
    diet_log_id: int
    food_item_id: Optional[int] = None
    custom_food_name: Optional[str] = None
    amount: Optional[float] = None
    unit: Optional[str] = None
    created_at: datetime
    food_item: Optional[FoodItemResponse] = None

    class Config:
        from_attributes = True


# ── DietLog ───────────────────────────────────────────────────────────────────

class DietLogCreate(BaseModel):
    logged_at: Optional[datetime] = None
    captured_at: Optional[datetime] = None
    meal_type: Literal["아침", "점심", "저녁", "간식"]
    input_method: Literal["photo", "manual"] = "photo"
    photo_url: Optional[str] = None
    captured_lat: Optional[float] = Field(None, ge=-90, le=90)
    captured_lng: Optional[float] = Field(None, ge=-180, le=180)
    captured_location_name: Optional[str] = None
    note: Optional[str] = None
    items: List[DietLogItemCreate] = Field(default_factory=list)

    @field_validator("captured_location_name")
    @classmethod
    def validate_location_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            return None
        if len(stripped) > 100:
            raise ValueError("지역명은 최대 100자까지 입력 가능합니다.")
        return stripped

    @field_validator("note")
    @classmethod
    def validate_note(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            return None
        if len(stripped) > 1000:
            raise ValueError("메모는 최대 1000자까지 입력 가능합니다.")
        return stripped

    @model_validator(mode="after")
    def validate_manual_note(self):
        if self.input_method == "manual" and not self.note:
            raise ValueError("manual 입력 시 note는 비워둘 수 없습니다.")
        return self
    
    @model_validator(mode="after")
    def validate_photo_input(self):
        if self.input_method == "photo":
            if not self.photo_url and not self.items:
                raise ValueError("photo 입력 시 photo_url 또는 items 중 하나는 필수입니다.")
        return self


class DietLogListItemResponse(BaseModel):
    """기록 탭·목록용 경량 응답."""

    id: int
    logged_at: datetime
    meal_type: Optional[str] = None
    photo_url: Optional[str] = None
    note: Optional[str] = None
    food_names: List[str] = Field(default_factory=list)
    nutrition: Optional[dict[str, Any]] = None
    match_type: Optional[str] = None
    skin_factors: Optional[List[dict[str, Any]]] = None


class DietLogResponse(BaseModel):
    id: int
    user_id: int
    logged_at: datetime
    meal_type: Optional[str] = None
    input_method: Optional[str] = None
    photo_url: Optional[str] = None
    captured_lat: Optional[float] = None
    captured_lng: Optional[float] = None
    captured_location_name: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    items: List[DietLogItemResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


class DietLogUpdate(BaseModel):
    meal_type: Optional[Literal["아침", "점심", "저녁", "간식"]] = None
    logged_at: Optional[datetime] = None
    photo_url: Optional[str] = None
    note: Optional[str] = None
    captured_lat: Optional[float] = Field(None, ge=-90, le=90)
    captured_lng: Optional[float] = Field(None, ge=-180, le=180)
    captured_location_name: Optional[str] = None
    environment_log_id: Optional[int] = None
    items: Optional[List[DietLogItemCreate]] = None

    @field_validator("captured_location_name")
    @classmethod
    def validate_location_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            return None
        if len(stripped) > 100:
            raise ValueError("지역명은 최대 100자까지 입력 가능합니다.")
        return stripped

    @field_validator("note")
    @classmethod
    def validate_note(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            return None
        if len(stripped) > 1000:
            raise ValueError("메모는 최대 1000자까지 입력 가능합니다.")
        return stripped


# ── 사진 분석 결과 ─────────────────────────────────────────────────────────────

class PhotoAnalyzeQuickResponse(BaseModel):
    """GPT Vision만 사용하는 1단계 빠른 음식명 인식."""
    food_name: str


class PhotoAnalyzeResponse(BaseModel):
    food_name: str
    match_type: str  # 정확(DB) | 카테고리 | FTS검색 | 공공API | GPT추정 | 없음
    nutrition: Optional[dict[str, Any]] = None
    photo_url: Optional[str] = None
    food_item_id: Optional[int] = None
    food_item_source: Optional[str] = None
    skin_factors: Optional[List[dict[str, Any]]] = None
