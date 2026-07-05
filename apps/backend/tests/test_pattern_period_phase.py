from datetime import date, timedelta

from app.services.pattern_discovery import discover_patterns


def _day(logged_at: date, score: int):
    return {
        "date": logged_at.isoformat(),
        "skin": {"overall_score": score},
        "diet": [],
        "environment": None,
        "behavior": None,
    }


def test_discovers_luteal_phase_pattern_from_period_logs():
    start = date(2026, 6, 1)
    timeline = []
    for offset in range(28):
        logged_at = start + timedelta(days=offset)
        cycle_day = offset + 1
        score = 2 if cycle_day >= 16 else 5
        timeline.append(_day(logged_at, score))

    result = discover_patterns(
        {
            "meta": {"trigger_date": "2026-06-28"},
            "daily_timeline": timeline,
            "context": {
                "period_logs": [{"started_at": "2026-06-01"}],
            },
        }
    )

    by_key = {item["factor_key"]: item for item in result}
    assert "period_luteal_phase" in by_key
    pattern = by_key["period_luteal_phase"]
    assert pattern["factor_type"] == "behavior"
    assert pattern["label"] == "황체기"
    assert pattern["lag_min_days"] == 0
    assert pattern["lag_max_days"] == 0
    assert pattern["exposure_days"] >= 10
    assert pattern["confidence_factors"]["exposure_event_count"] >= 10
