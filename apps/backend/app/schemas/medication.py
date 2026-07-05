from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime

class MedicationIngredientBase(BaseModel):
    name: str
    drug_class: Optional[str] = None
    is_skin_relevant: bool = False

class MedicationIngredientResponse(MedicationIngredientBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class MedicationBase(BaseModel):
    name: str
    english_name: Optional[str] = None
    form: Optional[str] = None
    manufacturer: Optional[str] = None
    item_seq: Optional[str] = None
    valid_term: Optional[str] = None
    storage_method: Optional[str] = None
    material_name: Optional[str] = None
    license_status: Optional[str] = None
    is_active: Optional[bool] = None

class MedicationResponse(MedicationBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class MedicationDetailResponse(MedicationResponse):
    ingredients_list: List[MedicationIngredientResponse] = Field(default_factory=list)
    skin_relevant_ingredients_count: int = 0
    skin_relevant_ingredients: List[MedicationIngredientResponse] = Field(default_factory=list)
    risk_summary: Optional[str] = None

    class Config:
        from_attributes = True

class UserMedicationCreate(BaseModel):
    medication_id: int
    is_current: bool = True
    started_at: Optional[date] = None
    expected_end_at: Optional[date] = None

class UserMedicationUpdate(BaseModel):
    is_current: Optional[bool] = None
    started_at: Optional[date] = None
    expected_end_at: Optional[date] = None
    ended_at: Optional[date] = None

class UserMedicationResponse(BaseModel):
    id: int
    user_id: int
    medication_id: int
    is_current: Optional[bool] = None
    started_at: Optional[date] = None
    expected_end_at: Optional[date] = None
    ended_at: Optional[date] = None
    medication: MedicationResponse

    class Config:
        from_attributes = True

class PaginatedUserMedicationsResponse(BaseModel):
    items: List[UserMedicationResponse]
    total: int
    skip: int
    limit: int
    has_more: bool
