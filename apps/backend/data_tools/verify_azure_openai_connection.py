import sys
from pathlib import Path

from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
load_dotenv(BACKEND_ROOT / ".env")

from app.services.analysis_exceptions import AnalysisError
from app.services.analysis_llm_service import analyze_with_llm


SAMPLE_CONTEXT = {
    "meta": {
        "trigger_date": "2026-06-01",
        "trigger_score": 3,
        "trigger_tags": [],
        "lookback_days": 14,
        "data_coverage": {
            "skin_days": 7,
            "behavior_days": 0,
            "diet_days": 0,
            "env_days": 0,
        },
        "data_quality": {
            "skin_behavior_overlap_days": 0,
            "has_sufficient_overlap": False,
        },
    },
    "daily_timeline": [],
    "context": {
        "current_cosmetics": [],
        "current_medications": [],
    },
    "summary": {
        "personal": {},
        "stats": {},
        "worst_day": {},
    },
}


def _classify_bad_request(cause) -> str:
    body = getattr(cause, "body", None)
    error = body.get("error", body) if isinstance(body, dict) else {}
    message = error.get("message", "") if isinstance(error, dict) else ""
    normalized = str(message).lower()
    if "response_format" in normalized or "json_object" in normalized:
        return "response_format_not_supported"
    if "deployment" in normalized or "model" in normalized:
        return "deployment_or_model_configuration"
    if "api-version" in normalized or "api version" in normalized:
        return "api_version_incompatible"
    if "content filter" in normalized or "content_filter" in normalized:
        return "content_filter"
    return "unclassified_bad_request"


def main() -> int:
    try:
        result = analyze_with_llm(SAMPLE_CONTEXT)
    except AnalysisError as exc:
        print(f"Azure OpenAI verification failed: {type(exc).__name__}: {exc}")
        cause = exc.__cause__
        if cause is not None:
            print(f"root_cause_type={type(cause).__name__}")
            status_code = getattr(cause, "status_code", None)
            if status_code is not None:
                print(f"root_cause_status_code={status_code}")
            if status_code == 400:
                print(f"root_cause_category={_classify_bad_request(cause)}")
            body = getattr(cause, "body", None)
            error = body.get("error", body) if isinstance(body, dict) else {}
            if isinstance(error, dict):
                for field in ("type", "param", "code"):
                    value = error.get(field)
                    if value is not None:
                        print(f"root_cause_{field}={value}")
        return 1

    print("Azure OpenAI verification succeeded.")
    print(f"primary_cause_type={type(result['primary_cause']).__name__}")
    print(f"contributing_factors_type={type(result['contributing_factors']).__name__}")
    print(f"report_text_type={type(result['report_text']).__name__}")
    print(f"confidence_score_type={type(result['confidence_score']).__name__}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
