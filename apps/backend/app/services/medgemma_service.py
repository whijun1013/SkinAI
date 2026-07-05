import io
import json
import logging
import os
from pathlib import Path
from typing import Any

from google import genai

logger = logging.getLogger(__name__)

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

SKIN_ANALYSIS_PROMPT = """You are an expert in skin photo analysis.
Analyze the provided skin photo and respond in the following JSON format:

{
  "signals": {
    "active_lesion": 0|1|2|3,  // breakouts (0=none, 3=severe)
    "redness": 0|1|2|3,        // redness/erythema
    "barrier": 0|1|2|3         // dead skin/skin barrier
  },
  "confidence": "low"|"medium"|"high",
  "primary_visual_summary": "1-2 sentence summary in Korean",
  "usable": true|false,
  "photo_quality": "pass"|"fail",
  "display_summary": "User-friendly summary in Korean"
}

Notes:
- This is an analysis of skin concerns, not a medical diagnosis.
- Use beauty/wellness terms such as "breakouts" or "redness".
- Do not use medical terms like "acne", "diagnosis", or "treatment".
- "primary_visual_summary" and "display_summary" must be written in Korean.
- Return ONLY valid JSON. Do not include markdown blocks.
"""

SIGNAL_KEYS = ("active_lesion", "redness", "barrier")

SIGNAL_LEVELS = {
    "none": 0,
    "mild": 1,
    "moderate": 2,
    "severe": 3,
}

SIGNAL_LABELS = {
    "active_lesion": "트러블",
    "redness": "염증성 홍반",
    "barrier": "각질/피부 장벽",
}

def _crop_skin_region(image_bytes: bytes) -> bytes:
    """
    MediaPipe Face Detector로 볼 영역을 크롭합니다.
    모델이 없거나 얼굴 탐지에 실패하면 원본을 그대로 반환합니다(fallback).
    """
    try:
        model_path = os.getenv("MEDIAPIPE_FACE_DETECTOR_MODEL")
        if not model_path:
            return image_bytes
        if not os.path.isabs(model_path):
            base_dir = Path(__file__).resolve().parent.parent.parent
            model_path = str(base_dir / model_path)
        if not os.path.isfile(model_path):
            return image_bytes

        import numpy as np
        import cv2
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision
        from PIL import Image as PilImage

        img_pil = PilImage.open(io.BytesIO(image_bytes)).convert("RGB")
        img_np = np.array(img_pil)
        img_cv = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        rgb = cv2.cvtColor(img_cv, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        options = mp_vision.FaceDetectorOptions(
            base_options=mp_python.BaseOptions(model_asset_path=model_path),
            min_detection_confidence=0.5,
        )
        with mp_vision.FaceDetector.create_from_options(options) as detector:
            result = detector.detect(mp_image)

        if not result.detections:
            logger.info("[skin_crop] No face detected; using original image.")
            return image_bytes

        det = result.detections[0]
        bb = det.bounding_box
        h, w = img_np.shape[:2]
        x1 = max(0, bb.origin_x)
        y1 = max(0, bb.origin_y)
        x2 = min(w, bb.origin_x + bb.width)
        y2 = min(h, bb.origin_y + bb.height)

        # 볼 영역 = 하단 2/3 (이마 제외)
        y1_cheek = y1 + (y2 - y1) // 3
        crop = img_np[y1_cheek:y2, x1:x2]
        if crop.size == 0:
            return image_bytes

        buf = io.BytesIO()
        PilImage.fromarray(crop).save(buf, format="JPEG", quality=90)
        logger.info("[skin_crop] Cropped to cheek region (%dx%d)", x2 - x1, y2 - y1_cheek)
        return buf.getvalue()

    except Exception as exc:
        logger.warning("[skin_crop] Failed, using original: %s", exc)
        return image_bytes


def analyze_skin_photo(image_bytes: bytes) -> dict[str, Any]:
    """
    피부 사진 분석 (Vision Analysis).
    SKIN_ANALYSIS_PROVIDER 환경 변수에 따라 동작 (gemini, openai, disabled).
    API 키가 없거나 disabled 일 경우 분석하지 않고 기본 스키마 반환.
    Vision API Safety Block 방지를 위해 MediaPipe로 볼 영역을 크롭한 뒤 전송합니다.
    """
    provider = os.getenv("SKIN_ANALYSIS_PROVIDER", "gemini").lower()

    if provider == "disabled":
        return _build_disabled_result()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("Vision API key is not configured. Falling back to disabled state.")
        return _build_disabled_result()

    # Safety Block 방지: 얼굴 전체 대신 볼 영역 크롭 이미지 전송
    send_bytes = _crop_skin_region(image_bytes)

    client = genai.Client(api_key=api_key)

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                SKIN_ANALYSIS_PROMPT,
                {"mime_type": "image/jpeg", "data": send_bytes}
            ],
            config={"response_mime_type": "application/json"},
        )
        result = json.loads(response.text)
    except Exception as e:
        logger.error(f"Vision API analysis failed: {e}")
        return _build_disabled_result(failed=True)

    # 스키마 검증 및 기본값 보정
    signals = result.get("signals", {})
    for key in SIGNAL_KEYS:
        if key not in signals:
            signals[key] = 0
        signals[key] = min(3, max(0, int(signals[key])))

    result["signals"] = signals
    result.setdefault("confidence", "medium")
    result.setdefault("usable", True)
    result.setdefault("photo_quality", "pass")
    result.setdefault("primary_visual_summary", "분석 결과를 불러오지 못했습니다.")

    return result

def _build_disabled_result(failed: bool = False) -> dict[str, Any]:
    return {
        "signals": {k: 0 for k in SIGNAL_KEYS},
        "confidence": "low",
        "primary_visual_summary": "사진 분석이 현재 비활성화되어 있거나 설정되지 않았습니다." if not failed else "사진 기반 피부 분석에 실패했습니다.",
        "usable": True,
        "photo_quality": "pass",
        "display_summary": "사진 분석이 현재 비활성화되어 있거나 설정되지 않았습니다." if not failed else "사진 기반 피부 분석에 실패했습니다."
    }

def _legacy_score_to_label(value: Any) -> str | None:
    """기존 0~10 정수 신호를 새 4등급 라벨로 읽기 위한 호환 변환."""
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    if value == 0:
        return "none"
    if 1 <= value <= 3:
        return "mild"
    if 4 <= value <= 6:
        return "moderate"
    if 7 <= value <= 10:
        return "severe"
    return None

def signal_label_to_score(label: str) -> int | None:
    """4등급 문자열 라벨을 0~3 정수로 변환. 유효하지 않은 값은 None 반환."""
    return SIGNAL_LEVELS.get(label)

def signal_value_to_score(value: Any) -> int | None:
    """MongoDB 라벨 또는 기존 0~10 정수 신호를 분석용 0~3으로 변환."""
    if isinstance(value, str):
        return signal_label_to_score(value)
    legacy_label = _legacy_score_to_label(value)
    return signal_label_to_score(legacy_label) if legacy_label is not None else None

def extract_signal_labels(result: dict[str, Any]) -> dict[str, str]:
    """MedGemma 결과를 canonical 4등급 라벨로 정규화한다."""
    labels: dict[str, str] = {}

    for key in SIGNAL_KEYS:
        value = result.get(key)
        if isinstance(value, str) and value in SIGNAL_LEVELS:
            labels[key] = value

    stored = result.get("signals") or {}
    if isinstance(stored, dict):
        for key in SIGNAL_KEYS:
            if key in labels:
                continue
            value = stored.get(key)
            if isinstance(value, str) and value in SIGNAL_LEVELS:
                labels[key] = value
                continue
            legacy_label = _legacy_score_to_label(value)
            if legacy_label is not None:
                labels[key] = legacy_label

    for key in SIGNAL_KEYS:
        if key in labels:
            continue
        legacy_label = _legacy_score_to_label(result.get(key))
        if legacy_label is not None:
            labels[key] = legacy_label

    return labels

def _parse_signals(result: dict[str, Any]) -> dict[str, int]:
    """신호값을 추출해 {key: 0~3 정수} 딕셔너리로 반환."""
    signals = result.get("signals", {})
    if signals and all(isinstance(signals.get(k), int) for k in SIGNAL_KEYS):
        return {k: signals.get(k, 0) for k in SIGNAL_KEYS}
        
    return {
        key: SIGNAL_LEVELS[label]
        for key, label in extract_signal_labels(result).items()
    }

def build_medgemma_handoff_payload(result: dict[str, Any] | None) -> dict[str, Any] | None:
    if not result:
        return None
    if result.get("recommendation") == "reject":
        return None
    if result.get("usable") is False or result.get("usable_for_skin_observation") is False:
        return None
    if result.get("photo_quality") == "fail":
        return None

    signals = _parse_signals(result)
    if not signals:
        return None

    payload = dict(result)
    payload["signals"] = signals
    payload["photo_quality"] = payload.get("photo_quality", "pass")
    payload["model_version"] = payload.get("model_version", payload.get("model", "medgemma-v1"))
    return payload


def _score_label(score: int) -> str:
    if score == 0:
        return "없음"
    if score == 1:
        return "약한"
    if score == 2:
        return "중간 수준의"
    return "심한"

def build_medgemma_display_summary(result: dict[str, Any] | None) -> str | None:
    """모바일 표시용 한 줄 요약 생성."""
    if not result:
        return None
    if result.get("photo_quality") == "fail":
        return "사진 품질 제한으로 사진 기반 피부 분석 결과를 제공하기 어렵습니다."

    signals = _parse_signals(result)
    if not signals:
        return None

    # moderate(2) 이상만 유의미한 신호로 표시
    significant = [
        (SIGNAL_LABELS[key], signals[key])
        for key in SIGNAL_KEYS
        if signals.get(key, 0) >= 2
    ]

    if not significant:
        return "업로드된 사진에서는 뚜렷한 피부 신호가 관찰되지 않았습니다."

    if len(significant) == 1:
        label, score = significant[0]
        return f"업로드된 사진에서 {_score_label(score)} {label} 신호가 관찰되었습니다."

    names = [s[0] for s in significant]
    joined = ", ".join(names[:-1]) + f" 및 {names[-1]}"
    return f"업로드된 사진에서 {joined} 신호가 관찰되었습니다."

def _score_to_level_label(score: int) -> str:
    if score == 0:
        return "없음"
    if score == 1:
        return "경미함"
    if score == 2:
        return "중간"
    return "심함"

def build_user_facing_observations(result: dict[str, Any] | None) -> dict[str, Any]:
    """모바일 표시용 신호별 상세 정보 생성."""
    if not result:
        return {}

    signals = _parse_signals(result)
    if not signals:
        return {}

    return {
        key: {
            "key": key,
            "label": SIGNAL_LABELS[key],
            "score": signals.get(key, 0),
            "level_label": _score_to_level_label(signals.get(key, 0)),
        }
        for key in SIGNAL_KEYS
    }

def get_medgemma_prompt() -> str:
    """로컬 MedGemma 모델을 위한 프롬프트 반환."""
    return SKIN_ANALYSIS_PROMPT

def extract_json(text: str) -> dict[str, Any]:
    """텍스트에서 JSON 블록을 추출하여 파싱한다."""
    text = text.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.error(f"Failed to parse JSON from text: {text}")
        return {}
