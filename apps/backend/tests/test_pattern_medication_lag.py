from datetime import date, timedelta

from app.services.pattern_discovery import discover_patterns


def _day(logged_at: date, score: int, *, started=None, ended=None):
    return {
        "date": logged_at.isoformat(),
        "skin": {"overall_score": score},
        "diet": [],
        "environment": None,
        "behavior": None,
        "medication_started": started or [],
        "medication_ended": ended or [],
    }


def test_discovers_medication_started_with_one_to_thirty_day_lag():
    start = date(2026, 6, 1)
    medication_offsets = {0, 10, 20}
    low_score_offsets = {5, 6, 15, 16, 25, 26}
    timeline = []

    for offset in range(31):
        score = 2 if offset in low_score_offsets else 5
        started = ["Test Med"] if offset in medication_offsets else []
        timeline.append(_day(start + timedelta(days=offset), score, started=started))

    result = discover_patterns(
        {
            "meta": {"trigger_date": "2026-07-01"},
            "lookback_days": 31,
            "daily_timeline": timeline,
        }
    )

    by_key = {item["factor_key"]: item for item in result}
    pattern = by_key["medication_started"]
    assert pattern["factor_type"] == "medication"
    assert pattern["lag_min_days"] == 1
    assert pattern["lag_max_days"] == 30
    assert pattern["detail"] == "Test Med"
    assert pattern["confidence_factors"]["exposure_event_count"] == 3


def test_discovers_medication_stopped_with_one_to_thirty_day_lag():
    start = date(2026, 6, 1)
    stop_offsets = {0, 10, 20}
    low_score_offsets = {3, 4, 13, 14, 23, 24}
    timeline = []

    for offset in range(31):
        score = 2 if offset in low_score_offsets else 5
        ended = ["Test Med"] if offset in stop_offsets else []
        timeline.append(_day(start + timedelta(days=offset), score, ended=ended))

    result = discover_patterns(
        {
            "meta": {"trigger_date": "2026-07-01"},
            "lookback_days": 31,
            "daily_timeline": timeline,
        }
    )

    by_key = {item["factor_key"]: item for item in result}
    pattern = by_key["medication_stopped"]
    assert pattern["factor_type"] == "medication"
    assert pattern["lag_min_days"] == 1
    assert pattern["lag_max_days"] == 30
    assert pattern["detail"] == "Test Med"
