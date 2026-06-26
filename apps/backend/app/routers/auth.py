import os
import secrets
import traceback
from datetime import datetime
from time import sleep

from authlib.integrations.base_client import OAuthError
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from starlette.responses import RedirectResponse

from app.auth.oauth import (
    append_query_params,
    build_callback_url,
    is_provider_configured,
    is_supported_provider,
    normalize_google_profile,
    normalize_kakao_profile,
    normalize_naver_profile,
    oauth,
    resolve_app_redirect_uri,
)
from app.auth.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.database import get_db
from app.deps.auth import get_current_user
from app.models.user import SocialAccount, User
from app.models.skin_log import SkinLog
from app.models.diet import DietLog
from app.services.blob_storage import delete_blobs
from app.schemas.user import (
    RefreshTokenRequest,
    Token,
    UserCreate,
    UserOnboardingProfileUpdate,
    UserLogin,
    UserResponse,
    UserResponse,
    PushTokenUpdate,
)
from app.schemas.auth import PasswordResetRequest, PasswordResetConfirm, PasswordChangeRequest
from app.schemas.auth_error import (
    EMAIL_ALREADY_EXISTS,
    EMAIL_REGISTERED_WITH_SOCIAL,
    PASSWORD_TOO_LONG,
    PASSWORD_TOO_SHORT,
    raise_auth_error,
)
from app.models.auth import PasswordResetToken

router = APIRouter(prefix="/auth", tags=["auth"])


def create_token_pair(user: User) -> dict:
    access_token = create_access_token(data={"sub": user.email, "session_version": user.session_version})
    refresh_token = create_refresh_token(data={"sub": user.email, "session_version": user.session_version})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user,
    }


def get_or_create_social_user(profile, db: Session) -> tuple[User, bool]:
    social_account = (
        db.query(SocialAccount)
        .filter(
            SocialAccount.provider == profile.provider,
            SocialAccount.provider_user_id == profile.provider_user_id,
        )
        .first()
    )

    if social_account:
        user = social_account.user
        # 소셜 계정은 있지만 약관 동의를 완료하지 않은 경우 (거부 후 재시도)
        needs_terms = user.terms_agreed_at is None
        return user, needs_terms

    email = profile.email.lower()
    user = db.query(User).filter(User.email == email).first()

    if not user:
        random_password = secrets.token_urlsafe(32)
        user = User(
            email=email,
            name=profile.name[:50],
            hashed_password=get_password_hash(random_password),
            terms_agreed_at=None,  # 약관 동의 전까지 NULL
        )
        db.add(user)
        db.flush()

    db.add(
        SocialAccount(
            user_id=user.id,
            provider=profile.provider,
            provider_user_id=profile.provider_user_id,
            email=email,
        )
    )

    db.commit()
    db.refresh(user)
    # 약관 미동의 상태면 terms 요구
    needs_terms = user.terms_agreed_at is None
    return user, needs_terms


async def fetch_social_profile(provider: str, client, token: dict):
    if provider == "google":
        return normalize_google_profile(token)

    if provider == "kakao":
        response = await client.get("v2/user/me", token=token)
        response.raise_for_status()
        return normalize_kakao_profile(response.json())

    if provider == "naver":
        response = await client.get("v1/nid/me", token=token)
        response.raise_for_status()
        return normalize_naver_profile(response.json())

    raise ValueError("지원하지 않는 소셜 로그인 제공자입니다")


def redirect_with_error(redirect_uri: str, message: str) -> RedirectResponse:
    return RedirectResponse(
        append_query_params(redirect_uri, {"error": message}),
        status_code=status.HTTP_302_FOUND,
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    try:
        print(f"📥 회원가입 요청: {user_data.email}, {user_data.name}")

        existing_user = db.query(User).filter(User.email == user_data.email).first()
        if existing_user:
            social = db.query(SocialAccount).filter(
                SocialAccount.user_id == existing_user.id
            ).first()
            if social:
                raise_auth_error(
                    status.HTTP_409_CONFLICT,
                    EMAIL_REGISTERED_WITH_SOCIAL,
                    f"이 이메일은 {social.provider} 소셜 로그인으로 가입된 계정입니다.",
                    provider=social.provider,
                )
            raise_auth_error(
                status.HTTP_400_BAD_REQUEST,
                EMAIL_ALREADY_EXISTS,
                "이미 사용 중인 이메일입니다",
            )

        if len(user_data.password) < 8:
            raise_auth_error(
                status.HTTP_400_BAD_REQUEST,
                PASSWORD_TOO_SHORT,
                "비밀번호는 최소 8자 이상이어야 합니다",
            )

        if len(user_data.password) > 72:
            raise_auth_error(
                status.HTTP_400_BAD_REQUEST,
                PASSWORD_TOO_LONG,
                "비밀번호는 최대 72자까지 가능합니다",
            )

        print("🔒 비밀번호 해싱 중...")
        hashed_password = get_password_hash(user_data.password)

        print("💾 DB 저장 중...")
        new_user = User(
            email=user_data.email,
            name=user_data.name[:50],
            hashed_password=hashed_password,
            skin_type=user_data.skin_type or None,
            birth_year=user_data.birth_year or None,
            gender=user_data.gender or None,
            terms_agreed_at=datetime.utcnow(),
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        print(f"✅ 회원가입 성공: ID={new_user.id}")
        return new_user

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 회원가입 에러: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"서버 에러: {str(e)}",
        )


@router.post("/login", response_model=Token)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_data.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다",
        )

    if not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다",
        )

    return create_token_pair(user)


@router.post("/refresh", response_model=dict)
def refresh_token(token_data: RefreshTokenRequest, db: Session = Depends(get_db)):
    payload = decode_token(token_data.refresh_token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 토큰입니다",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh 토큰이 아닙니다",
        )

    email = payload.get("sub")
    user = db.query(User).filter(User.email == email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="사용자를 찾을 수 없습니다",
        )

    if user.deleted_at is not None or user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="접근이 제한된 계정입니다",
        )
        
    token_session_version = payload.get("session_version")
    if token_session_version is not None and token_session_version != user.session_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="세션이 만료되었습니다",
        )

    new_access_token = create_access_token(data={"sub": user.email, "session_version": user.session_version})

    return {"access_token": new_access_token}


@router.get("/social/{provider}/login")
async def social_login(
    provider: str,
    request: Request,
    redirect_uri: str | None = Query(default=None),
):
    if not is_supported_provider(provider):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="지원하지 않는 소셜 로그인 제공자입니다",
        )

    if not is_provider_configured(provider):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{provider} 소셜 로그인이 아직 설정되지 않았습니다",
        )

    try:
        app_redirect_uri = resolve_app_redirect_uri(redirect_uri)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    request.session["social_login_redirect_uri"] = app_redirect_uri
    client = oauth.create_client(provider)
    callback_url = build_callback_url(request, provider)

    print(f"🔗 OAuth 콜백 URL: {callback_url}")

    return await client.authorize_redirect(request, callback_url)


@router.get("/social/{provider}/callback", name="social_login_callback")
async def social_login_callback(
    provider: str,
    request: Request,
    db: Session = Depends(get_db),
):
    if not is_supported_provider(provider):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="지원하지 않는 소셜 로그인 제공자입니다",
        )

    try:
        app_redirect_uri = resolve_app_redirect_uri(
            request.session.pop("social_login_redirect_uri", None)
        )
    except ValueError:
        app_redirect_uri = resolve_app_redirect_uri(None)

    try:
        client = oauth.create_client(provider)
        token = await client.authorize_access_token(request)
        profile = await fetch_social_profile(provider, client, token)
        # DB 연결이 끊긴 경우(2013/2006) 새 세션으로 1회 재시도
        try:
            user, is_new_user = get_or_create_social_user(profile, db)
        except Exception as db_exc:
            from sqlalchemy.exc import OperationalError as SAOperationalError
            if isinstance(db_exc, SAOperationalError):
                print(f"DB 연결 오류 — 새 세션으로 재시도: {db_exc}")
                sleep(0.5)
                from app.database import SessionLocal
                retry_db = SessionLocal()
                try:
                    user, is_new_user = get_or_create_social_user(profile, retry_db)
                finally:
                    retry_db.close()
            else:
                raise
        tokens = create_token_pair(user)
    except OAuthError as exc:
        return redirect_with_error(
            app_redirect_uri,
            exc.description or exc.error or "소셜 로그인 인증에 실패했습니다",
        )
    except Exception as exc:
        print(f"소셜 로그인 에러({provider}): {str(exc)}")
        print(traceback.format_exc())
        return redirect_with_error(app_redirect_uri, "소셜 로그인에 실패했습니다")

    return RedirectResponse(
        append_query_params(
            app_redirect_uri,
            {
                "access_token": tokens["access_token"],
                "refresh_token": tokens["refresh_token"],
                "token_type": tokens["token_type"],
                "provider": provider,
                "is_new_user": "true" if is_new_user else "false",
            },
        ),
        status_code=status.HTTP_302_FOUND,
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.from_orm_with_computed(current_user)


@router.post("/agree-terms", response_model=UserResponse)
def agree_terms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """소셜 로그인 약관 동의 완료 시점에 호출 — terms_agreed_at 기록."""
    if current_user.terms_agreed_at is not None:
        return UserResponse.from_orm_with_computed(current_user)

    user = db.merge(current_user)
    user.terms_agreed_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return UserResponse.from_orm_with_computed(user)


@router.patch("/me/onboarding-profile", response_model=UserResponse)
def complete_onboarding_profile(
    payload: UserOnboardingProfileUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.concern_extractor import chips_to_tags, extract_and_save_concern_tags

    user = db.merge(current_user)
    user.skin_type = payload.skin_type
    user.birth_year = payload.birth_year
    user.gender = payload.gender
    user.avg_cycle_length = payload.avg_cycle_length
    user.cycle_regularity = payload.cycle_regularity if payload.gender == "여" else None
    user.is_onboarded = True

    # 칩 선택지를 즉시 skin_concerns 태그로 변환하여 저장 (LLM 추출보다 먼저 확보)
    if payload.skin_condition_chips:
        chip_tags = chips_to_tags(payload.skin_condition_chips)
        if chip_tags:
            user.skin_concerns = chip_tags

    if payload.raw_concern_text:
        user.raw_concern_text = payload.raw_concern_text
        # LLM 추출 결과는 기존 칩 태그와 merge하여 저장됨 (concern_extractor 참고)
        background_tasks.add_task(
            extract_and_save_concern_tags,
            user.id,
            payload.raw_concern_text,
        )

    db.commit()
    db.refresh(user)
    return UserResponse.from_orm_with_computed(user)


@router.patch("/me/push-token", response_model=UserResponse)
def update_push_token(
    payload: PushTokenUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.merge(current_user)
    user.push_token = payload.push_token
    db.commit()
    db.refresh(user)
    return UserResponse.from_orm_with_computed(user)


@router.patch("/me/password")
def change_password(
    payload: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.social_accounts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="소셜 로그인 계정은 비밀번호를 변경할 수 없습니다.",
        )
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="현재 비밀번호가 올바르지 않습니다.",
        )
    current_user.hashed_password = get_password_hash(payload.new_password)
    current_user.session_version += 1
    db.commit()
    return {"message": "비밀번호가 변경되었습니다."}


@router.post("/password-reset/request")
def request_password_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or user.deleted_at:
        # 보안상 유저 존재 여부를 노출하지 않기 위해 항상 성공 메시지 반환
        return {"message": "비밀번호 재설정 이메일이 발송되었습니다."}
        
    # 기존 토큰 무효화
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id, PasswordResetToken.is_used == False).update({"is_used": True})
    
    # 새 토큰 생성 (1시간 만료)
    import secrets
    from datetime import timedelta
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=1)
    
    reset_token = PasswordResetToken(
        user_id=user.id,
        token=token,
        expires_at=expires_at
    )
    db.add(reset_token)
    db.commit()
    
    _is_dev = os.getenv("APP_ENV", "production").lower() in ("dev", "development", "local")
    if _is_dev:
        print(f"🔑 [Password Reset] URL: http://localhost:5173/reset-password?token={token}")

    response: dict = {"message": "비밀번호 재설정 이메일이 발송되었습니다."}
    if _is_dev:
        response["dev_token"] = token
    return response


@router.post("/password-reset/confirm")
def confirm_password_reset(payload: PasswordResetConfirm, db: Session = Depends(get_db)):
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == payload.token,
        PasswordResetToken.is_used == False,
        PasswordResetToken.expires_at > datetime.utcnow()
    ).first()
    
    if not reset_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="유효하지 않거나 만료된 토큰입니다.")
        
    user = db.query(User).filter(User.id == reset_token.user_id).first()
    if not user or user.deleted_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="유효하지 않은 사용자입니다.")
        
    # 비밀번호 업데이트 및 세션 무효화
    user.hashed_password = get_password_hash(payload.new_password)
    user.session_version += 1
    reset_token.is_used = True
    
    db.commit()
    return {"message": "비밀번호가 성공적으로 변경되었습니다."}


@router.delete("/me")
async def delete_account(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.database import get_mongo_db

    # 1. 삭제 전 Blob URL 수집 (DB 삭제 후엔 접근 불가)
    skin_logs = db.query(SkinLog).filter(SkinLog.user_id == current_user.id).all()
    blob_urls: list = []
    for log in skin_logs:
        blob_urls.extend([log.photo_url, log.masked_photo_url, log.left_photo_url, log.right_photo_url])

    diet_logs = db.query(DietLog).filter(DietLog.user_id == current_user.id).all()
    for log in diet_logs:
        blob_urls.append(log.photo_url)

    # 2. 하드 삭제 — DB CASCADE로 모든 관련 데이터 자동 제거
    user_id = current_user.id
    user = db.merge(current_user)
    db.delete(user)
    db.commit()

    # 3. MongoDB 연관 데이터 하드 삭제 (실제 사용 컬렉션 위주)
    try:
        mongo_db = get_mongo_db()
        await mongo_db.analysis_contexts.delete_many({"user_id": user_id})
        await mongo_db.skin_ai_results.delete_many({"user_id": user_id})
        await mongo_db.diet_ai_results.delete_many({"user_id": user_id})
        await mongo_db.medgemma_analysis_tasks.delete_many({"user_id": user_id})
        print(f"✅ MongoDB cleanup completed for user_id={user_id}")
    except Exception as e:
        print(f"❌ MongoDB cleanup failed for user_id={user_id}")

    # 4. Blob 파일 삭제 (DB 커밋 후 처리 — 실패해도 계정 삭제에는 영향 없음)
    try:
        delete_blobs([u for u in blob_urls if u])
    except Exception as e:
        print(f"❌ Blob cleanup failed for user_id={user_id}")

    return {"message": "계정이 성공적으로 탈퇴 처리되었습니다."}

