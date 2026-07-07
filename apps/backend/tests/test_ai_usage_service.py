import pytest
from datetime import datetime, date, timedelta
from sqlalchemy import create_engine, BigInteger
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models.user import User
from app.models.ai_usage import AIUsageLog
from app.models.cosmetic import UserCosmetic
from app.models.diet import DietLogItem
from app.models.medication import UserMedication
from app.models.skin_log import SkinLog
from app.models.behavior import DailyBehaviorLog
from app.models.analysis import AnalysisRequest
from app.models.environment import EnvironmentLog
from app.services.ai_usage_service import record_ai_usage, check_user_daily_limit, check_monthly_budget

@compiles(TINYINT, "sqlite")
def compile_tinyint_sqlite(type_, compiler, **kw):
    return "INTEGER"

@compiles(BigInteger, "sqlite")
def compile_bigint_sqlite(type_, compiler, **kw):
    return "INTEGER"

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

def test_record_ai_usage_sanitizes_error(db_session):
    # Dummy user
    db_session.add(User(id=1, email="test@test.com", name="test", hashed_password="hash"))
    db_session.commit()

    log = record_ai_usage(
        db_session,
        user_id=1,
        feature="food_vision",
        provider="openai",
        input_units=10,
        output_units=20,
        estimated_cost_usd=0.01,
        latency_ms=500,
        status="failed",
        error_code="Error: " + "sk-" + "abc123secret"
    )
    assert log.error_code == "<redacted-key>"

def test_check_user_daily_limit(db_session):
    db_session.add(User(id=1, email="test@test.com", name="test", hashed_password="hash"))
    db_session.commit()

    # Limit = 2
    assert check_user_daily_limit(db_session, 1, "food_vision", 2) == True

    # Record 1 success
    record_ai_usage(db_session, 1, "food_vision", "openai", 10, 20, 0.01, 500, "success")
    assert check_user_daily_limit(db_session, 1, "food_vision", 2) == True

    # Record 1 fallback (also counts)
    record_ai_usage(db_session, 1, "food_vision", "openai", 10, 20, 0.01, 500, "fallback")
    assert check_user_daily_limit(db_session, 1, "food_vision", 2) == False

    # Record 1 failed (does not count, so limit is still exceeded because of previous 2, wait, limit=2, 2 usages = limit reached)
    # Actually count < limit: 2 < 2 is False. So after 2 usages, it returns False.

    # Let's check with limit = 3
    assert check_user_daily_limit(db_session, 1, "food_vision", 3) == True

def test_check_monthly_budget(db_session):
    # Budget = 0.05
    assert check_monthly_budget(db_session, "food_vision", 0.05) == True

    db_session.add(User(id=1, email="test@test.com", name="test", hashed_password="hash"))
    db_session.commit()

    record_ai_usage(db_session, 1, "food_vision", "openai", 10, 20, 0.02, 500, "success")
    assert check_monthly_budget(db_session, "food_vision", 0.05) == True

    record_ai_usage(db_session, 1, "food_vision", "openai", 10, 20, 0.04, 500, "success")
    # Total = 0.06
    assert check_monthly_budget(db_session, "food_vision", 0.05) == False

def test_check_zero_or_negative_limits(db_session):
    # if limit <= 0, it means it should always return True (disabled check)
    assert check_user_daily_limit(db_session, 1, "food_vision", 0) == True
    assert check_monthly_budget(db_session, "food_vision", 0.0) == True
