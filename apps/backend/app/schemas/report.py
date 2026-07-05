from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field


class DailyFeatureSkinSummary(BaseModel):
    score: Optional[int] = None
    tags: List[str] = Field(default_factory=list)
    has_photo: bool = False
    note: Optional[str] = None


class DailyFeatureDietSummary(BaseModel):
    meal_count: int = 0
    item_count: int = 0
    high_gi_count: int = 0
    dairy_count: int = 0
    meal_types: List[str] = Field(default_factory=list)
    signals: List[str] = Field(default_factory=list)


class DailyFeatureBehaviorSummary(BaseModel):
    sleep_hours: Optional[float] = None
    sleep_quality: Optional[int] = None
    stress_level: Optional[int] = None
    water_intake_ml: Optional[int] = None
    exercise_yn: Optional[bool] = None
    exercise_type: Optional[str] = None
    exercise_duration_min: Optional[int] = None
    alcohol_yn: Optional[bool] = None
    smoking_yn: Optional[bool] = None
    signals: List[str] = Field(default_factory=list)


class DailyFeatureEnvironmentSummary(BaseModel):
    log_count: int = 0
    temperature: Optional[float] = None
    humidity: Optional[int] = None
    pm10: Optional[int] = None
    pm25: Optional[int] = None
    uv_index: Optional[int] = None
    weather: Optional[str] = None
    location_name: Optional[str] = None
    source: Optional[str] = None
    signals: List[str] = Field(default_factory=list)


class DailyFeatureProductSummary(BaseModel):
    current_count: int = 0
    recent_started: int = 0
    names: List[str] = Field(default_factory=list)


class DailyFeatureSummaryResponse(BaseModel):
    date: date
    skin: DailyFeatureSkinSummary
    diet: DailyFeatureDietSummary
    behavior: DailyFeatureBehaviorSummary
    environment: DailyFeatureEnvironmentSummary
    cosmetics: DailyFeatureProductSummary
    medications: DailyFeatureProductSummary


class WeeklyDietNutrientSummaryResponse(BaseModel):
    start_date: date
    end_date: date
    total_sugar_g: float = 0.0
    total_sodium_mg: float = 0.0
    total_fat_g: float = 0.0
    total_carbohydrate_g: float = 0.0
    total_protein_g: float = 0.0
    high_sugar_days: int = 0
    high_sodium_days: int = 0
    logged_days: int = 0
    missing_days: int = 0
    signals: List[str] = Field(default_factory=list)
