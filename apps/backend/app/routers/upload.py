"""
이미지 업로드 Router
"""

import io
import logging
import os
from datetime import datetime
from uuid import uuid4
from typing import Optional

from PIL import Image as PilImage

# HEIC/HEIF 지원 (iOS 고효율 이미지 포맷)
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

logger = logging.getLogger("upload")

MAX_IMAGE_SIDE = 1200
JPEG_QUALITY = 85


def compress_image(file_content: bytes) -> bytes:
    """긴 변 기준 MAX_IMAGE_SIDE 이하로 리사이즈하고 JPEG 85%로 압축."""
    img = PilImage.open(io.BytesIO(file_content))

    # EXIF orientation 보정
    try:
        from PIL import ImageOps
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass

    # 알파 채널 제거 (JPEG 저장 전)
    if img.mode in ("RGBA", "P", "LA"):
        bg = PilImage.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # 리사이즈
    w, h = img.size
    if max(w, h) > MAX_IMAGE_SIDE:
        if w >= h:
            new_w, new_h = MAX_IMAGE_SIDE, int(h * MAX_IMAGE_SIDE / w)
        else:
            new_w, new_h = int(w * MAX_IMAGE_SIDE / h), MAX_IMAGE_SIDE
        img = img.resize((new_w, new_h), PilImage.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    compressed = buf.getvalue()
    logger.info("[compress] %d KB → %d KB", len(file_content) // 1024, len(compressed) // 1024)
    return compressed

from sqlalchemy import func
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.user import User
from app.models.skin_log import SkinLog
from app.models.diet import DietLog

from app.services.blob_storage import blob_service_client, build_blob_url, sign_blob_read_url
from app.services.image_quality_service import validate_skin_photo

router = APIRouter(prefix="/upload", tags=["upload"])

# ===== 헬퍼 함수 =====

def upload_to_blob_storage(file_content: bytes, container_name: str, blob_name: str) -> str:
    if not blob_service_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Azure Blob Storage가 설정되지 않았습니다. AZURE_STORAGE_CONNECTION_STRING을 확인하세요."
        )
    try:
        container_client = blob_service_client.get_container_client(container_name)
        blob_client = container_client.get_blob_client(blob_name)
        blob_client.upload_blob(file_content, overwrite=True)
        return build_blob_url(container_name, blob_name)
    except Exception as e:
        raise Exception(f"Azure Blob 업로드 실패: {str(e)}")


def generate_filename(user_id: int, log_type: str, meal_type: Optional[str] = None) -> str:
    today = datetime.now().strftime("%Y%m%d")
    unique_id = str(uuid4()).split('-')[0]
    
    if log_type == 'skin':
        return f"{user_id}_skin_{today}_{unique_id}.jpg"
    elif log_type == 'diet':
        return f"{user_id}_diet_{today}_{meal_type}_{unique_id}.jpg"
    else:
        raise ValueError(f"유효하지 않은 log_type: {log_type}")


async def validate_image_file(file: UploadFile) -> bytes:
    # content_type은 React Native/iOS 환경에서 신뢰할 수 없으므로 로그만 남김
    logger.info("[validate] content_type=%s filename=%s", file.content_type, file.filename)

    file_content = await file.read()
    if len(file_content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="파일 크기는 10MB 이하여야 합니다"
        )

    # PIL로 실제 이미지 파일인지 검증 (HEIC 포함 모든 PIL 지원 포맷 허용)
    try:
        img = PilImage.open(io.BytesIO(file_content))
        detected_format = img.format  # 헤더만 읽어 포맷 감지
        logger.info("[validate] detected_format=%s", detected_format)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="유효한 이미지 파일만 업로드 가능합니다 (JPG, PNG, HEIC 등)"
        )

    return file_content


# ===== 엔드포인트 =====

@router.post("/skin-log/image")
async def upload_skin_image(
    user_id: int,
    file: UploadFile = File(...),
    create_log: bool = Query(
        False,
        description="true면 skin_log를 즉시 생성. false면 Blob URL만 반환 (확정 저장은 /users/me/skin-log)",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> dict:
    """피부 사진 업로드"""
    logger.info(
        "[skin-upload] user_id=%s create_log=%s filename=%s",
        user_id,
        create_log,
        file.filename,
    )
    try:
        if current_user.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="다른 사용자의 데이터를 업로드할 수 없습니다"
            )

        file_content = await validate_image_file(file)
        
        file_content = compress_image(file_content)
        
        # 이미지 품질 평가 (압축 및 포맷 변환된 JPEG 기준, HEIC 지원)
        quality_result = validate_skin_photo(file_content)
        if quality_result.warning:
            logger.warning(f"[skin-upload] quality warning: {quality_result.warning}")
            
        full_filename = generate_filename(user_id, 'skin')

        image_url = upload_to_blob_storage(
            file_content=file_content,
            container_name="skin-img",
            blob_name=full_filename
        )
        
        response = {
            "imageUrl": sign_blob_read_url(image_url),
            "filename": full_filename,
            "message": "피부 사진이 업로드되었습니다",
            "skinLogId": None,
            "qualityWarning": quality_result.warning,
            "qualityStatus": quality_result.status,
            "qualityReasonCode": quality_result.reason_code,
        }

        if create_log:
            today = datetime.now().date()
            skin_log = db.query(SkinLog).filter(
                SkinLog.user_id == user_id,
                SkinLog.logged_at == today
            ).first()

            if skin_log:
                skin_log.photo_url = image_url
                skin_log.quality_check_passed = quality_result.is_valid
                skin_log.quality_warning = quality_result.warning
            else:
                skin_log = SkinLog(
                    user_id=user_id,
                    logged_at=today,
                    photo_url=image_url,
                    quality_check_passed=quality_result.is_valid,
                    quality_warning=quality_result.warning,
                    created_at=datetime.now()
                )
                db.add(skin_log)
            db.commit()
            db.refresh(skin_log)
            response["skinLogId"] = skin_log.id


        logger.info(
            "[skin-upload] ok blob=%s skin_log_id=%s",
            image_url[:80] + "..." if len(image_url) > 80 else image_url,
            response["skinLogId"],
        )
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[skin-upload] failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"피부 사진 업로드 중 오류: {str(e)}"
        )


@router.post("/diet-log/image")
async def upload_diet_image(
    user_id: int,
    meal_type: str = Query(..., description="breakfast/lunch/dinner/snack"),
    file: UploadFile = File(...),
    create_log: bool = Query(
        False,
        description="true면 diet_log를 즉시 생성. false면 Blob URL만 반환 (확정 저장은 /users/me/diet-logs)",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> dict:
    """식단 사진 업로드"""
    logger.info(
        "[diet-upload] user_id=%s meal_type=%s create_log=%s filename=%s",
        user_id,
        meal_type,
        create_log,
        file.filename,
    )
    try:
        # meal_type 한글 변환 맵
        meal_type_korean = {
            'breakfast': '아침',
            'lunch': '점심',
            'dinner': '저녁',
            'snack': '간식'
        }
        
        # 1️⃣ 사용자 검증
        if current_user.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="다른 사용자의 데이터를 업로드할 수 없습니다"
            )
        
        # 2️⃣ meal_type 검증
        valid_meal_types = ['breakfast', 'lunch', 'dinner', 'snack']
        if meal_type not in valid_meal_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"유효한 meal_type: {valid_meal_types}"
            )
        
        # 3️⃣ 파일 검증 + 압축
        file_content = await validate_image_file(file)
        logger.info("[diet-upload] file_bytes=%s", len(file_content))
        file_content = compress_image(file_content)

        # 4️⃣ 파일명 생성
        full_filename = generate_filename(user_id, 'diet', meal_type)
        
        # 5️⃣ Azure Blob에 업로드
        image_url = upload_to_blob_storage(
            file_content=file_content,
            container_name="food-img",
            blob_name=full_filename
        )
        
        response = {
            "imageUrl": sign_blob_read_url(image_url),
            "filename": full_filename,
            "message": f"{meal_type_korean[meal_type]} 사진이 업로드되었습니다",
            "mealType": meal_type,
            "dietLogId": None,
        }

        if create_log:
            now = datetime.now()
            diet_log = DietLog(
                user_id=user_id,
                logged_at=now,
                meal_type=meal_type_korean[meal_type],
                photo_url=image_url,
                input_method="photo",
                created_at=now,
            )
            db.add(diet_log)
            db.commit()
            db.refresh(diet_log)
            response["dietLogId"] = diet_log.id

        logger.info(
            "[diet-upload] ok container=food-img blob=%s diet_log_id=%s",
            image_url[:80] + "..." if len(image_url) > 80 else image_url,
            response["dietLogId"],
        )
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[diet-upload] failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"식단 사진 업로드 중 오류: {str(e)}"
        )
