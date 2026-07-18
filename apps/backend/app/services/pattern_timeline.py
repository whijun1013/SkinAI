"""Timeline normalization and exposure-window helpers for pattern discovery."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from app.services.period_cycle_service import DEFAULT_CYCLE_LENGTH, _resolve_phase


def parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def extract_skin_signals(skin: dict[str, Any]) -> dict[str, float]:
    signals = ((skin.get("medgemma") or {}).get("signals") or {})
    return {
        key: -float(value)
        for key in ("active_lesion", "redness", "barrier")
        if isinstance((value := signals.get(key)), (int, float))
    }


def normalize_timeline(timeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for day in timeline:
        logged_date = parse_date(day.get("date"))
        if logged_date is None:
            continue
        skin = day.get("skin") or {}
        result.append({
            **day,
            "date": logged_date,
            "score": safe_float(skin.get("overall_score")),
            "signals": extract_skin_signals(skin),
        })
    return sorted(result, key=lambda item: item["date"])


def filter_timeline_from(timeline: list[dict[str, Any]], start_date: date | None) -> list[dict[str, Any]]:
    return timeline if start_date is None else [day for day in timeline if day["date"] >= start_date]


def attach_period_phases(timeline: list[dict[str, Any]], period_logs: list[dict[str, Any]]) -> None:
    starts = sorted(
        started_at
        for item in period_logs
        if (started_at := parse_date(item.get("started_at"))) is not None
    )
    for day in timeline:
        candidates = [started_at for started_at in starts if started_at <= day["date"]]
        if not candidates:
            continue
        cycle_day = (day["date"] - candidates[-1]).days + 1
        phase, phase_label = _resolve_phase(cycle_day, DEFAULT_CYCLE_LENGTH)
        day["period_phase"] = phase
        day["period_phase_label"] = phase_label
        day["period_cycle_day"] = cycle_day


def attach_cosmetic_ingredient_group_exposures(
    timeline: list[dict[str, Any]],
    current_cosmetics: list[dict[str, Any]],
) -> None:
    by_date = {day["date"]: day for day in timeline}
    field_map = {
        "cosmetic_irritant_ingredients": "irritant_ingredients",
        "cosmetic_high_comedogenic_ingredients": "high_comedogenic_ingredients",
        "cosmetic_functional_ingredients": "functional_ingredients",
        "cosmetic_ingredient_groups": "ingredient_groups",
    }
    for cosmetic in current_cosmetics:
        day = by_date.get(parse_date(cosmetic.get("started_at")))
        if day is None:
            continue
        for target_key, source_key in field_map.items():
            existing = list(day.get(target_key) or [])
            for value in cosmetic.get(source_key) or []:
                if value not in existing:
                    existing.append(value)
            if existing:
                day[target_key] = existing


def lag_target_dates(
    exposure_dates: list[date],
    lag_min_days: int,
    lag_max_days: int,
    score_by_date: dict[date, float],
) -> set[date]:
    return {
        target_date
        for exposure_date in exposure_dates
        for offset in range(lag_min_days, lag_max_days + 1)
        if (target_date := exposure_date + timedelta(days=offset)) in score_by_date
    }


def direction_consistency(
    *,
    exposure_dates: list[date],
    lag_min_days: int,
    lag_max_days: int,
    score_by_date: dict[date, float],
    comparison_avg: float,
) -> float:
    event_averages = []
    for exposure_date in exposure_dates:
        scores = [
            score_by_date[target_date]
            for offset in range(lag_min_days, lag_max_days + 1)
            if (target_date := exposure_date + timedelta(days=offset)) in score_by_date
        ]
        if scores:
            event_averages.append(sum(scores) / len(scores))
    if not event_averages:
        return 0.0
    return round(sum(value < comparison_avg for value in event_averages) / len(event_averages), 2)


def baseline_exclusion_dates(trigger_day: date) -> set[date]:
    return {trigger_day - timedelta(days=offset) for offset in range(4)}
