from datetime import datetime

from sqlalchemy.orm import Session

from app.models.analysis import UserBaseline, UserFactorSensitivity
from app.services.skin_tendency_llm_service import get_skin_tendency


SKIN_TENDENCY_MIN_ANALYSIS_COUNT = 3
SKIN_TENDENCY_MIN_DELTA = 0.2
SKIN_TENDENCY_FACTOR_LIMIT = 5


def update_skin_tendency_if_needed(
    db: Session,
    user_id: int,
    updated_factors: list[dict],
) -> bool:
    baseline = db.query(UserBaseline).filter(UserBaseline.user_id == user_id).first()
    if baseline is None:
        return False

    if (baseline.analysis_count or 0) < SKIN_TENDENCY_MIN_ANALYSIS_COUNT:
        return False

    if not any((factor.get("delta") or 0) >= SKIN_TENDENCY_MIN_DELTA for factor in updated_factors or []):
        return False

    now = datetime.now()
    if baseline.last_calibrated_at and baseline.last_calibrated_at.date() == now.date():
        return False

    sensitivity_rows = (
        db.query(UserFactorSensitivity)
        .filter(UserFactorSensitivity.user_id == user_id)
        .order_by(
            UserFactorSensitivity.sensitivity_score.desc(),
            UserFactorSensitivity.factor_type.asc(),
            UserFactorSensitivity.factor_key.asc(),
        )
        .limit(SKIN_TENDENCY_FACTOR_LIMIT)
        .all()
    )
    factor_sensitivities = [
        {
            "factor_type": row.factor_type,
            "factor_key": row.factor_key,
            "sensitivity_score": float(row.sensitivity_score),
            "trigger_count": int(row.trigger_count or 0),
        }
        for row in sensitivity_rows
    ]
    if not factor_sensitivities:
        return False

    baseline.skin_tendency = get_skin_tendency(db, user_id, factor_sensitivities)
    baseline.last_calibrated_at = now
    db.flush()
    return True
