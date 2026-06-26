import hashlib
import json
import os
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, ValidationError


DEFAULT_MODEL_NAME = "google/medgemma-4b-it"

SKIN_SIGNAL_PROMPT_VERSION = "skin_signal_v3_ordinal"
MEDGEMMA_ASSISTANT_PREFILL = "{"

SKIN_SIGNAL_PROMPT = """Analyze only visible facial skin features in the supplied image. The image has already passed a quality gateway.

Return exactly one JSON object and no other text or Markdown fences.

Output schema:
{
  "active_lesion": "none",
  "redness": "none",
  "barrier": "none"
}

Rules:
- Values must be exactly one of: "none", "mild", "moderate", "severe".
- Score each signal independently.
- Do not evaluate or output fields related to darkness, overexposure, blur, face angle, occlusion, or resolution.
- Do not output fields like photo_quality, reject, usable, or confidence.
- Do not output diagnosis, causes, treatment, recommendations, evidence, reasoning, or summary text.
- active_lesion:
  - none: no clear papules or pustules
  - mild: a few small localized papules or pustules
  - moderate: multiple clear lesions distributed in one or more facial regions
  - severe: numerous or widely distributed lesions, visually dominant
- redness: visible inflammatory erythema only. Exclude lighting warmth, normal skin tone, shadows, and makeup.
  - none: no clear inflammatory erythema
  - mild: faint or localized erythema
  - moderate: clear or relatively broad erythema in one or two regions
  - severe: intense or widespread erythema
- barrier:
  - none: no clear dryness-related roughness, fine scaling, flaking, or cracking
  - mild: subtle localized roughness or fine scaling
  - moderate: clear scaling, flaking, or peeling observed
  - severe: broad or marked peeling/cracking observed
  - Do not infer barrier damage from redness or lesions alone.
"""

SIGNAL_KEYS = ("active_lesion", "redness", "barrier")
ORDINAL_SCORE_MAP = {
    "none": 0,
    "mild": 1,
    "moderate": 2,
    "severe": 3,
}
# Alias kept for backward compatibility with existing imports
SIGNAL_LEVELS = ORDINAL_SCORE_MAP
SCORE_LEVELS = {score: label for label, score in ORDINAL_SCORE_MAP.items()}

SIGNAL_LABELS = {
    "active_lesion": "트러블/여드름",
    "redness": "염증성 홍반",
    "barrier": "각질/피부 장벽 손상",
}


class MedGemmaOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    active_lesion: Literal["none", "mild", "moderate", "severe"]
    redness: Literal["none", "mild", "moderate", "severe"]
    barrier: Literal["none", "mild", "moderate", "severe"]


def ordinal_signal_to_score(value: Any) -> int | None:
    if not isinstance(value, str):
        return None
    return ORDINAL_SCORE_MAP.get(value)


# ── Legacy compatibility ──────────────────────────────────────────────────────

def signal_label_to_score(label: str) -> int | None:
    """4등급 문자열 라벨을 0~3 정수로 변환. 유효하지 않은 값은 None 반환."""
    return ORDINAL_SCORE_MAP.get(label)


def _legacy_score_to_label(value: Any) -> str | None:
    """기존 0~10 정수 신호를 새 4등급 라벨로 읽기 위한 호환 변환."""
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    if value == 0:
        return "none"
    if 1 <= value <= 3:
        return "mild"
    if 4 <= value <= 6:
        return "moderate"
    if 7 <= value <= 10:
        return "severe"
    return None


def extract_signal_labels(result: dict[str, Any]) -> dict[str, str]:
    """MedGemma 결과를 canonical 4등급 라벨로 정규화한다.

    새 출력의 최상위 라벨을 우선하고, MongoDB의 중첩 라벨과 기존 0~10
    정수 기록을 차례로 지원한다. 유효하지 않은 값은 보정하지 않는다.
    """
    labels: dict[str, str] = {}

    for key in SIGNAL_KEYS:
        value = result.get(key)
        if isinstance(value, str) and value in ORDINAL_SCORE_MAP:
            labels[key] = value

    stored = result.get("signals") or {}
    if isinstance(stored, dict):
        for key in SIGNAL_KEYS:
            if key in labels:
                continue
            value = stored.get(key)
            if isinstance(value, str) and value in ORDINAL_SCORE_MAP:
                labels[key] = value
                continue
            legacy_label = _legacy_score_to_label(value)
            if legacy_label is not None:
                labels[key] = legacy_label

    for key in SIGNAL_KEYS:
        if key in labels:
            continue
        legacy_label = _legacy_score_to_label(result.get(key))
        if legacy_label is not None:
            labels[key] = legacy_label

    return labels


def signal_value_to_score(value: Any) -> int | None:
    """MongoDB 라벨 또는 기존 0~10 정수 신호를 분석용 0~3으로 변환."""
    if isinstance(value, str):
        return signal_label_to_score(value)
    legacy_label = _legacy_score_to_label(value)
    return signal_label_to_score(legacy_label) if legacy_label is not None else None


# ── Core functions ────────────────────────────────────────────────────────────

def _model_name() -> str:
    return os.getenv("MEDGEMMA_MODEL_NAME", DEFAULT_MODEL_NAME)


def get_medgemma_prompt() -> str:
    return SKIN_SIGNAL_PROMPT


def get_medgemma_prompt_sha256() -> str:
    return hashlib.sha256(SKIN_SIGNAL_PROMPT.encode("utf-8")).hexdigest()


def extract_json_with_metadata(text: str) -> tuple[dict[str, Any], bool]:
    stripped = text.strip()
    try:
        parsed = json.loads(stripped)
        return (parsed, True) if isinstance(parsed, dict) else ({}, False)
    except json.JSONDecodeError:
        pass

    match = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.DOTALL | re.IGNORECASE)
    if match:
        try:
            parsed = json.loads(match.group(1))
            return (parsed, False) if isinstance(parsed, dict) else ({}, False)
        except json.JSONDecodeError:
            pass

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end > start:
        try:
            parsed = json.loads(stripped[start : end + 1])
            return (parsed, False) if isinstance(parsed, dict) else ({}, False)
        except json.JSONDecodeError:
            pass
    return {}, False


def extract_json(text: str) -> dict[str, Any]:
    parsed, _ = extract_json_with_metadata(text)
    return parsed


def validate_medgemma_output(result: dict[str, Any]) -> dict[str, Any]:
    return MedGemmaOutput.model_validate(result).model_dump()


def parse_medgemma_output(text: str) -> tuple[dict[str, Any], bool]:
    parsed, raw_json_only = extract_json_with_metadata(text)
    if not parsed:
        raise ValueError("no valid JSON object found")
    if not raw_json_only:
        raise ValueError("output must be exactly one raw JSON object")
    return validate_medgemma_output(parsed), raw_json_only


def build_medgemma_handoff_payload(result: dict[str, Any] | None) -> dict[str, Any] | None:
    """MedGemma 출력 → analysis_context에서 사용하는 handoff 형태로 변환."""
    if not result:
        return None
    source_signals = result.get("signals", result)
    if not isinstance(source_signals, dict):
        return None
    candidate = {key: source_signals.get(key) for key in SIGNAL_KEYS}
    try:
        validated = validate_medgemma_output(candidate)
    except ValidationError:
        return None
    return {
        "signals": {key: validated[key] for key in SIGNAL_KEYS},
        "model_version": result.get("model_version", "medgemma-v1"),
        "source": result.get("source", "medgemma"),
        # This payload is created only after the gateway quality check passed.
        "usable": True,
    }


def _score_label(score: str) -> str:  # 내부 유틸 — 현재 미사용
    if score == "none":
        return "없음"
    if score == "mild":
        return "약한"
    if score == "moderate":
        return "중간 수준의"
    return "심한"


def build_medgemma_display_summary(result: dict[str, Any] | None) -> str | None:
    """모바일 표시용 한 줄 요약 생성."""
    if not result:
        return None
    signals = result.get("signals") or {}
    if not signals:
        # raw MedGemma 출력이 직접 전달된 경우
        signals = {k: result[k] for k in SIGNAL_KEYS if k in result}

    _SEVERITY_KO = {"mild": "경미", "moderate": "중등도", "severe": "심함"}
    significant = [
        (SIGNAL_LABELS[key], signals[key])
        for key in SIGNAL_KEYS
        if signals.get(key, "none") in {"mild", "moderate", "severe"}
    ]

    if not significant:
        return "피부 상태가 전반적으로 양호해 보여요."

    if len(significant) == 1:
        label, score = significant[0]
        sev = _SEVERITY_KO.get(score, "")
        return f"{label} 신호가 {sev}하게 감지됐어요."

    parts = [f"{label}({_SEVERITY_KO.get(score, '')})" for label, score in significant]
    joined = ", ".join(parts[:-1]) + f" 및 {parts[-1]}"
    return f"{joined} 신호가 감지됐어요."


def _score_to_level_label(score: str) -> str:
    if score == "mild":
        return "경미함"
    if score == "moderate":
        return "중간"
    if score == "severe":
        return "심함"
    return "없음"


def build_user_facing_observations(result: dict[str, Any] | None) -> dict[str, Any]:
    """모바일 표시용 신호별 상세 정보 생성."""
    if not result:
        return {}

    signals = result.get("signals") or {}
    if not signals:
        # raw MedGemma 출력이 직접 전달된 경우
        signals = {k: result[k] for k in SIGNAL_KEYS if k in result}

    if not signals:
        return {}

    return {
        key: {
            "key": key,
            "label": SIGNAL_LABELS[key],
            "score": signals.get(key, "none"),
            "level_label": _score_to_level_label(signals.get(key, "none")),
        }
        for key in SIGNAL_KEYS
    }
