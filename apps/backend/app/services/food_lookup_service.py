"""
  food_item DB 검색 서비스

  검색 우선순위:
    ① 정확 매칭        — food_item.name = 검색어
    ② 브랜드 alias     — BRAND_ALIAS 테이블로 일반명 재검색
    ③ LIKE 부분 매칭   — name LIKE %검색어%
    ④ 공백 정규화 매칭 — 공백 제거 후 LIKE
    ⑤ 토큰 분할 매칭   — '감자된장국' → LIKE %감자% AND LIKE %된장국%
                         (DB의 '된장국_감자' 같은 역순 형식 대응)
    실패 시 (None, None, "없음") 반환 → 호출부에서 GPT 추정 + save-back
  """

from typing import Optional
from sqlalchemy import and_, func
from sqlalchemy.orm import Session
from app.models.diet import FoodItem
from app.services.skin_factor_rules import calculate_skin_factors


# food_item 컬럼 → 한국어 키 매핑
_COL_TO_KR = {
    "calories":     "에너지(kcal)",
    "protein":      "단백질(g)",
    "fat":          "지방(g)",
    "carbohydrate": "탄수화물(g)",
    "sugar":        "당류(g)",
    "sodium":       "나트륨(mg)",
}

NutritionDict = dict[str, Optional[float]]
LookupResult = tuple[Optional[str], Optional[NutritionDict], str, Optional[int], Optional[str]]


# ── 내부 유틸 ────────────────────────────────────────────────────────────────

def _sf(val) -> Optional[float]:
    try:
        return float(val) if val not in (None, "", "N/A") else None
    except (ValueError, TypeError):
        return None


def _row_to_nutrition(food: FoodItem) -> NutritionDict:
    return {kr: _sf(getattr(food, col)) for col, kr in _COL_TO_KR.items()}


def food_item_to_nutrition(food: FoodItem | None) -> NutritionDict | None:
    if food is None:
        return None
    return _row_to_nutrition(food)


def _exact(db: Session, name: str) -> LookupResult:
    food = db.query(FoodItem).filter(FoodItem.name == name).first()
    if food:
        return food.name, _row_to_nutrition(food), "정확(DB)", food.id, food.source
    return None, None, "", None, None


def _starts_with(db: Session, name: str) -> LookupResult:
    """
    언더스코어 전방 일치 — '검색어\\_%' (escape='\\').
    MFDS 식단 데이터의 '카테고리_재료' 형식 전용:
      '된장국' → '된장국_감자', '된장국_호박' 등.
    SQL LIKE의 '_' 와일드카드 동작을 막기 위해 escape 처리.
    '초밥나라', '계란후라이도시락' 같이 언더스코어 없이 이어붙은 경우는 제외.
    """
    food = (
        db.query(FoodItem)
        .filter(FoodItem.name.like(f"{name}\\_%", escape="\\"))
        .order_by(func.length(FoodItem.name))
        .first()
    )
    if food:
        return food.name, _row_to_nutrition(food), "전방(DB)", food.id, food.source
    return None, None, "", None, None


def _like(db: Session, name: str) -> LookupResult:
    """
    LIKE 부분 매칭 — '%검색어%'.
    동일한 키워드를 포함하는 항목이 여럿일 때 짧은(=일반적인) 이름 우선 반환.
    """
    food = (
        db.query(FoodItem)
        .filter(FoodItem.name.like(f"%{name}%"))
        .order_by(func.length(FoodItem.name))
        .first()
    )
    if food:
        return food.name, _row_to_nutrition(food), "부분(DB)", food.id, food.source
    return None, None, "", None, None


def _normalized_like(db: Session, name: str) -> LookupResult:
    """공백 제거 후 LIKE — '감자 된장국' → '%감자된장국%'"""
    normalized = name.replace(" ", "")
    if normalized == name:
        return None, None, "", None, None
    food = (
        db.query(FoodItem)
        .filter(func.replace(FoodItem.name, " ", "").like(f"%{normalized}%"))
        .order_by(func.length(FoodItem.name))
        .first()
    )
    if food:
        return food.name, _row_to_nutrition(food), "정규화(DB)", food.id, food.source
    return None, None, "", None, None


def _token_match(db: Session, name: str) -> LookupResult:
    """
    토큰 분할 AND LIKE 매칭.

    GPT가 '감자된장국'을 반환했을 때 DB에 '된장국_감자'처럼
    순서가 역전된 형태로 저장된 경우를 처리한다.

    '감자된장국' → ('감자', '된장국'), ('감자된', '장국'), ... 순으로 시도,
    두 토큰이 모두 DB name에 포함된 첫 번째 행을 반환한다.
    양쪽 토큰이 최소 2글자여야 오검색을 줄인다.
    """
    n = len(name)
    for split in range(2, n - 1):
        part1 = name[:split]
        part2 = name[split:]
        if len(part1) < 2 or len(part2) < 2:
            continue
        food = (
            db.query(FoodItem)
            .filter(
                and_(
                    FoodItem.name.like(f"%{part1}%"),
                    FoodItem.name.like(f"%{part2}%"),
                )
            )
            .order_by(func.length(FoodItem.name))
            .first()
        )
        if food:
            return food.name, _row_to_nutrition(food), "토큰(DB)", food.id, food.source
    return None, None, "", None, None


# 브랜드 메뉴 → DB에 저장된 일반 음식명 매핑
# GPT가 브랜드명을 반환했을 때 DB에서 못 찾으면 alias로 재검색
_BRAND_ALIAS: dict[str, str] = {
    "BHC 뿌링클":          "시즈닝치킨",
    "BHC 맛초킹":          "양념치킨",
    "교촌 허니콤보":        "간장치킨",
    "교촌 허니오리지날":    "간장치킨",
    "BBQ 황금올리브치킨":   "후라이드치킨",
    "BBQ 자메이카통다리구이": "구운치킨",
    "굽네 고추바사삭":      "오븐구이치킨",
    "굽네 볼케이노":        "매운양념치킨",
    "네네치킨 스노윙치즈":  "치즈치킨",
    "맥도날드 빅맥":        "햄버거",
    "맥도날드 맥스파이시":  "스파이시버거",
    "롯데리아 불고기버거":  "불고기버거",
    "버거킹 와퍼":          "햄버거",
    "스타벅스 아메리카노":  "아메리카노",
    "스타벅스 카페라떼":    "카페라떼",
}


def _generate_food_query_candidates(query: str) -> list[str]:
    tokens = query.split()
    if not tokens:
        return []

    _REGION_PREFIXES = {"의정부", "전주", "춘천", "안동", "나주", "부산", "대구", "광주", "제주", "수원", "마산", "포항", "속초", "강릉", "평양", "함흥"}
    _QUALIFIERS = {"맛집", "식당", "원조", "전통", "할머니", "본점", "직화", "매운", "순한", "수제", "프리미엄", "옛날", "즉석"}
    _SUFFIXES = {"시", "군", "구", "동", "읍", "면"}

    cleaned_tokens = []
    for t in tokens:
        is_region = False
        for r in _REGION_PREFIXES:
            if t.startswith(r):
                if len(t) == len(r) or (len(t) == len(r) + 1 and t[-1] in _SUFFIXES):
                    is_region = True
                    break
        if is_region:
            continue

        if t in _QUALIFIERS:
            continue

        cleaned_tokens.append(t)

    candidates = []
    if cleaned_tokens:
        n = len(cleaned_tokens)
        for i in range(n):
            for j in range(n, i, -1):
                cand = " ".join(cleaned_tokens[i:j])
                if len(cand.replace(" ", "")) > 1:
                    candidates.append(cand)

    result = []
    for c in candidates:
        if c not in result and c != query:
            result.append(c)

    return result


_SEARCH_NOISE_KEYWORDS = {
    "믹스",
    "소스",
    "양념",
    "키트",
    "햄",
    "용",
    "분말",
    "파우더",
    "빵가루",
    "시즈닝",
    "토핑",
    "반죽",
    "필링",
    "베이스",
    "원료",
    "소시지",
    "캔디",
    "장",
    "세트",
    "전병",
    "만두",
    "덮밥",
    "덥밥",
    "볶음밥",
    "잡곡밥",
    "두부볶음",
    "그릴",
    "스모크",
    "미트칠리",
    "+",
}

_SEARCH_NOISE_EXCEPTIONS = {
    "커피믹스",
    "견과믹스",
    "요거트",
    "아이스크림",
    "프로틴파우더",
    "단백질파우더",
    "쉐이크",
    "스무디",
}


def _is_noisy_search_result(food: FoodItem, query: str) -> bool:
    name = food.name or ""
    if name == query:
        return False
    if any(exc in name for exc in _SEARCH_NOISE_EXCEPTIONS):
        return False
    return any(keyword in name and keyword not in query for keyword in _SEARCH_NOISE_KEYWORDS)


def _save_food_from_nutrition(
    db: Session,
    food_name: str,
    nutrition: NutritionDict,
    source: str,
) -> Optional[int]:
    """영양성분 dict를 food_item에 저장하고 id 반환 (중복 시 기존 id 반환)."""
    exists = db.query(FoodItem).filter(FoodItem.name == food_name).first()
    if exists:
        return exists.id

    sugar  = nutrition.get("당류(g)")
    sodium = nutrition.get("나트륨(mg)")
    fat    = nutrition.get("지방(g)")
    carb   = nutrition.get("탄수화물(g)")

    factors = calculate_skin_factors(
        name=food_name,
        sugar=sugar,
        sodium=sodium,
        fat=fat,
        carbohydrate=carb,
    )

    new_food = FoodItem(
        name=food_name,
        calories=nutrition.get("에너지(kcal)"),
        protein=nutrition.get("단백질(g)"),
        fat=fat,
        carbohydrate=carb,
        sugar=sugar,
        sodium=sodium,
        skin_factors=factors,
        source=source,
    )
    db.add(new_food)
    db.commit()
    db.refresh(new_food)
    return new_food.id


def save_gpt_estimate(db: Session, food_name: str, nutrition: NutritionDict) -> Optional[int]:
    """GPT 추정 영양성분을 food_item에 저장하고 id 반환 (하위 호환 유지)."""
    return _save_food_from_nutrition(db, food_name, nutrition, source="gpt_estimate")


def resolve_food_item_id_db_only(db: Session, food_name: str) -> Optional[int]:
    """exact/정규화 DB 매칭만 — GPT 추정·FoodItem 생성 없음."""
    clean_name = (food_name or "").strip()
    if not clean_name:
        return None
    for finder in (_exact, _normalized_like):
        found, _, _, food_id, _ = finder(db, clean_name)
        if found and food_id:
            return food_id
    return None


async def resolve_nutrition_for_name(
    db: Session, food_name: str
) -> tuple[NutritionDict | None, str, Optional[int], Optional[str]]:
    """
    DB lookup 우선; 없으면 GPT 영양 추정 후 food_item 저장.
    Returns: (nutrition, match_type, food_item_id, food_item_source)
    """
    clean_name = (food_name or "").strip()
    if not clean_name:
        return None, "없음", None, None

    _found, nutrition, match_type, food_item_id, food_item_source = lookup(db, clean_name)
    if nutrition and food_item_id:
        if food_item_source == "gpt_estimate":
            return nutrition, "GPT추정", food_item_id, food_item_source
        if food_item_source == "mfds_api":
            return nutrition, "공공API", food_item_id, food_item_source
        return nutrition, match_type or "DB", food_item_id, food_item_source

    food_item_id = await resolve_manual_food_item_id(db, clean_name)
    if not food_item_id:
        return None, "없음", None, None

    food = db.query(FoodItem).filter(FoodItem.id == food_item_id).first()
    if not food:
        return None, "없음", None, None
    actual_source = food.source or "gpt_estimate"
    actual_match_type = "공공API" if actual_source == "mfds_api" else "GPT추정"
    return food_item_to_nutrition(food), actual_match_type, food_item_id, actual_source


def _build_gpt_ref_examples(db: Session, food_name: str) -> list[dict]:
    """
    로컬 DB에서 유사 음식 최대 3개 조회해 GPT 레퍼런스 dict 목록 반환.

    검색 우선순위:
      ① 전체 이름 LIKE '%음식명%'
      ② 공백 분리 토큰 (긴 것 우선) — "흑임자 크림라떼" → "크림라떼", "흑임자"
         카테고리 유지에 핵심: 음료명이 있으면 음료류 먼저 잡힘
      ③ 캐릭터 split (공백 없는 단일 단어에만 적용) — "마라탕면" → "마라", "탕면"
    gpt_estimate 소스 제외, 공식 DB 데이터만 사용.
    """
    results: list[dict] = []
    seen: set[int] = set()

    def _is_official(row) -> bool:
        return (row.source or "") != "gpt_estimate"

    def _add(row) -> bool:
        if row.id in seen or not _is_official(row):
            return False
        # 식용유·오일류 제외 (에너지 700kcal 초과 + 나트륨 50mg 미만)
        if row.calories and row.calories > 700 and (row.sodium or 0) < 50:
            return False
        seen.add(row.id)
        results.append({
            "name":        row.name,
            "에너지(kcal)": row.calories,
            "지방(g)":      row.fat,
            "나트륨(mg)":   row.sodium,
            "당류(g)":      row.sugar,
            "탄수화물(g)":  row.carbohydrate,
        })
        return True

    def _like_query(token: str):
        return (
            db.query(FoodItem)
            .filter(
                FoodItem.name.like(f"%{token}%"),
                (FoodItem.source != "gpt_estimate") | (FoodItem.source.is_(None)),
            )
            .order_by(func.length(FoodItem.name))
            .limit(2)
            .all()
        )

    def _search(token: str):
        if len(results) >= 3 or len(token) < 2:
            return
        for row in _like_query(token):
            _add(row)

    # ① 전체 이름
    _search(food_name)

    # ② 공백 분리 토큰 — 긴 것(더 구체적인 것) 우선
    space_tokens = sorted(
        [t for t in food_name.split() if len(t) >= 2],
        key=len,
        reverse=True,
    )
    for token in space_tokens:
        if len(results) >= 3:
            break
        _search(token)

    # ③ 캐릭터 split — 공백 없는 단일 단어에만 적용
    if " " not in food_name:
        n = len(food_name)
        for split in range(2, n - 1):
            if len(results) >= 3:
                break
            part1, part2 = food_name[:split], food_name[split:]
            if len(part1) < 2 or len(part2) < 2:
                continue
            _search(part1)
            _search(part2)

    return results[:3]


async def resolve_manual_food_item_id(db: Session, food_name: str) -> Optional[int]:
    """
    Resolve a user-confirmed manual food name to a FoodItem id.

    조회 순서:
      ① 로컬 DB 정확/정규화 매칭
      ② MFDS 공공데이터 API (식품의약품안전처 공식 출처)
      ③ GPT 추정 — 로컬 DB 유사 음식 레퍼런스 주입
    """
    clean_name = (food_name or "").strip()
    if not clean_name:
        return None

    # ① 로컬 DB
    for finder in (_exact, _normalized_like):
        found, _, _, food_id, _ = finder(db, clean_name)
        if found and food_id:
            return food_id

    from app.services import food_vision_service

    # ② MFDS API
    mfds_nutrition, mfds_name = await food_vision_service.fetch_mfds_nutrition(clean_name)
    if mfds_nutrition:
        import logging as _log
        _log.getLogger("food_lookup").info(
            "[resolve] MFDS 조회 성공: %s → %s", clean_name, mfds_name
        )
        return _save_food_from_nutrition(db, clean_name, mfds_nutrition, source="mfds_api")

    # ③ GPT 추정 — DB 유사 음식 레퍼런스 주입
    ref_examples = _build_gpt_ref_examples(db, clean_name)
    nutrition = await food_vision_service.estimate_nutrition(clean_name, ref_examples=ref_examples)
    if not nutrition:
        return None

    return _save_food_from_nutrition(db, clean_name, nutrition, source="gpt_estimate")


def lookup(db: Session, name: str, *, strict: bool = False) -> LookupResult:
    """
    음식 이름으로 영양정보를 계층적으로 검색한다.

    strict=True (analyze-photo + OCR 사용 시):
        전체 이름 기준 exact/alias/전방/LIKE/정규화까지만 시도.
        토큰 분할·candidate 매칭 생략 → 짧은 이름(농심라면)으로 뭉개지지 않음.

    Returns:
        (found_name, nutrition_dict, match_type, food_item_id, food_item_source)
        모두 실패하면 (None, None, "없음", None, None)
    """
    # ① 정확 매칭
    found, nutr, mt, food_id, food_source = _exact(db, name)
    if found:
        return found, nutr, mt, food_id, food_source

    # ② 브랜드명 → 일반 음식명 alias 재검색 (정확 → LIKE 순)
    alias = _BRAND_ALIAS.get(name)
    if alias:
        found, nutr, _, food_id, food_source = _exact(db, alias)
        if found:
            return found, nutr, "alias(DB)", food_id, food_source
        found, nutr, _, food_id, food_source = _like(db, alias)
        if found:
            return found, nutr, "alias(DB)", food_id, food_source

    # ④ 전방 일치 — '된장국' → '된장국_감자', '된장국_호박' 등
    found, nutr, mt, food_id, food_source = _starts_with(db, name)
    if found:
        return found, nutr, mt, food_id, food_source

    # ⑤ LIKE 부분 매칭 — '%검색어%'
    found, nutr, mt, food_id, food_source = _like(db, name)
    if found:
        return found, nutr, mt, food_id, food_source

    # ⑥ 공백 제거 후 정규화 LIKE
    found, nutr, mt, food_id, food_source = _normalized_like(db, name)
    if found:
        return found, nutr, mt, food_id, food_source

    if strict:
        return None, None, "없음", None, None

    # ⑦ 토큰 분할 AND 매칭 — '감자된장국' → LIKE %감자% AND LIKE %된장국%
    if len(name) >= 4:
        found, nutr, mt, food_id, food_source = _token_match(db, name)
        if found:
            return found, nutr, mt, food_id, food_source

    # ⑧ 후보 기반 일반 음식명 검색
    candidates = _generate_food_query_candidates(name)
    for cand in candidates:
        found, nutr, _, food_id, food_source = _exact(db, cand)
        if found:
            return found, nutr, "candidate(DB)", food_id, food_source

        found, nutr, _, food_id, food_source = _starts_with(db, cand)
        if found:
            return found, nutr, "candidate(DB)", food_id, food_source

        found, nutr, _, food_id, food_source = _like(db, cand)
        if found:
            return found, nutr, "candidate(DB)", food_id, food_source

    return None, None, "없음", None, None


def search_food_items(
    db: Session,
    query: str,
    limit: int = 10,
) -> list[FoodItem]:
    """
    사용자가 직접 텍스트를 입력할 때의 food_item 목록 검색.
    정확 매칭 우선, 이후 전방 일치(Prefix), 그 다음 LIKE 부분 매칭.
    """
    results_map = {}

    def _add(item, score):
        if item.id not in results_map or results_map[item.id][1] > score:
            results_map[item.id] = (item, score)

    # gpt_estimate로 저장된 항목은 검색 후보에서 제외 (공식 DB 음식만)
    base_q = db.query(FoodItem).filter(
        (FoodItem.source != "gpt_estimate") | (FoodItem.source.is_(None))
    )

    # 1. 원본 쿼리 매칭
    exact = base_q.filter(FoodItem.name == query).all()
    for item in exact:
        _add(item, 1)

    prefix_query = (
        base_q.filter(FoodItem.name.like(f"{query}%"))
        .limit(50)
        .all()
    )
    for item in prefix_query:
        _add(item, 3)

    if len(results_map) < limit:
        contains_query = (
            base_q.filter(FoodItem.name.like(f"%{query}%"))
            .limit(50)
            .all()
        )
        for item in contains_query:
            _add(item, 5)

    # 2. 후보 쿼리 매칭 (원본 쿼리 결과가 부족할 때)
    candidates = _generate_food_query_candidates(query)
    for cand in candidates:
        cand_exact = base_q.filter(FoodItem.name == cand).all()
        for item in cand_exact:
            _add(item, 2)

        if len(results_map) < limit:
            cand_prefix = (
                base_q.filter(FoodItem.name.like(f"{cand}%"))
                .limit(50)
                .all()
            )
            for item in cand_prefix:
                _add(item, 4)

        if len(results_map) < limit:
            cand_contains = (
                base_q.filter(FoodItem.name.like(f"%{cand}%"))
                .limit(50)
                .all()
            )
            for item in cand_contains:
                _add(item, 6)

    # 3. 정렬 및 반환 (score 오름차순, 동점이면 짧은 이름 우선)
    scored_results = list(results_map.values())

    filtered_results = [
        row for row in scored_results
        if not _is_noisy_search_result(row[0], query)
    ]
    if filtered_results:
        scored_results = filtered_results

    scored_results.sort(key=lambda x: (x[1], len(x[0].name), x[0].id))

    return [x[0] for x in scored_results][:limit]
