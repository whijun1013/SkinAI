from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class EnvVarSpec:
    name: str
    required_in_production: bool = False
    secret: bool = False
    default: str | None = None
    description: str = ""


ENVIRONMENT_VARIABLES: tuple[EnvVarSpec, ...] = (
    EnvVarSpec("APP_ENV", default="production", description="Runtime environment name."),
    EnvVarSpec("DATABASE_URL", True, True, description="Production SQLAlchemy database URL."),
    EnvVarSpec("DB_HOST", default="localhost", description="Local MySQL host when DATABASE_URL is not set."),
    EnvVarSpec("DB_PORT", default="3306", description="Local MySQL port."),
    EnvVarSpec("DB_USER", default="root", description="Local MySQL user."),
    EnvVarSpec("DB_PASSWORD", secret=True, description="Local MySQL password."),
    EnvVarSpec("DB_NAME", default="luvel", description="Local MySQL database name."),
    EnvVarSpec("MONGO_URL", True, True, description="MongoDB URL for analysis/chatbot/queue records."),
    EnvVarSpec("MONGO_DB_NAME", True, default="luvel", description="MongoDB database name."),
    EnvVarSpec("JWT_SECRET_KEY", True, True, description="JWT signing secret."),
    EnvVarSpec("OAUTH_SESSION_SECRET", True, True, description="Signed OAuth session cookie secret."),
    EnvVarSpec("OAUTH_REDIRECT_BASE_URL", True, description="Public backend base URL for OAuth callbacks."),
    EnvVarSpec("SOCIAL_LOGIN_DEFAULT_REDIRECT_URI", True, description="Default mobile redirect URI."),
    EnvVarSpec("SOCIAL_LOGIN_ALLOWED_REDIRECT_SCHEMES", True, description="Allowed mobile OAuth redirect schemes."),
    EnvVarSpec("GOOGLE_CLIENT_ID", secret=True, description="Google OAuth client ID."),
    EnvVarSpec("GOOGLE_CLIENT_SECRET", secret=True, description="Google OAuth client secret."),
    EnvVarSpec("KAKAO_CLIENT_ID", secret=True, description="Kakao OAuth REST API key."),
    EnvVarSpec("KAKAO_CLIENT_SECRET", secret=True, description="Kakao OAuth client secret when enabled."),
    EnvVarSpec("KAKAO_REST_API_KEY", secret=True, description="Alias for Kakao REST API key."),
    EnvVarSpec("NAVER_CLIENT_ID", secret=True, description="Naver OAuth client ID."),
    EnvVarSpec("NAVER_CLIENT_SECRET", secret=True, description="Naver OAuth client secret."),
    EnvVarSpec("APPLE_CLIENT_ID", True, description="Apple Services ID or app bundle ID."),
    EnvVarSpec("APPLE_TEAM_ID", True, secret=True, description="Apple developer team ID."),
    EnvVarSpec("APPLE_KEY_ID", True, secret=True, description="Apple private key ID."),
    EnvVarSpec("APPLE_PRIVATE_KEY_PATH", True, secret=True, description="Apple private key file path."),
    EnvVarSpec("OPENAI_API_KEY", secret=True, description="OpenAI API key for LLM features."),
    EnvVarSpec("OPENAI_MODEL", default="gpt-4o-mini", description="Default OpenAI text model."),
    EnvVarSpec("OPENAI_ANALYSIS_MODEL", default="gpt-4o", description="OpenAI analysis model."),
    EnvVarSpec("OPENAI_CHAT_MODEL", default="gpt-4o", description="OpenAI chatbot model."),
    EnvVarSpec("OPENAI_VISION_MODEL", default="gpt-4o", description="OpenAI food vision model."),
    EnvVarSpec("GEMINI_API_KEY", secret=True, description="Gemini API key when SKIN_ANALYSIS_PROVIDER=gemini."),
    EnvVarSpec("GEMINI_MODEL", default="gemini-2.5-flash", description="Gemini skin analysis model."),
    EnvVarSpec("SKIN_ANALYSIS_PROVIDER", default="gemini", description="gemini|openai|disabled."),
    EnvVarSpec("MEDIAPIPE_FACE_DETECTOR_MODEL", description="Local MediaPipe face detector model path."),
    EnvVarSpec("MEDGEMMA_QUEUE_ENABLED", default="false", description="Enable async visual analysis queue."),
    EnvVarSpec("ENABLE_WEB_SCHEDULER", default="false", description="Run APScheduler inside the web process; keep false in production when using Render cron."),
    EnvVarSpec("MEDGEMMA_WORKER_MAX_ATTEMPTS", default="3", description="Queue worker retry limit."),
    EnvVarSpec("MEDGEMMA_STALE_REQUEUE_INTERVAL_MINUTES", default="60", description="Stale queue requeue interval."),
    EnvVarSpec("MEDGEMMA_PRIMARY_VISUAL_MIN_CONFIDENCE", default="medium", description="Minimum visual confidence."),
    EnvVarSpec("STORAGE_PROVIDER", True, default="local", description="local|s3|r2 blob storage provider."),
    EnvVarSpec("LOCAL_STORAGE_ROOT", default="./uploads", description="Local blob storage root."),
    EnvVarSpec("S3_BUCKET_NAME", secret=True, description="S3 bucket when STORAGE_PROVIDER=s3."),
    EnvVarSpec("S3_PUBLIC_BASE_URL", description="Public S3 asset base URL."),
    EnvVarSpec("S3_ENDPOINT_URL", description="Custom S3 endpoint URL."),
    EnvVarSpec("S3_ACCESS_KEY_ID", secret=True, description="S3 access key."),
    EnvVarSpec("S3_SECRET_ACCESS_KEY", secret=True, description="S3 secret key."),
    EnvVarSpec("S3_REGION", default="auto", description="S3 region."),
    EnvVarSpec("R2_ACCOUNT_ID", secret=True, description="Cloudflare R2 account ID."),
    EnvVarSpec("R2_ACCESS_KEY_ID", secret=True, description="Cloudflare R2 access key."),
    EnvVarSpec("R2_SECRET_ACCESS_KEY", secret=True, description="Cloudflare R2 secret key."),
    EnvVarSpec("R2_BUCKET", secret=True, description="Cloudflare R2 bucket."),
    EnvVarSpec("R2_PUBLIC_BASE_URL", description="Public R2 asset base URL."),
    EnvVarSpec("BACKEND_BASE_URL", True, description="Public backend base URL for workers/image loading."),
    EnvVarSpec("CORS_ORIGINS", True, description="Comma-separated allowed frontend origins."),
    EnvVarSpec("KMA_AUTH_KEY", secret=True, description="KMA weather API key."),
    EnvVarSpec("KMA_LIVING_INDEX_SERVICE_KEY", secret=True, description="KMA UV/living index API key."),
    EnvVarSpec("AIRKOREA_SERVICE_KEY", secret=True, description="AirKorea dust API key."),
    EnvVarSpec("KAKAO_API_KEY", secret=True, description="Kakao local API key for reverse geocoding."),
    EnvVarSpec("ALLOW_MOCK_ENVIRONMENT_DATA", default="false", description="Allow mock environment data."),
    EnvVarSpec("MFDS_API_KEY", secret=True, description="MFDS medication data API key."),
    EnvVarSpec("DATA_GO_KR_SERVICE_KEY", secret=True, description="data.go.kr food/HACCP API key."),
    EnvVarSpec("FOODSAFETY_API_KEY", secret=True, description="Food safety API key."),
    EnvVarSpec("NAVER_SHOPPING_CLIENT_ID", secret=True, description="Naver shopping API client ID."),
    EnvVarSpec("NAVER_SHOPPING_CLIENT_SECRET", secret=True, description="Naver shopping API secret."),
    EnvVarSpec("NAVER_SEARCH_CLIENT_ID", secret=True, description="Naver image search API client ID."),
    EnvVarSpec("NAVER_SEARCH_CLIENT_SECRET", secret=True, description="Naver image search API secret."),
    EnvVarSpec("ENABLE_REVIEW_ACCOUNT_LOGIN", default="false", description="Enable App Store/Play Store reviewer test account."),
    EnvVarSpec("REVIEW_ACCOUNT_EMAIL", description="Email for reviewer test account."),
    EnvVarSpec("REVIEW_ACCOUNT_PASSWORD", secret=True, description="Password for reviewer test account."),
    EnvVarSpec("REVIEW_ACCOUNT_NAME", default="Luvel Reviewer", description="Name for reviewer test account."),
    EnvVarSpec("ENABLE_ADMIN_DUMMY_TOOLS", default="false", description="Enable admin-only dummy generators."),
    EnvVarSpec("ENABLE_ACTION_RECOMMENDATIONS", default="true", description="Enable action recommendations in reports."),
    EnvVarSpec("ENABLE_FOOD_VISION", default="false", description="Enable AI food vision processing."),
    EnvVarSpec("FOOD_VISION_PROVIDER", default="openai", description="disabled|openai|gemini"),
    EnvVarSpec("FOOD_VISION_DAILY_LIMIT_PER_USER", default="10", description="Daily quota per user for food vision."),
    EnvVarSpec("FOOD_VISION_MONTHLY_BUDGET_USD", default="20.0", description="Global monthly budget for food vision."),
    EnvVarSpec("FOOD_VISION_CACHE_TTL_DAYS", default="30", description="Cache TTL for food vision results."),
    EnvVarSpec("ENABLE_COSMETIC_OCR", default="false", description="Enable cosmetic ingredients OCR."),
    EnvVarSpec("COSMETIC_OCR_PROVIDER", default="openai", description="disabled|openai"),
    EnvVarSpec("COSMETIC_OCR_DAILY_LIMIT_PER_USER", default="5", description="Daily quota per user for cosmetic OCR."),
    EnvVarSpec("COSMETIC_OCR_MONTHLY_BUDGET_USD", default="10.0", description="Global monthly budget for cosmetic OCR."),
    EnvVarSpec("COSMETIC_OCR_CACHE_TTL_DAYS", default="30", description="Cache TTL for OCR results."),
)


PROVIDER_REQUIRED_ENV: dict[str, tuple[str, ...]] = {
    "s3": ("S3_BUCKET_NAME", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"),
    "r2": ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"),
}

REVIEW_ACCOUNT_REQUIRED_ENV: tuple[str, ...] = (
    "REVIEW_ACCOUNT_EMAIL",
    "REVIEW_ACCOUNT_PASSWORD",
)


def env_names(specs: Iterable[EnvVarSpec] = ENVIRONMENT_VARIABLES) -> set[str]:
    return {spec.name for spec in specs}


def required_production_names() -> set[str]:
    return {spec.name for spec in ENVIRONMENT_VARIABLES if spec.required_in_production}


def validate_environment(environ: dict[str, str] | None = None) -> list[str]:
    values = os.environ if environ is None else environ
    missing = sorted(name for name in required_production_names() if not values.get(name, "").strip())

    provider = values.get("STORAGE_PROVIDER", "local").lower()
    missing.extend(name for name in PROVIDER_REQUIRED_ENV.get(provider, ()) if not values.get(name, "").strip())

    analysis_provider = values.get("SKIN_ANALYSIS_PROVIDER", "gemini").lower()
    if analysis_provider == "gemini" and not values.get("GEMINI_API_KEY", "").strip():
        missing.append("GEMINI_API_KEY")
    if analysis_provider == "openai" and not values.get("OPENAI_API_KEY", "").strip():
        missing.append("OPENAI_API_KEY")

    review_login_enabled = values.get("ENABLE_REVIEW_ACCOUNT_LOGIN", "false").lower() in {"1", "true", "yes", "on"}
    if review_login_enabled:
        missing.extend(name for name in REVIEW_ACCOUNT_REQUIRED_ENV if not values.get(name, "").strip())

    food_vision_enabled = values.get("ENABLE_FOOD_VISION", "false").lower() in {"1", "true", "yes", "on"}
    food_vision_provider = values.get("FOOD_VISION_PROVIDER", "openai").lower()
    if food_vision_enabled and food_vision_provider == "openai" and not values.get("OPENAI_API_KEY", "").strip():
        missing.append("OPENAI_API_KEY")

    cosmetic_ocr_enabled = values.get("ENABLE_COSMETIC_OCR", "false").lower() in {"1", "true", "yes", "on"}
    cosmetic_ocr_provider = values.get("COSMETIC_OCR_PROVIDER", "disabled").lower()
    if cosmetic_ocr_enabled and cosmetic_ocr_provider == "openai" and not values.get("OPENAI_API_KEY", "").strip():
        missing.append("OPENAI_API_KEY")

    return sorted(set(missing))
