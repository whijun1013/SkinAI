from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.deps.auth import get_current_admin_user
from app.models.cosmetic import CosmeticProduct
from app.models.medication import Medication
from app.models.diet import FoodItem
from app.schemas.admin_metadata import (
    CosmeticResponse, CosmeticCreate, CosmeticUpdate,
    MedicationResponse, MedicationCreate, MedicationUpdate,
    FoodItemResponse, FoodItemCreate, FoodItemUpdate
)
from app.services.admin_audit_service import log_admin_action

router = APIRouter(
    prefix="/admin/metadata",
    tags=["Admin Metadata"],
    dependencies=[Depends(get_current_admin_user)]
)

# Cosmetics
@router.get("/cosmetics", response_model=List[CosmeticResponse])
def get_cosmetics(skip: int = Query(0, ge=0), limit: int = Query(1000, ge=1, le=1000), db: Session = Depends(get_db)):
    return db.query(CosmeticProduct).offset(skip).limit(limit).all()

@router.post("/cosmetics", response_model=CosmeticResponse)
def create_cosmetic(payload: CosmeticCreate, db: Session = Depends(get_db), admin=Depends(get_current_admin_user)):
    item = CosmeticProduct(**payload.dict())
    db.add(item)
    db.flush()
    log_admin_action(db, admin.id, "CREATE", "CosmeticProduct", str(item.id), None, payload.dict())
    db.commit()
    return item

@router.put("/cosmetics/{id}", response_model=CosmeticResponse)
def update_cosmetic(id: int, payload: CosmeticUpdate, db: Session = Depends(get_db), admin=Depends(get_current_admin_user)):
    item = db.query(CosmeticProduct).filter(CosmeticProduct.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    update_data = payload.dict(exclude_unset=True)
    old_data = {k: getattr(item, k) for k in update_data.keys()}
    for key, value in update_data.items():
        setattr(item, key, value)
    log_admin_action(db, admin.id, "UPDATE", "CosmeticProduct", str(id), old_data, update_data)
    db.commit()
    db.refresh(item)
    return item

@router.delete("/cosmetics/{id}")
def delete_cosmetic(id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin_user)):
    item = db.query(CosmeticProduct).filter(CosmeticProduct.id == id).first()
    if not item:
        raise HTTPException(status_code=404)
    db.delete(item)
    log_admin_action(db, admin.id, "DELETE", "CosmeticProduct", str(id), {"brand": item.brand, "name": item.product_name}, None)
    db.commit()
    return {"message": "Deleted"}

# Medications
@router.get("/medications", response_model=List[MedicationResponse])
def get_medications(skip: int = Query(0, ge=0), limit: int = Query(1000, ge=1, le=1000), db: Session = Depends(get_db)):
    return db.query(Medication).offset(skip).limit(limit).all()

@router.post("/medications", response_model=MedicationResponse)
def create_medication(payload: MedicationCreate, db: Session = Depends(get_db), admin=Depends(get_current_admin_user)):
    item = Medication(**payload.dict())
    db.add(item)
    db.flush()
    log_admin_action(db, admin.id, "CREATE", "Medication", str(item.id), None, payload.dict())
    db.commit()
    return item

@router.put("/medications/{id}", response_model=MedicationResponse)
def update_medication(id: int, payload: MedicationUpdate, db: Session = Depends(get_db), admin=Depends(get_current_admin_user)):
    item = db.query(Medication).filter(Medication.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    update_data = payload.dict(exclude_unset=True)
    old_data = {k: getattr(item, k) for k in update_data.keys()}
    for key, value in update_data.items():
        setattr(item, key, value)
    log_admin_action(db, admin.id, "UPDATE", "Medication", str(id), old_data, update_data)
    db.commit()
    db.refresh(item)
    return item

@router.delete("/medications/{id}")
def delete_medication(id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin_user)):
    item = db.query(Medication).filter(Medication.id == id).first()
    if not item:
        raise HTTPException(status_code=404)
    db.delete(item)
    log_admin_action(db, admin.id, "DELETE", "Medication", str(id), {"name": item.name}, None)
    db.commit()
    return {"message": "Deleted"}

# FoodItems
@router.get("/food-items", response_model=List[FoodItemResponse])
def get_food_items(skip: int = Query(0, ge=0), limit: int = Query(1000, ge=1, le=1000), db: Session = Depends(get_db)):
    return db.query(FoodItem).offset(skip).limit(limit).all()

@router.post("/food-items", response_model=FoodItemResponse)
def create_food_item(payload: FoodItemCreate, db: Session = Depends(get_db), admin=Depends(get_current_admin_user)):
    item = FoodItem(**payload.dict())
    db.add(item)
    db.flush()
    log_admin_action(db, admin.id, "CREATE", "FoodItem", str(item.id), None, payload.dict())
    db.commit()
    return item

@router.put("/food-items/{id}", response_model=FoodItemResponse)
def update_food_item(id: int, payload: FoodItemUpdate, db: Session = Depends(get_db), admin=Depends(get_current_admin_user)):
    item = db.query(FoodItem).filter(FoodItem.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    update_data = payload.dict(exclude_unset=True)
    old_data = {k: getattr(item, k) for k in update_data.keys()}
    for key, value in update_data.items():
        setattr(item, key, value)
    log_admin_action(db, admin.id, "UPDATE", "FoodItem", str(id), old_data, update_data)
    db.commit()
    db.refresh(item)
    return item

@router.delete("/food-items/{id}")
def delete_food_item(id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin_user)):
    item = db.query(FoodItem).filter(FoodItem.id == id).first()
    if not item:
        raise HTTPException(status_code=404)
    db.delete(item)
    log_admin_action(db, admin.id, "DELETE", "FoodItem", str(id), {"name": item.name}, None)
    db.commit()
    return {"message": "Deleted"}
