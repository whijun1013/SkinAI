from __future__ import annotations

from collections import Counter
from typing import Any


def build_candidate_signals(context: dict[str, Any]) -> list[dict[str, Any]]:
    timeline = context.get("daily_timeline") or []
    current = context.get("context") or {}
    signals = []

    signals.extend(_build_behavior_signals(timeline))
    signals.extend(_build_cosmetic_signals(current.get("current_cosmetics") or []))
    signals.extend(_build_environment_signals(timeline))
    signals.extend(_build_diet_signals(timeline))
    signals.extend(_build_medication_signals(current.get("current_medications") or []))

    signals = [signal for signal in signals if signal["score"] > 0]
    signals.sort(
        key=lambda item: (
            -item["score"],
            _agent_priority(item["agent_type"]),
            item["factor_key"],
        )
    )
    return [
        {
            **signal,
            "rank": index + 1,
            "score": round(signal["score"], 2),
        }
        for index, signal in enumerate(signals)
    ]


def apply_candidate_signals(llm_result: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    signals = context.get("candidate_signals") or []
    if not signals:
        return llm_result

    result = dict(llm_result)
    result["contributing_factors"] = [signal["label"] for signal in signals[:3]]
    result["confidence_score"] = _candidate_confidence(signals)
    result["agent_results"] = _merge_agent_results_with_signals(
        result.get("agent_results") or [],
        signals,
    )
    return result


def _build_behavior_signals(timeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sleep_days = []
    stress_days = []
    for day in timeline:
        behavior = day.get("behavior") or {}
        date = day.get("date")
        sleep_hours = _safe_float(behavior.get("sleep_hours"))
        stress_level = _safe_float(behavior.get("stress_level"))
        if sleep_hours is not None and sleep_hours < 6:
            sleep_days.append(date)
        if stress_level is not None and stress_level >= 4:
            stress_days.append(date)

    return [
        _count_signal(
            agent_type="behavior",
            factor_type="behavior",
            factor_key="sleep_shortage",
            label="수면 부족",
            count=len(sleep_days),
            recent_count=_recent_count(sleep_days, timeline),
            base=0.45,
            per_day=0.06,
            per_recent_day=0.04,
            max_score=0.85,
        ),
        _count_signal(
            agent_type="behavior",
            factor_type="behavior",
            factor_key="stress_high",
            label="높은 스트레스",
            count=len(stress_days),
            recent_count=_recent_count(stress_days, timeline),
            base=0.43,
            per_day=0.05,
            per_recent_day=0.04,
            max_score=0.82,
        ),
    ]


def _build_cosmetic_signals(cosmetics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ingredient_names = []
    for cosmetic in cosmetics:
        ingredient_names.extend(cosmetic.get("irritant_ingredients") or [])

    counts = Counter(_ingredient_key(name) for name in ingredient_names)
    labels = {_ingredient_key(name): _ingredient_label(name) for name in ingredient_names}
    signals = []
    for factor_key, count in counts.items():
        score = min(0.78, 0.60 + (0.03 * min(count, 3)))
        if factor_key == "retinol":
            score += 0.03
        signals.append(
            _signal(
                agent_type="cosmetic",
                factor_type="ingredient",
                factor_key=factor_key,
                label=labels[factor_key],
                score=score,
                evidence=f"현재 사용 화장품의 자극 가능 성분 {count}건",
            )
        )
    return signals


def _build_environment_signals(timeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pm25_days = []
    uv_days = []
    humidity_days = []
    for day in timeline:
        environment = day.get("environment") or {}
        date = day.get("date")
        pm25 = _safe_float(environment.get("pm25"))
        uv = _safe_float(environment.get("uv"))
        humidity = _safe_float(environment.get("humidity"))
        if pm25 is not None and pm25 >= 35:
            pm25_days.append(date)
        if uv is not None and uv >= 6:
            uv_days.append(date)
        if humidity is not None and humidity >= 65:
            humidity_days.append(date)

    return [
        _count_signal(
            agent_type="environment",
            factor_type="environment",
            factor_key="pm25",
            label="초미세먼지 높음",
            count=len(pm25_days),
            recent_count=_recent_count(pm25_days, timeline),
            base=0.38,
            per_day=0.04,
            per_recent_day=0.03,
            max_score=0.70,
        ),
        _count_signal(
            agent_type="environment",
            factor_type="environment",
            factor_key="uv_high",
            label="높은 UV",
            count=len(uv_days),
            recent_count=_recent_count(uv_days, timeline),
            base=0.35,
            per_day=0.04,
            per_recent_day=0.03,
            max_score=0.68,
        ),
        _count_signal(
            agent_type="environment",
            factor_type="environment",
            factor_key="humidity_high",
            label="높은 습도",
            count=len(humidity_days),
            recent_count=_recent_count(humidity_days, timeline),
            base=0.32,
            per_day=0.03,
            per_recent_day=0.03,
            max_score=0.62,
        ),
    ]


def _build_diet_signals(timeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    factor_dates = {
        "high_sugar": [],
        "high_fat": [],
        "high_gi": [],
        "dairy": [],
    }
    factor_evidence = {key: [] for key in factor_dates}
    for day in timeline:
        date = day.get("date")
        seen_today = {key: False for key in factor_dates}
        for meal in day.get("diet") or []:
            for food in meal.get("foods") or []:
                tags = food.get("skin_tags") or []
                flags = food.get("flags") or []
                skin_factors = food.get("skin_factors") or []
                factor_keys = {factor.get("key") for factor in skin_factors}

                matches = {
                    "high_sugar": "high_sugar" in factor_keys or "고당류" in tags,
                    "high_fat": "high_fat" in factor_keys or "고지방" in tags,
                    "high_gi": "high_gl_candidate" in factor_keys or any("고혈당지수" in flag for flag in flags),
                    "dairy": bool({"dairy_confirmed", "possible_dairy"} & factor_keys) or any("유제품" in flag for flag in flags),
                }
                for key, matched in matches.items():
                    if matched:
                        seen_today[key] = True
                        factor_evidence[key].extend(_food_factor_evidence(food, key))
        for key, seen in seen_today.items():
            if seen:
                factor_dates[key].append(date)

    return [
        _diet_count_signal(
            "high_sugar", "고당류", factor_dates, factor_evidence, timeline, 0.34, 0.025, 0.015, 0.66
        ),
        _diet_count_signal(
            "high_fat", "고지방", factor_dates, factor_evidence, timeline, 0.30, 0.02, 0.012, 0.58
        ),
        _diet_count_signal(
            "high_gi", "고혈당지수 음식", factor_dates, factor_evidence, timeline, 0.30, 0.025, 0.015, 0.62
        ),
        _diet_count_signal(
            "dairy", "유제품", factor_dates, factor_evidence, timeline, 0.28, 0.025, 0.015, 0.60
        ),
    ]


def _diet_count_signal(
    factor_key: str,
    label: str,
    factor_dates: dict[str, list[str | None]],
    factor_evidence: dict[str, list[str]],
    timeline: list[dict[str, Any]],
    base: float,
    per_day: float,
    per_recent_day: float,
    max_score: float,
) -> dict[str, Any]:
    dates = factor_dates[factor_key]
    signal = _count_signal(
        agent_type="diet",
        factor_type="food",
        factor_key=factor_key,
        label=label,
        count=len(dates),
        recent_count=_recent_count(dates, timeline),
        base=base,
        per_day=per_day,
        per_recent_day=per_recent_day,
        max_score=max_score,
    )
    evidence = list(dict.fromkeys(factor_evidence[factor_key]))[:4]
    if evidence:
        signal["evidence"] = f"{signal['evidence']} / 근거: {', '.join(evidence)}"
    return signal


def _food_factor_evidence(food: dict[str, Any], signal_key: str) -> list[str]:
    target_keys = {
        "high_sugar": {"high_sugar"},
        "high_fat": {"high_fat"},
        "high_gi": {"high_gl_candidate"},
        "dairy": {"dairy_confirmed", "possible_dairy"},
    }[signal_key]
    evidence = []
    for factor in food.get("skin_factors") or []:
        if factor.get("key") not in target_keys:
            continue
        source = factor.get("source")
        label = factor.get("label") or factor.get("key")
        for item in factor.get("evidence") or []:
            evidence.append(f"{food.get('name')}:{label}:{source}:{item}")
        if not factor.get("evidence"):
            evidence.append(f"{food.get('name')}:{label}:{source}")
    return evidence


def _build_medication_signals(medications: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ingredient_names = []
    for medication in medications:
        ingredient_names.extend(medication.get("skin_relevant_ingredients") or [])

    counts = Counter(_medication_key(name) for name in ingredient_names)
    labels = {_medication_key(name): _medication_label(name) for name in ingredient_names}
    return [
        _signal(
            agent_type="medication",
            factor_type="medication",
            factor_key=factor_key,
            label=labels[factor_key],
            score=min(0.62, 0.48 + (0.04 * min(count, 2))),
            evidence=f"피부 관련 약물 성분 {count}건",
        )
        for factor_key, count in counts.items()
    ]


def _merge_agent_results_with_signals(
    agent_results: list[dict[str, Any]],
    signals: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_agent = {result.get("agent_type"): dict(result) for result in agent_results}
    signals_by_agent: dict[str, list[dict[str, Any]]] = {}
    for signal in signals:
        signals_by_agent.setdefault(signal["agent_type"], []).append(signal)

    merged = []
    for agent_type in ("cosmetic", "diet", "environment", "behavior", "medication"):
        agent_result = by_agent.get(agent_type, {"agent_type": agent_type, "reason": ""})
        agent_signals = signals_by_agent.get(agent_type, [])[:2]
        items = [
            {
                "factor_type": signal["factor_type"],
                "factor_key": signal["factor_key"],
                "label": signal["label"],
                "confidence": signal["score"],
            }
            for signal in agent_signals
        ]
        agent_result["suspicious_items"] = items
        agent_result["confidence"] = max((item["confidence"] for item in items), default=None)
        merged.append(agent_result)
    return merged


def _candidate_confidence(signals: list[dict[str, Any]]) -> float:
    top_scores = [signal["score"] for signal in signals[:3]]
    if not top_scores:
        return 0.0
    return round(sum(top_scores) / len(top_scores), 2)


def _count_signal(
    *,
    agent_type: str,
    factor_type: str,
    factor_key: str,
    label: str,
    count: int,
    recent_count: int,
    base: float,
    per_day: float,
    per_recent_day: float,
    max_score: float,
) -> dict[str, Any]:
    score = 0.0 if count == 0 else min(max_score, base + (count * per_day) + (recent_count * per_recent_day))
    return _signal(
        agent_type=agent_type,
        factor_type=factor_type,
        factor_key=factor_key,
        label=label,
        score=score,
        evidence=f"최근 14일 중 {count}일 관찰, 최근 3일 중 {recent_count}일 관찰",
    )


def _signal(
    *,
    agent_type: str,
    factor_type: str,
    factor_key: str,
    label: str,
    score: float,
    evidence: str,
) -> dict[str, Any]:
    return {
        "agent_type": agent_type,
        "factor_type": factor_type,
        "factor_key": factor_key,
        "label": label,
        "score": score,
        "evidence": evidence,
    }


def _recent_count(signal_dates: list[str | None], timeline: list[dict[str, Any]]) -> int:
    recent_dates = {day.get("date") for day in timeline[-3:]}
    return sum(date in recent_dates for date in signal_dates)


def _safe_float(value) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _ingredient_key(value: str) -> str:
    text = value.strip().lower()
    if "retinol" in text or "레티놀" in text:
        return "retinol"
    if "fragrance" in text or "향료" in text:
        return "fragrance"
    return text.replace(" ", "_")


def _ingredient_label(value: str) -> str:
    key = _ingredient_key(value)
    if key == "retinol":
        return "레티놀"
    if key == "fragrance":
        return "향료"
    return value.strip()


def _medication_key(value: str) -> str:
    text = value.strip().lower()
    if "steroid" in text or "스테로이드" in text:
        return "steroid"
    return text.replace(" ", "_")


def _medication_label(value: str) -> str:
    key = _medication_key(value)
    if key == "steroid":
        return "스테로이드 성분"
    return value.strip()


def _agent_priority(agent_type: str) -> int:
    return {
        "behavior": 0,
        "cosmetic": 1,
        "environment": 2,
        "diet": 3,
        "medication": 4,
    }.get(agent_type, 99)
