from datetime import date, timedelta

from app.services.pattern_discovery import discover_patterns


def _day(logged_at: date, score: int):
    return {
        "date": logged_at.isoformat(),
        "skin": {"overall_score": score},
        "diet": [],
        "environment": None,
        "behavior": None,
        "cosmetic_started": [],
        "cosmetic_ended": [],
    }


def test_discovers_cosmetic_ingredient_group_patterns_from_current_cosmetics():
    start = date(2026, 6, 1)
    low_score_offsets = {1, 2, 3, 5, 6, 7, 9, 10, 11}
    timeline = [
        _day(start + timedelta(days=offset), 2 if offset in low_score_offsets else 5)
        for offset in range(14)
    ]

    result = discover_patterns(
        {
            "meta": {"trigger_date": "2026-06-14"},
            "daily_timeline": timeline,
            "context": {
                "current_cosmetics": [
                    {
                        "user_cosmetic_id": 10,
                        "product_name": "Test Cream",
                        "started_at": "2026-06-01",
                        "irritant_ingredients": ["Fragrance"],
                        "high_comedogenic_ingredients": ["Isopropyl Myristate"],
                        "functional_ingredients": ["Retinol"],
                        "ingredient_groups": [
                            {"key": "fragrance_essential_oil", "label": "Fragrance / essential oil", "ingredient": "Fragrance"},
                            {"key": "retinoid", "label": "Retinoid", "ingredient": "Retinol"},
                        ],
                    }
                ]
            },
        }
    )

    by_key = {item["factor_key"]: item for item in result}
    assert by_key["cosmetic_irritant_candidate"]["detail"] == "Fragrance"
    assert by_key["cosmetic_high_comedogenic"]["detail"] == "Isopropyl Myristate"
    assert by_key["cosmetic_functional_ingredient"]["detail"] == "Retinol"
    assert by_key["cosmetic_group_fragrance_essential_oil"]["detail"] == "Fragrance"
    assert by_key["cosmetic_group_retinoid"]["detail"] == "Retinol"
    assert by_key["cosmetic_group_retinoid"]["lag_max_days"] == 21
    assert by_key["cosmetic_irritant_candidate"]["lag_min_days"] == 1
    assert by_key["cosmetic_irritant_candidate"]["lag_max_days"] == 14
