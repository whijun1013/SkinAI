from datetime import date, timedelta

from app.services.pattern_discovery import discover_patterns


def _food(key: str):
    return {
        "name": key,
        "skin_tags": [],
        "flags": [],
        "skin_factors": [{"key": key, "label": key, "confidence": "high"}],
        "skin_factor_details": [{"key": key, "label": key, "confidence": "high"}],
    }


def _day(logged_at: date, score: int, *, factor_key: str | None = None):
    foods = [_food(factor_key)] if factor_key else []
    return {
        "date": logged_at.isoformat(),
        "skin": {"overall_score": score},
        "diet": [{"meal": "dinner", "foods": foods}] if foods else [],
        "environment": None,
        "behavior": None,
    }


def _context_for_factor(factor_key: str):
    start = date(2026, 6, 1)
    exposure_offsets = {0, 4, 8}
    low_score_offsets = {1, 2, 3, 5, 6, 7, 9, 10, 11}
    timeline = []
    for offset in range(14):
        factor = factor_key if offset in exposure_offsets else None
        score = 2 if offset in low_score_offsets else 5
        timeline.append(_day(start + timedelta(days=offset), score, factor_key=factor))
    return {
        "meta": {"trigger_date": "2026-06-14"},
        "daily_timeline": timeline,
    }


def test_discovers_expanded_food_factor_keys_from_skin_factors():
    cases = {
        "high_fat": "high_fat",
        "high_sodium": "high_sodium",
        "caffeine": "caffeine",
        "alcohol_histamine": "alcohol_food",
        "spicy_food": "spicy_food",
        "gluten": "gluten_wheat",
        "allergen_confirmed": "allergen",
        "ultra_processed": "ultra_processed",
        "chocolate": "chocolate",
        "nuts": "nuts",
        "fermented_food": "fermented_food",
    }

    for source_key, expected_pattern_key in cases.items():
        result = discover_patterns(_context_for_factor(source_key))
        assert expected_pattern_key in {item["factor_key"] for item in result}
