from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date

class CosmeticIngredientBase(BaseModel):
    name: str
    is_irritant: bool = False
    comedogenic: Optional[int] = None
    is_banned: bool = False
    restriction_limit: Optional[str] = None

class CosmeticIngredientResponse(CosmeticIngredientBase):
    id: int
    english_name: Optional[str] = None
    comedogenic_source: Optional[str] = None
    cas_no: Optional[str] = None
    origin: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CosmeticBase(BaseModel):
    brand: str
    product_name: str
    category: Optional[str] = None
    image_url: Optional[str] = None

class CosmeticResponse(CosmeticBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CosmeticDetailResponse(CosmeticResponse):
    ingredients: Optional[str] = None
    ingredients_list: List[CosmeticIngredientResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True

class CosmeticAnalysisResponse(BaseModel):
    product: CosmeticResponse
    irritant_count: int
    comedogenic_count: int
    comedogenic_average: float
    comedogenic_coverage: float
    safety_grade: str
    banned_count: int = 0
    restricted_count: int = 0
    risk_ingredients: List[CosmeticIngredientResponse] = Field(default_factory=list)


class UserCosmeticCreate(BaseModel):
    product_id: int
    is_current: Optional[bool] = True
    started_at: Optional[date] = None


class UserCosmeticUpdate(BaseModel):
    is_current: Optional[bool] = None
    started_at: Optional[date] = None
    ended_at: Optional[date] = None


class UserCosmeticResponse(BaseModel):
    id: int
    user_id: int
    product_id: int
    is_current: Optional[bool] = None
    started_at: Optional[date] = None
    ended_at: Optional[date] = None
    created_at: Optional[datetime] = None
    product: CosmeticResponse

    class Config:
        from_attributes = True


class PaginatedUserCosmeticsResponse(BaseModel):
    items: List[UserCosmeticResponse]
    total: int
    skip: int
    limit: int
    has_more: bool
