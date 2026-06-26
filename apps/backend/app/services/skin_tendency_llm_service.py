import json
import os

from sqlalchemy.orm import Session

from app.models.analysis import AnalysisRequest, AnalysisResult
from app.services.analysis_exceptions import (
    SkinTendencyLLMError,
    SkinTendencyLLMResponseError,
)


REQUIRED_ENV_VARS = (
    "AZURE_OPENAI_KEY",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_ANALYSIS_DEPLOYMENT_NAME",
    "AZURE_OPENAI_API_VERSION",
)


def _get_settings() -> dict[str, str]:
    settings = {name: os.getenv(name, "").strip() for name in REQUIRED_ENV_VARS}
    if missing := [name for name, value in settings.items() if not value]:
        raise SkinTendencyLLMError(
            f"missing Azure OpenAI configuration: {', '.join(sorted(missing))}"
        )
    return settings


def _create_client(settings: dict[str, str]):
    try:
        from openai import AzureOpenAI
    except ImportError as exc:
        raise SkinTendencyLLMError("Azure OpenAI client is not installed") from exc
    return AzureOpenAI(
        api_key=settings["AZURE_OPENAI_KEY"],
        azure_endpoint=settings["AZURE_OPENAI_ENDPOINT"],
        api_version=settings["AZURE_OPENAI_API_VERSION"],
    )


def _build_skin_tendency_context(
    db: Session,
    user_id: int,
    factor_sensitivities: list[dict],
) -> dict:
    recent_analyses = (
        db.query(AnalysisResult)
        .join(AnalysisRequest, AnalysisResult.request_id == AnalysisRequest.id)
        .filter(AnalysisRequest.user_id == user_id)
        .order_by(AnalysisResult.created_at.desc())
        .limit(5)
        .all()
    )
    return {
        "recent_analyses": [
            {
                "primary_cause": row.primary_cause,
                "contributing_factors": row.contributing_factors or [],
            }
            for row in recent_analyses
        ],
        "factor_sensitivities": factor_sensitivities,
    }


def _build_messages(context: dict) -> list[dict[str, str]]:
    serialized_context = json.dumps(context, ensure_ascii=False, default=str)
    return [
        {
            "role": "system",
            "content": (
                "You summarize a user's skin sensitivity patterns "
                "based on accumulated analysis data. "
                "Return a JSON object only with a single field: skin_tendency. "
                "Write skin_tendency in Korean, 2~3 sentences. "
                "Focus on specific ingredients, behaviors, or environmental factors "
                "the user reacts to. "
                "Write as observational reference, not a medical diagnosis."
            ),
        },
        {
            "role": "user",
            "content": f"Summarize this user's skin tendency:\n{serialized_context}",
        },
    ]


def _validate_result(result) -> str:
    if not isinstance(result, dict):
        raise SkinTendencyLLMResponseError("Azure OpenAI response must be a JSON object")

    skin_tendency = result.get("skin_tendency")
    if not isinstance(skin_tendency, str):
        raise SkinTendencyLLMResponseError("skin_tendency must be a string")

    skin_tendency = skin_tendency.strip()
    if not skin_tendency:
        raise SkinTendencyLLMResponseError("skin_tendency must not be empty")

    return skin_tendency


def get_skin_tendency(
    db: Session,
    user_id: int,
    factor_sensitivities: list[dict],
) -> str:
    context = _build_skin_tendency_context(db, user_id, factor_sensitivities)
    settings = _get_settings()
    client = _create_client(settings)

    try:
        response = client.chat.completions.create(
            model=settings["AZURE_OPENAI_ANALYSIS_DEPLOYMENT_NAME"],
            messages=_build_messages(context),
            response_format={"type": "json_object"},
        )
    except SkinTendencyLLMError:
        raise
    except Exception as exc:
        raise SkinTendencyLLMError("Azure OpenAI request failed") from exc

    try:
        content = response.choices[0].message.content
        parsed = json.loads(content)
    except Exception as exc:
        raise SkinTendencyLLMResponseError(
            "Azure OpenAI response is not valid JSON"
        ) from exc

    return _validate_result(parsed)
