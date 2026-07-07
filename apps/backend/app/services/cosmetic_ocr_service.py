import base64
import io
import json
import logging
import os
import time
from typing import Any, List, Optional

from openai import AsyncOpenAI
from PIL import Image, ImageFilter
from sqlalchemy.orm import Session

from app.services import ai_usage_service
from app.services.food_vision_service import _clean_env, _oai_client, _extract_json_from_gpt_response, _VISION_MODEL

logger = logging.getLogger("cosmetic_ocr")

def _resize_for_ocr(image_bytes: bytes, max_side: int = 1536) -> bytes:
    """OCR용 이미지는 화질이 중요하므로 max_side를 기본 1536으로 둡니다."""
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = img.size
        if max(w, h) > max_side:
            ratio = max_side / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85, optimize=True)
        return buf.getvalue()
    except Exception as e:
        logger.warning("이미지 리사이즈 실패, 원본 사용: %s", e)
        return image_bytes

async def extract_ingredients(db: Session, user_id: int, image_bytes: bytes) -> dict:
    """
    화장품 전성분표 이미지를 분석하여 성분 목록을 반환.
    """
    enable_ocr = _clean_env(os.getenv("ENABLE_COSMETIC_OCR", "false")).lower() in ("true", "1", "yes")
    if not enable_ocr:
        return {"ingredients": [], "confidence": "low", "error": "ocr_disabled"}

    client = None
    try:
        client = _oai_client()
    except Exception:
        return {"ingredients": [], "confidence": "low", "error": "api_key_missing"}

    if not client:
        return {"ingredients": [], "confidence": "low", "error": "api_key_missing"}

    daily_limit = int(os.getenv("COSMETIC_OCR_DAILY_LIMIT_PER_USER", "5"))
    budget_usd = float(os.getenv("COSMETIC_OCR_MONTHLY_BUDGET_USD", "10.0"))

    if not ai_usage_service.check_user_daily_limit(db, user_id, "cosmetic_ocr", daily_limit):
        logger.warning("[cosmetic_ocr] user_id=%s daily limit exceeded.", user_id)
        return {"ingredients": [], "confidence": "low", "error": "daily_limit_exceeded"}

    if not ai_usage_service.check_monthly_budget(db, "cosmetic_ocr", budget_usd):
        logger.warning("[cosmetic_ocr] Global monthly budget exceeded.")
        return {"ingredients": [], "confidence": "low", "error": "monthly_budget_exceeded"}

    prompt = """
You are an expert cosmetic ingredients OCR system.
Look at the photo of the cosmetic product's ingredient list (전성분표) and extract ONLY the list of ingredients.

Rules:
1. Extract the ingredients in the exact order they appear.
2. Ensure you preserve the original language (usually Korean or English). If both are provided, prioritize Korean.
3. Clean up any OCR artifacts, typos, or unnecessary text like "전성분:", "Ingredients:", marketing claims, or instructions.
4. Split the ingredients properly. They are usually separated by commas (,).
5. Output ONLY a valid JSON object.
6. Evaluate your confidence level ("high", "medium", "low"). If the image is blurry, cropped, or not an ingredient list, set confidence to "low".

Output format:
{
  "ingredients": ["정제수", "글리세린", "부틸렌글라이콜", ...],
  "confidence": "high"
}
"""

    image_bytes = _resize_for_ocr(image_bytes)
    img_b64 = base64.b64encode(image_bytes).decode()

    start_time = time.time()

    def _parse_response(content: str) -> dict:
        try:
            content = _extract_json_from_gpt_response(content)
            parsed = json.loads(content)
            ingredients = parsed.get("ingredients", [])
            # 성분 리스트 내의 앞뒤 공백 제거 및 빈 문자열 필터링
            ingredients = [ing.strip() for ing in ingredients if ing.strip()]
            return {
                "ingredients": ingredients,
                "confidence": parsed.get("confidence", "high"),
                "error": None
            }
        except Exception as e:
            logger.warning("Failed to parse OCR GPT response: %s (Raw: %s)", e, content)
            return {"ingredients": [], "confidence": "low", "error": "parse_error"}

    try:
        import openai
        res = await client.chat.completions.create(
            model=_VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                ],
            }],
            max_tokens=800,
            response_format={"type": "json_object"}
        )
        gpt_raw = res.choices[0].message.content.strip()
        latency_ms = int((time.time() - start_time) * 1000)
        usage = res.usage

        # Estimate cost (GPT-4o standard: input $5/1M, output $15/1M roughly)
        est_cost = (usage.prompt_tokens * 0.000005) + (usage.completion_tokens * 0.000015)
        ai_usage_service.record_ai_usage(
            db, user_id, "cosmetic_ocr", "openai",
            usage.prompt_tokens, usage.completion_tokens, est_cost, latency_ms, "success"
        )

        return _parse_response(gpt_raw)
    except openai.BadRequestError as e:
        logger.warning("Vision API Policy Refusal detected in OCR: %s. Retrying with blurred image.", e)
        try:
            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            img = img.filter(ImageFilter.GaussianBlur(radius=5))  # OCR은 블러를 너무 강하게 주면 글씨가 안보이므로 약하게
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85)
            blurred_b64 = base64.b64encode(buf.getvalue()).decode()

            start_time = time.time()
            res = await client.chat.completions.create(
                model=_VISION_MODEL,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{blurred_b64}"}},
                    ],
                }],
                max_tokens=800,
                response_format={"type": "json_object"}
            )
            gpt_raw = res.choices[0].message.content.strip()
            latency_ms = int((time.time() - start_time) * 1000)
            usage = res.usage
            est_cost = (usage.prompt_tokens * 0.000005) + (usage.completion_tokens * 0.000015)
            ai_usage_service.record_ai_usage(
                db, user_id, "cosmetic_ocr", "openai",
                usage.prompt_tokens, usage.completion_tokens, est_cost, latency_ms, "fallback"
            )
            return _parse_response(gpt_raw)
        except Exception as retry_e:
            logger.warning("블러 처리 후 재시도 실패: %s", retry_e)
            ai_usage_service.record_ai_usage(db, user_id, "cosmetic_ocr", "openai", 0, 0, 0, 0, "failed", str(retry_e)[:50])
            return {"ingredients": [], "confidence": "low", "error": "api_error"}
    except Exception as e:
        logger.warning("Cosmetic OCR 오류: %s", e)
        ai_usage_service.record_ai_usage(db, user_id, "cosmetic_ocr", "openai", 0, 0, 0, 0, "failed", str(e)[:50])
        return {"ingredients": [], "confidence": "low", "error": "api_error"}
