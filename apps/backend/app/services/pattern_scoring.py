"""Evidence and confidence calculations for deterministic pattern discovery."""

from __future__ import annotations

from datetime import date
from typing import Any, Iterable

MIN_STRONG_EXPOSURE_DAYS = 3
MIN_STRONG_COMPARISON_DAYS = 3
STRONG_EFFECT_SIZE = 0.7
STRONG_DIRECTION_CONSISTENCY = 0.6
MIN_MODERATE_EXPOSURE_DAYS = 2
MIN_MODERATE_COMPARISON_DAYS = 2
MODERATE_EFFECT_SIZE = 0.4
MODERATE_DIRECTION_CONSISTENCY = 0.5


def evidence_level(
    *,
    exposure_days: int,
    comparison_days: int,
    effect_size: float,
    direction_consistency: float,
) -> str:
    if (
        exposure_days >= MIN_STRONG_EXPOSURE_DAYS
        and comparison_days >= MIN_STRONG_COMPARISON_DAYS
        and effect_size >= STRONG_EFFECT_SIZE
        and direction_consistency >= STRONG_DIRECTION_CONSISTENCY
    ):
        return "strong"
    if (
        exposure_days >= MIN_MODERATE_EXPOSURE_DAYS
        and comparison_days >= MIN_MODERATE_COMPARISON_DAYS
        and effect_size >= MODERATE_EFFECT_SIZE
        and direction_consistency >= MODERATE_DIRECTION_CONSISTENCY
    ):
        return "moderate"
    return "weak"


def confidence(
    evidence: str,
    effect_size: float,
    direction_consistency: float,
    factors: dict[str, Any] | None = None,
) -> float:
    value = {"strong": 0.75, "moderate": 0.55, "weak": 0.25}[evidence]
    value += max(0.0, effect_size) * 0.05 + direction_consistency * 0.05
    if factors:
        exposure_count = int(factors.get("exposure_event_count") or 0)
        counterexamples = int(factors.get("counterexample_days") or 0)
        if exposure_count > 0 and counterexamples >= exposure_count:
            return 0.0
        missing_rate = factors.get("missing_rate")
        if isinstance(missing_rate, (int, float)):
            value -= float(missing_rate) * 0.25
            if missing_rate > 0.5:
                value = min(value, 0.3)
        concurrent_avg = factors.get("concurrent_exposure_avg")
        if isinstance(concurrent_avg, (int, float)):
            value -= min(float(concurrent_avg), 3.0) * 0.05
        if exposure_count:
            value -= counterexamples / max(exposure_count + counterexamples, 1) * 0.3
            value += min(exposure_count / 5, 1.0) * 0.08
    return round(max(0.0, min(0.95, value)), 2)


def counterexample_days(comparison_scores: list[float], exposed_avg: float) -> int:
    return sum(1 for score in comparison_scores if score <= exposed_avg)


def missing_rate(score_by_date: dict[date, float]) -> float | None:
    if not score_by_date:
        return None
    dates = sorted(score_by_date)
    expected_days = (dates[-1] - dates[0]).days + 1
    return 0.0 if expected_days <= 0 else round(1 - len(score_by_date) / expected_days, 2)


def concurrent_exposure_average(
    definition: Any,
    definitions: Iterable[Any],
    timeline: list[dict[str, Any]],
    exposure_dates: list[date],
) -> float:
    exposure_set = set(exposure_dates)
    if not exposure_set:
        return 0.0
    counts = [
        sum(1 for other in definitions if other.factor_key != definition.factor_key and other.matcher(day))
        for day in timeline
        if day["date"] in exposure_set
    ]
    return round(sum(counts) / len(counts), 2) if counts else 0.0


def confidence_factors(
    *,
    definition: Any,
    definitions: Iterable[Any],
    timeline: list[dict[str, Any]],
    exposure_dates: list[date],
    score_by_date: dict[date, float],
    lag_target_dates: set[date],
    exposed_avg: float,
    comparison_scores: list[float],
    effect_size: float,
    direction_consistency: float,
) -> dict[str, Any]:
    return {
        "exposure_event_count": len(exposure_dates),
        "baseline_change": max(0.0, round(effect_size, 2)),
        "counterexample_days": counterexample_days(comparison_scores, exposed_avg),
        "missing_rate": missing_rate(score_by_date),
        "concurrent_exposure_avg": concurrent_exposure_average(definition, definitions, timeline, exposure_dates),
        "lag_target_days": len(lag_target_dates),
        "direction_consistency": direction_consistency,
    }
