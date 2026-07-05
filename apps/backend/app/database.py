from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import os

load_dotenv(override=True)

# ── MySQL ────────────────────────────────────────────────────────────────────

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "luvel")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Render/Neon often provides postgres:// which SQLAlchemy 1.4+ no longer accepts; it must be postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Neon Serverless / PostgreSQL optimized pool settings
engine_kwargs = {}
if not DATABASE_URL.startswith("sqlite"):
    engine_kwargs.update(
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True
    )
    if DATABASE_URL.startswith("postgresql"):
        engine_kwargs["connect_args"] = {"sslmode": "require"}
else:
    engine_kwargs.update(
        connect_args={"check_same_thread": False}
    )

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── MongoDB ──────────────────────────────────────────────────────────────────

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "luvel")

_mongo_client: AsyncIOMotorClient | None = None


def get_mongo_client() -> AsyncIOMotorClient:
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(MONGO_URL)
    return _mongo_client


def get_mongo_db():
    return get_mongo_client()[MONGO_DB_NAME]


async def connect_mongo():
    """서버 startup 시 호출 — 연결 확인"""
    client = get_mongo_client()
    await client.admin.command("ping")


async def disconnect_mongo():
    """서버 shutdown 시 호출"""
    global _mongo_client
    if _mongo_client is not None:
        _mongo_client.close()
        _mongo_client = None
