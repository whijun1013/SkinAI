from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CosmeticBase(BaseModel):
    brand: str
    product_name: str
    ingredients: Optional[str] = None
    category: Optional[str] = None
    source: Optional[str] = None
    source_product_id: Optional[str] = None
    product_url: Optional[str] = None
    status: Optional[str] = None
    normalized_name: Optional[str] = None

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
    english_name: Optional[str] = None
    manufacturer: Optional[str] = None
    item_seq: Optional[str] = None
    valid_term: Optional[str] = None
    storage_method: Optional[str] = None
    material_name: Optional[str] = None
    license_status: Optional[str] = None
    license_date: Optional[datetime] = None
    cancel_date: Optional[datetime] = None
    efficacy_group: Optional[str] = None
    prescription_type: Optional[str] = None
    source_updated_at: Optional[datetime] = None
    is_active: Optional[bool] = None

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
    barcode: Optional[str] = None
    brand: Optional[str] = None
    product_type: Optional[str] = None
    caffeine: Optional[float] = None
    glycemic_index: Optional[float] = None
    serving_size: Optional[float] = None
    serving_unit: Optional[str] = None
    is_canonical: bool = False
    canonical_id: Optional[int] = None

class FoodItemCreate(FoodItemBase):
    pass

class FoodItemUpdate(FoodItemBase):
    name: Optional[str] = None

class FoodItemResponse(FoodItemBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True
