from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Any, List, Optional
from app.database import get_db
from app.models.diet import FoodItem
from app.schemas.diet import FoodItemResponse
from app.deps.auth import get_current_user
from app.models.user import User
from app.services.food_lookup_service import (
    resolve_nutrition_for_name,
    search_food_items as search_food_items_service,
)
from pydantic import BaseModel


class FoodLookupResponse(BaseModel):
    found_name: Optional[str] = None
    match_type: str
    nutrition: Optional[dict[str, Any]] = None
    food_item_id: Optional[int] = None
    food_item_source: Optional[str] = None
    skin_factors: Optional[List[dict[str, Any]]] = None

router = APIRouter(prefix="/food-items", tags=["음식 정보"])

@router.get("/search", response_model=List[FoodItemResponse])
def search_food_items(
    q: Optional[str] = Query(None, description="검색할 음식명 부분 일치"),
    category: Optional[str] = Query(None, description="음식 카테고리"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if q:
        service_results = search_food_items_service(db, q, limit + skip)
        if category:
            service_results = [item for item in service_results if item.category == category]
        results = service_results
    else:
        query = db.query(FoodItem)
        if category:
            query = query.filter(FoodItem.category == category)
        results = query.offset(skip).limit(limit * 3).all()

    seen: set[str] = set()
    unique: list[FoodItem] = []
    for item in results:
        key = item.name.replace(" ", "")
        if key not in seen:
            seen.add(key)
            unique.append(item)
    
    return unique[skip:skip + limit]


@router.get("/lookup", response_model=FoodLookupResponse)
async def lookup_food_item(
    name: str = Query(..., description="조회할 음식명"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """음식명으로 DB 조회, 없으면 GPT 영양 추정 후 food_item 저장."""
    clean_name = (name or "").strip()
    nutrition, match_type, food_item_id, food_item_source = await resolve_nutrition_for_name(
        db, clean_name
    )
    found_name = None
    skin_factors = None
    if food_item_id:
        food = db.query(FoodItem).filter(FoodItem.id == food_item_id).first()
        found_name = food.name if food else clean_name
        if food and food.skin_factors:
            skin_factors = food.skin_factors
    return FoodLookupResponse(
        found_name=found_name,
        match_type=match_type or "없음",
        nutrition=nutrition,
        food_item_id=food_item_id,
        food_item_source=food_item_source,
        skin_factors=skin_factors,
    )
