from typing import List, Dict, Any

from app.services.pattern_discovery import FACTOR_DEFINITION_REGISTRY

KEYWORD_MAPPING = {
    "스트레스": ["stress_high"],
    "잠": ["sleep_shortage"],
    "수면": ["sleep_shortage"],
    "피곤": ["sleep_shortage"],
    "단것": ["high_sugar"],
    "단거": ["high_sugar"],
    "초콜릿": ["high_sugar"],
    "우유": ["dairy"],
    "유제품": ["dairy"],
    "빵": ["high_gi"],
    "흰쌀": ["high_gi"],
    "면류": ["high_gi"],
    "라면": ["high_gi"],
    "과자": ["high_gi"],
    "자외선": ["uv_high"],
    "햇빛": ["uv_high"],
    "햇볕": ["uv_high"],
    "미세먼지": ["pm_high"],
    "황사": ["pm_high"],
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
