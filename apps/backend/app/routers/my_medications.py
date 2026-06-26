from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional

from app.database import get_db
from app.models.user import User
from app.models.medication import UserMedication, Medication
from app.schemas.medication import (
    UserMedicationCreate,
    UserMedicationUpdate,
    UserMedicationResponse,
    PaginatedUserMedicationsResponse,
)
from app.deps.auth import get_current_user

router = APIRouter(prefix="/users/me/medications", tags=["내 약물"])


def _build_my_medications_query(db: Session, user_id: int, is_current: Optional[bool]):
    query = (
        db.query(UserMedication)
        .options(selectinload(UserMedication.medication))
        .filter(UserMedication.user_id == user_id)
    )
    if is_current is not None:
        query = query.filter(UserMedication.is_current == is_current)
    return query


def _order_my_medications(query, is_current: Optional[bool]):
    if is_current is False:
        return query.order_by(
            UserMedication.ended_at.is_(None),
            desc(UserMedication.ended_at),
            desc(UserMedication.started_at),
        )
    return query.order_by(desc(UserMedication.is_current), desc(UserMedication.started_at))


@router.get("")
def get_my_medications(
    is_current: Optional[bool] = None,
    skip: int = Query(0, ge=0),
    limit: Optional[int] = Query(None, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = _build_my_medications_query(db, current_user.id, is_current)

    if limit is None:
        items = _order_my_medications(query, is_current).all()
        return [UserMedicationResponse.model_validate(item) for item in items]

    total = query.count()
    rows = _order_my_medications(query, is_current).offset(skip).limit(limit).all()
    validated = [UserMedicationResponse.model_validate(item) for item in rows]
    return PaginatedUserMedicationsResponse(
        items=validated,
        total=total,
        skip=skip,
        limit=limit,
        has_more=skip + len(validated) < total,
    ).model_dump()


@router.post("", response_model=UserMedicationResponse)
def add_my_medication(
    med_in: UserMedicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not db.query(Medication).filter(Medication.id == med_in.medication_id).first():
        raise HTTPException(status_code=404, detail="약물을 찾을 수 없습니다.")

    if db.query(UserMedication).filter(
        UserMedication.user_id == current_user.id,
        UserMedication.medication_id == med_in.medication_id,
        UserMedication.is_current == True
    ).first():
        raise HTTPException(status_code=400, detail="이미 복용 중인 약물입니다.")

    started_at = med_in.started_at or date.today()

    if med_in.expected_end_at and started_at > med_in.expected_end_at:
        raise HTTPException(status_code=400, detail="시작일은 예상 종료일보다 빨라야 합니다.")

    new_user_med = UserMedication(
        user_id=current_user.id,
        medication_id=med_in.medication_id,
        is_current=med_in.is_current,
        started_at=started_at,
        expected_end_at=med_in.expected_end_at
    )
    db.add(new_user_med)
    db.commit()
    db.refresh(new_user_med)
    return new_user_med


@router.put("/{user_med_id}", response_model=UserMedicationResponse)
def update_my_medication(
    user_med_id: int,
    med_in: UserMedicationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user_med = db.query(UserMedication).filter(
        UserMedication.id == user_med_id,
        UserMedication.user_id == current_user.id
    ).first()
    if not user_med:
        raise HTTPException(status_code=404, detail="등록된 약물 기록을 찾을 수 없습니다.")

    for field, value in med_in.model_dump(exclude_none=True).items():
        setattr(user_med, field, value)

    if med_in.is_current is True:
        user_med.ended_at = None

    if med_in.is_current is False and not user_med.ended_at:
        user_med.ended_at = date.today()

    if user_med.started_at:
        if user_med.expected_end_at and user_med.started_at > user_med.expected_end_at:
            raise HTTPException(status_code=400, detail="시작일은 예상 종료일보다 빨라야 합니다.")
        if user_med.ended_at and user_med.started_at > user_med.ended_at:
            raise HTTPException(status_code=400, detail="시작일은 복용 종료일보다 빨라야 합니다.")

    db.commit()
    db.refresh(user_med)
    return user_med


@router.delete("/{user_med_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_medication(
    user_med_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user_med = db.query(UserMedication).filter(
        UserMedication.id == user_med_id,
        UserMedication.user_id == current_user.id
    ).first()
    if not user_med:
        raise HTTPException(status_code=404, detail="등록된 약물 기록을 찾을 수 없습니다.")

    db.delete(user_med)
    db.commit()
