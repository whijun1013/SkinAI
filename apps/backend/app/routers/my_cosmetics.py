from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional
from datetime import date
from app.database import get_db
from app.models.user import User
from app.models.cosmetic import UserCosmetic, CosmeticProduct
from app.schemas.cosmetic import (
    UserCosmeticCreate,
    UserCosmeticUpdate,
    UserCosmeticResponse,
    PaginatedUserCosmeticsResponse,
)
from app.deps.auth import get_current_user

router = APIRouter(prefix="/users/me/cosmetics", tags=["내 화장품"])


def _build_my_cosmetics_query(db: Session, user_id: int, is_current: Optional[bool]):
    query = (
        db.query(UserCosmetic)
        .options(selectinload(UserCosmetic.product))
        .filter(UserCosmetic.user_id == user_id)
    )
    if is_current is not None:
        query = query.filter(UserCosmetic.is_current == is_current)
    return query


def _order_my_cosmetics(query, is_current: Optional[bool]):
    if is_current is False:
        # MySQL/MariaDB 호환: NULLS LAST 대신 ended_at IS NULL 로 종료일 없는 행을 뒤로
        return query.order_by(
            UserCosmetic.ended_at.is_(None),
            desc(UserCosmetic.ended_at),
            desc(UserCosmetic.started_at),
        )
    return query.order_by(desc(UserCosmetic.is_current), desc(UserCosmetic.started_at))


@router.get("")
def get_my_cosmetics(
    is_current: Optional[bool] = None,
    skip: int = Query(0, ge=0),
    limit: Optional[int] = Query(None, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = _build_my_cosmetics_query(db, current_user.id, is_current)

    if limit is None:
        items = _order_my_cosmetics(query, is_current).all()
        return [UserCosmeticResponse.model_validate(item) for item in items]

    total = query.count()
    rows = _order_my_cosmetics(query, is_current).offset(skip).limit(limit).all()
    validated = [UserCosmeticResponse.model_validate(item) for item in rows]
    return PaginatedUserCosmeticsResponse(
        items=validated,
        total=total,
        skip=skip,
        limit=limit,
        has_more=skip + len(validated) < total,
    ).model_dump()


@router.post("", response_model=UserCosmeticResponse)
def add_my_cosmetic(
    cos_in: UserCosmeticCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not db.query(CosmeticProduct).filter(CosmeticProduct.id == cos_in.product_id).first():
        raise HTTPException(status_code=404, detail="화장품을 찾을 수 없습니다.")

    if db.query(UserCosmetic).filter(
        UserCosmetic.user_id == current_user.id,
        UserCosmetic.product_id == cos_in.product_id,
        UserCosmetic.is_current == True
    ).first():
        raise HTTPException(status_code=400, detail="이미 사용 중인 화장품입니다.")

    new_cosmetic = UserCosmetic(
        user_id=current_user.id,
        product_id=cos_in.product_id,
        is_current=cos_in.is_current,
        started_at=cos_in.started_at or date.today()
    )
    db.add(new_cosmetic)
    db.commit()
    db.refresh(new_cosmetic)
    return new_cosmetic


@router.put("/{user_cos_id}", response_model=UserCosmeticResponse)
def update_my_cosmetic(
    user_cos_id: int,
    cos_in: UserCosmeticUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user_cos = db.query(UserCosmetic).filter(
        UserCosmetic.id == user_cos_id,
        UserCosmetic.user_id == current_user.id
    ).first()
    if not user_cos:
        raise HTTPException(status_code=404, detail="등록된 화장품 기록을 찾을 수 없습니다.")

    if cos_in.is_current is True:
        if user_cos.is_current is False or user_cos.ended_at is not None:
            raise HTTPException(
                status_code=400,
                detail="종료된 사용 기록은 다시 활성화할 수 없습니다. 새 사용 기간으로 등록해 주세요.",
            )
        duplicate_current = db.query(UserCosmetic).filter(
            UserCosmetic.user_id == current_user.id,
            UserCosmetic.product_id == user_cos.product_id,
            UserCosmetic.is_current == True,
            UserCosmetic.id != user_cos_id,
        ).first()
        if duplicate_current:
            raise HTTPException(status_code=400, detail="이미 사용 중인 화장품입니다.")

    for field, value in cos_in.model_dump(exclude_none=True).items():
        setattr(user_cos, field, value)

    if cos_in.is_current is True:
        user_cos.ended_at = None

    if cos_in.is_current is False and not user_cos.ended_at:
        user_cos.ended_at = date.today()

    if user_cos.started_at and user_cos.ended_at and user_cos.started_at > user_cos.ended_at:
        raise HTTPException(status_code=400, detail="시작일은 종료일보다 빨라야 합니다.")

    db.commit()
    db.refresh(user_cos)
    return user_cos


@router.delete("/{user_cos_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_cosmetic(
    user_cos_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    [삭제 정책 안내]
    본 API는 등록된 화장품을 DB에서 영구 삭제(Hard Delete)합니다.
    사용자의 과거 피부 분석 일지 등과의 연동 이력 보존이 중요하거나 
    과거 사용 이력을 유지하고 싶은 경우, 본 DELETE API 대신 
    PUT API를 호출하여 is_current=False (및 ended_at 기록)로 업데이트하여 
    사용 종료 상태로 전환할 것을 권장합니다.
    """
    user_cos = db.query(UserCosmetic).filter(
        UserCosmetic.id == user_cos_id,
        UserCosmetic.user_id == current_user.id
    ).first()
    if not user_cos:
        raise HTTPException(status_code=404, detail="등록된 화장품 기록을 찾을 수 없습니다.")

    db.delete(user_cos)
    db.commit()
