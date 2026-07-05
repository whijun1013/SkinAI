"""
2단계: GPT 음식 인식, 영양 추정

사진 → 음식명 인식 + 영양 추정 서비스 (OpenAI / Gemini)

FastAPI async 환경에 맞춰 httpx.AsyncClient + AsyncOpenAI 사용.
"""

import io
import logging
import os
import json
import base64
from typing import Optional

from PIL import Image

import httpx
from openai import AsyncOpenAI

logger = logging.getLogger("food_vision")

# ── 환경 변수 ────────────────────────────────────────────────────────────────

def _clean_env(val: str | None) -> str:
    return (val or "").strip().strip('"').strip("'")


_OAI_KEY = _clean_env(os.getenv("OPENAI_API_KEY"))
_VISION_MODEL = os.getenv("OPENAI_VISION_MODEL", "gpt-4o")
_CHAT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

_FOODSAFETY_API_KEY = _clean_env(os.getenv("FOODSAFETY_API_KEY"))
# 식품안전나라 Open API: http://openapi.foodsafetykorea.go.kr/api/{key}/I2790/json/{start}/{end}
_FOODSAFETY_BASE_URL = "http://openapi.foodsafetykorea.go.kr/api"
_FOODSAFETY_SERVICE_ID = "I2790"

NutritionDict = dict[str, Optional[float]]

def _oai_client() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=_OAI_KEY)


# ── Step 1: GPT 음식명 인식 ──────────────────────────────────────────────────

async def recognize_food(image_bytes: bytes) -> str:
    """
    이미지를 GPT에 전달해 음식명을 한국어로 반환.
    """
    if not _OAI_KEY:
        return ""

    prompt = """
Look at the photo and tell me the name of the food in Korean.

Rules:
1. If there is no food in the photo, you MUST return an empty string (""). Never explain anything.
2. If it is a packaged food product, return the exact product name written on the packaging.
3. If the product name or brand is visible on the packaging, do not invent or modify the product name.
4. Only when a brand is visually distinct and recognizable, return "Brand + Menu name". For example, if you see the characteristic cheese seasoning powder of BHC Bburinkle, return "BHC 뿌링클".
4-1. If the visual characteristics of a specific brand's menu are extremely strong, return the most likely "Brand + Menu name" even if the brand name is not directly visible.

Examples:
- Chicken with lots of yellow cheese seasoning + green parsley powder -> BHC 뿌링클
- Wing/stick chicken coated in soy sauce -> 교촌 허니콤보
- Golden fried chicken -> BBQ 황금올리브치킨
- Tteokbokki with red sauce and lots of cheese topping -> 치즈떡볶이

However, if it's just a general appearance that could be multiple brands, DO NOT attach the brand name, just return the general food name.
5. If the brand is uncertain, return it based on ingredients and cooking method without the brand name. e.g., 페퍼로니피자, 불고기피자, 시즈닝치킨, 양념치킨
6. Never return overly short, single-word names like "치킨", "피자", "밥".
7. Return ONLY the food name, no explanation.
8. If multiple foods are visible, return ONLY the 1 main food. e.g., Rice + Soup + Side dishes -> Name of the representative side dish or "한식백반".
9. Return foreign food names in Korean. e.g., pasta -> 파스타, sushi -> 초밥
10. If there are only drinks, return the drink name. e.g., 아메리카노, 오렌지주스, 콜라
11. Even if the food is only partially visible or blurry, do your best to estimate and return it. If unsure, return based on ingredients.

Output Examples:
* BHC 뿌링클
* 교촌 허니콤보
* BBQ 황금올리브치킨
* 참치김밥
* 평양냉면
* 제육볶음
* 빅파이 국내산 영동포도
* 후렌치파이 딸기
* (If no food) -> ""

Bad Examples:
* 뿌링클 -> 뿌링클치킨버거
* 뿌링클 -> 뿌링클맛 과자
* 허니콤보 -> 허니콤보버거
* 빅파이 국내산 영동포도 -> 먹아이 국내산 영동포도
* 후렌치파이 딸기 -> modifying to another product name
* No food in image -> "알 수 없음" or "음식 아님" (Strictly forbidden. MUST return empty string "")

IMPORTANT:
If the food in the photo is chicken, do not change it to burger, hot dog, snack, etc.
If the food in the photo is kimbap, do not change it to triangle kimbap or bento.
If the food in the photo is cold noodles(naengmyeon), do not change it to ramen or regular noodles.
For packaged foods, the product name written on the packaging has the highest priority. Do not modify it.

Return the food name you see in the photo exactly as it is. If there is no food, return ONLY an empty string ("").

Before returning the food name, MUST evaluate internally in this order:
1. Determine food category (e.g., 치킨, 피자, 냉면, 김밥)
2. Determine specific menu (e.g., 시즈닝치킨, 페퍼로니피자, 평양냉면)
3. Determine if it's a signature menu of a specific brand (e.g., BHC 뿌링클, 교촌 허니콤보)
4. Return the most specific food name.

In the final result, output ONLY the food name. Do NOT output the evaluation process.
"""

    img_b64 = base64.b64encode(image_bytes).decode()

    import openai
    from PIL import ImageFilter
    
    try:
        client = _oai_client()
        res = await client.chat.completions.create(
            model=_VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                ],
            }],
            max_tokens=60,
        )
        gpt_raw = res.choices[0].message.content.strip().strip('"').strip("'").strip()
        logger.debug("GPT 원본 응답: %s", gpt_raw)
        return gpt_raw
    except openai.BadRequestError as e:
        logger.warning("Vision API Policy Refusal detected: %s. Retrying with blurred image.", e)
        try:
            # 얼굴/민감정보 차단으로 인한 거부일 수 있으므로 강한 블러 처리 후 재시도
            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            img = img.filter(ImageFilter.GaussianBlur(radius=30))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=75)
            blurred_b64 = base64.b64encode(buf.getvalue()).decode()

            res = await client.chat.completions.create(
                model=_VISION_MODEL,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{blurred_b64}"}},
                    ],
                }],
                max_tokens=60,
            )
            gpt_raw = res.choices[0].message.content.strip().strip('"').strip("'").strip()
            return gpt_raw
        except Exception as retry_e:
            logger.warning("블러 처리 후 재시도 실패: %s", retry_e)
            return ""
    except Exception as e:
        logger.warning("GPT 음식명 인식 오류: %s", e)
        return ""


# ── 내부 유틸 ────────────────────────────────────────────────────────────────

def _extract_json_from_gpt_response(text: str) -> str:
    """
    GPT 응답에서 JSON 문자열만 추출한다.
    ```json ... ```, ```JSON ... ```, ``` ... ``` 블록을 모두 처리한다.
    블록이 없으면 원본 텍스트를 그대로 반환한다.
    """
    if "```" not in text:
        return text.strip()
    # 첫 번째 ``` 이후 텍스트 추출
    after_fence = text.split("```", 1)[1]
    # 언어 태그 제거 (json, JSON, 공백 등)
    first_line, _, rest = after_fence.partition("\n")
    if first_line.strip().lower() in ("json", ""):
        after_fence = rest
    # 닫는 ``` 이전까지만 취함
    content = after_fence.split("```", 1)[0]
    return content.strip()


# ── Step 2a: MFDS 공공데이터 API 조회 (공식 출처 우선) ──────────────────────

def _safe_nutr(value) -> Optional[float]:
    """MFDS API 응답값을 float으로 변환. 빈 문자열·None → None."""
    if value is None or str(value).strip() in ("", "-", "N/A"):
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


async def fetch_mfds_nutrition(food_name: str) -> tuple[NutritionDict | None, str | None]:
    """
    식품안전나라 식품영양성분DB API(I2790)로 영양성분 조회.

    URL 형식: http://openapi.foodsafetykorea.go.kr/api/{key}/I2790/json/1/5/DESC_KOR={음식명}

    Returns:
        (nutrition_dict, matched_food_name) — 못 찾으면 (None, None)

    응답 필드 매핑 (I2790 기준, 1회 제공량 → 100g 환산):
        NUTR_CONT1 → 에너지(kcal)
        NUTR_CONT2 → 탄수화물(g)
        NUTR_CONT3 → 단백질(g)
        NUTR_CONT4 → 지방(g)
        NUTR_CONT5 → 당류(g)
        NUTR_CONT6 → 나트륨(mg)
        SERVING_SIZE → 1회 제공량(g), 100g 환산에 사용
    """
    if not _FOODSAFETY_API_KEY:
        return None, None

    from urllib.parse import quote
    url = (
        f"{_FOODSAFETY_BASE_URL}/{_FOODSAFETY_API_KEY}"
        f"/{_FOODSAFETY_SERVICE_ID}/json/1/5"
        f"/DESC_KOR={quote(food_name)}"
    )

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(url)
            res.raise_for_status()
            data = res.json()

        # 응답 형식: {"I2790": {"row": [...], "total_count": "N", "RESULT": {...}}}
        service_data = data.get(_FOODSAFETY_SERVICE_ID, {})
        result_code = service_data.get("RESULT", {}).get("CODE", "")
        if result_code == "INFO-200":  # 결과 없음
            logger.info("[식품안전나라] 검색 결과 없음: %s", food_name)
            return None, None

        rows = service_data.get("row", [])
        if not rows:
            logger.info("[식품안전나라] 결과 없음: %s", food_name)
            return None, None

        item = rows[0]
        matched_name = item.get("DESC_KOR", food_name)

        # I2790는 1회 제공량(SERVING_SIZE g) 기준으로 반환 → 100g으로 환산
        serving_size = _safe_nutr(item.get("SERVING_SIZE"))
        scale = (100.0 / serving_size) if serving_size and serving_size > 0 else 1.0

        def _per100(val: float | None) -> float | None:
            return round(val * scale, 2) if val is not None else None

        nutrition: NutritionDict = {
            "에너지(kcal)": _per100(_safe_nutr(item.get("NUTR_CONT1"))),
            "단백질(g)":    _per100(_safe_nutr(item.get("NUTR_CONT3"))),
            "지방(g)":      _per100(_safe_nutr(item.get("NUTR_CONT4"))),
            "탄수화물(g)":  _per100(_safe_nutr(item.get("NUTR_CONT2"))),
            "당류(g)":      _per100(_safe_nutr(item.get("NUTR_CONT5"))),
            "나트륨(mg)":   _per100(_safe_nutr(item.get("NUTR_CONT6"))),
        }

        core_values = [nutrition["에너지(kcal)"], nutrition["단백질(g)"], nutrition["나트륨(mg)"]]
        if all(v is None for v in core_values):
            logger.warning("[식품안전나라] 필드 매핑 실패 (모두 None): %s → %s", food_name, item)
            return None, None

        logger.info("[식품안전나라] 조회 성공: %s → %s (제공량=%.0fg, 에너지=%.1f, 나트륨=%.1f)",
                    food_name, matched_name,
                    serving_size or 0,
                    nutrition["에너지(kcal)"] or 0,
                    nutrition["나트륨(mg)"] or 0)
        return nutrition, matched_name

    except httpx.TimeoutException:
        logger.warning("[식품안전나라] 타임아웃: %s", food_name)
        return None, None
    except Exception as e:
        logger.warning("[식품안전나라] 조회 오류 [food=%s]: %s", food_name, e)
        return None, None


# ── Step 2b: GPT 영양 추정 (DB·API 모두 실패 시 fallback) ───────────────────

async def estimate_nutrition(
    food_name: str,
    ref_examples: list[dict] | None = None,
) -> NutritionDict:
    """
    음식명으로 100g당 영양성분을 GPT에 추정 요청.
    """
    if not _OAI_KEY:
        return {}

    ref_block = ""
    if ref_examples:
        lines = []
        for r in ref_examples:
            name = r.get("name", "알 수 없음")
            cal  = r.get("에너지(kcal)")
            fat  = r.get("지방(g)")
            sod  = r.get("나트륨(mg)")
            parts = [f"  - {name}:"]
            if cal  is not None: parts.append(f"에너지 {cal:.1f}kcal")
            if fat  is not None: parts.append(f"지방 {fat:.1f}g")
            if sod  is not None: parts.append(f"나트륨 {sod:.1f}mg")
            lines.append(" ".join(parts) + " (Korean Food DB, per 100g)")
        ref_block = (
            "\n\n[Reference — Official DB values for similar Korean foods]\n"
            + "\n".join(lines)
            + "\nPlease estimate realistic values based on the reference above."
        )

    prompt = (
        f"Estimate the nutritional facts per 100g for the food '{food_name}'.\n"
        "Follow the standards of the Korean Ministry of Food and Drug Safety, and realistically estimate based on similar foods.\n"
        "NEVER fill the values with 0. Reply ONLY with the following JSON (numbers only):\n"
        '{"에너지(kcal)": number, "단백질(g)": number, "지방(g)": number,'
        ' "탄수화물(g)": number, "당류(g)": number, "나트륨(mg)": number}'
        + ref_block
    )

    try:
        client = _oai_client()
        res = await client.chat.completions.create(
            model=_CHAT_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a Korean food and nutrition expert. "
                        "You estimate the nutritional components of foods based on the Korean Ministry of Food and Drug Safety's food nutrition database. "
                        "Reply ONLY in JSON."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            max_tokens=200,
        )
        text = res.choices[0].message.content.strip()
        parsed = json.loads(text)
        return parsed
    except json.JSONDecodeError as e:
        logger.warning("GPT 영양 추정 JSON 파싱 실패 [food=%s]: %s", food_name, e)
        return {}
    except Exception as e:
        logger.warning("GPT 영양 추정 오류 [food=%s]: %s", food_name, e)
        return {}


# ── 이미지 전처리 ────────────────────────────────────────────────────────────

def _resize_for_vision(image_bytes: bytes, max_side: int | None = None) -> bytes:
    """GPT Vision 전송 전 리사이즈·JPEG 압축 (업로드·추론 시간 단축)."""
    if max_side is None:
        max_side = int(os.getenv("FOOD_VISION_MAX_SIDE", "768"))
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = img.size
        if max(w, h) > max_side:
            ratio = max_side / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=75, optimize=True)
        return buf.getvalue()
    except Exception as e:
        logger.warning("이미지 리사이즈 실패, 원본 사용: %s", e)
        return image_bytes


# ── 편의 함수: 이미지 → 음식명 전체 파이프라인 ──────────────────────────────

async def image_to_food_name_fast(image_bytes: bytes) -> str:
    """모바일 1단계 빠른 이름 표시용."""
    fast_side = int(os.getenv("FOOD_VISION_FAST_MAX_SIDE", "768"))
    image_bytes = _resize_for_vision(image_bytes, max_side=fast_side)
    food_name = await recognize_food(image_bytes)
    logger.info("[food-vision] mode=fast_gpt result=%s", food_name)
    return food_name


async def image_to_food_name(image_bytes: bytes) -> tuple[str, dict]:
    """
    음식명 인식 파이프라인.
    CV를 거치지 않고 바로 GPT Vision을 호출합니다.
    Returns:
        (food_name, {})
    """
    image_bytes = _resize_for_vision(image_bytes)
    food_name = await recognize_food(image_bytes)
    logger.info("[food-vision] mode=gpt_only result=%s", food_name)
    return food_name, {}
