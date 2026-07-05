from __future__ import annotations

from datetime import date
from statistics import median
from typing import Literal, TypedDict

from sqlalchemy.orm import Session

from app.models.period import PeriodLog
from app.models.user import User

DEFAULT_CYCLE_LENGTH = 28
MIN_VALID_INTERVAL_DAYS = 15
MENSTRUAL_PHASE_DAYS = 5
OVULATION_LUTEAL_OFFSET = 14
OVULATION_WINDOW_DAYS = 3
IRREGULAR_INTERVAL_STDEV_DAYS = 4

CycleLengthSource = Literal["user", "estimated", "default"]
CyclePhase = Literal["menstrual", "follicular", "ovulation", "luteal", "unknown"]
InferredRegularity = Literal["regular", "irregular", "unknown"]


class PeriodCycleSnapshot(TypedDict):
    target_date: date
    applicable: bool
    last_period_start: date | None
    cycle_day: int | None
    cycle_length_used: int | None
    cycle_length_source: CycleLengthSource | None
    estimated_cycle_length: int | None
    phase: CyclePhase
    phase_label_ko: str
    cycle_regularity_reported: str | None
    cycle_regularity_inferred: InferredRegularity
    confidence: Literal["high", "medium", "low"]
    message: str | None


def build_period_cycle_snapshot(
    db: Session,
    user: User,
    target_date: date,
) -> PeriodCycleSnapshot:
    if user.gender != "여":
        return _not_applicable_snapshot(target_date, "생리 주기 정보는 여성 사용자에게만 제공됩니다.")

    starts = _list_period_starts(db, user.id)
    if not starts:
        return _empty_snapshot(
            target_date,
            user.cycle_regularity,
            message="생리 시작일 기록이 없어 주기를 계산할 수 없습니다.",
        )

    last_start = _last_start_on_or_before(starts, target_date)
    if last_start is None:
        return _empty_snapshot(
            target_date,
            user.cycle_regularity,
            message="선택한 날짜 이전의 생리 시작일이 없습니다.",
        )

    estimated_length = _estimate_cycle_length(starts)
    cycle_length, source = _resolve_cycle_length(user.avg_cycle_length, estimated_length)
    cycle_day = (target_date - last_start).days + 1
    if cycle_day <= 0:
        return _empty_snapshot(
            target_date,
            user.cycle_regularity,
            message="선택한 날짜가 마지막 생리 시작일 이전입니다.",
        )

    phase, phase_label = _resolve_phase(cycle_day, cycle_length)
    confidence = _resolve_confidence(source, starts, user.cycle_regularity)

    return {
        "target_date": target_date,
        "applicable": True,
        "last_period_start": last_start,
        "cycle_day": cycle_day,
        "cycle_length_used": cycle_length,
        "cycle_length_source": source,
        "estimated_cycle_length": estimated_length,
        "phase": phase,
        "phase_label_ko": phase_label,
        "cycle_regularity_reported": user.cycle_regularity,
        "cycle_regularity_inferred": _infer_regularity(starts),
        "confidence": confidence,
        "message": None,
    }


def _list_period_starts(db: Session, user_id: int) -> list[date]:
    rows = (
        db.query(PeriodLog.started_at)
        .filter(PeriodLog.user_id == user_id)
        .order_by(PeriodLog.started_at.asc())
        .all()
    )
    return [row[0] for row in rows]


def _last_start_on_or_before(starts: list[date], target_date: date) -> date | None:
    eligible = [started_at for started_at in starts if started_at <= target_date]
    return eligible[-1] if eligible else None


def _valid_intervals(starts: list[date]) -> list[int]:
    if len(starts) < 2:
        return []

    intervals: list[int] = []
    for previous, current in zip(starts, starts[1:]):
        gap = (current - previous).days
        if gap >= MIN_VALID_INTERVAL_DAYS:
            intervals.append(gap)
    return intervals


def _estimate_cycle_length(starts: list[date]) -> int | None:
    intervals = _valid_intervals(starts)
    if not intervals:
        return None
    return int(round(median(intervals)))


def _resolve_cycle_length(
    user_cycle_length: int | None,
    estimated_cycle_length: int | None,
) -> tuple[int, CycleLengthSource]:
    if user_cycle_length is not None:
        return user_cycle_length, "user"
    if estimated_cycle_length is not None:
        return estimated_cycle_length, "estimated"
    return DEFAULT_CYCLE_LENGTH, "default"


def _resolve_phase(cycle_day: int, cycle_length: int) -> tuple[CyclePhase, str]:
    if cycle_day > cycle_length:
        return "unknown", "주기 예상일 이후"

    ovulation_day = max(MENSTRUAL_PHASE_DAYS + 1, cycle_length - OVULATION_LUTEAL_OFFSET)
    ovulation_start = max(MENSTRUAL_PHASE_DAYS + 1, ovulation_day - 1)
    ovulation_end = min(cycle_length, ovulation_day + (OVULATION_WINDOW_DAYS - 2))

    if cycle_day <= MENSTRUAL_PHASE_DAYS:
        return "menstrual", "생리기"
    if cycle_day < ovulation_start:
        return "follicular", "여포기"
    if cycle_day <= ovulation_end:
        return "ovulation", "배란기"
    return "luteal", "황체기"


def _infer_regularity(starts: list[date]) -> InferredRegularity:
    intervals = _valid_intervals(starts)
    if len(intervals) < 2:
        return "unknown"

    avg = sum(intervals) / len(intervals)
    variance = sum((value - avg) ** 2 for value in intervals) / len(intervals)
    spread = variance ** 0.5
    return "irregular" if spread >= IRREGULAR_INTERVAL_STDEV_DAYS else "regular"


def _resolve_confidence(
    source: CycleLengthSource,
    starts: list[date],
    cycle_regularity: str | None,
) -> Literal["high", "medium", "low"]:
    if source == "user" and len(starts) >= 2:
        return "high"
    if source == "estimated" and len(starts) >= 3:
        return "high"
    if source == "estimated":
        return "medium"
    if cycle_regularity == "규칙적":
        return "medium"
    return "low"


def _not_applicable_snapshot(target_date: date, message: str) -> PeriodCycleSnapshot:
    return {
        "target_date": target_date,
        "applicable": False,
        "last_period_start": None,
        "cycle_day": None,
        "cycle_length_used": None,
        "cycle_length_source": None,
        "estimated_cycle_length": None,
        "phase": "unknown",
        "phase_label_ko": "해당 없음",
        "cycle_regularity_reported": None,
        "cycle_regularity_inferred": "unknown",
        "confidence": "low",
        "message": message,
    }


def _empty_snapshot(
    target_date: date,
    cycle_regularity: str | None,
    *,
    message: str,
) -> PeriodCycleSnapshot:
    return {
        "target_date": target_date,
        "applicable": True,
        "last_period_start": None,
        "cycle_day": None,
        "cycle_length_used": None,
        "cycle_length_source": None,
        "estimated_cycle_length": None,
        "phase": "unknown",
        "phase_label_ko": "알 수 없음",
        "cycle_regularity_reported": cycle_regularity,
        "cycle_regularity_inferred": "unknown",
        "confidence": "low",
        "message": message,
    }
