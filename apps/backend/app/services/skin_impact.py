"""Adapt stored food skin factors for analysis context payloads."""

from typing import Any

from app.models.diet import FoodItem

_NUTRIENT_TAG = {
    "sugar": "\uace0\ub2f9\ub958",
    "sodium": "\uace0\ub098\ud2b8\ub968",
    "fat": "\uace0\uc9c0\ubc29",
}

_FACTOR_FALLBACK_LABEL = {
    "high_sugar": "\uace0\ub2f9\ub958",
    "high_sodium": "\uace0\ub098\ud2b8\ub968",
    "high_fat": "\uace0\uc9c0\ubc29",
    "dairy_confirmed": "\uc720\uc81c\ud488",
    "possible_dairy": "\uc720\uc81c\ud488",
    "high_gl_candidate": "\uace0\ud608\ub2f9\uc9c0\uc218",
}


def _normalize_skin_factors(raw_factors: Any) -> list[dict]:
    if not raw_factors:
        return []

    if isinstance(raw_factors, dict):
        factors = []
        for key, items in raw_factors.items():
            if isinstance(items, dict):
                items = [items]
            for item in items or []:
                if not isinstance(item, dict):
                    continue
                factor = dict(item)
                factor.setdefault("key", key)
                factors.append(factor)
        return factors

    if isinstance(raw_factors, list):
        return [dict(item) for item in raw_factors if isinstance(item, dict)]

    return []


def _build_factor_details(factors: list[dict]) -> list[dict]:
    details = []
    for factor in factors:
        detail = {
            key: factor[key]
            for key in ("key", "label", "level", "confidence", "source", "evidence")
            if key in factor and factor[key] not in (None, "", [])
        }
        if detail:
            details.append(detail)
    return details


def adapt_food_skin_factors_for_context(food_item: FoodItem) -> dict:
    """Return backward-compatible skin impact fields for a FoodItem."""
    tags = []
    notes = []
    flags = []

    factors = _normalize_skin_factors(food_item.skin_factors)
    details = _build_factor_details(factors)

    for factor in factors:
        key = factor.get("key")
        label = factor.get("label") or _FACTOR_FALLBACK_LABEL.get(key)

        if key in ("high_sugar", "high_sodium", "high_fat"):
            tags.append(label or _NUTRIENT_TAG.get(key.replace("high_", ""), ""))
            evidence = factor.get("evidence", [])
            if evidence:
                notes.append(evidence[0])
        elif key in ("dairy_confirmed", "possible_dairy"):
            flags.append(label or "dairy")
        elif key == "high_gl_candidate":
            flags.append(label or "high_gl_candidate")
        elif label:
            tags.append(label)

    return {
        "tags": list(dict.fromkeys(tag for tag in tags if tag)),
        "flags": list(dict.fromkeys(flag for flag in flags if flag)),
        "notes": notes,
        "details": details,
        "skin_factors": factors,
    }
