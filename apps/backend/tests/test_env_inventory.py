import re
from pathlib import Path

from app.env_inventory import required_production_names, validate_environment


REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = REPO_ROOT / "apps" / "backend"


def _dotenv_keys(path: Path) -> set[str]:
    keys: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^([A-Z0-9_]+)=", line.strip())
        if match:
            keys.add(match.group(1))
    return keys


def _render_env_keys() -> set[str]:
    keys: set[str] = set()
    for line in (REPO_ROOT / "render.yaml").read_text(encoding="utf-8").splitlines():
        match = re.match(r"\s*-\s+key:\s+([A-Z0-9_]+)\s*$", line)
        if match:
            keys.add(match.group(1))
    return keys


def test_backend_env_example_documents_required_production_keys():
    keys = _dotenv_keys(BACKEND_ROOT / ".env.example")

    assert required_production_names() <= keys


def test_render_manifest_declares_required_production_keys():
    keys = _render_env_keys()

    assert required_production_names() <= keys


def test_validate_environment_adds_provider_specific_requirements():
    missing = validate_environment(
        {
            "DATABASE_URL": "mysql://example",
            "MONGO_URL": "mongodb://example",
            "MONGO_DB_NAME": "luvel",
            "JWT_SECRET_KEY": "secret",
            "OAUTH_SESSION_SECRET": "secret",
            "OAUTH_REDIRECT_BASE_URL": "https://api.example.com",
            "SOCIAL_LOGIN_DEFAULT_REDIRECT_URI": "luvel://auth/social",
            "SOCIAL_LOGIN_ALLOWED_REDIRECT_SCHEMES": "luvel",
            "APPLE_CLIENT_ID": "com.luvel.app",
            "APPLE_TEAM_ID": "team",
            "APPLE_KEY_ID": "key",
            "APPLE_PRIVATE_KEY_PATH": "/run/secrets/apple.p8",
            "STORAGE_PROVIDER": "r2",
            "BACKEND_BASE_URL": "https://api.example.com",
            "CORS_ORIGINS": "https://app.example.com",
            "SKIN_ANALYSIS_PROVIDER": "disabled",
        }
    )

    assert missing == ["R2_ACCESS_KEY_ID", "R2_ACCOUNT_ID", "R2_BUCKET", "R2_SECRET_ACCESS_KEY"]


def test_validate_environment_requires_review_account_credentials_when_enabled():
    missing = validate_environment(
        {
            "DATABASE_URL": "mysql://example",
            "MONGO_URL": "mongodb://example",
            "MONGO_DB_NAME": "luvel",
            "JWT_SECRET_KEY": "secret",
            "OAUTH_SESSION_SECRET": "secret",
            "OAUTH_REDIRECT_BASE_URL": "https://api.example.com",
            "SOCIAL_LOGIN_DEFAULT_REDIRECT_URI": "luvel://auth/social",
            "SOCIAL_LOGIN_ALLOWED_REDIRECT_SCHEMES": "luvel",
            "APPLE_CLIENT_ID": "com.luvel.app",
            "APPLE_TEAM_ID": "team",
            "APPLE_KEY_ID": "key",
            "APPLE_PRIVATE_KEY_PATH": "/run/secrets/apple.p8",
            "STORAGE_PROVIDER": "local",
            "BACKEND_BASE_URL": "https://api.example.com",
            "CORS_ORIGINS": "https://app.example.com",
            "SKIN_ANALYSIS_PROVIDER": "disabled",
            "ENABLE_REVIEW_ACCOUNT_LOGIN": "true",
        }
    )

    assert missing == ["REVIEW_ACCOUNT_EMAIL", "REVIEW_ACCOUNT_PASSWORD"]


def test_validate_environment_requires_ai_provider_key_when_feature_enabled():
    base_env = {
        "DATABASE_URL": "mysql://example",
        "MONGO_URL": "mongodb://example",
        "MONGO_DB_NAME": "luvel",
        "JWT_SECRET_KEY": "secret",
        "OAUTH_SESSION_SECRET": "secret",
        "OAUTH_REDIRECT_BASE_URL": "https://api.example.com",
        "SOCIAL_LOGIN_DEFAULT_REDIRECT_URI": "luvel://auth/social",
        "SOCIAL_LOGIN_ALLOWED_REDIRECT_SCHEMES": "luvel",
        "APPLE_CLIENT_ID": "com.luvel.app",
        "APPLE_TEAM_ID": "team",
        "APPLE_KEY_ID": "key",
        "APPLE_PRIVATE_KEY_PATH": "/run/secrets/apple.p8",
        "STORAGE_PROVIDER": "local",
        "BACKEND_BASE_URL": "https://api.example.com",
        "CORS_ORIGINS": "https://app.example.com",
        "SKIN_ANALYSIS_PROVIDER": "disabled",
    }

    food_missing = validate_environment(
        {
            **base_env,
            "ENABLE_FOOD_VISION": "true",
            "FOOD_VISION_PROVIDER": "openai",
        }
    )
    assert food_missing == ["OPENAI_API_KEY"]

    ocr_missing = validate_environment(
        {
            **base_env,
            "ENABLE_COSMETIC_OCR": "true",
            "COSMETIC_OCR_PROVIDER": "openai",
        }
    )
    assert ocr_missing == ["OPENAI_API_KEY"]
