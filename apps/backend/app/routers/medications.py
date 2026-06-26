from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import or_
from typing import List, Optional
from app.database import get_db
from app.models.medication import Medication, MedicationIngredient
from app.schemas.medication import MedicationResponse, MedicationDetailResponse

router = APIRouter(prefix="/medications", tags=["medications"])

@router.get("/search", response_model=List[MedicationResponse])
def search_medications(
    q: str = Query(..., description="Search keyword for medication name"),
    skin_relevant_only: Optional[bool] = Query(None, description="Filter to show only medications with skin relevant ingredients"),
    skip: int = Query(0, ge=0, description="Offset results to skip"),
    limit: int = Query(20, ge=1, le=100, description="Max results to return"),
    db: Session = Depends(get_db)
):
    q_stripped = q.strip()
    if not q_stripped:
        return []
    keyword = f"%{q_stripped}%"

    query = db.query(Medication).options(
        selectinload(Medication.ingredients_list)
    ).outerjoin(
        Medication.ingredients_list
    ).filter(
        or_(
            Medication.name.like(keyword),
            MedicationIngredient.name.like(keyword),
            MedicationIngredient.drug_class.like(keyword)
        )
    )

    if skin_relevant_only:
        query = query.filter(MedicationIngredient.is_skin_relevant == True)

    results = query.distinct().all()
    
    # Sort in Python (medication.name prefix/contains > ingredient.name match > drug_class match)
    def get_medication_relevance(med):
        name_lower = med.name.lower() if med.name else ""
        q_lower = q_stripped.lower()
        score = 0
        if name_lower == q_lower:
            score += 200
        elif name_lower.startswith(q_lower):
            score += 100
        elif q_lower in name_lower:
            score += 50
            
        for ing in med.ingredients_list:
            ing_name = ing.name.lower() if ing.name else ""
            ing_class = ing.drug_class.lower() if ing.drug_class else ""
            if ing_name == q_lower:
                score += 40
            elif q_lower in ing_name:
                score += 30
            if ing_class == q_lower:
                score += 20
            elif q_lower in ing_class:
                score += 10
        return score

    results.sort(key=lambda m: (-get_medication_relevance(m), m.name))
    return results[skip : skip + limit]

@router.get("/{medication_id}", response_model=MedicationDetailResponse)
def get_medication_detail(medication_id: int, db: Session = Depends(get_db)):
    medication = db.query(Medication).options(
        selectinload(Medication.ingredients_list)
    ).filter(Medication.id == medication_id).first()
    if not medication:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="약물을 찾을 수 없습니다"
        )

    # Compute additional skin relevance details
    ingredients = medication.ingredients_list
    skin_relevant_ingredients = [ing for ing in ingredients if ing.is_skin_relevant]
    skin_relevant_ingredients_count = len(skin_relevant_ingredients)

    if skin_relevant_ingredients_count > 0:
        names_str = ", ".join([ing.name for ing in skin_relevant_ingredients])
        risk_summary = f"피부 관련 성분({names_str})이 포함되어 있습니다. 복용 시 피부 반응에 유의하세요."
    else:
        risk_summary = "피부에 직접적인 영향을 주는 성분이 알려져 있지 않습니다."

    medication.skin_relevant_ingredients_count = skin_relevant_ingredients_count
    medication.skin_relevant_ingredients = skin_relevant_ingredients
    medication.risk_summary = risk_summary

    return medication
