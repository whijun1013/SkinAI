from datetime import date, timedelta

from app.services.pattern_discovery import discover_patterns


def _day(logged_at: date, score: int, *, sleep_hours: int = 8, stress_level: int | None = None):
    behavior = {"sleep_hours": sleep_hours}
    if stress_level is not None:
        behavior["stress_level"] = stress_level
    return {
        "date": logged_at.isoformat(),
        "skin": {"overall_score": score},
        "diet": [],
        "environment": None,
        "behavior": behavior,
    }


def test_daily_pattern_confidence_exposes_five_required_metrics():
    start = date(2026, 6, 1)
    sleep_offsets = {0, 4, 8}
    missing_offsets = {5}
    counterexample_offsets = {3}
    timeline = []

    for offset in range(14):
        if offset in missing_offsets:
            continue
        logged_at = start + timedelta(days=offset)
        sleep_hours = 5 if offset in sleep_offsets else 8
        stress_level = 5 if offset in sleep_offsets else 1
        score = 2 if offset in sleep_offsets or offset in {1, 2, 6, 9, 10} or offset in counterexample_offsets else 5
        timeline.append(_day(logged_at, score, sleep_hours=sleep_hours, stress_level=stress_level))

    result = discover_patterns(
        {
            "meta": {"trigger_date": "2026-06-14"},
            "daily_timeline": timeline,
        }
    )

    sleep = next(item for item in result if item["factor_key"] == "sleep_shortage")
    factors = sleep["confidence_factors"]

    assert factors["exposure_event_count"] == 3
    assert factors["baseline_change"] > 0
    assert factors["counterexample_days"] >= 1
    assert factors["missing_rate"] > 0
    assert factors["concurrent_exposure_avg"] == 1.0
    assert "confidence" in sleep
