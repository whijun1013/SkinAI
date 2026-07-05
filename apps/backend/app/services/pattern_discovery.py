from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Callable

from app.services.period_cycle_service import DEFAULT_CYCLE_LENGTH, _resolve_phase


MIN_STRONG_EXPOSURE_DAYS = 3
MIN_STRONG_COMPARISON_DAYS = 3
# effect_size는 MedGemma 4등급을 변환한 0~3 점수의 평균 등급 차이다.
STRONG_EFFECT_SIZE = 0.7
STRONG_DIRECTION_CONSISTENCY = 0.6

MIN_MODERATE_EXPOSURE_DAYS = 2
MIN_MODERATE_COMPARISON_DAYS = 2
MODERATE_EFFECT_SIZE = 0.4
MODERATE_DIRECTION_CONSISTENCY = 0.5

_MIN_BEFORE_AFTER_DAYS = 3

# 3개 신호 정의 (MedGemma 관측 → 분석용 신호)
# 높을수록 좋음 컨벤션 유지 (MedGemma 정수 신호 부호 반전)
SKIN_SIGNALS: dict[str, str] = {
    "active_lesion": "트러블/뾰루지",
    "redness": "홍조/발적",
    "barrier": "각질/장벽",
}

# P3 MVP factor_key → changepoint_service 연속형 factor_key
_PATTERN_KEY_TO_CONTINUOUS_KEY: dict[str, str] = {
    "sleep_shortage": "sleep_hours",
    "stress_high": "stress_level",
    "uv_high": "uv_index",
    "pm_high": "pm25",
}


@dataclass(frozen=True)
class PatternDefinition:
    factor_type: str
    factor_key: str
    label: str
    lag_min_days: int
    lag_max_days: int
    matcher: Callable[[dict[str, Any]], bool]


def discover_patterns(
    context: dict[str, Any],
    excluded_factor_keys: set[str] | None = None,
) -> list[dict[str, Any]]:
    timeline = _normalized_timeline(context.get("daily_timeline") or [])
    trigger_day = _parse_date((context.get("meta") or {}).get("trigger_date"))
    if not timeline or trigger_day is None:
        return []

    factor_methods = context.get("factor_methods") or {}
    factor_changepoints = context.get("factor_changepoints") or {}
    ctx = context.get("context") or {}
    window_days: int = context.get("lookback_days") or 14
    analysis_window_start = _parse_date(context.get("analysis_window_start_date"))
    _attach_period_phases(timeline, ctx.get("period_logs") or [])
    _attach_cosmetic_ingredient_group_exposures(timeline, ctx.get("current_cosmetics") or [])
    analysis_timeline = _filter_timeline_from(timeline, analysis_window_start)

    has_signals = any(day["signals"] for day in analysis_timeline)
    excluded = excluded_factor_keys or set()

    patterns: list[dict[str, Any]] = []

    # MVP 정적 요인 (food, behavior)
    for definition in MVP_PATTERN_DEFINITIONS:
        if definition.factor_key in excluded:
            continue

        continuous_key = _PATTERN_KEY_TO_CONTINUOUS_KEY.get(definition.factor_key)
        method = factor_methods.get(continuous_key) if continuous_key else None
        changepoint_date = factor_changepoints.get(continuous_key) if continuous_key else None

        if method == "before_after" and changepoint_date:
            p = _build_before_after_pattern(
                factor_key=definition.factor_key,
                factor_type=definition.factor_type,
                label=definition.label,
                changepoint_date=changepoint_date,
                timeline=timeline,
                trigger_day=trigger_day,
            )
        else:
            p = _build_pattern(
                definition,
                analysis_timeline,
                trigger_day,
                use_signals=has_signals,
                window_days=window_days,
            )

        if p is not None:
            patterns.append(p)

    # 화장품 동적 요인 (before/after)
    for cosmetic in ctx.get("current_cosmetics") or []:
        cosmetic_id = cosmetic.get("user_cosmetic_id")
        if cosmetic_id is None:
            continue
        factor_key = f"cosmetic_{cosmetic_id}"
        if factor_key in excluded:
            continue
        if factor_methods.get(factor_key) != "before_after":
            continue
        changepoint_date = factor_changepoints.get(factor_key)
        if changepoint_date is None:
            continue

        product_name = cosmetic.get("product_name") or "화장품"
        p = _build_before_after_pattern(
            factor_key=factor_key,
            factor_type="cosmetic",
            label=product_name,
            changepoint_date=changepoint_date,
            timeline=timeline,
            trigger_day=trigger_day,
        )
        if p is not None:
            patterns.append(p)

    # 약품 동적 요인 (before/after)
    for medication in ctx.get("current_medications") or []:
        medication_id = medication.get("user_medication_id")
        if medication_id is None:
            continue
        factor_key = f"medication_{medication_id}"
        if factor_key in excluded:
            continue
        if factor_methods.get(factor_key) != "before_after":
            continue
        changepoint_date = factor_changepoints.get(factor_key)
        if changepoint_date is None:
            continue

        medication_name = medication.get("medication_name") or "약품"
        p = _build_before_after_pattern(
            factor_key=factor_key,
            factor_type="medication",
            label=medication_name,
            changepoint_date=changepoint_date,
            timeline=timeline,
            trigger_day=trigger_day,
        )
        if p is not None:
            patterns.append(p)

    _attach_confounder_notes(patterns)
    patterns.sort(
        key=lambda item: (
            _evidence_rank(item["evidence_level"]),
            -item["effect_size"],
            -item["exposure_days"],
            item["factor_key"],
        )
    )
    return patterns


# ---------------------------------------------------------------------------
# before/after 분석
# ---------------------------------------------------------------------------

def _build_before_after_pattern(
    *,
    factor_key: str,
    factor_type: str,
    label: str,
    changepoint_date: date,
    timeline: list[dict[str, Any]],
    trigger_day: date,
) -> dict[str, Any] | None:
    has_signals = any(day["signals"] for day in timeline)
    if has_signals:
        return _build_before_after_from_signals(
            factor_key=factor_key,
            factor_type=factor_type,
            label=label,
            changepoint_date=changepoint_date,
            timeline=timeline,
            trigger_day=trigger_day,
        )
    return _build_before_after_from_overall_score(
        factor_key=factor_key,
        factor_type=factor_type,
        label=label,
        changepoint_date=changepoint_date,
        timeline=timeline,
        trigger_day=trigger_day,
    )


def _build_before_after_from_signals(
    *,
    factor_key: str,
    factor_type: str,
    label: str,
    changepoint_date: date,
    timeline: list[dict[str, Any]],
    trigger_day: date,
) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None

    for signal_key, signal_label in SKIN_SIGNALS.items():
        before_scores = [
            day["signals"][signal_key]
            for day in timeline
            if signal_key in day["signals"] and day["date"] < changepoint_date
        ]
        after_scores = [
            day["signals"][signal_key]
            for day in timeline
            if signal_key in day["signals"] and day["date"] >= changepoint_date
        ]
        if len(before_scores) < _MIN_BEFORE_AFTER_DAYS or len(after_scores) < _MIN_BEFORE_AFTER_DAYS:
            continue

        before_avg = _average(before_scores)
        after_avg = _average(after_scores)
        effect_size = round(before_avg - after_avg, 2)
        evidence_level = _evidence_level_before_after(len(before_scores), len(after_scores), effect_size)
        confidence = _confidence(evidence_level, effect_size, 0.0)

        result = {
            "factor_type": factor_type,
            "factor_key": factor_key,
            "label": label,
            "affected_signal": signal_key,
            "affected_signal_label": signal_label,
            "analysis_method": "before_after",
            "pattern": _before_after_pattern_text(label, evidence_level, signal_label),
            "evidence": _before_after_evidence_text(label, len(before_scores), len(after_scores), effect_size, signal_label),
            "evidence_level": evidence_level,
            "trigger_day": trigger_day.isoformat(),
            "lag_min_days": None,
            "lag_max_days": None,
            "exposure_days": len(after_scores),
            "comparison_days": len(before_scores),
            "effect_size": effect_size,
            "direction_consistency": None,
            "confidence": confidence,
            "confounder_notes": None,
        }
        if best is None or effect_size > best["effect_size"]:
            best = result

    return best


def _build_before_after_from_overall_score(
    *,
    factor_key: str,
    factor_type: str,
    label: str,
    changepoint_date: date,
    timeline: list[dict[str, Any]],
    trigger_day: date,
) -> dict[str, Any] | None:
    before_scores = [
        day["score"]
        for day in timeline
        if day["score"] is not None and day["date"] < changepoint_date
    ]
    after_scores = [
        day["score"]
        for day in timeline
        if day["score"] is not None and day["date"] >= changepoint_date
    ]
    if len(before_scores) < _MIN_BEFORE_AFTER_DAYS or len(after_scores) < _MIN_BEFORE_AFTER_DAYS:
        return None

    before_avg = _average(before_scores)
    after_avg = _average(after_scores)
    effect_size = round(before_avg - after_avg, 2)
    evidence_level = _evidence_level_before_after(len(before_scores), len(after_scores), effect_size)
    confidence = _confidence(evidence_level, effect_size, 0.0)

    return {
        "factor_type": factor_type,
        "factor_key": factor_key,
        "label": label,
        "affected_signal": None,
        "affected_signal_label": None,
        "analysis_method": "before_after",
        "pattern": _before_after_pattern_text(label, evidence_level, None),
        "evidence": _before_after_evidence_text(label, len(before_scores), len(after_scores), effect_size, None),
        "evidence_level": evidence_level,
        "trigger_day": trigger_day.isoformat(),
        "lag_min_days": None,
        "lag_max_days": None,
        "exposure_days": len(after_scores),
        "comparison_days": len(before_scores),
        "effect_size": effect_size,
        "direction_consistency": None,
        "confidence": confidence,
        "confounder_notes": None,
    }


def _evidence_level_before_after(before_days: int, after_days: int, effect_size: float) -> str:
    if before_days >= _MIN_BEFORE_AFTER_DAYS and after_days >= _MIN_BEFORE_AFTER_DAYS and effect_size >= STRONG_EFFECT_SIZE:
        return "strong"
    if before_days >= _MIN_BEFORE_AFTER_DAYS and after_days >= _MIN_BEFORE_AFTER_DAYS and effect_size >= MODERATE_EFFECT_SIZE:
        return "moderate"
    return "weak"


def _before_after_pattern_text(label: str, evidence_level: str, signal_label: str | None) -> str:
    signal_part = f" {signal_label}에서" if signal_label else ""
    if evidence_level == "strong":
        return f"{label} 이후{signal_part} 피부 상태가 뚜렷하게 변화했어요."
    if evidence_level == "moderate":
        return f"{label} 전후로{signal_part} 피부 변화 가능성이 보여요."
    return f"{label} 전후로 아직 충분한 비교 기록이 쌓이지 않았어요."


def _before_after_evidence_text(
    label: str,
    before_days: int,
    after_days: int,
    effect_size: float,
    signal_label: str | None,
) -> str:
    signal_part = f" ({signal_label})" if signal_label else ""
    return (
        f"{label} 이전 {before_days}일, 이후 {after_days}일 기록 기준으로 "
        f"피부 상태{signal_part}가 평균 {abs(effect_size):.1f}점 변화했어요."
    )


# ---------------------------------------------------------------------------
# daily_correlation 분석 (기존 로직)
# ---------------------------------------------------------------------------

def _build_pattern(
    definition: PatternDefinition,
    timeline: list[dict[str, Any]],
    trigger_day: date,
    use_signals: bool,
    window_days: int = 14,
) -> dict[str, Any] | None:
    exposure_dates = [day["date"] for day in timeline if definition.matcher(day)]
    if not exposure_dates:
        return None

    detail = None
    if definition.factor_key == "cosmetic_new_product":
        products = {p for day in timeline if definition.matcher(day) for p in (day.get("cosmetic_started") or [])}
        if products: detail = ", ".join(sorted(products))
    elif definition.factor_key == "cosmetic_stopped":
        products = {p for day in timeline if definition.matcher(day) for p in (day.get("cosmetic_ended") or [])}
        if products: detail = ", ".join(sorted(products))
    elif definition.factor_key == "cosmetic_irritant_candidate":
        ingredients = {
            item
            for day in timeline
            if definition.matcher(day)
            for item in (day.get("cosmetic_irritant_ingredients") or [])
        }
        if ingredients: detail = ", ".join(sorted(ingredients))
    elif definition.factor_key == "cosmetic_high_comedogenic":
        ingredients = {
            item
            for day in timeline
            if definition.matcher(day)
            for item in (day.get("cosmetic_high_comedogenic_ingredients") or [])
        }
        if ingredients: detail = ", ".join(sorted(ingredients))
    elif definition.factor_key == "cosmetic_functional_ingredient":
        ingredients = {
            item
            for day in timeline
            if definition.matcher(day)
            for item in (day.get("cosmetic_functional_ingredients") or [])
        }
        if ingredients: detail = ", ".join(sorted(ingredients))
    elif definition.factor_key.startswith("cosmetic_group_"):
        group_key = definition.factor_key.removeprefix("cosmetic_group_")
        ingredients = {
            item.get("ingredient")
            for day in timeline
            if definition.matcher(day)
            for item in (day.get("cosmetic_ingredient_groups") or [])
            if item.get("key") == group_key and item.get("ingredient")
        }
        if ingredients: detail = ", ".join(sorted(ingredients))
    elif definition.factor_key == "medication_started":
        medications = {m for day in timeline if definition.matcher(day) for m in (day.get("medication_started") or [])}
        if medications: detail = ", ".join(sorted(medications))
    elif definition.factor_key == "medication_stopped":
        medications = {m for day in timeline if definition.matcher(day) for m in (day.get("medication_ended") or [])}
        if medications: detail = ", ".join(sorted(medications))

    if use_signals:
        return _build_pattern_from_signals(definition, timeline, trigger_day, exposure_dates, window_days=window_days, detail=detail)
    return _build_pattern_from_overall_score(definition, timeline, trigger_day, exposure_dates, window_days=window_days, detail=detail)


def _build_pattern_from_signals(
    definition: PatternDefinition,
    timeline: list[dict[str, Any]],
    trigger_day: date,
    exposure_dates: list[date],
    window_days: int = 14,
    detail: str | None = None,
) -> dict[str, Any] | None:
    """3신호 각각과 상관 분석 후 가장 강한 신호 선택."""
    excluded = _baseline_exclusion_dates(trigger_day)
    best: dict[str, Any] | None = None

    for signal_key, signal_label in SKIN_SIGNALS.items():
        score_by_date = {
            day["date"]: day["signals"][signal_key]
            for day in timeline
            if signal_key in day["signals"]
        }
        if not score_by_date:
            continue

        result = _evaluate_single(
            definition=definition,
            timeline=timeline,
            exposure_dates=exposure_dates,
            score_by_date=score_by_date,
            excluded=excluded,
            trigger_day=trigger_day,
            signal_key=signal_key,
            signal_label=signal_label,
            window_days=window_days,
            detail=detail,
        )
        if result is None:
            continue
        if best is None or result["effect_size"] > best["effect_size"]:
            best = result

    return best


def _evaluate_single(
    *,
    definition: PatternDefinition,
    timeline: list[dict[str, Any]],
    exposure_dates: list[date],
    score_by_date: dict[date, float],
    excluded: set[date],
    trigger_day: date,
    signal_key: str,
    signal_label: str,
    window_days: int = 14,
    detail: str | None = None,
) -> dict[str, Any] | None:
    lag_target_dates = _lag_target_dates(
        exposure_dates, definition.lag_min_days, definition.lag_max_days, score_by_date
    )
    exposed_scores = [score_by_date[d] for d in lag_target_dates]
    if not exposed_scores:
        return _weak_pattern(definition, trigger_day, len(exposure_dates), signal_key, signal_label, window_days=window_days, detail=detail)

    comparison_scores = [
        score
        for d, score in score_by_date.items()
        if d not in lag_target_dates and d not in excluded
    ]
    comparison_days = len(comparison_scores)
    if not comparison_scores:
        return _weak_pattern(definition, trigger_day, len(exposure_dates), signal_key, signal_label, window_days=window_days, detail=detail)

    exposed_avg = _average(exposed_scores)
    comparison_avg = _average(comparison_scores)
    effect_size = round(comparison_avg - exposed_avg, 2)
    direction_consistency = _direction_consistency(
        exposure_dates=exposure_dates,
        lag_min_days=definition.lag_min_days,
        lag_max_days=definition.lag_max_days,
        score_by_date=score_by_date,
        comparison_avg=comparison_avg,
    )
    evidence_level = _evidence_level(
        exposure_days=len(exposure_dates),
        comparison_days=comparison_days,
        effect_size=effect_size,
        direction_consistency=direction_consistency,
    )
    confidence_factors = _confidence_factors(
        definition=definition,
        timeline=timeline,
        exposure_dates=exposure_dates,
        score_by_date=score_by_date,
        lag_target_dates=lag_target_dates,
        exposed_avg=exposed_avg,
        comparison_scores=comparison_scores,
        effect_size=effect_size,
        direction_consistency=direction_consistency,
    )
    confidence = _confidence(evidence_level, effect_size, direction_consistency, confidence_factors)

    return {
        "factor_type": definition.factor_type,
        "factor_key": definition.factor_key,
        "label": definition.label,
        "detail": detail,
        "affected_signal": signal_key,
        "affected_signal_label": signal_label,
        "analysis_method": "daily_correlation",
        "pattern": _pattern_text(definition, evidence_level, signal_label),
        "evidence": _evidence_text(
            definition=definition,
            exposure_days=len(exposure_dates),
            comparison_days=comparison_days,
            effect_size=effect_size,
            signal_label=signal_label,
            window_days=window_days,
        ),
        "evidence_level": evidence_level,
        "trigger_day": trigger_day.isoformat(),
        "lag_min_days": definition.lag_min_days,
        "lag_max_days": definition.lag_max_days,
        "exposure_days": len(exposure_dates),
        "comparison_days": comparison_days,
        "effect_size": effect_size,
        "direction_consistency": direction_consistency,
        "confidence": confidence,
        "confidence_factors": confidence_factors,
        "confounder_notes": None,
    }


def _build_pattern_from_overall_score(
    definition: PatternDefinition,
    timeline: list[dict[str, Any]],
    trigger_day: date,
    exposure_dates: list[date],
    window_days: int = 14,
    detail: str | None = None,
) -> dict[str, Any] | None:
    """MedGemma 신호가 없을 때 overall_score fallback."""
    score_by_date = {
        day["date"]: day["score"]
        for day in timeline
        if day["score"] is not None
    }
    if not score_by_date:
        return None

    excluded = _baseline_exclusion_dates(trigger_day)
    lag_target_dates = _lag_target_dates(
        exposure_dates, definition.lag_min_days, definition.lag_max_days, score_by_date
    )
    exposed_scores = [score_by_date[d] for d in lag_target_dates]
    if not exposed_scores:
        return _weak_pattern(definition, trigger_day, len(exposure_dates), None, None, window_days=window_days, detail=detail)

    comparison_scores = [
        score
        for d, score in score_by_date.items()
        if d not in lag_target_dates and d not in excluded
    ]
    if not comparison_scores:
        return _weak_pattern(definition, trigger_day, len(exposure_dates), None, None, window_days=window_days, detail=detail)

    exposed_avg = _average(exposed_scores)
    comparison_avg = _average(comparison_scores)
    effect_size = round(comparison_avg - exposed_avg, 2)
    direction_consistency = _direction_consistency(
        exposure_dates=exposure_dates,
        lag_min_days=definition.lag_min_days,
        lag_max_days=definition.lag_max_days,
        score_by_date=score_by_date,
        comparison_avg=comparison_avg,
    )
    evidence_level = _evidence_level(
        exposure_days=len(exposure_dates),
        comparison_days=len(comparison_scores),
        effect_size=effect_size,
        direction_consistency=direction_consistency,
    )
    confidence_factors = _confidence_factors(
        definition=definition,
        timeline=timeline,
        exposure_dates=exposure_dates,
        score_by_date=score_by_date,
        lag_target_dates=lag_target_dates,
        exposed_avg=exposed_avg,
        comparison_scores=comparison_scores,
        effect_size=effect_size,
        direction_consistency=direction_consistency,
    )
    confidence = _confidence(evidence_level, effect_size, direction_consistency, confidence_factors)

    return {
        "factor_type": definition.factor_type,
        "factor_key": definition.factor_key,
        "label": definition.label,
        "detail": detail,
        "affected_signal": None,
        "affected_signal_label": None,
        "analysis_method": "daily_correlation",
        "pattern": _pattern_text(definition, evidence_level, None),
        "evidence": _evidence_text(
            definition=definition,
            exposure_days=len(exposure_dates),
            comparison_days=len(comparison_scores),
            effect_size=effect_size,
            signal_label=None,
            window_days=window_days,
        ),
        "evidence_level": evidence_level,
        "trigger_day": trigger_day.isoformat(),
        "lag_min_days": definition.lag_min_days,
        "lag_max_days": definition.lag_max_days,
        "exposure_days": len(exposure_dates),
        "comparison_days": len(comparison_scores),
        "effect_size": effect_size,
        "direction_consistency": direction_consistency,
        "confidence": confidence,
        "confidence_factors": confidence_factors,
        "confounder_notes": None,
    }


def _weak_pattern(
    definition: PatternDefinition,
    trigger_day: date,
    exposure_days: int,
    signal_key: str | None,
    signal_label: str | None,
    window_days: int = 14,
    detail: str | None = None,
) -> dict[str, Any]:
    return {
        "factor_type": definition.factor_type,
        "factor_key": definition.factor_key,
        "label": definition.label,
        "detail": detail,
        "affected_signal": signal_key,
        "affected_signal_label": signal_label,
        "analysis_method": "daily_correlation",
        "pattern": _pattern_text(definition, "weak", signal_label),
        "evidence": f"최근 {window_days}일 중 {definition.label} 관찰일은 {exposure_days}일이지만, 비교 가능한 피부 기록이 아직 부족해요.",
        "evidence_level": "weak",
        "trigger_day": trigger_day.isoformat(),
        "lag_min_days": definition.lag_min_days,
        "lag_max_days": definition.lag_max_days,
        "exposure_days": exposure_days,
        "comparison_days": 0,
        "effect_size": 0.0,
        "direction_consistency": 0.0,
        "confidence": 0.2,
        "confidence_factors": {
            "exposure_event_count": exposure_days,
            "baseline_change": 0.0,
            "counterexample_days": 0,
            "missing_rate": None,
            "concurrent_exposure_avg": 0.0,
        },
        "confounder_notes": None,
    }


def _attach_confounder_notes(patterns: list[dict[str, Any]]) -> None:
    strong_confounders = [
        p for p in patterns
        if p["effect_size"] >= STRONG_EFFECT_SIZE
        and p["evidence_level"] in {"moderate", "strong"}
    ]
    for pattern in patterns:
        labels = [
            item["label"]
            for item in strong_confounders
            if item["factor_key"] != pattern["factor_key"]
        ][:2]
        if labels:
            pattern["confounder_notes"] = (
                f"같은 기간 {', '.join(labels)} 패턴도 함께 관찰되어 결과 해석에 영향을 줄 수 있습니다."
            )


# ---------------------------------------------------------------------------
# 공통 헬퍼
# ---------------------------------------------------------------------------

def _extract_skin_signals(skin: dict[str, Any]) -> dict[str, float]:
    """MedGemma 신호를 분석용 float으로 변환. 부호 반전: 높을수록 좋음 컨벤션 유지."""
    medgemma = skin.get("medgemma") or {}
    signals = medgemma.get("signals") or {}
    if not signals:
        return {}
    result: dict[str, float] = {}
    for key in ("active_lesion", "redness", "barrier"):
        val = signals.get(key)
        if isinstance(val, (int, float)):
            result[key] = -float(val)
    return result


def _normalized_timeline(timeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for day in timeline:
        logged_date = _parse_date(day.get("date"))
        if logged_date is None:
            continue
        skin = day.get("skin") or {}
        result.append(
            {
                **day,
                "date": logged_date,
                "score": _safe_float(skin.get("overall_score")),
                "signals": _extract_skin_signals(skin),
            }
        )
    return sorted(result, key=lambda item: item["date"])


def _filter_timeline_from(
    timeline: list[dict[str, Any]],
    start_date: date | None,
) -> list[dict[str, Any]]:
    if start_date is None:
        return timeline
    return [day for day in timeline if day["date"] >= start_date]


def _attach_period_phases(timeline: list[dict[str, Any]], period_logs: list[dict[str, Any]]) -> None:
    starts = sorted(
        started_at
        for item in period_logs
        if (started_at := _parse_date(item.get("started_at"))) is not None
    )
    if not starts:
        return
    for day in timeline:
        last_start = _last_period_start_on_or_before(starts, day["date"])
        if last_start is None:
            continue
        cycle_day = (day["date"] - last_start).days + 1
        phase, phase_label = _resolve_phase(cycle_day, DEFAULT_CYCLE_LENGTH)
        day["period_phase"] = phase
        day["period_phase_label"] = phase_label
        day["period_cycle_day"] = cycle_day


def _last_period_start_on_or_before(starts: list[date], target_date: date) -> date | None:
    candidates = [started_at for started_at in starts if started_at <= target_date]
    return candidates[-1] if candidates else None


def _attach_cosmetic_ingredient_group_exposures(
    timeline: list[dict[str, Any]],
    current_cosmetics: list[dict[str, Any]],
) -> None:
    by_date = {day["date"]: day for day in timeline}
    for cosmetic in current_cosmetics:
        started_at = _parse_date(cosmetic.get("started_at"))
        if started_at is None or started_at not in by_date:
            continue
        day = by_date[started_at]
        _extend_unique(day, "cosmetic_irritant_ingredients", cosmetic.get("irritant_ingredients") or [])
        _extend_unique(
            day,
            "cosmetic_high_comedogenic_ingredients",
            cosmetic.get("high_comedogenic_ingredients") or [],
        )
        _extend_unique(
            day,
            "cosmetic_functional_ingredients",
            cosmetic.get("functional_ingredients") or [],
        )
        _extend_unique(
            day,
            "cosmetic_ingredient_groups",
            cosmetic.get("ingredient_groups") or [],
        )


def _extend_unique(target: dict[str, Any], key: str, values: list[Any]) -> None:
    if not values:
        return
    existing = list(target.get(key) or [])
    for value in values:
        if value not in existing:
            existing.append(value)
    target[key] = existing


def _lag_target_dates(
    exposure_dates: list[date],
    lag_min_days: int,
    lag_max_days: int,
    score_by_date: dict[date, float],
) -> set[date]:
    targets = set()
    for exposure_date in exposure_dates:
        for offset in range(lag_min_days, lag_max_days + 1):
            target_date = exposure_date + timedelta(days=offset)
            if target_date in score_by_date:
                targets.add(target_date)
    return targets


def _direction_consistency(
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
            event_averages.append(_average(scores))
    if not event_averages:
        return 0.0
    consistent_count = sum(event_avg < comparison_avg for event_avg in event_averages)
    return round(consistent_count / len(event_averages), 2)


def _baseline_exclusion_dates(trigger_day: date) -> set[date]:
    return {trigger_day - timedelta(days=offset) for offset in range(0, 4)}


def _evidence_level(
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


def _confidence(
    evidence_level: str,
    effect_size: float,
    direction_consistency: float,
    factors: dict[str, Any] | None = None,
) -> float:
    base = {
        "strong": 0.75,
        "moderate": 0.55,
        "weak": 0.25,
    }[evidence_level]
    confidence = base + max(0.0, effect_size) * 0.05 + direction_consistency * 0.05
    if factors:
        exposure_count = int(factors.get("exposure_event_count") or 0)
        counterexamples = int(factors.get("counterexample_days") or 0)
        if exposure_count > 0 and counterexamples >= exposure_count:
            return 0.0

        missing_rate = factors.get("missing_rate")
        if isinstance(missing_rate, (int, float)):
            confidence -= float(missing_rate) * 0.25
            if missing_rate > 0.5:
                confidence = min(confidence, 0.3)

        concurrent_avg = factors.get("concurrent_exposure_avg")
        if isinstance(concurrent_avg, (int, float)):
            confidence -= min(float(concurrent_avg), 3.0) * 0.05

        if exposure_count:
            counterexample_ratio = counterexamples / max(exposure_count + counterexamples, 1)
            confidence -= counterexample_ratio * 0.3
            confidence += min(exposure_count / 5, 1.0) * 0.08

    return round(max(0.0, min(0.95, confidence)), 2)


def _confidence_factors(
    *,
    definition: PatternDefinition,
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
        "counterexample_days": _counterexample_days(comparison_scores, exposed_avg),
        "missing_rate": _missing_rate(score_by_date),
        "concurrent_exposure_avg": _concurrent_exposure_avg(definition, timeline, exposure_dates),
        "lag_target_days": len(lag_target_dates),
        "direction_consistency": direction_consistency,
    }


def _counterexample_days(comparison_scores: list[float], exposed_avg: float) -> int:
    return sum(1 for score in comparison_scores if score <= exposed_avg)


def _missing_rate(score_by_date: dict[date, float]) -> float | None:
    if not score_by_date:
        return None
    dates = sorted(score_by_date)
    expected_days = (dates[-1] - dates[0]).days + 1
    if expected_days <= 0:
        return 0.0
    return round(1 - (len(score_by_date) / expected_days), 2)


def _concurrent_exposure_avg(
    definition: PatternDefinition,
    timeline: list[dict[str, Any]],
    exposure_dates: list[date],
) -> float:
    if not exposure_dates:
        return 0.0
    exposure_set = set(exposure_dates)
    counts = []
    for day in timeline:
        if day["date"] not in exposure_set:
            continue
        counts.append(
            sum(
                1
                for other in MVP_PATTERN_DEFINITIONS
                if other.factor_key != definition.factor_key and other.matcher(day)
            )
        )
    if not counts:
        return 0.0
    return round(sum(counts) / len(counts), 2)


def _pattern_text(definition: PatternDefinition, evidence_level: str, signal_label: str | None) -> str:
    lag_text = _lag_text(definition)
    signal_part = f" {signal_label}에서" if signal_label else ""
    if evidence_level == "strong":
        return f"최근 기록에서 {definition.label} 이후 {lag_text}{signal_part} 피부 악화 패턴이 반복됐어요."
    if evidence_level == "moderate":
        return f"{definition.label}이 피부 변화 후보로 보여요. 줄여보며{signal_part} 변화를 확인해볼 수 있어요."
    return f"아직 확실한 패턴은 아니지만, {definition.label}을 기록하며 변화를 더 확인해볼 수 있어요."


def _evidence_text(
    *,
    definition: PatternDefinition,
    exposure_days: int,
    comparison_days: int,
    effect_size: float,
    signal_label: str | None,
    window_days: int = 14,
) -> str:
    lag_text = _lag_text(definition)
    signal_part = f" ({signal_label})" if signal_label else ""
    return (
        f"최근 {window_days}일 중 {definition.label} 관찰일 {exposure_days}일, "
        f"비교 가능한 피부 기록 {comparison_days}일 기준으로 "
        f"{lag_text} 피부 상태{signal_part}가 비교일보다 평균 {effect_size:.1f}점 낮았어요."
    )


def _lag_text(definition: PatternDefinition) -> str:
    if definition.lag_min_days == definition.lag_max_days:
        return f"{definition.lag_min_days}일 뒤"
    if definition.lag_min_days == 0:
        return f"당일~{definition.lag_max_days}일 사이"
    return f"{definition.lag_min_days}~{definition.lag_max_days}일 사이"


def _has_food_tag(tag: str) -> Callable[[dict[str, Any]], bool]:
    def matcher(day: dict[str, Any]) -> bool:
        for meal in day.get("diet") or []:
            for food in meal.get("foods") or []:
                if tag in (food.get("skin_tags") or []):
                    return True
        return False
    return matcher


def _has_food_flag(flag: str) -> Callable[[dict[str, Any]], bool]:
    def matcher(day: dict[str, Any]) -> bool:
        for meal in day.get("diet") or []:
            for food in meal.get("foods") or []:
                if flag in (food.get("flags") or []):
                    return True
        return False
    return matcher


def _food_factor_keys(food: dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    for field in ("skin_factors", "skin_factor_details"):
        for factor in food.get(field) or []:
            if isinstance(factor, dict) and factor.get("key"):
                keys.add(str(factor["key"]))
    return keys


def _has_food_factor_keys(*factor_keys: str) -> Callable[[dict[str, Any]], bool]:
    target_keys = set(factor_keys)

    def matcher(day: dict[str, Any]) -> bool:
        for meal in day.get("diet") or []:
            for food in meal.get("foods") or []:
                if _food_factor_keys(food) & target_keys:
                    return True
        return False

    return matcher


def _has_sleep_shortage(day: dict[str, Any]) -> bool:
    behavior = day.get("behavior") or {}
    sleep_hours = _safe_float(behavior.get("sleep_hours"))
    return sleep_hours is not None and sleep_hours < 6


def _has_high_stress(day: dict[str, Any]) -> bool:
    behavior = day.get("behavior") or {}
    stress_level = _safe_float(behavior.get("stress_level"))
    return stress_level is not None and stress_level >= 4


def _has_high_uv(day: dict[str, Any]) -> bool:
    env = day.get("environment") or {}
    uv = _safe_float(env.get("uv"))
    return uv is not None and uv >= 6


def _has_high_pm(day: dict[str, Any]) -> bool:
    env = day.get("environment") or {}
    pm25 = _safe_float(env.get("pm25"))
    pm10 = _safe_float(env.get("pm10"))
    return (pm25 is not None and pm25 >= 35) or (pm10 is not None and pm10 >= 80)


def _is_luteal_phase(day: dict[str, Any]) -> bool:
    return day.get("period_phase") == "luteal"


def _has_cosmetic_ingredient_group(key: str) -> Callable[[dict[str, Any]], bool]:
    def matcher(day: dict[str, Any]) -> bool:
        return bool(day.get(key))
    return matcher


def _has_cosmetic_taxonomy_group(group_key: str) -> Callable[[dict[str, Any]], bool]:
    def matcher(day: dict[str, Any]) -> bool:
        return any(
            item.get("key") == group_key
            for item in (day.get("cosmetic_ingredient_groups") or [])
        )
    return matcher


def _safe_float(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _parse_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


def _average(values: list[float]) -> float:
    return sum(values) / len(values)


def _evidence_rank(level: str) -> int:
    return {
        "strong": 0,
        "moderate": 1,
        "weak": 2,
    }.get(level, 99)


MVP_PATTERN_DEFINITIONS = (
    PatternDefinition(
        factor_type="food",
        factor_key="high_sugar",
        label="고당류",
        lag_min_days=1,
        lag_max_days=3,
        matcher=_has_food_tag("고당류"),
    ),
    PatternDefinition(
        factor_type="food",
        factor_key="dairy",
        label="유제품",
        lag_min_days=1,
        lag_max_days=3,
        matcher=_has_food_flag("유제품"),
    ),
    PatternDefinition(
        factor_type="food",
        factor_key="high_gi",
        label="고혈당지수",
        lag_min_days=1,
        lag_max_days=3,
        matcher=_has_food_flag("고혈당지수"),
    ),
    PatternDefinition(
        factor_type="food",
        factor_key="high_fat",
        label="고지방",
        lag_min_days=1,
        lag_max_days=3,
        matcher=_has_food_factor_keys("high_fat", "high_saturated_fat", "trans_fat_present", "fried_or_high_ages"),
    ),
    PatternDefinition(
        factor_type="food",
        factor_key="high_sodium",
        label="고나트륨",
        lag_min_days=0,
        lag_max_days=2,
        matcher=_has_food_factor_keys("high_sodium"),
    ),
    PatternDefinition(
        factor_type="food",
        factor_key="caffeine",
        label="카페인",
        lag_min_days=0,
        lag_max_days=2,
        matcher=_has_food_factor_keys("caffeine", "high_caffeine"),
    ),
    PatternDefinition(
        factor_type="food",
        factor_key="alcohol_food",
        label="알코올",
        lag_min_days=0,
        lag_max_days=2,
        matcher=_has_food_factor_keys("alcohol_histamine", "alcohol"),
    ),
    PatternDefinition(
        factor_type="food",
        factor_key="spicy_food",
        label="매운 음식",
        lag_min_days=0,
        lag_max_days=2,
        matcher=_has_food_factor_keys("spicy_food", "spicy"),
    ),
    PatternDefinition(
        factor_type="food",
        factor_key="gluten_wheat",
        label="밀/글루텐",
        lag_min_days=1,
        lag_max_days=3,
        matcher=_has_food_factor_keys("gluten", "wheat", "wheat_gluten"),
    ),
    PatternDefinition(
        factor_type="food",
        factor_key="allergen",
        label="알레르겐",
        lag_min_days=0,
        lag_max_days=3,
        matcher=_has_food_factor_keys("allergen", "allergen_confirmed", "allergen_candidate"),
    ),
    PatternDefinition(
        factor_type="food",
        factor_key="ultra_processed",
        label="초가공식품",
        lag_min_days=1,
        lag_max_days=3,
        matcher=_has_food_factor_keys("ultra_processed", "processed_meat"),
    ),
    PatternDefinition(
        factor_type="food",
        factor_key="chocolate",
        label="초콜릿",
        lag_min_days=0,
        lag_max_days=2,
        matcher=_has_food_factor_keys("chocolate", "cocoa"),
    ),
    PatternDefinition(
        factor_type="food",
        factor_key="nuts",
        label="견과류",
        lag_min_days=0,
        lag_max_days=3,
        matcher=_has_food_factor_keys("nuts", "tree_nut", "peanut"),
    ),
    PatternDefinition(
        factor_type="food",
        factor_key="fermented_food",
        label="발효식품",
        lag_min_days=0,
        lag_max_days=3,
        matcher=_has_food_factor_keys("fermented_food", "histamine_food"),
    ),
    PatternDefinition(
        factor_type="behavior",
        factor_key="sleep_shortage",
        label="수면 부족",
        lag_min_days=0,
        lag_max_days=2,
        matcher=_has_sleep_shortage,
    ),
    PatternDefinition(
        factor_type="behavior",
        factor_key="stress_high",
        label="스트레스",
        lag_min_days=0,
        lag_max_days=2,
        matcher=_has_high_stress,
    ),
    PatternDefinition(
        factor_type="environment",
        factor_key="uv_high",
        label="강한 자외선",
        lag_min_days=0,
        lag_max_days=1,
        matcher=_has_high_uv,
    ),
    PatternDefinition(
        factor_type="environment",
        factor_key="pm_high",
        label="미세먼지",
        lag_min_days=0,
        lag_max_days=2,
        matcher=_has_high_pm,
    ),
    PatternDefinition(
        factor_type="behavior",
        factor_key="period_luteal_phase",
        label="황체기",
        lag_min_days=0,
        lag_max_days=0,
        matcher=_is_luteal_phase,
    ),
    PatternDefinition(
        factor_type="cosmetic",
        factor_key="cosmetic_new_product",
        label="새 화장품 사용 시작",
        lag_min_days=1,
        lag_max_days=14,
        matcher=lambda day: bool(day.get("cosmetic_started")),
    ),
    PatternDefinition(
        factor_type="cosmetic",
        factor_key="cosmetic_stopped",
        label="화장품 사용 중단",
        lag_min_days=1,
        lag_max_days=7,
        matcher=lambda day: bool(day.get("cosmetic_ended")),
    ),
    PatternDefinition(
        factor_type="cosmetic",
        factor_key="cosmetic_irritant_candidate",
        label="자극 가능 성분",
        lag_min_days=1,
        lag_max_days=14,
        matcher=_has_cosmetic_ingredient_group("cosmetic_irritant_ingredients"),
    ),
    PatternDefinition(
        factor_type="cosmetic",
        factor_key="cosmetic_high_comedogenic",
        label="고면포성 성분",
        lag_min_days=1,
        lag_max_days=14,
        matcher=_has_cosmetic_ingredient_group("cosmetic_high_comedogenic_ingredients"),
    ),
    PatternDefinition(
        factor_type="cosmetic",
        factor_key="cosmetic_functional_ingredient",
        label="기능성 성분",
        lag_min_days=1,
        lag_max_days=14,
        matcher=_has_cosmetic_ingredient_group("cosmetic_functional_ingredients"),
    ),
    PatternDefinition(
        factor_type="cosmetic",
        factor_key="cosmetic_group_retinoid",
        label="Retinoid ingredient group",
        lag_min_days=1,
        lag_max_days=21,
        matcher=_has_cosmetic_taxonomy_group("retinoid"),
    ),
    PatternDefinition(
        factor_type="cosmetic",
        factor_key="cosmetic_group_exfoliating_acid",
        label="Exfoliating acid ingredient group",
        lag_min_days=1,
        lag_max_days=14,
        matcher=_has_cosmetic_taxonomy_group("exfoliating_acid"),
    ),
    PatternDefinition(
        factor_type="cosmetic",
        factor_key="cosmetic_group_fragrance_essential_oil",
        label="Fragrance or essential oil ingredient group",
        lag_min_days=1,
        lag_max_days=14,
        matcher=_has_cosmetic_taxonomy_group("fragrance_essential_oil"),
    ),
    PatternDefinition(
        factor_type="cosmetic",
        factor_key="cosmetic_group_drying_alcohol",
        label="Drying alcohol ingredient group",
        lag_min_days=1,
        lag_max_days=14,
        matcher=_has_cosmetic_taxonomy_group("drying_alcohol"),
    ),
    PatternDefinition(
        factor_type="cosmetic",
        factor_key="cosmetic_group_preservative_sensitizer",
        label="Preservative sensitizer ingredient group",
        lag_min_days=1,
        lag_max_days=14,
        matcher=_has_cosmetic_taxonomy_group("preservative_sensitizer"),
    ),
    PatternDefinition(
        factor_type="medication",
        factor_key="medication_started",
        label="의약품 복용 시작",
        lag_min_days=1,
        lag_max_days=30,
        matcher=lambda day: bool(day.get("medication_started")),
    ),
    PatternDefinition(
        factor_type="medication",
        factor_key="medication_stopped",
        label="의약품 복용 중단",
        lag_min_days=1,
        lag_max_days=30,
        matcher=lambda day: bool(day.get("medication_ended")),
    ),
)

FACTOR_DEFINITION_REGISTRY = {
    p.factor_key: p for p in MVP_PATTERN_DEFINITIONS
}
