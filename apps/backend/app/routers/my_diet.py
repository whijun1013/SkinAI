import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional
from datetime import date, datetime, time

from app.database import get_db

logger = logging.getLogger("diet_log")
from app.deps.auth import get_current_user
from app.models.user import User
from app.models.diet import DietLog, DietLogItem
from app.models.environment import EnvironmentLog
from app.schemas.diet import (
    DietLogCreate,
    DietLogItemCreate,
    DietLogListItemResponse,
    DietLogResponse,
    DietLogUpdate,
    PhotoAnalyzeQuickResponse,
    PhotoAnalyzeResponse,
)
from app.services import food_lookup_service, food_vision_service
from app.services.food_lookup_service import food_item_to_nutrition
from app.services.diet_service import (
    attach_environment_log_for_diet,
    create_diet_log as create_diet_log_service,
)
from app.services.blob_storage import sign_blob_read_url

router = APIRouter(
    prefix="/users/me/diet-logs",
    tags=["식단 기록"]
)

_DIET_LOG_LOAD_OPTIONS = (
    selectinload(DietLog.items).selectinload(DietLogItem.food_item),
)

_NOT_FOOD_RESPONSES = {
    "음식없음",
    "음식 없음",
    "음식 아님",
    "음식아님",
    "음식이 보이지 않음",
    "음식이 없음",
    "없음",
    "모름",
    "unknown",
    "none",
    "not food",
    "no food",
}


def _extract_food_names(log: DietLog) -> list[str]:
    names: list[str] = []
    for item in log.items:
        if item.custom_food_name:
            names.append(item.custom_food_name)
        elif item.food_item is not None and item.food_item.name:
            names.append(item.food_item.name)
    return names


def _extract_list_nutrition(log: DietLog) -> tuple[dict | None, str | None, list | None]:
    """연결된 food_item에서만 영양 추출 (목록 API는 가볍게 유지)."""
    for item in log.items or []:
        food = item.food_item
        if food is None:
            continue
        nutrition = food_item_to_nutrition(food)
        source = (food.source or "").strip()
        if source == "gpt_estimate":
            match_type = "GPT추정"
        elif source == "mfds_api":
            match_type = "공공API"
        elif source:
            match_type = "DB"
        else:
            match_type = None
        skin_factors = food.skin_factors if food.skin_factors else None
        return nutrition, match_type, skin_factors
    return None, None, None


def _to_diet_log_list_item(log: DietLog) -> DietLogListItemResponse:
    nutrition, match_type, skin_factors = _extract_list_nutrition(log)
    return DietLogListItemResponse(
        id=log.id,
        logged_at=log.logged_at,
        meal_type=log.meal_type,
        photo_url=sign_blob_read_url(log.photo_url),
        note=log.note,
        food_names=_extract_food_names(log),
        nutrition=nutrition,
        match_type=match_type,
        skin_factors=skin_factors,
    )


def _to_diet_log_response(log: DietLog) -> DietLogResponse:
    response = DietLogResponse.model_validate(log)
    response.photo_url = sign_blob_read_url(response.photo_url)
    return response


def _diet_logs_query(db: Session, user_id: int):
    return (
        db.query(DietLog)
        .filter(DietLog.user_id == user_id)
        .options(*_DIET_LOG_LOAD_OPTIONS)
    )


def _resolve_diet_items_sync(items: list[DietLogItemCreate] | None) -> list[DietLogItemCreate]:
    """food_item_id가 이미 있거나 custom_food_name이 없는 항목만 통과 — LLM 호출 없음."""
    return list(items or [])




def _attach_environment_log_background(
    *,
    diet_log_id: int,
    user_id: int,
    source: str,
    captured_at,
    lat,
    lng,
    location_name,
) -> None:
    """BackgroundTask: 역지오코딩·날씨 외부 API를 저장 응답 후 비동기 처리."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        attach_environment_log_for_diet(
            db,
            user_id=user_id,
            source=source,
            captured_at=captured_at,
            lat=lat,
            lng=lng,
            location_name=location_name,
            diet_log_id=diet_log_id,
        )
        db.commit()
    except Exception as exc:
        logger.warning("[diet-save] environment_log background failed diet_log_id=%s: %s", diet_log_id, exc)
    finally:
        db.close()


def _needs_diet_enrich(log: DietLog) -> bool:
    """
    food_item_id 보강만 담당 (이름 설정은 프론트 AI 전담).
    - 항목이 있고 food_item_id가 없을 때만 실행
    - 항목이 없으면 실행 안 함 (프론트 updateDietLog 패치를 기다림)
    """
    items = list(log.items or [])
    return bool(items) and any(not item.food_item_id for item in items)




def _enrich_diet_log_items(diet_log_id: int, user_id: int) -> None:
    """
    BackgroundTask: custom_food_name 기준 food_item_id 보강.

    - DB lookup 우선, 없으면 GPT 영양 추정 후 food_item 저장
    - custom_food_name은 절대 건드리지 않음
    """
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        log = (
            db.query(DietLog)
            .options(*_DIET_LOG_LOAD_OPTIONS)
            .filter(DietLog.id == diet_log_id, DietLog.user_id == user_id)
            .first()
        )
        if not log:
            return

        items = list(log.items or [])
        if not items:
            return

        changed = False
        for item in items:
            if item.food_item_id or not item.custom_food_name:
                continue

            # ① 로컬 DB 검색
            _found, _, _, food_item_id, _ = food_lookup_service.lookup(
                db, item.custom_food_name
            )

            # ② DB 미스 → MFDS → GPT 추정
            if not food_item_id:
                food_item_id = asyncio.run(
                    food_lookup_service.resolve_manual_food_item_id(db, item.custom_food_name)
                )

            if food_item_id:
                item.food_item_id = food_item_id
                changed = True
                logger.info(
                    "[diet-enrich] log_id=%s item_id=%s name=%s -> food_item_id=%s",
                    diet_log_id,
                    item.id,
                    item.custom_food_name,
                    food_item_id,
                )

        if changed:
            db.commit()
    except Exception as exc:
        logger.warning("[diet-enrich] log_id=%s 실패: %s", diet_log_id, exc)
    finally:
        db.close()


@router.post("/analyze-photo/quick", response_model=PhotoAnalyzeQuickResponse)
async def analyze_diet_photo_quick(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """1단계: GPT Vision만 — 음식명만 빠르게 반환 (CV·DB lookup 없음)."""
    image_bytes = await file.read()
    print(
        f"[diet-analyze-quick] user_id={current_user.id} bytes={len(image_bytes)}",
        flush=True,
    )
    food_name = await food_vision_service.image_to_food_name_fast(image_bytes)
    clean_name = (food_name or "").strip()
    if not clean_name or clean_name.lower() in _NOT_FOOD_RESPONSES:
        return PhotoAnalyzeQuickResponse(food_name="")
    return PhotoAnalyzeQuickResponse(food_name=clean_name)


@router.post("/analyze-photo", response_model=PhotoAnalyzeResponse)
async def analyze_diet_photo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    image_bytes = await file.read()
    print(
        f"[diet-analyze] user_id={current_user.id} bytes={len(image_bytes)}",
        flush=True,
    )

    food_name, cv_info = await food_vision_service.image_to_food_name(image_bytes)
    clean_name = (food_name or "").strip()
    if not clean_name or clean_name.lower() in _NOT_FOOD_RESPONSES:
        return PhotoAnalyzeResponse(
            food_name="",
            match_type="인식실패",
            nutrition=None,
        )

    nutrition, match_type, food_item_id, food_item_source = (
        await food_lookup_service.resolve_nutrition_for_name(db, clean_name)
    )

    # GPT 인식명 그대로 제안 — DB 매칭명으로 덮어쓰지 않음 (사용자가 최종 입력)
    response_name = clean_name

    ocr_preview = " | ".join((cv_info.get("ocr") or [])[:5])
    print(
        f"[diet-analyze] result={response_name} match={match_type} "
        f"food_item_id={food_item_id} ocr={ocr_preview or '(none)'}",
        flush=True,
    )
    logger.info(
        "[diet-analyze] user_id=%s food=%s match=%s food_item_id=%s",
        current_user.id,
        response_name,
        match_type,
        food_item_id,
    )
    skin_factors = None
    if food_item_id:
        from app.models.diet import FoodItem as _FoodItem
        _food = db.query(_FoodItem).filter(_FoodItem.id == food_item_id).first()
        if _food and _food.skin_factors:
            skin_factors = _food.skin_factors

    return PhotoAnalyzeResponse(
        food_name=response_name,
        match_type=match_type,
        nutrition=nutrition,
        food_item_id=food_item_id,
        food_item_source=food_item_source,
        skin_factors=skin_factors,
    )


@router.post("", response_model=DietLogResponse)
async def create_diet_log(
    log_in: DietLogCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    logger.info(
        "[diet-save] user_id=%s meal=%s method=%s photo=%s lat=%s lng=%s items=%s",
        current_user.id,
        log_in.meal_type,
        log_in.input_method,
        "yes" if log_in.photo_url else "no",
        log_in.captured_lat,
        log_in.captured_lng,
        len(log_in.items or []),
    )
    resolved_items = _resolve_diet_items_sync(log_in.items)

    diet_log = create_diet_log_service(
        db,
        user_id=current_user.id,
        meal_type=log_in.meal_type,
        input_method=log_in.input_method,
        logged_at=log_in.logged_at,
        captured_at=log_in.captured_at,
        photo_url=log_in.photo_url,
        captured_lat=log_in.captured_lat,
        captured_lng=log_in.captured_lng,
        captured_location_name=log_in.captured_location_name,
        note=log_in.note,
        items=resolved_items,
    )

    has_coords = log_in.captured_lat is not None and log_in.captured_lng is not None
    clean_location_name = (
        log_in.captured_location_name.strip() if log_in.captured_location_name else None
    )
    if clean_location_name == "":
        clean_location_name = None

    db.commit()
    db.refresh(diet_log)

    env_captured_at = log_in.captured_at or diet_log.logged_at
    if has_coords or clean_location_name:
        background_tasks.add_task(
            _attach_environment_log_background,
            diet_log_id=diet_log.id,
            user_id=current_user.id,
            source="exif" if has_coords else "manual",
            captured_at=env_captured_at,
            lat=float(log_in.captured_lat) if log_in.captured_lat is not None else None,
            lng=float(log_in.captured_lng) if log_in.captured_lng is not None else None,
            location_name=clean_location_name,
        )

    # food_item_id·이름 보강은 백그라운드에서 — 저장 응답은 즉시 반환
    if _needs_diet_enrich(diet_log):
        background_tasks.add_task(_enrich_diet_log_items, diet_log.id, current_user.id)
        logger.info("[diet-save] enrich 예약 log_id=%s", diet_log.id)

    logger.info(
        "[diet-save] ok id=%s logged_at=%s photo_url=%s",
        diet_log.id,
        diet_log.logged_at,
        (diet_log.photo_url or "")[:80],
    )
    return _to_diet_log_response(diet_log)


@router.get("", response_model=List[DietLogListItemResponse])
def get_diet_logs(
    skip: int = 0,
    limit: int = 100,
    target_date: Optional[date] = Query(None, alias="date", description="특정 날짜 필터 (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = _diet_logs_query(db, current_user.id)
    if target_date:
        day_start = datetime.combine(target_date, time.min)
        day_end = datetime.combine(target_date, time.max)
        query = query.filter(DietLog.logged_at >= day_start, DietLog.logged_at <= day_end)
    logs = query.order_by(DietLog.logged_at.desc()).offset(skip).limit(limit).all()
    return [_to_diet_log_list_item(log) for log in logs]


@router.get("/{log_id}", response_model=DietLogResponse)
def get_diet_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    log = (
        _diet_logs_query(db, current_user.id)
        .filter(DietLog.id == log_id)
        .first()
    )
    if not log:
        raise HTTPException(status_code=404, detail="식단 기록을 찾을 수 없습니다.")
    return _to_diet_log_response(log)


@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diet_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    log = db.query(DietLog).filter(DietLog.id == log_id, DietLog.user_id == current_user.id).first()
    if not log:
        raise HTTPException(status_code=404, detail="식단 기록을 찾을 수 없습니다.")

    photo_urls = [log.photo_url] if log.photo_url else []

    db.delete(log)
    db.commit()

    try:
        from app.database import get_mongo_db
        mongo_db = get_mongo_db()
        await mongo_db.diet_ai_results.delete_many({"diet_log_id": log_id})
    except Exception as exc:
        logger.warning(f"[diet-delete] failed to delete mongo ai results for log_id={log_id}: {exc}")

    try:
        if photo_urls:
            from app.services.blob_storage import delete_blobs
            delete_blobs(photo_urls)
    except Exception as exc:
        logger.warning(f"[diet-delete] failed to delete blobs for log_id={log_id}: {exc}")


@router.put("/{diet_log_id}", response_model=DietLogResponse)
async def update_diet_log(
    diet_log_id: int,
    log_in: DietLogUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    log = (
        _diet_logs_query(db, current_user.id)
        .filter(DietLog.id == diet_log_id)
        .first()
    )
    if not log:
        raise HTTPException(status_code=404, detail="식단 기록을 찾을 수 없습니다.")

    if log_in.meal_type is not None:
        log.meal_type = log_in.meal_type
    if log_in.logged_at is not None:
        log.logged_at = log_in.logged_at
    if log_in.photo_url is not None:
        log.photo_url = log_in.photo_url
    if log_in.note is not None:
        log.note = log_in.note
    if log_in.captured_lat is not None:
        log.captured_lat = log_in.captured_lat
    if log_in.captured_lng is not None:
        log.captured_lng = log_in.captured_lng
    if log_in.captured_location_name is not None:
        log.captured_location_name = log_in.captured_location_name

    if log_in.environment_log_id is not None:
        db.query(EnvironmentLog).filter(EnvironmentLog.diet_log_id == log.id).update({EnvironmentLog.diet_log_id: None})
        if log_in.environment_log_id > 0:
            env_log = db.query(EnvironmentLog).filter(
                EnvironmentLog.id == log_in.environment_log_id,
                EnvironmentLog.user_id == current_user.id
            ).first()
            if not env_log:
                raise HTTPException(status_code=404, detail="지정한 환경 로그를 찾을 수 없습니다.")
            env_log.diet_log_id = log.id

    if log_in.items is not None:
        resolved_items = _resolve_diet_items_sync(log_in.items)
        log.items.clear()
        for item_data in resolved_items:
            new_item = DietLogItem(
                diet_log_id=log.id,
                food_item_id=item_data.food_item_id,
                custom_food_name=item_data.custom_food_name,
                amount=item_data.amount,
                unit=item_data.unit
            )
            log.items.append(new_item)

    db.commit()
    db.refresh(log)

    if _needs_diet_enrich(log):
        background_tasks.add_task(_enrich_diet_log_items, log.id, current_user.id)

    return _to_diet_log_response(log)
