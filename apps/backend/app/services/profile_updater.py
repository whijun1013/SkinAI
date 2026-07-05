from datetime import date, datetime
from decimal import Decimal
from numbers import Real
from typing import Any

from sqlalchemy.orm import Session

from app.models.analysis import UserBaseline, UserFactorSensitivity


MIN_FACTOR_CONFIDENCE = 0.5
OLD_SCORE_WEIGHT = Decimal("0.7")
CONFIDENCE_WEIGHT = Decimal("0.3")


def update_user_profile_from_agent_results(
    db: Session,
    user_id: int,
    agent_results: list[dict[str, Any]],
    skin_log_logged_at,
) -> list[dict[str, Any]]:
    updated_factors = []
    triggered_at = _as_date(skin_log_logged_at)

    for agent_result in agent_results or []:
        for item in agent_result.get("suspicious_items") or []:
            confidence = _parse_confidence(item.get("confidence"))
            if confidence is None or confidence < MIN_FACTOR_CONFIDENCE:
                continue

            factor_type = item.get("factor_type")
            factor_key = item.get("factor_key")
            if not factor_type or not factor_key:
                continue

            sensitivity = _get_or_create_sensitivity(
                db=db,
                user_id=user_id,
                factor_type=factor_type,
                factor_key=factor_key,
            )
            old_score = _as_decimal(sensitivity.sensitivity_score)
            new_score = old_score * OLD_SCORE_WEIGHT + confidence * CONFIDENCE_WEIGHT
            delta = new_score - old_score

            sensitivity.sensitivity_score = new_score
            sensitivity.trigger_count = (sensitivity.trigger_count or 0) + 1
            sensitivity.last_triggered_at = triggered_at

            updated_factors.append(
                {
                    "factor_type": factor_type,
                    "factor_key": factor_key,
                    "old_score": float(old_score),
                    "new_score": float(new_score),
                    "delta": float(delta),
                    "trigger_count": sensitivity.trigger_count,
                }
            )

    baseline = _get_or_create_baseline(db, user_id)
    baseline.analysis_count = (baseline.analysis_count or 0) + 1

    db.flush()

    return updated_factors


def _get_or_create_sensitivity(
    db: Session,
    user_id: int,
    factor_type: str,
    factor_key: str,
) -> UserFactorSensitivity:
    sensitivity = (
        db.query(UserFactorSensitivity)
        .filter(
            UserFactorSensitivity.user_id == user_id,
            UserFactorSensitivity.factor_type == factor_type,
            UserFactorSensitivity.factor_key == factor_key,
        )
        .first()
    )
    if sensitivity is not None:
        return sensitivity

    sensitivity = UserFactorSensitivity(
        user_id=user_id,
        factor_type=factor_type,
        factor_key=factor_key,
        sensitivity_score=Decimal("0.0"),
        trigger_count=0,
    )
    db.add(sensitivity)
    return sensitivity


def _get_or_create_baseline(db: Session, user_id: int) -> UserBaseline:
    baseline = db.query(UserBaseline).filter(UserBaseline.user_id == user_id).first()
    if baseline is not None:
        return baseline

    baseline = UserBaseline(user_id=user_id, analysis_count=0)
    db.add(baseline)
    return baseline


def _parse_confidence(value) -> Decimal | None:
    if isinstance(value, bool) or not isinstance(value, Real):
        return None
    return Decimal(str(float(value)))


def _as_decimal(value) -> Decimal:
    if value is None:
        return Decimal("0.0")
    return Decimal(str(value))


def _as_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value
