from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import or_
from typing import List, Optional
from app.database import get_db
from app.models.cosmetic import CosmeticProduct
from app.schemas.cosmetic import CosmeticResponse, CosmeticDetailResponse, CosmeticAnalysisResponse
from app.services.cosmetic_risk import summarize_cosmetic_ingredients

router = APIRouter(prefix="/cosmetics", tags=["cosmetics"])


# placeholder 상품명 목록 — 검색 결과에서 제외
PLACEHOLDER_NAMES = {"상품명", "가품 피해 방지 안내"}

@router.get("/search", response_model=List[CosmeticResponse])
def search_cosmetics(
    q: Optional[str] = Query(None, description="Search keyword for brand or product name"),
    category: Optional[str] = Query(None, description="Filter by category"),
    has_image: Optional[bool] = Query(None, description="Filter by whether product has image"),
    skip: int = Query(0, ge=0, description="Offset results to skip"),
    limit: int = Query(20, ge=1, le=100, description="Max results to return"),
    db: Session = Depends(get_db)
):
    q_stripped = (q or "").strip()
    if not q_stripped and not category:
        return []

    query = db.query(CosmeticProduct).filter(
        CosmeticProduct.product_name.notin_(PLACEHOLDER_NAMES)
    )

    if q_stripped:
        keyword = f"%{q_stripped}%"
        query = query.filter(
            or_(
                CosmeticProduct.brand.like(keyword),
                CosmeticProduct.product_name.like(keyword)
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
        def get_cosmetic_relevance(prod):
            brand_lower = prod.brand.lower() if prod.brand else ""
            prod_name_lower = prod.product_name.lower() if prod.product_name else ""
            q_lower = q_stripped.lower()
            score = 0
            if brand_lower == q_lower:
                score += 200
            elif brand_lower.startswith(q_lower):
                score += 80
            elif q_lower in brand_lower:
                score += 40

            if prod_name_lower == q_lower:
                score += 150
            elif prod_name_lower.startswith(q_lower):
                score += 100
            elif q_lower in prod_name_lower:
                score += 50

            return score

        results.sort(key=lambda p: (-get_cosmetic_relevance(p), p.product_name))
    else:
        results.sort(key=lambda p: (p.brand or "", p.product_name or ""))
    return results[skip : skip + limit]

@router.get("/{cosmetic_id}", response_model=CosmeticDetailResponse)
def get_cosmetic_detail(cosmetic_id: int, db: Session = Depends(get_db)):
    cosmetic = db.query(CosmeticProduct).options(
        selectinload(CosmeticProduct.ingredients_list)
    ).filter(CosmeticProduct.id == cosmetic_id).first()
    if not cosmetic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="화장품을 찾을 수 없습니다"
        )
    return cosmetic

@router.get("/{cosmetic_id}/analyze", response_model=CosmeticAnalysisResponse)
def analyze_cosmetic(cosmetic_id: int, db: Session = Depends(get_db)):
    cosmetic = db.query(CosmeticProduct).options(
        selectinload(CosmeticProduct.ingredients_list)
    ).filter(CosmeticProduct.id == cosmetic_id).first()
    if not cosmetic:
        raise HTTPException(status_code=404, detail="Cosmetic not found")

    risk = summarize_cosmetic_ingredients(cosmetic.ingredients_list)

    return CosmeticAnalysisResponse(
        product=cosmetic,
        irritant_count=risk["irritant_count"],
        comedogenic_count=risk["comedogenic_count"],
        comedogenic_average=risk["comedogenic_average"],
        comedogenic_coverage=risk["comedogenic_coverage"],
        safety_grade=risk["safety_grade"],
        banned_count=risk["banned_count"],
        restricted_count=risk["restricted_count"],
        risk_ingredients=risk["risk_ingredients"],
    )
