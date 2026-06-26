import json
import os
import sys
import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import BigInteger, create_engine
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.analysis import AnalysisRequest, AnalysisResult
from app.models.cosmetic import UserCosmetic  # noqa: F401
from app.models.medication import UserMedication  # noqa: F401
from app.models.skin_log import SkinLog  # noqa: F401
from app.models.user import User
from app.services.analysis_exceptions import (
    SkinTendencyLLMError,
    SkinTendencyLLMResponseError,
)
from app.services.skin_tendency_llm_service import get_skin_tendency


@compiles(TINYINT, "sqlite")
def compile_tinyint_sqlite(type_, compiler, **kw):
    return "INTEGER"


@compiles(BigInteger, "sqlite")
def compile_bigint_sqlite(type_, compiler, **kw):
    return "INTEGER"


engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


AZURE_ENV = {
    "AZURE_OPENAI_KEY": "test-key",
    "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com",
    "AZURE_OPENAI_ANALYSIS_DEPLOYMENT_NAME": "test-deployment",
    "AZURE_OPENAI_API_VERSION": "2024-10-21",
}


def _response(payload):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=payload))]
    )


class TestSkinTendencyLLMService(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self.db = TestingSessionLocal()
        self.user_id = 1
        self.db.add(
            User(
                id=self.user_id,
                email="skin-tendency@example.com",
                name="Skin Tendency",
                hashed_password="hashed",
                terms_agreed_at=datetime(2026, 1, 1),
            )
        )
        self.db.add(
            User(
                id=2,
                email="other-skin-tendency@example.com",
                name="Other User",
                hashed_password="hashed",
                terms_agreed_at=datetime(2026, 1, 1),
            )
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

    def test_returns_skin_tendency_and_builds_recent_context(self):
        self._add_analysis_rows(self.user_id, count=6)
        self._add_analysis_rows(2, count=1, cause_prefix="other-user")
        payload = {
            "skin_tendency": "  레티놀 계열 성분에 민감하게 반응하며 수면 부족 시 악화 패턴이 반복됩니다.  "
        }
        client, result = self._get_skin_tendency(
            _response(json.dumps(payload, ensure_ascii=False)),
            factor_sensitivities=[
                {
                    "factor_type": "ingredient",
                    "factor_key": "retinol",
                    "sensitivity_score": 0.52,
                    "trigger_count": 3,
                }
            ],
        )

        self.assertEqual(
            result,
            "레티놀 계열 성분에 민감하게 반응하며 수면 부족 시 악화 패턴이 반복됩니다.",
        )
        client.chat.completions.create.assert_called_once()
        kwargs = client.chat.completions.create.call_args.kwargs
        self.assertEqual(kwargs["model"], "test-deployment")
        self.assertEqual(kwargs["response_format"], {"type": "json_object"})
        self.assertIn("skin_tendency", kwargs["messages"][0]["content"])
        user_content = kwargs["messages"][1]["content"]
        self.assertIn('"factor_key": "retinol"', user_content)
        self.assertIn('"primary_cause": "cause-5"', user_content)
        self.assertIn('"primary_cause": "cause-1"', user_content)
        self.assertNotIn('"primary_cause": "cause-0"', user_content)
        self.assertNotIn("other-user", user_content)

    def test_empty_factor_sensitivities_is_passed_to_gpt(self):
        client, result = self._get_skin_tendency(
            _response(json.dumps({"skin_tendency": "누적 요인이 적어 경향을 보수적으로 관찰합니다."}, ensure_ascii=False)),
            factor_sensitivities=[],
        )

        self.assertEqual(result, "누적 요인이 적어 경향을 보수적으로 관찰합니다.")
        user_content = client.chat.completions.create.call_args.kwargs["messages"][1]["content"]
        self.assertIn('"factor_sensitivities": []', user_content)

    def test_missing_environment_variable_is_rejected(self):
        env = {**AZURE_ENV, "AZURE_OPENAI_KEY": ""}
        with patch.dict(os.environ, env, clear=False):
            with self.assertRaises(SkinTendencyLLMError):
                get_skin_tendency(self.db, self.user_id, [])

    def test_azure_failure_is_wrapped(self):
        client = MagicMock()
        client.chat.completions.create.side_effect = RuntimeError("secret response")
        with patch.dict(os.environ, AZURE_ENV, clear=False):
            with patch(
                "app.services.skin_tendency_llm_service._create_client",
                return_value=client,
            ):
                with self.assertRaisesRegex(
                    SkinTendencyLLMError, "Azure OpenAI request failed"
                ):
                    get_skin_tendency(self.db, self.user_id, [])

    def test_invalid_json_is_rejected(self):
        with self.assertRaises(SkinTendencyLLMResponseError):
            self._get_skin_tendency(_response("not-json"), factor_sensitivities=[])

    def test_invalid_skin_tendency_field_is_rejected(self):
        for payload in (
            {},
            {"skin_tendency": None},
            {"skin_tendency": "   "},
        ):
            with self.subTest(payload=payload):
                with self.assertRaises(SkinTendencyLLMResponseError):
                    self._get_skin_tendency(
                        _response(json.dumps(payload)),
                        factor_sensitivities=[],
                    )

    def _get_skin_tendency(self, response, factor_sensitivities):
        client = MagicMock()
        client.chat.completions.create.return_value = response
        with patch.dict(os.environ, AZURE_ENV, clear=False):
            with patch(
                "app.services.skin_tendency_llm_service._create_client",
                return_value=client,
            ):
                result = get_skin_tendency(
                    self.db,
                    user_id=self.user_id,
                    factor_sensitivities=factor_sensitivities,
                )
        return client, result

    def _add_analysis_rows(self, user_id, count, cause_prefix="cause"):
        base_time = datetime(2026, 6, 1, 12, 0, 0)
        for index in range(count):
            request_id = user_id * 100 + index + 1
            created_at = base_time + timedelta(days=index)
            self.db.add(
                AnalysisRequest(
                    id=request_id,
                    user_id=user_id,
                    skin_log_id=request_id,
                    lookback_days=14,
                    status="done",
                    created_at=created_at,
                )
            )
            self.db.add(
                AnalysisResult(
                    id=request_id,
                    request_id=request_id,
                    primary_cause=f"{cause_prefix}-{index}",
                    contributing_factors=[f"factor-{index}"],
                    report_text=f"report-{index}",
                    confidence_score=0.8,
                    created_at=created_at,
                )
            )
        self.db.commit()


if __name__ == "__main__":
    unittest.main()
