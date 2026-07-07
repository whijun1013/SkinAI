import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.services import food_vision_service
from app.models.user import User

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

@pytest.mark.anyio
async def test_recognize_food_disabled(db_session):
    with patch("app.services.food_vision_service._clean_env", return_value="false"):
        result = await food_vision_service.recognize_food(db_session, 1, b"dummy")
        assert result["food_name"] == ""
        assert result["confidence"] == "low"

@pytest.mark.anyio
async def test_recognize_food_success(db_session, monkeypatch):
    monkeypatch.setenv("ENABLE_FOOD_VISION", "true")

    with patch("app.services.food_vision_service._OAI_KEY", "dummy"), \
         patch("app.services.ai_usage_service.check_user_daily_limit", return_value=True), \
         patch("app.services.ai_usage_service.check_monthly_budget", return_value=True), \
         patch("app.services.ai_usage_service.record_ai_usage") as mock_record:

        mock_client = MagicMock()
        mock_res = MagicMock()
        mock_res.choices[0].message.content = '{"food_name": "Pizza", "candidates": ["Burger"], "confidence": "high", "needs_confirmation": false}'
        mock_res.usage.prompt_tokens = 100
        mock_res.usage.completion_tokens = 50

        async def mock_create(*args, **kwargs):
            return mock_res

        mock_client.chat.completions.create = mock_create

        with patch("app.services.food_vision_service._oai_client", return_value=mock_client):
            result = await food_vision_service.recognize_food(db_session, 1, b"dummy")
            assert result["food_name"] == "Pizza"
            assert result["candidates"] == ["Burger"]
            assert result["confidence"] == "high"
            assert result["needs_confirmation"] is False

            mock_record.assert_called_once()
