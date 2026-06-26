import io
import os
import logging
from pathlib import Path
import cv2
import numpy as np
from PIL import Image as PilImage
from typing import Literal, Optional, Tuple
from pydantic import BaseModel

logger = logging.getLogger("image_quality")

class ValidationResult(BaseModel):
    is_valid: bool
    warning: Optional[str] = None
    status: Literal["pass", "fail", "unknown"] = "pass"
    reason_code: Optional[str] = None

MIN_SIDE = 256
BLUR_THRESHOLD = 10.0 # MVP Laplacian variance threshold (완화됨: < 10~20)
UNDER_EXPOSED_THRESH = 0.5 # if 50% of pixels are < 20
OVER_EXPOSED_THRESH = 0.5 # if 50% of pixels are > 240


def _fail_closed() -> bool:
    return os.getenv("IMAGE_QUALITY_FAIL_CLOSED", "true").lower() in {"1", "true", "yes", "on"}


def _unknown_result(warning: str, reason_code: str) -> ValidationResult:
    return ValidationResult(
        is_valid=not _fail_closed(),
        warning=warning,
        status="unknown",
        reason_code=reason_code,
    )

def _get_mediapipe_model_path() -> Optional[str]:
    model_path = os.getenv("MEDIAPIPE_FACE_DETECTOR_MODEL")
    if not model_path:
        return None
        
    if not os.path.isabs(model_path):
        # Resolve relative to apps/backend (which is the parent of app/services)
        base_dir = Path(__file__).resolve().parent.parent.parent
        model_path = str(base_dir / model_path)
        
    return model_path

def _detect_face_with_mediapipe(img_cv: np.ndarray, model_path: str) -> Tuple[bool, Optional[str]]:
    """
    MediaPipe를 이용해 정면 얼굴을 탐지합니다.
    - return (얼굴있음여부, 경고/에러메시지)
    
    [동시성 주의사항]
    MediaPipe Python Tasks API의 FaceDetector는 thread-safe하지 않으므로, 
    FastAPI의 멀티스레드 환경(sync def 라우터나 BackgroundTasks)에서 
    단일 전역 인스턴스(Global Cache)를 공유하면 충돌이 발생할 수 있습니다. 
    따라서 현재는 호출 시마다 인스턴스를 생성하도록 안전하게 구성했습니다.
    추후 성능 최적화가 필요하다면 threading.local() 기반 캐싱 풀입이 필요합니다.
    """
    if not os.path.isfile(model_path):
        # 모델 경로가 설정되었으나 파일이 없는 경우
        logger.warning(f"MediaPipe model file not found at: {model_path}")
        return True, "얼굴 탐지 모델 파일이 없어 탐지를 건너뛰었습니다."
        
    try:
        import mediapipe as mp
        from mediapipe.tasks import python
        from mediapipe.tasks.python import vision
    except ImportError as e:
        logger.error(f"MediaPipe import failed: {e}")
        return True, "얼굴 탐지 라이브러리(MediaPipe) 로드에 실패하여 탐지를 건너뛰었습니다."
        
    try:
        rgb = cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        options = vision.FaceDetectorOptions(
            base_options=python.BaseOptions(model_asset_path=model_path),
            min_detection_confidence=0.5,
        )
        with vision.FaceDetector.create_from_options(options) as detector:
            result = detector.detect(mp_image)
            
        if not result.detections:
            return False, "정면 얼굴이 충분히 인식되지 않았습니다. 얼굴 전체가 나오도록 다시 촬영해주세요."
            
        return True, None
    except Exception as e:
        logger.exception(f"MediaPipe face detection failed during execution: {e}")
        return True, "얼굴 인식 검사를 완료하지 못했습니다. 잠시 후 다시 시도해주세요."

def validate_skin_photo(file_content: bytes) -> ValidationResult:
    """
    Pillow와 OpenCV, MediaPipe를 이용해 피부 사진(정면 얼굴 포함) 품질을 검증합니다.
    - 사진 품질 검사 (Pillow, OpenCV)
    - 정면 얼굴 검출 (MediaPipe Face Detector)
    """
    try:
        # 1. Pillow: 파일 포맷 및 해상도 검사
        img_pil = PilImage.open(io.BytesIO(file_content))
        w, h = img_pil.size
        if w < MIN_SIDE or h < MIN_SIDE:
            return ValidationResult(
                is_valid=False,
                warning="사진 해상도가 너무 작습니다. (최소 256x256 이상 필요)",
                status="fail",
                reason_code="resolution_too_small",
            )
            
        # 2. OpenCV: Blur 및 노출도 검사 (Pillow 이미지를 BGR로 변환하여 HEIC 지원 유지)
        img_rgb = img_pil.convert("RGB")
        img_cv = np.array(img_rgb)
        img_cv = cv2.cvtColor(img_cv, cv2.COLOR_RGB2BGR)
        
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        
        # Blur 점수 계산
        blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
        if blur_score < BLUR_THRESHOLD:
            return ValidationResult(
                is_valid=False,
                warning="사진이 너무 흐립니다. 초점을 맞춰 다시 촬영해주세요.",
                status="fail",
                reason_code="blurred",
            )
            
        # 노출 불량 계산
        pixels = gray.size
        underexposed = np.sum(gray < 20)
        overexposed = np.sum(gray > 240)
        
        if (underexposed / pixels) > UNDER_EXPOSED_THRESH:
            return ValidationResult(
                is_valid=False,
                warning="사진이 너무 어둡습니다. 밝은 곳에서 촬영해주세요.",
                status="fail",
                reason_code="underexposed",
            )
            
        if (overexposed / pixels) > OVER_EXPOSED_THRESH:
            return ValidationResult(
                is_valid=False,
                warning="사진이 너무 밝습니다(빛 반사). 조명을 조절해주세요.",
                status="fail",
                reason_code="overexposed",
            )
            
        # 3. MediaPipe: 얼굴 탐지
        model_path = _get_mediapipe_model_path()
        if model_path:
            face_detected, warning_msg = _detect_face_with_mediapipe(img_cv, model_path)
            if not face_detected:
                return ValidationResult(
                    is_valid=False,
                    warning=warning_msg,
                    status="fail",
                    reason_code="face_not_detected",
                )
            if warning_msg:
                return _unknown_result(warning_msg, "face_detection_unavailable")
        else:
            warning = "얼굴 탐지 모델이 설정되지 않아 얼굴 방향/가림 검증을 완료하지 못했습니다."
            logger.warning(warning)
            return _unknown_result(warning, "face_detector_not_configured")
            
        return ValidationResult(is_valid=True, status="pass")
        
    except Exception as e:
        logger.exception(f"Image quality validation failed: {e}")
        return _unknown_result("사진 품질 검사를 완료하지 못했습니다. 잠시 후 다시 시도해주세요.", "quality_check_error")
