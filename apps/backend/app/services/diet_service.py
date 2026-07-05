import logging
from datetime import datetime, timezone, timedelta
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.diet import DietLog, DietLogItem
from app.schemas.diet import DietLogItemCreate
from app.services.environment_service import (
    create_environment_log_from_capture,
    normalize_to_kst_naive,
    get_kst_timezone,
)
from app.services.blob_storage import normalize_blob_storage_url

logger = logging.getLogger("diet_service")


def attach_environment_log_for_diet(
    db: Session,
    *,
    user_id: int,
    source: str,
    captured_at: datetime,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    location_name: Optional[str] = None,
    diet_log_id: int,
) -> None:
    """식단 저장과 같은 DB 세션·트랜잭션에서 환경 로그 생성 (실패해도 식단 저장은 유지)."""
    try:
        create_environment_log_from_capture(
            db=db,
            user_id=user_id,
            source=source,
            captured_at=captured_at,
            lat=lat,
            lng=lng,
            location_name=location_name,
            diet_log_id=diet_log_id,
        )
        logger.info(
            "[diet-save] environment_log ok diet_log_id=%s source=%s",
            diet_log_id,
            source,
        )
    except Exception as exc:
        logger.warning(
            "[diet-save] environment_log failed diet_log_id=%s: %s",
            diet_log_id,
            exc,
        )


def create_diet_log(
    db: Session,
    *,
    user_id: int,
    meal_type: str,
    input_method: str,
    logged_at: Optional[datetime] = None,
    captured_at: Optional[datetime] = None,
    photo_url: Optional[str] = None,
    captured_lat: Optional[float] = None,
    captured_lng: Optional[float] = None,
    captured_location_name: Optional[str] = None,
    note: Optional[str] = None,
    items: Optional[Iterable[DietLogItemCreate]] = None,
) -> DietLog:
    # 1. Normalize input datetimes to KST naive datetimes
    normalized_logged_at = normalize_to_kst_naive(logged_at)
    normalized_captured_at = normalize_to_kst_naive(captured_at)

    # 2. Determine resolved logged time (DietLog.logged_at)
    # Priority policy:
    # - logged_at이 오면 (기록 탭 선택일·홈 오늘) 항상 우선 — EXIF 날짜와 분리
    # - photo이고 logged_at 없으면 captured_at(EXIF) 사용 (하위 호환)
    # - manual은 logged_at 우선
    if normalized_logged_at is not None:
        resolved_logged_at = normalized_logged_at
    elif input_method == "photo":
        resolved_logged_at = normalized_captured_at or datetime.now(get_kst_timezone()).replace(tzinfo=None)
    else:
        resolved_logged_at = datetime.now(get_kst_timezone()).replace(tzinfo=None)

    clean_location_name = captured_location_name.strip() if captured_location_name else None
    if not clean_location_name:
        clean_location_name = None
    elif len(clean_location_name) > 100:
        clean_location_name = clean_location_name[:100]

    clean_note = note.strip() if note else None
    if not clean_note:
        clean_note = None
    elif len(clean_note) > 1000:
        clean_note = clean_note[:1000]

    diet_log = DietLog(
        user_id=user_id,
        logged_at=resolved_logged_at,
        meal_type=meal_type,
        input_method=input_method,
        photo_url=normalize_blob_storage_url(photo_url),
        captured_lat=captured_lat,
        captured_lng=captured_lng,
        captured_location_name=clean_location_name,
        note=clean_note,
    )
    db.add(diet_log)
    db.flush()

    for item in items or []:
        # Skip invalid items or clamp custom name to 255 chars
        clean_custom_name = item.custom_food_name.strip() if item.custom_food_name else None
        if not clean_custom_name:
            clean_custom_name = None
        elif len(clean_custom_name) > 255:
            clean_custom_name = clean_custom_name[:255]

        if not item.food_item_id and not clean_custom_name:
            continue

        db.add(
            DietLogItem(
                diet_log_id=diet_log.id,
                food_item_id=item.food_item_id,
                custom_food_name=clean_custom_name,
                amount=item.amount,
                unit=item.unit,
            )
        )

    # EnvironmentLog는 라우터에서 attach_environment_log_for_diet로 동기 생성
    return diet_log
