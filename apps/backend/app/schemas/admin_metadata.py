from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CosmeticBase(BaseModel):
    brand: str
    product_name: str
    ingredients: Optional[str] = None
    category: Optional[str] = None

class CosmeticCreate(CosmeticBase):
    pass

class CosmeticUpdate(CosmeticBase):
    brand: Optional[str] = None
    product_name: Optional[str] = None

class CosmeticResponse(CosmeticBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True

class MedicationBase(BaseModel):
    name: str
    form: Optional[str] = None

class MedicationCreate(MedicationBase):
    pass

class MedicationUpdate(MedicationBase):
    name: Optional[str] = None

class MedicationResponse(MedicationBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True

class FoodItemBase(BaseModel):
    name: str
    category: Optional[str] = None
    calories: Optional[float] = None
    raw_material_text: Optional[str] = None
    allergen_text: Optional[str] = None

class FoodItemCreate(FoodItemBase):
    pass

class FoodItemUpdate(FoodItemBase):
    name: Optional[str] = None

class FoodItemResponse(FoodItemBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True
