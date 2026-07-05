from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.cosmetic import CosmeticProduct, PendingCosmeticProduct
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.cosmetic import (
    CosmeticAnalysisResponse,
    CosmeticDetailResponse,
    CosmeticResponse,
    PendingCosmeticProductCreate,
    PendingCosmeticProductResponse,
)
from app.services.cosmetic_risk import summarize_cosmetic_ingredients


router = APIRouter(prefix="/cosmetics", tags=["cosmetics"])

PLACEHOLDER_NAMES = {"상품명", "가져올 수 없음", "상품명을 확인할 수 없음"}


@router.post("/pending", response_model=PendingCosmeticProductResponse, status_code=status.HTTP_201_CREATED)
def create_pending_cosmetic(
    payload: PendingCosmeticProductCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    new_pending = PendingCosmeticProduct(
        user_id=current_user.id,
        brand=payload.brand.strip(),
        product_name=payload.product_name.strip(),
        ingredients_text=payload.ingredients_text.strip() if payload.ingredients_text else None,
        image_url=payload.image_url.strip() if payload.image_url else None,
        source_note=payload.source_note.strip() if payload.source_note else None,
        status="pending",
    )
    db.add(new_pending)
    db.commit()
    db.refresh(new_pending)
    return new_pending


@router.get("/search", response_model=List[CosmeticResponse])
def search_cosmetics(
    q: Optional[str] = Query(None, description="Search keyword for brand or product name"),
    category: Optional[str] = Query(None, description="Filter by category"),
    has_image: Optional[bool] = Query(None, description="Filter by whether product has image"),
    skip: int = Query(0, ge=0, description="Offset results to skip"),
    limit: int = Query(20, ge=1, le=100, description="Max results to return"),
    db: Session = Depends(get_db),
):
    q_stripped = (q or "").strip()
    if not q_stripped and not category:
        return []

    query = db.query(CosmeticProduct).filter(CosmeticProduct.product_name.notin_(PLACEHOLDER_NAMES))

    if q_stripped:
        keyword = f"%{q_stripped}%"
        query = query.filter(
            or_(
                CosmeticProduct.brand.like(keyword),
                CosmeticProduct.product_name.like(keyword),
            )
        )

    if category:
        query = query.filter(CosmeticProduct.category == category)
    if has_image is not None:
        if has_image:
            query = query.filter(CosmeticProduct.image_url.isnot(None), CosmeticProduct.image_url != "")
        else:
            query = query.filter(or_(CosmeticProduct.image_url.is_(None), CosmeticProduct.image_url == ""))

    results = query.all()

    if q_stripped:
        q_lower = q_stripped.lower()

        def get_cosmetic_relevance(product):
            brand_lower = product.brand.lower() if product.brand else ""
            product_name_lower = product.product_name.lower() if product.product_name else ""
            score = 0
            if brand_lower == q_lower:
                score += 200
            elif brand_lower.startswith(q_lower):
                score += 80
            elif q_lower in brand_lower:
                score += 40

            if product_name_lower == q_lower:
                score += 150
            elif product_name_lower.startswith(q_lower):
                score += 100
            elif q_lower in product_name_lower:
                score += 50
            return score

        results.sort(key=lambda product: (-get_cosmetic_relevance(product), product.product_name))
    else:
        results.sort(key=lambda product: (product.brand or "", product.product_name or ""))
    return results[skip : skip + limit]


@router.get("/{cosmetic_id}", response_model=CosmeticDetailResponse)
def get_cosmetic_detail(cosmetic_id: int, db: Session = Depends(get_db)):
    cosmetic = (
        db.query(CosmeticProduct)
        .options(selectinload(CosmeticProduct.ingredients_list))
        .filter(CosmeticProduct.id == cosmetic_id)
        .first()
    )
    if not cosmetic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="화장품을 찾을 수 없습니다")
    return cosmetic


@router.get("/{cosmetic_id}/analyze", response_model=CosmeticAnalysisResponse)
def analyze_cosmetic(cosmetic_id: int, db: Session = Depends(get_db)):
    cosmetic = (
        db.query(CosmeticProduct)
        .options(selectinload(CosmeticProduct.ingredients_list))
        .filter(CosmeticProduct.id == cosmetic_id)
        .first()
    )
    if not cosmetic:
        raise HTTPException(status_code=404, detail="Cosmetic not found")

    risk = summarize_cosmetic_ingredients(cosmetic.ingredients_list)
    return CosmeticAnalysisResponse(product=cosmetic, **risk)
