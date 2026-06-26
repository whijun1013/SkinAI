import os
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from authlib.integrations.starlette_client import OAuth
from dotenv import load_dotenv


load_dotenv()


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _csv_env(name: str, default: str = "") -> set[str]:
    values = _env(name, default)
    return {value.strip() for value in values.split(",") if value.strip()}


@dataclass(frozen=True)
class SocialProfile:
    provider: str
    provider_user_id: str
    email: str
    name: str


OAUTH_SESSION_SECRET = (
    _env("OAUTH_SESSION_SECRET")
    or _env("JWT_SECRET_KEY")
    or "change-me-oauth-session-secret"
)

SOCIAL_LOGIN_DEFAULT_REDIRECT_URI = _env(
    "SOCIAL_LOGIN_DEFAULT_REDIRECT_URI",
    "skinai://auth/social",
)

SOCIAL_LOGIN_ALLOWED_REDIRECT_SCHEMES = _csv_env(
    "SOCIAL_LOGIN_ALLOWED_REDIRECT_SCHEMES",
    "skinai",
)

SUPPORTED_SOCIAL_PROVIDERS = ("google", "kakao", "naver")

oauth = OAuth()

oauth.register(
    name="google",
    client_id=_env("GOOGLE_CLIENT_ID"),
    client_secret=_env("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

_kakao_client_secret = _env("KAKAO_CLIENT_SECRET")
_kakao_options: dict[str, Any] = {
    "name": "kakao",
    "client_id": _env("KAKAO_CLIENT_ID") or _env("KAKAO_REST_API_KEY"),
    "authorize_url": "https://kauth.kakao.com/oauth/authorize",
    "access_token_url": "https://kauth.kakao.com/oauth/token",
    "api_base_url": "https://kapi.kakao.com/",
    "client_kwargs": {"scope": "profile_nickname"},
}
if _kakao_client_secret:
    _kakao_options["client_secret"] = _kakao_client_secret
    _kakao_options["token_endpoint_auth_method"] = "client_secret_post"
oauth.register(**_kakao_options)

oauth.register(
    name="naver",
    client_id=_env("NAVER_CLIENT_ID"),
    client_secret=_env("NAVER_CLIENT_SECRET"),
    authorize_url="https://nid.naver.com/oauth2.0/authorize",
    access_token_url="https://nid.naver.com/oauth2.0/token",
    api_base_url="https://openapi.naver.com/",
    token_endpoint_auth_method="client_secret_post",
)


def is_supported_provider(provider: str) -> bool:
    return provider in SUPPORTED_SOCIAL_PROVIDERS


def is_provider_configured(provider: str) -> bool:
    if provider == "google":
        return bool(_env("GOOGLE_CLIENT_ID") and _env("GOOGLE_CLIENT_SECRET"))
    if provider == "kakao":
        return bool(_env("KAKAO_CLIENT_ID") or _env("KAKAO_REST_API_KEY"))
    if provider == "naver":
        return bool(_env("NAVER_CLIENT_ID") and _env("NAVER_CLIENT_SECRET"))
    return False


def build_callback_url(request: Any, provider: str) -> str:
    base_url = _env("OAUTH_REDIRECT_BASE_URL")
    if base_url:
        return f"{base_url.rstrip('/')}/auth/social/{provider}/callback"

    return str(request.url_for("social_login_callback", provider=provider))


def resolve_app_redirect_uri(redirect_uri: str | None) -> str:
    redirect_uri = (redirect_uri or SOCIAL_LOGIN_DEFAULT_REDIRECT_URI).strip()
    parsed = urlparse(redirect_uri)

    if not parsed.scheme:
        raise ValueError("Redirect URI must include a scheme.")

    if parsed.scheme not in SOCIAL_LOGIN_ALLOWED_REDIRECT_SCHEMES:
        raise ValueError("Redirect URI scheme is not allowed.")

    return redirect_uri


def append_fragment_params(redirect_uri: str, params: dict[str, str]) -> str:
    parsed = urlparse(redirect_uri)
    current = dict(parse_qsl(parsed.fragment, keep_blank_values=True))
    current.update(params)
    return urlunparse(parsed._replace(fragment=urlencode(current)))


def append_query_params(redirect_uri: str, params: dict[str, str]) -> str:
    parsed = urlparse(redirect_uri)
    current = dict(parse_qsl(parsed.query, keep_blank_values=True))
    current.update(params)
    return urlunparse(parsed._replace(query=urlencode(current)))


def normalize_google_profile(token: dict[str, Any]) -> SocialProfile:
    userinfo = token.get("userinfo") or {}
    email = userinfo.get("email")
    if not email:
        raise ValueError("Google account did not return an email address.")
    if userinfo.get("email_verified") is False:
        raise ValueError("Google account email is not verified.")

    return SocialProfile(
        provider="google",
        provider_user_id=str(userinfo.get("sub") or email),
        email=email,
        name=userinfo.get("name") or email.split("@")[0],
    )


def normalize_kakao_profile(profile: dict[str, Any]) -> SocialProfile:
    kakao_id = str(profile.get("id") or "")
    if not kakao_id:
        raise ValueError("Kakao account did not return a user ID.")

    kakao_account = profile.get("kakao_account") or {}
    kakao_profile = kakao_account.get("profile") or {}
    properties = profile.get("properties") or {}

    name = (
        kakao_profile.get("nickname")
        or properties.get("nickname")
        or f"카카오사용자_{kakao_id}"
    )
    # 이메일 우선, 없으면 임시 이메일
    email = kakao_account.get("email") or f"kakao_{kakao_id}@kakao.social"

    return SocialProfile(
        provider="kakao",
        provider_user_id=kakao_id,
        email=email,
        name=name,
    )


def normalize_naver_profile(profile: dict[str, Any]) -> SocialProfile:
    response = profile.get("response") or {}
    email = response.get("email")
    if not email:
        raise ValueError("Naver account did not return an email address.")

    return SocialProfile(
        provider="naver",
        provider_user_id=str(response.get("id") or email),
        email=email,
        name=response.get("name") or response.get("nickname") or email.split("@")[0],
    )
