import sys
import time

from dotenv import load_dotenv

# Windows에서 이모지/한글 print가 UnicodeEncodeError를 내지 않도록 강제 UTF-8
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

load_dotenv()

import logging

# uvicorn 기본 설정만으로는 food_vision·diet_log 등 앱 로거 INFO가 안 보임
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s [%(name)s] %(message)s",
    force=True,
)
for _logger_name in ("food_vision", "diet_log", "diet_service", "upload"):
    logging.getLogger(_logger_name).setLevel(logging.INFO)

from authlib.integrations.base_client import FrameworkIntegration
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.auth.oauth import OAUTH_SESSION_SECRET
from app.database import connect_mongo, disconnect_mongo
from app.models.chatbot import ChatSession, ChatMessage # noqa: F401

from app.routers import analysis

from app.models.analysis import (  # noqa: F401
    AgentResult,
    AnalysisRequest,
    AnalysisResult,
    UserBaseline,
    UserChangepoint,
    UserFactorSensitivity,
)
from app.models.behavior import DailyBehaviorLog  # noqa: F401
from app.models.cosmetic import Cosmetic  # noqa: F401
from app.models.diet import DietLog, DietLogItem, FoodItem  # noqa: F401
from app.models.environment import EnvironmentLog  # noqa: F401
from app.models.location import UserLocation  # noqa: F401
from app.models.medication import Medication  # noqa: F401
from app.models.period import PeriodLog  # noqa: F401
from app.models.skin_log import SkinLog  # noqa: F401
from app.models.user import SocialAccount, User  # noqa: F401
from app.routers import (
    auth,
    cosmetics,
    environment_logs,
    medications,
    my_behavior,
    my_cosmetics,
    my_diet,
    my_records,
    my_medications,
    my_skin_log,
    notifications,
    skin_log,
    upload,
    food_items,
    period_logs,
    report,
    user_locations,
    admin,
    admin_metadata,
    chatbot
)


def _safe_clear_session_state(self, session):
    """authlib 버그 패치: string 형식 state 값도 안전하게 처리"""
    now = time.time()
    prefix = f"_state_{self.name}"
    for key in list(session.keys()):
        if key.startswith(prefix):
            value = session[key]
            if not isinstance(value, dict):
                session.pop(key)
                continue
            exp = value.get("exp")
            if not exp or exp < now:
                session.pop(key)


FrameworkIntegration._clear_session_state = _safe_clear_session_state


app = FastAPI(title="SkinAI API", version="1.0.0")
_scheduler = BackgroundScheduler(timezone="Asia/Seoul")

# HEIC 이미지 지원 여부 확인
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    print("✅ HEIC 이미지 지원 활성화 (pillow-heif)")
except ImportError:
    print("⚠️  pillow-heif 미설치 → HEIC 이미지 업로드 불가. pip install pillow-heif 실행 필요")


class NgrokSkipWarningMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["ngrok-skip-browser-warning"] = "true"
        return response


class RequestLogMiddleware(BaseHTTPMiddleware):
    """uvicorn access log가 안 보일 때도 요청 추적용 (print → stdout 보장)."""

    async def dispatch(self, request: Request, call_next):
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} or "medgemma" in request.url.path:
            print(f"[api] {request.method} {request.url.path}", flush=True)
        response = await call_next(request)
        if "medgemma" in request.url.path or request.url.path.endswith("/analyze-photo"):
            print(f"[api] {request.method} {request.url.path} -> {response.status_code}", flush=True)
        return response


# Development 환경에서만 Ngrok 경고 우회 미들웨어 추가
_is_dev = os.getenv("APP_ENV", "production").lower() in ("dev", "development", "local")
if _is_dev:
    app.add_middleware(NgrokSkipWarningMiddleware)

app.add_middleware(RequestLogMiddleware)

app.add_middleware(
    SessionMiddleware,
    secret_key=OAUTH_SESSION_SECRET,
    same_site="lax",
    https_only=False,
)

import os

cors_origins_str = os.getenv("CORS_ORIGINS", "")
if cors_origins_str:
    allow_origins = [origin.strip() for origin in cors_origins_str.split(",")]
else:
    if _is_dev:
        allow_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
    else:
        allow_origins = ["https://skinai.nuvo.com", "https://admin.skinai.nuvo.com"] # 배포 환경 도메인

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




@app.on_event("startup")
async def startup_event():
    # MongoDB 연결
    import logging
    from app.database import MONGO_DB_NAME

    log = logging.getLogger("startup")
    food_vision_cv = os.getenv("FOOD_VISION_USE_CV", "false").lower() == "true"
    log.info("[startup] FOOD_VISION_USE_CV=%s (OCR %s)", food_vision_cv, "on" if food_vision_cv else "off")
    if food_vision_cv:
        from app.services.food_vision_service import _resolve_cv_credentials

        cv_endpoint, cv_key = _resolve_cv_credentials()
        if not cv_endpoint or not cv_key:
            log.warning("[startup] OCR on 이지만 CV 엔드포인트/키 없음 — GPT만 사용됩니다")
        elif "custom-prediction" in (os.getenv("AZURE_CV_ENDPOINT") or ""):
            log.info(
                "[startup] AZURE_CV_ENDPOINT가 Custom Vision URL — "
                "Computer Vision은 %s 로 fallback",
                cv_endpoint,
            )
        else:
            log.info("[startup] Computer Vision OCR endpoint=%s", cv_endpoint)
    try:
        await connect_mongo()
        msg = f"[startup] MongoDB 연결 완료 (db={MONGO_DB_NAME})"
        print(msg)
        log.info(msg)
    except Exception as e:
        msg = f"[startup] MongoDB 연결 실패 (계속 진행): {e}"
        print(msg)
        log.warning(msg)

    # 마이그레이션·시드 자동 실행 로직 호출 부분 제거 (안전성 확보)
    if _is_dev:
        # 개발 환경에서만 명시적 초기화 로그
        log.info("[startup] Development 환경: 마이그레이션은 수동으로 진행하세요.")

    # 변화점 감지 스케줄러 — 매일 오전 10시 (Asia/Seoul)
    from app.services.changepoint_service import run_daily_changepoint_detection
    _scheduler.add_job(
        run_daily_changepoint_detection,
        CronTrigger(hour=10, minute=0),
        id="daily_changepoint",
        replace_existing=True,
    )
    _scheduler.start()
    log.info("[startup] 변화점 감지 스케줄러 시작 (매일 10:00 KST)")


@app.on_event("shutdown")
async def shutdown_event():
    _scheduler.shutdown(wait=False)
    await disconnect_mongo()


app.include_router(auth.router)
app.include_router(cosmetics.router)
app.include_router(medications.router)
app.include_router(analysis.router)
app.include_router(my_medications.router)
app.include_router(my_cosmetics.router)
app.include_router(my_behavior.router)
app.include_router(my_records.router)
app.include_router(my_skin_log.router)
app.include_router(environment_logs.router)
app.include_router(my_diet.router)
app.include_router(upload.router)
app.include_router(food_items.router)
app.include_router(period_logs.router)
app.include_router(period_logs.cycle_router)
app.include_router(user_locations.router)
app.include_router(report.router)
app.include_router(skin_log.router)
app.include_router(notifications.router)
app.include_router(admin.router)
app.include_router(admin_metadata.router)
app.include_router(chatbot.router)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "SkinAI API 정상 작동 중"}
