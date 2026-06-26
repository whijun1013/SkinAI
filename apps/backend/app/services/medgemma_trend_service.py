from typing import Any

from app.services.medgemma_service import ordinal_signal_to_score


SIGNAL_LABELS = {
    "active_lesion": "트러블/여드름",
    "redness": "염증성 홍반",
    "barrier": "각질/피부 장벽",
}

SIGNAL_KEYS = ("active_lesion", "redness", "barrier")

DOMINANT_THRESHOLD = 2
DOMINANT_MAX_THRESHOLD = 3


def _usable_items(medgemma_handoffs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        h for h in medgemma_handoffs
        if h.get("usable") is not False
    ]


def _signal_history(items: list[dict[str, Any]], sig: str) -> list[dict[str, Any]]:
    history = []
    for h in sorted(items, key=lambda x: x.get("date", "")):
        signals = h.get("signals") or {}
        if sig in signals:
            score = ordinal_signal_to_score(signals[sig])
            if score is not None and h.get("date"):
                history.append({"date": h["date"], "score": score})
    return history


def _has_score_drop(timeline: list[dict[str, Any]]) -> bool:
    scores = [
        item.get("score")
        for item in sorted(timeline, key=lambda x: x.get("date", ""))
        if item.get("score") is not None
    ]
    return len(scores) >= 2 and scores[-1] < scores[0]


def build_medgemma_visual_trends(
    timeline: list[dict[str, Any]],
    medgemma_handoffs: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not medgemma_handoffs:
        return None

    usable = _usable_items(medgemma_handoffs)
    if not usable:
        return None

    dominant_signals = []
    worsened_signals = []

    signal_keys = sorted({key for h in usable for key in (h.get("signals") or {})})
    for sig in signal_keys:
        history = _signal_history(usable, sig)
        if not history:
            continue

        scores = [h["score"] for h in history]
        avg = sum(scores) / len(scores)

        if avg >= DOMINANT_THRESHOLD or max(scores) >= DOMINANT_MAX_THRESHOLD:
            dominant_signals.append(sig)

        if len(scores) >= 2:
            mid = len(scores) // 2
            avg_first = sum(scores[:mid]) / mid
            avg_second = sum(scores[mid:]) / (len(scores) - mid)
            if avg_second > avg_first and scores[-1] >= DOMINANT_THRESHOLD:
                worsened_signals.append(sig)

    if worsened_signals:
        summary = "시간이 지남에 따라 일부 피부 신호가 증가하는 경향이 있습니다."
    elif dominant_signals:
        summary = "분석 기간 동안 일부 피부 신호가 관찰되었습니다."
    else:
        summary = "기간 동안 뚜렷한 피부 신호 변화는 관찰되지 않았습니다."

    return {
        "total_days": len(medgemma_handoffs),
        "usable_days": len(usable),
        "dominant_signals": dominant_signals,
        "worsened_signals": worsened_signals,
        "score_drop_overlap_signals": worsened_signals if _has_score_drop(timeline) else [],
        "summary_for_report": summary,
        "guardrails": [
            "사진 기반 보조 관찰이며 진단이 아닙니다.",
            "식단, 화장품, 의약품과의 인과관계를 단정하지 않습니다.",
        ],
    }


def build_primary_visual_context(
    timeline: list[dict[str, Any]],
    medgemma_handoffs: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not medgemma_handoffs:
        return None

    usable = [
        h for h in medgemma_handoffs
        if h.get("usable") is not False
    ]

    if not usable:
        return None

    dominant_signals = []
    worsened_signals = []

    signal_keys = sorted({key for h in usable for key in (h.get("signals") or {})})
    for sig in signal_keys:
        history = _signal_history(usable, sig)
        if not history:
            continue

        scores = [h["score"] for h in history]
        avg = sum(scores) / len(scores)

        if avg >= DOMINANT_THRESHOLD or max(scores) >= DOMINANT_MAX_THRESHOLD:
            dominant_signals.append(sig)

        if len(scores) >= 2:
            mid = len(scores) // 2
            avg_first = sum(scores[:mid]) / mid
            avg_second = sum(scores[mid:]) / (len(scores) - mid)
            if avg_second > avg_first and scores[-1] >= DOMINANT_THRESHOLD:
                worsened_signals.append(sig)

    if worsened_signals:
        summary = "사진 기반 피부 분석에서 시간이 지남에 따라 일부 신호가 증가하는 경향이 있습니다."
    elif dominant_signals:
        summary = "사진 기반 피부 분석에서 일부 신호가 관찰되었습니다."
    else:
        summary = "사진 기반 피부 분석 기간 동안 뚜렷한 신호 변화는 관찰되지 않았습니다."

    return {
        "source": "medgemma",
        "role": "primary_skin_visual_interpretation",
        "total_days": len(medgemma_handoffs),
        "usable_days": len(usable),
        "dominant_signals": dominant_signals,
        "worsened_signals": worsened_signals,
        "summary_for_report": summary,
        "guardrails": [
            "사진 기반 시각 분석이며 의학적 진단이 아닙니다.",
            "식단, 화장품, 의약품과의 인과관계를 단정하지 않습니다.",
        ],
    }


