import pytest
import os
from app.services.action_recommendation_service import generate_action_recommendations

class MockPattern:
    def __init__(self, factor_key, evidence_level, effect_size, direction_consistency, exposure_days):
        self.factor_key = factor_key
        self.evidence_level = evidence_level
        self.effect_size = effect_size
        self.direction_consistency = direction_consistency
        self.exposure_days = exposure_days

def test_generate_action_recommendations_disabled():
    os.environ["ENABLE_ACTION_RECOMMENDATIONS"] = "false"
    patterns = [MockPattern("pm_high", "high", 1.5, 0.9, 5)]
    res = generate_action_recommendations(patterns)
    assert len(res) == 0

def test_generate_action_recommendations_enabled():
    os.environ["ENABLE_ACTION_RECOMMENDATIONS"] = "true"

    # 1 high, 1 moderate, 1 low(with <3 days so it skips), 1 low(with >3 days)
    patterns = [
        MockPattern("pm_high", "high", 1.5, 0.9, 5),
        MockPattern("sleep_shortage", "moderate", 1.0, 0.8, 4),
        MockPattern("uv_high", "low", 0.5, 0.5, 2), # skipped
        MockPattern("high_sugar", "low", 0.6, 0.6, 5),
        MockPattern("unknown_factor", "high", 2.0, 1.0, 10) # ignored because not in rules
    ]

    res = generate_action_recommendations(patterns)

    # pm_high (high -> 3000 + 150 + 9 + 5 = 3164)
    # sleep_shortage (moderate -> 2000 + 100 + 8 + 4 = 2112)
    # high_sugar (low -> 1000 + 60 + 6 + 5 = 1071)
    # uv_high (low, exposure=2 -> skipped)

    assert len(res) == 3
    assert res[0]["factor_key"] == "pm_high"
    assert res[1]["factor_key"] == "sleep_shortage"
    assert res[2]["factor_key"] == "high_sugar"

    assert "의료" not in res[0]["action"]
    assert "치료" not in res[0]["action"]
    assert "진단" not in res[0]["action"]

def test_generate_action_recommendations_dict_support():
    os.environ["ENABLE_ACTION_RECOMMENDATIONS"] = "true"
    patterns = [{
        "factor_key": "dairy",
        "evidence_level": "moderate",
        "effect_size": 1.2,
        "direction_consistency": 0.8,
        "exposure_days": 3
    }]
    res = generate_action_recommendations(patterns)
    assert len(res) == 1
    assert res[0]["factor_key"] == "dairy"
