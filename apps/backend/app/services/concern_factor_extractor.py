from typing import List, Dict, Any

from app.services.pattern_discovery import FACTOR_DEFINITION_REGISTRY

KEYWORD_MAPPING = {
    # ── 스트레스 ──────────────────────────────────────────────────────────────
    "스트레스": ["stress_high"],
    "긴장": ["stress_high"],
    "불안": ["stress_high"],
    "걱정": ["stress_high"],
    # ── 수면 부족 ─────────────────────────────────────────────────────────────
    "잠": ["sleep_shortage"],
    "수면": ["sleep_shortage"],
    "피곤": ["sleep_shortage"],
    "밤샘": ["sleep_shortage"],
    "야근": ["sleep_shortage"],
    "늦게 잠": ["sleep_shortage"],
    # ── 고당류 ────────────────────────────────────────────────────────────────
    "단것": ["high_sugar"],
    "단거": ["high_sugar"],
    "초콜릿": ["high_sugar"],
    "사탕": ["high_sugar"],
    "젤리": ["high_sugar"],
    "아이스크림": ["high_sugar"],
    "케이크": ["high_sugar"],
    "달달": ["high_sugar"],
    # ── 유제품 ────────────────────────────────────────────────────────────────
    "우유": ["dairy"],
    "유제품": ["dairy"],
    "치즈": ["dairy"],
    "요거트": ["dairy"],
    "요플레": ["dairy"],
    "버터": ["dairy"],
    # ── 고혈당지수 ────────────────────────────────────────────────────────────
    "빵": ["high_gi"],
    "흰쌀": ["high_gi"],
    "면류": ["high_gi"],
    "라면": ["high_gi"],
    "과자": ["high_gi"],
    "떡": ["high_gi"],
    "떡볶이": ["high_gi"],
    "국수": ["high_gi"],
    "우동": ["high_gi"],
    "쌀밥": ["high_gi"],
    # ── 고지방 ────────────────────────────────────────────────────────────────
    "고지방": ["high_fat"],
    "기름진": ["high_fat"],
    "튀김": ["high_fat"],
    "치킨": ["high_fat"],
    "삼겹살": ["high_fat"],
    "곱창": ["high_fat"],
    "마라": ["high_fat"],
    # ── 자외선 ────────────────────────────────────────────────────────────────
    "자외선": ["uv_high"],
    "햇빛": ["uv_high"],
    "햇볕": ["uv_high"],
    "선번": ["uv_high"],
    # ── 미세먼지 ──────────────────────────────────────────────────────────────
    "미세먼지": ["pm_high"],
    "황사": ["pm_high"],
    "먼지": ["pm_high"],
}


def extract_concern_factors(concern_note: str | None) -> List[Dict[str, Any]]:
    """
    사용자가 분석 요청 시 자유 텍스트로 적은 내용에서 factor를 추출한다.
    Returns a list of factor dicts with source, factor_type, factor_key, label, and mentioned_as.
    """
    factors = []
    seen_keys = set()

    if concern_note:
        for keyword, keys in KEYWORD_MAPPING.items():
            if keyword in concern_note:
                for key in keys:
                    if key not in seen_keys and key in FACTOR_DEFINITION_REGISTRY:
                        definition = FACTOR_DEFINITION_REGISTRY[key]
                        factors.append({
                            "factor_type": definition.factor_type,
                            "factor_key": key,
                            "label": definition.label,
                            "source": "concern_note",
                            "mentioned_as": keyword,
                        })
                        seen_keys.add(key)

    return factors
