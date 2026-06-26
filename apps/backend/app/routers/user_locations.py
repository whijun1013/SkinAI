from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.deps.auth import get_current_user
from app.models.user import User
from app.models.location import UserLocation
from app.schemas.location import UserLocationCreate, UserLocationResponse

router = APIRouter(prefix="/users/me/locations", tags=["사용자 위치"])

@router.post("", response_model=UserLocationResponse)
def upsert_user_location(
    location_in: UserLocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # upsert: 해당 location_type(home/work)이 있으면 업데이트, 없으면 신규 생성
    loc = db.query(UserLocation).filter(
        UserLocation.user_id == current_user.id,
        UserLocation.location_type == location_in.location_type
    ).first()

    if loc:
        loc.location_name = location_in.location_name
        loc.lat = location_in.lat
        loc.lng = location_in.lng
    else:
        loc = UserLocation(
            user_id=current_user.id,
            location_type=location_in.location_type,
            location_name=location_in.location_name,
            lat=location_in.lat,
            lng=location_in.lng
        )
        db.add(loc)
    
    db.commit()
    db.refresh(loc)
    return loc

@router.get("", response_model=List[UserLocationResponse])
def get_user_locations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(UserLocation).filter(UserLocation.user_id == current_user.id).all()

@router.get("/{location_type}", response_model=UserLocationResponse)
def get_user_location_by_type(
    location_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if location_type not in ["home", "work"]:
        raise HTTPException(status_code=400, detail="유효하지 않은 위치 타입입니다. 'home' 또는 'work'여야 합니다.")
    
    loc = db.query(UserLocation).filter(
        UserLocation.user_id == current_user.id,
        UserLocation.location_type == location_type
    ).first()
    if not loc:
        raise HTTPException(status_code=404, detail=f"등록된 {location_type} 위치 정보가 없습니다.")
    return loc

@router.delete("/{location_type}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_location(
    location_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if location_type not in ["home", "work"]:
        raise HTTPException(status_code=400, detail="유효하지 않은 위치 타입입니다. 'home' 또는 'work'여야 합니다.")
        
    loc = db.query(UserLocation).filter(
        UserLocation.user_id == current_user.id,
        UserLocation.location_type == location_type
    ).first()
    if not loc:
        raise HTTPException(status_code=404, detail=f"삭제할 {location_type} 위치 정보가 없습니다.")
    db.delete(loc)
    db.commit()
