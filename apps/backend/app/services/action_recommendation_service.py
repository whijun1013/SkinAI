import logging
import os
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# Action recommendation rules mapping factor_key -> dict of details
ACTION_RULES = {
    # Environment
    "pm_high": {
        "title": "오늘은 장벽 보호 루틴을 우선하세요",
        "action": "저녁에는 자극 성분 제품을 줄이고 보습 제품을 먼저 사용해보세요.",
        "category": "environment",
        "action_key": "pm_high_barrier_care"
    },
    "uv_high": {
        "title": "자외선 노출에 주의가 필요해요",
        "action": "외출 전 자외선 차단제를 꼼꼼히 바르고, 귀가 후 진정 스킨케어를 해주세요.",
        "category": "environment",
        "action_key": "uv_high_sun_protection"
    },
    # Behavior
    "sleep_shortage": {
        "title": "수면 부족이 피부에 영향을 주고 있어요",
        "action": "주말에는 충분한 휴식을 취하고, 오늘은 수분 마스크팩으로 보충해보세요.",
        "category": "behavior",
        "action_key": "sleep_shortage_hydrate"
    },
    "stress_high": {
        "title": "스트레스가 피부 트러블을 유발할 수 있어요",
        "action": "가벼운 산책이나 명상으로 스트레스를 풀고, 자극이 적은 기초 제품을 사용하세요.",
        "category": "behavior",
        "action_key": "stress_high_calm"
    },
    # Diet
    "high_sugar": {
        "title": "당분 섭취를 조금 줄여보는 건 어떨까요?",
        "action": "당류 섭취가 많은 날 트러블 신호가 관찰되었어요. 식단에서 당분을 의식적으로 줄여보세요.",
        "category": "diet",
        "action_key": "high_sugar_reduce"
    },
    "dairy": {
        "title": "유제품 섭취와 피부 신호의 연관성이 보여요",
        "action": "유제품 대신 대체유(아몬드, 귀리)를 며칠간 시도해보는 것을 제안합니다.",
        "category": "diet",
        "action_key": "dairy_replace"
    },
    "gluten_wheat": {
        "title": "밀가루 음식을 줄이는 식단을 추천해요",
        "action": "글루텐/밀가루 섭취 후 불편함이 있었다면 며칠간 쌀이나 대체 탄수화물을 선택해보세요.",
        "category": "diet",
        "action_key": "gluten_wheat_reduce"
    },
    "spicy": {
        "title": "매운 음식이 피부 자극을 높일 수 있어요",
        "action": "자극적인 식사 후에는 충분한 물을 마시고, 피부 온도를 낮추는 스킨케어를 해주세요.",
        "category": "diet",
        "action_key": "spicy_calm"
    },
    "high_sodium": {
        "title": "나트륨 섭취가 많은 날 수분 관리가 필요해요",
        "action": "짜게 먹은 날은 수분이 빠져나가기 쉬우니 보습에 더 신경 써주세요.",
        "category": "diet",
        "action_key": "high_sodium_hydrate"
    },
    "alcohol": {
        "title": "음주 후에는 피부 수분이 부족해질 수 있어요",
        "action": "물 한 컵을 더 마시고, 취침 전 평소보다 보습 크림을 넉넉히 발라주세요.",
        "category": "diet",
        "action_key": "alcohol_hydrate"
    },
    "caffeine": {
        "title": "카페인 섭취와 피부 건조의 관계가 보여요",
        "action": "커피 한 잔 후에는 반드시 물 한 잔을 마시는 습관을 들여보세요.",
        "category": "diet",
        "action_key": "caffeine_water"
    },
    # Period
    "period_luteal_phase": {
        "title": "황체기에 접어들어 피지 분비가 늘 수 있어요",
        "action": "트러블이 생기기 쉬운 시기이니, 꼼꼼한 클렌징과 산뜻한 수분 관리에 집중하세요.",
        "category": "period",
        "action_key": "luteal_phase_cleansing"
    },
    # Cosmetics
    "retinoid": {
        "title": "레티노이드 성분 사용 시 자극에 주의하세요",
        "action": "피부가 예민해졌다면 사용 주기를 늦추거나 보습제를 충분히 발라 장벽을 보호하세요.",
        "category": "cosmetics",
        "action_key": "retinoid_barrier_care"
    },
    "exfoliating_acid": {
        "title": "각질 제거 성분을 사용할 때는 밸런스가 중요해요",
        "action": "자극 신호가 있다면 며칠 쉬어주고 진정 성분이 포함된 제품으로 전환해보세요.",
        "category": "cosmetics",
        "action_key": "exfoliating_acid_rest"
    },
    "fragrance_essential_oil": {
        "title": "향료나 에센셜 오일이 자극이 될 수 있어요",
        "action": "붉은기나 간지러움이 있을 때는 무향/무자극 제품 위주로 단순하게 관리하세요.",
        "category": "cosmetics",
        "action_key": "fragrance_essential_oil_free"
    },
    "drying_alcohol": {
        "title": "알코올 성분이 피부를 건조하게 할 수 있어요",
        "action": "건조함이 심해진다면 건성용/알코올 프리 토너로 바꿔보는 것도 좋은 방법입니다.",
        "category": "cosmetics",
        "action_key": "drying_alcohol_replace"
    },
    # Medications
    "medication_started": {
        "title": "새로운 약물을 복용 중이시네요",
        "action": "약물 복용 중에는 피부가 평소와 다르게 반응할 수 있으니 세심하게 관찰해주세요.",
        "category": "medication",
        "action_key": "medication_started_observe"
    }
}

EVIDENCE_LEVEL_WEIGHTS = {
    "high": 3,
    "moderate": 2,
    "low": 1
}

def generate_action_recommendations(patterns: List[Any], limit: int = 3) -> List[Dict[str, str]]:
    """
    Generate up to `limit` action recommendations based on discovered patterns.
    Sorts based on evidence level, effect size, direction consistency, and exposure days.
    """
    if os.getenv("ENABLE_ACTION_RECOMMENDATIONS", "true").lower() not in ("true", "1", "yes"):
        return []

    scored_candidates = []

    for pattern in patterns:
        factor_key = getattr(pattern, "factor_key", None)
        if not factor_key:
            # If pattern is a dict
            if isinstance(pattern, dict):
                factor_key = pattern.get("factor_key")
            else:
                continue

        if not factor_key or factor_key not in ACTION_RULES:
            continue

        evidence_level = getattr(pattern, "evidence_level", None) or (isinstance(pattern, dict) and pattern.get("evidence_level")) or "low"
        effect_size = getattr(pattern, "effect_size", None) or (isinstance(pattern, dict) and pattern.get("effect_size")) or 0.0
        dir_consist = getattr(pattern, "direction_consistency", None) or (isinstance(pattern, dict) and pattern.get("direction_consistency")) or 0.0
        exposure_days = getattr(pattern, "exposure_days", None) or (isinstance(pattern, dict) and pattern.get("exposure_days")) or 0

        # Sort score (higher is better)
        # 1. evidence level weight (1~3) * 1000 to be primary sorter
        # 2. effect_size absolute value * 100
        # 3. direction consistency * 10
        # 4. exposure days
        evidence_w = EVIDENCE_LEVEL_WEIGHTS.get(evidence_level, 0)

        # Only suggest if evidence is moderate or high, or if they have decent effect size.
        if evidence_level == "low" and exposure_days < 3:
            continue

        score = (evidence_w * 1000) + (abs(effect_size) * 100) + (dir_consist * 10) + exposure_days

        confidence_label = "조심스럽게 참고" if evidence_level in ("low", "moderate") else "신뢰할 수 있음"

        rule = ACTION_RULES[factor_key]
        reason_desc = "관련된 패턴이 지속적으로 관찰되었습니다."
        if evidence_w >= 2:
            reason_desc = f"최근 {factor_key} 관련 신호가 나빠지는 경향이 뚜렷하게 관찰되었습니다."

        action_item = {
            "action_key": rule["action_key"],
            "title": rule["title"],
            "reason": reason_desc,
            "action": rule["action"],
            "category": rule["category"],
            "factor_key": factor_key,
            "evidence_level": evidence_level,
            "confidence_label": confidence_label
        }

        scored_candidates.append((score, action_item))

    # Sort descending
    scored_candidates.sort(key=lambda x: x[0], reverse=True)

    # Return top N, limit to unique action keys to avoid dupes
    results = []
    seen = set()
    for _, action in scored_candidates:
        if action["action_key"] not in seen:
            seen.add(action["action_key"])
            results.append(action)
            if len(results) >= limit:
                break

    return results
