"""
2단계: Azure cv + GPT 음식 인식, 영양 추정

사진 → 음식명 인식 + 영양 추정 서비스 (Azure Computer Vision + Azure OpenAI)

POC full_flow.py의 step0(Azure CV), step1(GPT 음식명), step2b(GPT 영양 추정)를 이식.
FastAPI async 환경에 맞춰 httpx.AsyncClient + AsyncAzureOpenAI 사용.
"""

import io
import logging
import os
import json
import base64
from typing import Optional

from PIL import Image

import httpx
from openai import AsyncAzureOpenAI

logger = logging.getLogger("food_vision")

# ── 환경 변수 ────────────────────────────────────────────────────────────────

def _clean_env(val: str | None) -> str:
    return (val or "").strip().strip('"').strip("'")


def _resolve_cv_credentials() -> tuple[str, str]:
    """
    Computer Vision API 엔드포인트·키 결정.

    1) AZURE_CV_ENDPOINT + AZURE_CV_KEY (custom-prediction URL 제외)
    2) 없거나 잘못된 경우 AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY (팀 공용 리소스)
    """
    cv_ep = _clean_env(os.getenv("AZURE_CV_ENDPOINT")).rstrip("/")
    cv_key = _clean_env(os.getenv("AZURE_CV_KEY") or os.getenv("AZURE_CV_PREDICTION_KEY"))
    if cv_ep and cv_key and "custom-prediction" not in cv_ep:
        return cv_ep, cv_key

    oai_ep = _clean_env(os.getenv("AZURE_OPENAI_ENDPOINT")).rstrip("/")
    oai_key = _clean_env(os.getenv("AZURE_OPENAI_KEY"))
    return oai_ep, oai_key


_OAI_ENDPOINT = _clean_env(os.getenv("AZURE_OPENAI_ENDPOINT")).rstrip("/")
_OAI_KEY = _clean_env(os.getenv("AZURE_OPENAI_KEY"))
_OAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "")
_OAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")

_FOODSAFETY_API_KEY = _clean_env(os.getenv("FOODSAFETY_API_KEY"))
# 식품안전나라 Open API: http://openapi.foodsafetykorea.go.kr/api/{key}/I2790/json/{start}/{end}
_FOODSAFETY_BASE_URL = "http://openapi.foodsafetykorea.go.kr/api"
_FOODSAFETY_SERVICE_ID = "I2790"

NutritionDict = dict[str, Optional[float]]


def _oai_client() -> AsyncAzureOpenAI:
    return AsyncAzureOpenAI(
        api_key=_OAI_KEY,
        azure_endpoint=_OAI_ENDPOINT,
        api_version=_OAI_API_VERSION,
    )


# ── Step 0: Azure Computer Vision ────────────────────────────────────────────

async def analyze_image_cv(image_bytes: bytes, *, include_ocr: bool = True) -> dict:
    """
    Azure CV로 이미지 분석 → tags / (선택) OCR 텍스트 반환.
    Azure 키 미설정 시 빈 dict 반환(graceful degradation).
    """
    cv_endpoint, cv_key = _resolve_cv_credentials()
    if not cv_endpoint or not cv_key:
        return {}

    # 팀 리소스는 caption 미지원 → tags+read만 사용
    if include_ocr:
        features = "tags,read"
    else:
        features = "tags"
    url = f"{cv_endpoint}/computervision/imageanalysis:analyze"
    params = {
        "features": features,
        "api-version": "2024-02-01",
        "language": "en",
    }
    headers = {
        "Ocp-Apim-Subscription-Key": cv_key,
        "Content-Type": "application/octet-stream",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, params=params, headers=headers, content=image_bytes)
            resp.raise_for_status()
            return _parse_cv(resp.json())
    except Exception as e:
        logger.warning("Azure CV 분석 실패 (OCR 미사용): %s", e)
        return {}


def _parse_cv(raw: dict) -> dict:
    tags = [
        t["name"]
        for t in raw.get("tagsResult", {}).get("values", [])
        if t.get("confidence", 0) >= 0.6
    ]
    caption_obj = raw.get("captionResult", {})
    caption = caption_obj.get("text", "")

    ocr_lines = [
        line["text"]
        for block in raw.get("readResult", {}).get("blocks", [])
        for line in block.get("lines", [])
        if _line_conf(line) >= 0.5
    ]
    return {"tags": tags, "caption": caption, "ocr": ocr_lines}


def _line_conf(line: dict) -> float:
    words = line.get("words", [])
    if not words:
        return 0.0
    return sum(w.get("confidence", 0) for w in words) / len(words)


# ── Step 1: GPT 음식명 인식 ──────────────────────────────────────────────────

async def recognize_food(image_bytes: bytes, cv_info: dict | None = None) -> str:
    """
    이미지(+ 선택적 CV 힌트)를 GPT에 전달해 음식명을 한국어로 반환.
    Azure 키 미설정 시 빈 문자열 반환.
    """
    if not _OAI_ENDPOINT or not _OAI_KEY or not _OAI_DEPLOYMENT:
        return ""

    base_prompt = """
사진을 보고 음식 이름을 한국어로 알려줘.

규칙:

1. 사진에 음식이 없으면 반드시 빈 문자열("")만 반환해. 절대 설명 금지.
2. 포장된 식품이면 포장지에 적힌 제품명을 그대로 반환.
3. 포장지에 제품명이나 브랜드명이 보이면 새로운 제품명을 만들거나 수정하지 마.
4. 브랜드가 시각적으로 명확하게 보일 때만 브랜드명 + 메뉴명을 반환. 예) 뿌링클처럼 특유의 치즈 시즈닝 분말이 보이면 "BHC 뿌링클"
4-1.특정 브랜드 메뉴의 시각적 특징이 매우 강하게 나타나는 경우에는 브랜드명이 보이지 않더라도 가장 가능성이 높은 브랜드명 + 메뉴명으로 반환한다.

예시:
- 노란 치즈 시즈닝 + 초록 파슬리 가루가 많이 뿌려진 치킨 → BHC 뿌링클
- 간장 소스가 발린 날개/봉 형태 치킨 → 교촌 허니콤보
- 황금빛 후라이드 치킨 → BBQ 황금올리브치킨
- 붉은 양념과 치즈 토핑이 많은 떡볶이 → 치즈떡볶이

단,
일반적인 외형만으로 여러 브랜드가 가능하면
브랜드명을 붙이지 말고 일반 음식명으로 반환한다.
5. 브랜드가 불확실하면 브랜드명 없이 재료·조리 방식 기반으로 반환. 예) 페퍼로니피자, 불고기피자, 시즈닝치킨, 양념치킨
6. "치킨", "피자", "밥"처럼 단어 하나짜리 너무 짧은 이름은 절대 반환하지 마.
7. 음식 이름만 반환하고 설명은 하지 마.
8. 음식이 여러 개 보이면 가장 메인이 되는 음식 1개만 반환해. 예) 밥+국+반찬이면 → 대표 반찬명 또는 "한식백반"
9. 외국 음식도 한국어로 반환해. 예) pasta → 파스타, sushi → 초밥
10. 음료만 있으면 음료명을 반환해. 예) 아메리카노, 오렌지주스, 콜라
11. 음식이 일부만 보이거나 흐릿해도 최선을 다해 추정해서 반환해. 모르겠으면 재료 기반으로 반환.

예시:

* BHC 뿌링클
* 교촌 허니콤보
* BBQ 황금올리브치킨
* 참치김밥
* 평양냉면
* 제육볶음
* 빅파이 국내산 영동포도
* 후렌치파이 딸기
* (음식이 없으면) → ""

잘못된 예시:

* 뿌링클 → 뿌링클치킨버거
* 뿌링클 → 뿌링클맛 과자
* 허니콤보 → 허니콤보버거
* 빅파이 국내산 영동포도 → 먹아이 국내산 영동포도
* 후렌치파이 딸기 → 다른 제품명으로 변경
* 음식이 없는데 → "알 수 없음" 또는 "음식 아님" (절대 금지, 빈 문자열 반환)

중요:
사진 속 음식이 치킨이라면 버거, 핫도그, 과자 등 다른 음식으로 변경하지 마.
사진 속 음식이 김밥이라면 삼각김밥이나 도시락으로 변경하지 마.
사진 속 음식이 냉면이라면 라면이나 국수로 변경하지 마.
포장 식품은 포장지에 적힌 제품명을 최우선으로 사용하고 수정하지 마.

실제 사진에 보이는 음식명을 그대로 반환해. 음식이 없으면 빈 문자열("")만 반환해.

음식명을 반환하기 전에 반드시 내부적으로 다음 순서로 판단해.
1. 음식 카테고리 판단
   예) 치킨, 피자, 냉면, 김밥

2. 세부 메뉴 판단
   예) 시즈닝치킨, 페퍼로니피자, 평양냉면

3. 특정 브랜드 대표 메뉴인지 판단
   예) BHC 뿌링클, 교촌 허니콤보, BBQ 황금올리브치킨

4. 가장 구체적인 음식명을 반환

최종 결과에는 음식명만 반환하고 판단 과정은 출력하지 마.
"""

    hints = _build_cv_hints(cv_info)

    if hints:
        prompt = (
            "아래는 Azure Computer Vision이 자동 분석한 결과야. 이걸 참고해서 판단해줘:\n"
            + "\n".join(f"  - {h}" for h in hints)
            + "\n\n"
            + base_prompt
        )
    else:
        prompt = base_prompt

    img_b64 = base64.b64encode(image_bytes).decode()

    logger.debug("CV hints: %s", cv_info)

    try:
        client = _oai_client()
        res = await client.chat.completions.create(
            model=_OAI_DEPLOYMENT,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                ],
            }],
            max_completion_tokens=60,
        )
        gpt_raw = res.choices[0].message.content.strip().strip('"').strip("'").strip()
        logger.debug("GPT 원본 응답: %s", gpt_raw)
        return gpt_raw
    except Exception as e:
        logger.warning("GPT 음식명 인식 오류: %s", e)
        return ""


def _build_cv_hints(cv_info: dict | None) -> list[str]:
    hints = []
    if not cv_info:
        return hints
    if cv_info.get("tags"):
        hints.append(f"감지된 객체·재료: {', '.join(cv_info['tags'][:10])}")
    if cv_info.get("caption"):
        hints.append(f"이미지 설명: {cv_info['caption']}")
    if cv_info.get("ocr"):
        hints.append(f"포장지 텍스트(OCR): {' / '.join(cv_info['ocr'])}")
    return hints


async def recognize_food_from_text_hints(cv_info: dict) -> str:
    """
    OCR/CV 텍스트 힌트만으로 음식명 추정 (이미지 미전송 → Vision보다 빠름).
    포장 식품 제품명 추출에 특화.
    """
    if not _OAI_ENDPOINT or not _OAI_KEY or not _OAI_DEPLOYMENT:
        return ""

    hints = _build_cv_hints(cv_info)
    if not hints:
        return ""

    prompt = (
        "아래는 식품 포장 사진에서 OCR로 읽은 텍스트와 CV 태그야.\n"
        "포장지에 적힌 제품명을 한국어로 그대로 반환해. 새 이름을 만들거나 수정하지 마.\n"
        "영양성분·바코드·제조일·ml·g·kcal 같은 라벨 문구는 무시해.\n"
        "제품명이 불명확하면 빈 문자열(\"\")만 반환.\n\n"
        + "\n".join(f"- {h}" for h in hints)
        + "\n\n음식명만 한 줄로 반환:"
    )

    try:
        client = _oai_client()
        res = await client.chat.completions.create(
            model=_OAI_DEPLOYMENT,
            messages=[{"role": "user", "content": prompt}],
            max_completion_tokens=40,
        )
        return res.choices[0].message.content.strip().strip('"').strip("'").strip()
    except Exception as e:
        logger.warning("GPT OCR 텍스트 음식명 추정 오류: %s", e)
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

    ref_examples: 로컬 DB에서 찾은 유사 음식 레퍼런스 목록
        [{"name": "마라탕", "에너지(kcal)": 95, "나트륨(mg)": 520, ...}, ...]
    반환 키는 food_lookup_service의 NutritionDict와 동일.
    """
    if not _OAI_ENDPOINT or not _OAI_KEY or not _OAI_DEPLOYMENT:
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
            lines.append(" ".join(parts) + " (한국 식품 DB 기준, 100g당)")
        ref_block = (
            "\n\n[참고 — 유사한 한국 음식의 공식 DB 수치]\n"
            + "\n".join(lines)
            + "\n위 수치를 참고해 현실적인 값을 추정해줘."
        )

    prompt = (
        f"음식 '{food_name}'의 100g당 영양성분을 추정해줘.\n"
        "한국 식품의약품안전처 기준을 따르고, 비슷한 음식 수치를 근거로 현실적으로 추정해.\n"
        "절대 0으로 채우지 마. 아래 JSON으로만 답해 (숫자만):\n"
        '{"에너지(kcal)": 숫자, "단백질(g)": 숫자, "지방(g)": 숫자,'
        ' "탄수화물(g)": 숫자, "당류(g)": 숫자, "나트륨(mg)": 숫자}'
        + ref_block
    )

    try:
        client = _oai_client()
        res = await client.chat.completions.create(
            model=_OAI_DEPLOYMENT,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "너는 한국 식품영양 전문가야. "
                        "식품의약품안전처 식품영양성분DB 기준으로 음식 영양성분을 추정한다. "
                        "JSON으로만 답해."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            max_completion_tokens=200,
        )
        text = res.choices[0].message.content.strip()
        text = _extract_json_from_gpt_response(text)
        return json.loads(text)
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
    """GPT Vision만 호출 — CV·OCR·DB 없음 (모바일 1단계 빠른 이름 표시용)."""
    fast_side = int(os.getenv("FOOD_VISION_FAST_MAX_SIDE", "768"))
    image_bytes = _resize_for_vision(image_bytes, max_side=fast_side)
    food_name = await recognize_food(image_bytes, None)
    print(f"[food-vision] mode=fast_gpt result={food_name}", flush=True)
    logger.info("[food-vision] mode=fast_gpt result=%s", food_name)
    return food_name


async def image_to_food_name(image_bytes: bytes) -> tuple[str, dict]:
    """
    음식명 인식 파이프라인.

    FOOD_VISION_USE_CV=false:
        GPT Vision만 호출

    FOOD_VISION_USE_CV=true (기본 develop 방식):
        CV 분석 후 GPT에 tags/OCR 힌트를 함께 전달

    Returns:
        (food_name, cv_info)  — food_name이 빈 문자열이면 인식 실패
    """
    image_bytes = _resize_for_vision(image_bytes)
    use_cv = os.getenv("FOOD_VISION_USE_CV", "false").lower() == "true"

    if not use_cv:
        food_name = await recognize_food(image_bytes, None)
        print(f"[food-vision] mode=gpt_only result={food_name}", flush=True)
        logger.info("[food-vision] mode=gpt_only result=%s", food_name)
        return food_name, {}

    cv_info = await analyze_image_cv(image_bytes, include_ocr=True)
    food_name = await recognize_food(image_bytes, cv_info)
    ocr_preview = " | ".join((cv_info.get("ocr") or [])[:5])
    print(
        f"[food-vision] mode=cv_then_gpt result={food_name} "
        f"cv_tags={cv_info.get('tags', [])[:5]} ocr={ocr_preview or '(none)'}",
        flush=True,
    )
    logger.info(
        "[food-vision] mode=cv_then_gpt result=%s cv_tags=%s",
        food_name,
        cv_info.get("tags", [])[:5],
    )
    return food_name, cv_info
