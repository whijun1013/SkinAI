from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from app.services.pattern_discovery import (
    FACTOR_DEFINITION_REGISTRY,
    SKIN_SIGNALS,
    _average,
    _confidence,
    _direction_consistency,
    _extract_skin_signals,
    _filter_timeline_from,
    _lag_target_dates,
    _parse_date,
    _safe_float,
)

# P2 factor_key → changepoint_service의 연속형 factor_key
_P2_TO_CONTINUOUS_KEY: dict[str, str] = {
    "sleep_shortage": "sleep_hours",
    "stress_high": "stress_level",
    "uv_high": "uv_index",
    "pm_high": "pm25",
}

_MIN_BEFORE_AFTER_DAYS = 3

# effect_size는 MedGemma 4등급을 변환한 0~3 점수의 평균 등급 차이다.
CONFIRMED_EFFECT_SIZE = 0.5
PARTIAL_EFFECT_SIZE = 0.25
CONFIRMED_MIN_EXPOSURE_DAYS = 3
PARTIAL_MIN_EXPOSURE_DAYS = 2


def evaluate_concern_verdicts(
    factors: List[Dict[str, Any]], context: Dict[str, Any]
) -> List[Dict[str, Any]]:
    timeline = _normalized_timeline_for_verdict(context.get("daily_timeline") or [])
    trigger_day = _parse_date((context.get("meta") or {}).get("trigger_date"))
    if not timeline or trigger_day is None:
        return _inconclusive_verdicts(factors)

    factor_methods = context.get("factor_methods") or {}
    factor_changepoints = context.get("factor_changepoints") or {}
    analysis_window_start = _parse_date(context.get("analysis_window_start_date"))
    analysis_timeline = _filter_timeline_from(timeline, analysis_window_start)
    excluded_baseline_dates = _baseline_exclusion_dates(trigger_day)
    has_any_medgemma = any(day["signal_scores"] for day in timeline)
    analysis_has_any_medgemma = any(
        day["signal_scores"] for day in analysis_timeline
    )

    verdicts = []
    for factor in factors:
        key = factor["factor_key"]
        if key not in FACTOR_DEFINITION_REGISTRY:
            verdicts.append(_inconclusive_verdict(factor))
            continue

        definition = FACTOR_DEFINITION_REGISTRY[key]

        continuous_key = _P2_TO_CONTINUOUS_KEY.get(key)
        analysis_method = factor_methods.get(continuous_key) if continuous_key else None
        changepoint_date = factor_changepoints.get(continuous_key) if continuous_key else None

        if analysis_method == "before_after" and changepoint_date:
            verdicts.extend(
                _evaluate_before_after_verdict(factor, changepoint_date, timeline, has_any_medgemma)
            )
            continue

        # daily_correlation
        exposure_dates = [
            day["date"] for day in analysis_timeline if definition.matcher(day)
        ]
        if not exposure_dates:
            verdicts.append(_inconclusive_verdict(factor))
            continue

        if analysis_has_any_medgemma:
            for signal in SKIN_SIGNALS:
                score_by_date = {
                    day["date"]: day["signal_scores"][signal]
                    for day in analysis_timeline
                    if signal in day["signal_scores"]
                }
                verdicts.append(
                    _evaluate_one(
                        factor,
                        definition,
                        exposure_dates,
                        score_by_date,
                        excluded_baseline_dates,
                        outcome_metric=f"medgemma:{signal}",
                        signal=signal,
                    )
                )
        else:
            score_by_date = {
                day["date"]: day["score"]
                for day in analysis_timeline
                if day["score"] is not None
            }
            verdicts.append(
                _evaluate_one(
                    factor,
                    definition,
                    exposure_dates,
                    score_by_date,
                    excluded_baseline_dates,
                    outcome_metric="overall_score",
                    signal=None,
                )
            )

    return verdicts


def _evaluate_before_after_verdict(
    factor: Dict[str, Any],
    changepoint_date: date,
    timeline: List[Dict[str, Any]],
    has_any_medgemma: bool,
) -> List[Dict[str, Any]]:
    if has_any_medgemma:
        return [
            _evaluate_before_after_one(
                factor,
                changepoint_date,
                timeline,
                signal=signal,
                outcome_metric=f"medgemma:{signal}",
            )
            for signal in SKIN_SIGNALS
        ]
    return [
        _evaluate_before_after_one(
            factor,
            changepoint_date,
            timeline,
            signal=None,
            outcome_metric="overall_score",
        )
    ]


def _evaluate_before_after_one(
    factor: Dict[str, Any],
    changepoint_date: date,
    timeline: List[Dict[str, Any]],
    signal: Optional[str],
    outcome_metric: str,
) -> Dict[str, Any]:
    before_scores: list[float] = []
    after_scores: list[float] = []

    for day in timeline:
        if signal:
            if signal not in day["signal_scores"]:
                continue
            score = day["signal_scores"][signal]
        else:
            if day["score"] is None:
                continue
            score = day["score"]

        if day["date"] < changepoint_date:
            before_scores.append(score)
        else:
            after_scores.append(score)

    if len(before_scores) < _MIN_BEFORE_AFTER_DAYS or len(after_scores) < _MIN_BEFORE_AFTER_DAYS:
        return _inconclusive_verdict(
            factor, signal=signal, outcome_metric=outcome_metric, analysis_method="before_after"
        )

    before_avg = _average(before_scores)
    after_avg = _average(after_scores)
    effect_size = round(before_avg - after_avg, 2)

    verdict = _determine_verdict(effect_size, len(after_scores))
    evidence_level = _evidence_level_for_confidence(verdict)
    confidence = _confidence(evidence_level, effect_size, 0.0)

    return {
        **factor,
        "signal": signal,
        "verdict": verdict,
        "effect_size": effect_size,
        "exposure_days": len(after_scores),
        "comparison_days": len(before_scores),
        "outcome_metric": outcome_metric,
        "confidence": confidence,
        "analysis_method": "before_after",
    }


def _evaluate_one(
    factor: Dict[str, Any],
    definition,
    exposure_dates: List[date],
    score_by_date: Dict[date, float],
    excluded_baseline_dates: set,
    outcome_metric: str,
    signal: Optional[str],
) -> Dict[str, Any]:
    if not score_by_date:
        return _inconclusive_verdict(factor, signal=signal, outcome_metric=outcome_metric)

    lag_target_dates = _lag_target_dates(
        exposure_dates,
        definition.lag_min_days,
        definition.lag_max_days,
        score_by_date,
    )
    exposed_scores = [score_by_date[target_date] for target_date in lag_target_dates]

    if not exposed_scores:
        return _inconclusive_verdict(factor, signal=signal, outcome_metric=outcome_metric)

    comparison_scores = [
        score
        for scored_date, score in score_by_date.items()
        if scored_date not in lag_target_dates and scored_date not in excluded_baseline_dates
    ]
    comparison_days = len(comparison_scores)

    if comparison_days < 2:
        return _inconclusive_verdict(factor, signal=signal, outcome_metric=outcome_metric)

    exposed_avg = _average(exposed_scores)
    comparison_avg = _average(comparison_scores)
    effect_size = round(comparison_avg - exposed_avg, 2)

    exposure_days = len(exposure_dates)
    verdict = _determine_verdict(effect_size, exposure_days)

    direction_consistency = _direction_consistency(
        exposure_dates=exposure_dates,
        lag_min_days=definition.lag_min_days,
        lag_max_days=definition.lag_max_days,
        score_by_date=score_by_date,
        comparison_avg=comparison_avg,
    )

    evidence_level = _evidence_level_for_confidence(verdict)
    confidence = _confidence(evidence_level, effect_size, direction_consistency)

    return {
        **factor,
        "signal": signal,
        "verdict": verdict,
        "effect_size": effect_size,
        "exposure_days": exposure_days,
        "comparison_days": comparison_days,
        "outcome_metric": outcome_metric,
        "confidence": confidence,
        "analysis_method": "daily_correlation",
    }


def _determine_verdict(effect_size: float, exposure_days: int) -> str:
    if effect_size >= CONFIRMED_EFFECT_SIZE and exposure_days >= CONFIRMED_MIN_EXPOSURE_DAYS:
        return "confirmed"
    elif effect_size >= PARTIAL_EFFECT_SIZE and exposure_days >= PARTIAL_MIN_EXPOSURE_DAYS:
        return "partial"
    elif effect_size > 0:
        return "weak"
    else:
        return "low"


def _evidence_level_for_confidence(verdict: str) -> str:
    if verdict == "confirmed":
        return "strong"
    if verdict == "partial":
        return "moderate"
    return "weak"


def _inconclusive_verdicts(factors: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [_inconclusive_verdict(f) for f in factors]


def _inconclusive_verdict(
    factor: Dict[str, Any],
    signal: Optional[str] = None,
    outcome_metric: Optional[str] = None,
    analysis_method: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        **factor,
        "signal": signal,
        "verdict": "inconclusive",
        "effect_size": None,
        "exposure_days": None,
        "comparison_days": None,
        "outcome_metric": outcome_metric,
        "confidence": None,
        "analysis_method": analysis_method,
    }


def _normalized_timeline_for_verdict(timeline: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    result = []
    for day in timeline:
        logged_date = _parse_date(day.get("date"))
        if logged_date is None:
            continue
        skin = day.get("skin") or {}
        item = {
            **day,
            "date": logged_date,
            "score": _safe_float(skin.get("overall_score")),
            "signal_scores": _extract_skin_signals(skin),
        }
        result.append(item)
    return sorted(result, key=lambda item: item["date"])


def _baseline_exclusion_dates(trigger_day: date) -> set[date]:
    return {trigger_day - timedelta(days=offset) for offset in range(0, 4)}
