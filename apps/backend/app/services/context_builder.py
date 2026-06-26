from datetime import date

from sqlalchemy.orm import Session

from app.models.analysis import UserBaseline, UserFactorSensitivity
from app.models.user import User
from app.services.aggregation import (
    aggregate_behavior_log,
    aggregate_cosmetic_risk,
    aggregate_diet_log,
    aggregate_environment_log,
    aggregate_medication_risk,
    aggregate_skin_log,
    extract_worst_context,
)


# 개인화 최소조건: analysis_count가 이 값보다 작으면 설문 피부타입 폴백을 사용한다.
# (원인 파악 최소조건인 7일 기록 조건과는 다른 임계값이다. analysis_orchestrator._ensure_enough_skin_log_days 참고.)
PERSONALIZATION_MIN_ANALYSIS_COUNT = 4


def build_analysis_context(db: Session, user_id: int, lookback_days: int, end_date: date) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    baseline = db.query(UserBaseline).filter(UserBaseline.user_id == user_id).first()
    analysis_count = baseline.analysis_count if baseline else 0
    is_personalization_cold_start = analysis_count < PERSONALIZATION_MIN_ANALYSIS_COUNT
    sensitivities = (
        db.query(UserFactorSensitivity)
        .filter(UserFactorSensitivity.user_id == user_id)
        .order_by(
            UserFactorSensitivity.sensitivity_score.desc(),
            UserFactorSensitivity.factor_type.asc(),
            UserFactorSensitivity.factor_key.asc(),
        )
        .limit(5)
        .all()
    )
    skin = aggregate_skin_log(db, user_id, lookback_days, end_date)
    behavior = aggregate_behavior_log(db, user_id, lookback_days, end_date)
    worst_date = date.fromisoformat(skin["worst_date"]) if skin["worst_date"] else None
    return {
        "personal": {
            "skin_tendency": baseline.skin_tendency if baseline else None,
            "skin_type_fallback": (user.skin_type if user else None) if is_personalization_cold_start else None,
            "onboarding_concern_text": user.raw_concern_text if user else None,
            "survey_concerns": (user.skin_concerns if user else None) or [],
            "birth_year": user.birth_year if user else None,
            "top_sensitivities": [
                {
                    "factor_type": sensitivity.factor_type,
                    "factor_key": sensitivity.factor_key,
                    "score": float(sensitivity.sensitivity_score),
                }
                for sensitivity in sensitivities
            ],
            "analysis_count": analysis_count,
            "is_personalization_cold_start": is_personalization_cold_start,
        },
        "stats": {
            "skin": skin,
            "behavior": behavior,
            "diet": aggregate_diet_log(db, user_id, lookback_days, end_date),
            "environment": aggregate_environment_log(db, user_id, lookback_days, end_date),
            "cosmetic": aggregate_cosmetic_risk(db, user_id),
            "medication": aggregate_medication_risk(db, user_id),
        },
        "worst_day": extract_worst_context(db, user_id, worst_date),
        "meta": {
            "lookback_days": lookback_days,
            "skin_records": skin["record_count"],
            "behavior_records": behavior["record_count"],
        },
    }
