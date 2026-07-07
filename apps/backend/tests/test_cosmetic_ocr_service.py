import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.services import cosmetic_ocr_service
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
async def test_extract_ingredients_disabled(db_session):
    with patch("app.services.cosmetic_ocr_service._clean_env", return_value="false"):
        result = await cosmetic_ocr_service.extract_ingredients(db_session, 1, b"dummy")
        assert result["ingredients"] == []
        assert result["error"] == "ocr_disabled"

@pytest.mark.anyio
async def test_extract_ingredients_success(db_session, monkeypatch):
    monkeypatch.setenv("ENABLE_COSMETIC_OCR", "true")

    with patch("app.services.cosmetic_ocr_service._oai_client") as mock_client_factory, \
         patch("app.services.ai_usage_service.check_user_daily_limit", return_value=True), \
         patch("app.services.ai_usage_service.check_monthly_budget", return_value=True), \
         patch("app.services.ai_usage_service.record_ai_usage") as mock_record:

        mock_client = MagicMock()
        mock_res = MagicMock()
        mock_res.choices[0].message.content = '{"ingredients": ["정제수", "글리세린"], "confidence": "high"}'
        mock_res.usage.prompt_tokens = 100
        mock_res.usage.completion_tokens = 50

        async def mock_create(*args, **kwargs):
            return mock_res

        mock_client.chat.completions.create = mock_create
        mock_client_factory.return_value = mock_client

        result = await cosmetic_ocr_service.extract_ingredients(db_session, 1, b"dummy")
        assert result["ingredients"] == ["정제수", "글리세린"]
        assert result["confidence"] == "high"
        assert result["error"] is None

        mock_record.assert_called_once()
