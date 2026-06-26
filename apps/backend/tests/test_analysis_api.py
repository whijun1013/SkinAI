import os
import sys
import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.deps.auth import get_current_user
from app.models.analysis import (
    AgentResult,
    AnalysisRequest,
    AnalysisResult,
    UserBaseline,
    UserFactorSensitivity,
)
from app.models.skin_log import SkinLog
from app.services.analysis_exceptions import AnalysisContextError, AnalysisLLMError, SkinTendencyLLMError
from app.services.analysis_orchestrator import run_analysis


@compiles(BigInteger, "sqlite")
def compile_bigint_sqlite(type_, compiler, **kw):
    return "INTEGER"


@compiles(TINYINT, "sqlite")
def compile_tinyint_sqlite(type_, compiler, **kw):
    return "INTEGER"


SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


from main import app
from app.routers import analysis as analysis_router

mock_user = type("MockUser", (), {"id": 1, "email": "test@example.com", "name": "Test User"})()


def override_get_current_user():
    return mock_user



MOCK_CONTEXT = {
    "meta": {},
    "daily_timeline": [],
    "context": {},
    "summary": {},
}
MOCK_LLM_RESULT = {
    "primary_cause": "테스트 원인",
    "contributing_factors": [],
    "report_text": "테스트 리포트",
    "confidence_score": 0.68,
}
MOCK_AGENT_RESULTS = [
    {
        "agent_type": "cosmetic",
        "suspicious_items": [
            {
                "factor_type": "ingredient",
                "factor_key": "retinol",
                "label": "레티놀",
                "confidence": 0.82,
            }
        ],
        "reason": "레티놀 자극 가능성",
        "confidence": 0.82,
    },
    {
        "agent_type": "diet",
        "suspicious_items": [
            {
                "factor_type": "food",
                "factor_key": "dairy",
                "label": "유제품",
                "confidence": 0.55,
            }
        ],
        "reason": "유제품 섭취 빈도 높음",
        "confidence": 0.55,
    },
    {
        "agent_type": "environment",
        "suspicious_items": [],
        "reason": "이상 없음",
        "confidence": None,
    },
    {
        "agent_type": "behavior",
        "suspicious_items": [
            {
                "factor_type": "behavior",
                "factor_key": "sleep_shortage",
                "label": "수면 부족",
                "confidence": 0.65,
            }
        ],
        "reason": "14일 중 9일 수면 6시간 미만",
        "confidence": 0.65,
    },
    {
        "agent_type": "medication",
        "suspicious_items": [],
        "reason": "피부 관련 약물 없음",
        "confidence": None,
    },
]
MOCK_LLM_RESULT_WITH_AGENTS = {
    "agent_results": MOCK_AGENT_RESULTS,
    "primary_cause": "레티놀 자극과 수면 부족 복합",
    "contributing_factors": ["retinol", "sleep_shortage"],
    "report_text": "테스트 리포트",
    "confidence_score": 0.80,
}
DISCLAIMER = "이 결과는 의학적 진단이 아닌 참고용 관찰 정보입니다."


class TestAnalysisAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        self._previous_current_user_override = app.dependency_overrides.get(get_current_user)
        self._previous_get_db_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_current_user] = override_get_current_user
        app.dependency_overrides[get_db] = override_get_db
        self.db = TestingSessionLocal()
        self.client = TestClient(app)
        self._background_patch = patch("app.routers.analysis.process_analysis_request_by_id")
        self.mock_background_process = self._background_patch.start()

    def tearDown(self):
        self._background_patch.stop()
        self.db.query(AgentResult).delete()
        self.db.query(AnalysisResult).delete()
        self.db.query(AnalysisRequest).delete()
        self.db.query(UserFactorSensitivity).delete()
        self.db.query(UserBaseline).delete()
        self.db.query(SkinLog).delete()
        self.db.commit()
        self.db.close()
        self._restore_override(get_current_user, self._previous_current_user_override)
        self._restore_override(get_db, self._previous_get_db_override)

    def test_app_router_import_and_swagger_schema(self):
        self.assertIsNotNone(app)
        self.assertIsNotNone(analysis_router.router)
        schema = self.client.get("/openapi.json")
        self.assertEqual(schema.status_code, 200)
        self.assertIn("/users/me/analysis", schema.json()["paths"])

    def test_successful_post_creates_pending_request_and_schedules_background_task(self):
        skin_log = self._create_skin_logs()

        response = self.client.post(
            "/users/me/analysis",
            json={"skin_log_id": skin_log.id},
        )

        self.assertEqual(response.status_code, 202)
        data = response.json()
        self.assertEqual(data["status"], "pending")
        self.assertIsNotNone(data["requested_at"])
        self.assertIsNone(data["result"])

        saved_request = self.db.query(AnalysisRequest).filter(AnalysisRequest.id == data["request_id"]).one()
        self.assertEqual(saved_request.status, "pending")
        self.mock_background_process.assert_called_once_with(saved_request.id)

    def test_post_normalizes_concern_note_before_storage(self):
        skin_log = self._create_skin_logs()

        response = self.client.post(
            "/users/me/analysis",
            json={"skin_log_id": skin_log.id, "concern_note": "  요즘 잠이 부족해요  "},
        )

        self.assertEqual(response.status_code, 202)
        saved_request = self.db.query(AnalysisRequest).filter(
            AnalysisRequest.id == response.json()["request_id"]
        ).one()
        self.assertEqual(saved_request.concern_note, "요즘 잠이 부족해요")

    def test_post_normalizes_blank_concern_note_to_none(self):
        skin_log = self._create_skin_logs()

        response = self.client.post(
            "/users/me/analysis",
            json={"skin_log_id": skin_log.id, "concern_note": "   \n  "},
        )

        self.assertEqual(response.status_code, 202)
        saved_request = self.db.query(AnalysisRequest).filter(
            AnalysisRequest.id == response.json()["request_id"]
        ).one()
        self.assertIsNone(saved_request.concern_note)

    def test_post_accepts_concern_note_at_100_characters(self):
        skin_log = self._create_skin_logs()
        response = self.client.post(
            "/users/me/analysis",
            json={"skin_log_id": skin_log.id, "concern_note": "가" * 100},
        )

        self.assertEqual(response.status_code, 202)

    def test_post_rejects_concern_note_over_100_characters(self):
        response = self.client.post(
            "/users/me/analysis",
            json={"skin_log_id": 1, "concern_note": "가" * 101},
        )

        self.assertEqual(response.status_code, 422)

    def test_post_rejects_non_string_concern_note(self):
        response = self.client.post(
            "/users/me/analysis",
            json={"skin_log_id": 1, "concern_note": 123},
        )

        self.assertEqual(response.status_code, 422)

    @patch("app.services.analysis_orchestrator.analyze_with_llm")
    @patch("app.services.analysis_orchestrator.build_analysis_context")
    def test_run_analysis_saves_result_and_returns_done(self, mock_builder, mock_llm):
        skin_log = self._create_skin_logs()
        mock_builder.return_value = MOCK_CONTEXT
        mock_llm.return_value = {
            **MOCK_LLM_RESULT,
            "contributing_factors": [{"factor": "food"}],
        }

        request = run_analysis(
            self.db,
            user_id=1,
            skin_log_id=skin_log.id,
            lookback_days=14,
        )

        self.assertEqual(request.status, "done")
        self.assertEqual(request.analysis_result.primary_cause, "테스트 원인")
        self.assertEqual(request.analysis_result.contributing_factors, [{"factor": "food"}])
        self.assertTrue(request.analysis_result.report_text.endswith(DISCLAIMER))

        args = mock_builder.call_args.args
        self.assertEqual(args[1:3], (1, skin_log.id))
        self.assertEqual(mock_builder.call_args.kwargs["lookback_days"], 14)
        mock_llm.assert_called_once_with(MOCK_CONTEXT)

    @patch("app.services.analysis_orchestrator.analyze_with_llm")
    @patch("app.services.analysis_orchestrator.build_analysis_context")
    def test_run_analysis_passes_concern_note_to_llm_context(self, mock_builder, mock_llm):
        skin_log = self._create_skin_logs()
        context = {**MOCK_CONTEXT}
        mock_builder.return_value = context
        mock_llm.return_value = MOCK_LLM_RESULT

        run_analysis(
            self.db,
            user_id=1,
            skin_log_id=skin_log.id,
            lookback_days=14,
            concern_note="  술을 마신 뒤 심해진 것 같아요  ",
        )

        llm_context = mock_llm.call_args.args[0]
        self.assertEqual(llm_context["concern_note"], "술을 마신 뒤 심해진 것 같아요")
        self.assertEqual(llm_context["concern_verdicts"], [])

    @patch("app.services.analysis_orchestrator.analyze_with_llm")
    @patch("app.services.analysis_orchestrator.build_analysis_context")
    def test_successful_post_saves_agent_results_and_updates_profile(self, mock_builder, mock_llm):
        skin_log = self._create_skin_logs()
        mock_builder.return_value = MOCK_CONTEXT
        mock_llm.return_value = MOCK_LLM_RESULT_WITH_AGENTS

        request = run_analysis(
            self.db,
            user_id=1,
            skin_log_id=skin_log.id,
            lookback_days=14,
        )

        self.assertEqual(request.status, "done")
        self.assertIsNotNone(request.analysis_result)
        self.assertEqual(request.analysis_result.primary_cause, "레티놀 자극과 수면 부족 복합")
        self.assertEqual(request.analysis_result.contributing_factors, ["retinol", "sleep_shortage"])
        self.assertTrue(request.analysis_result.report_text.startswith("테스트 리포트"))
        self.assertEqual(float(request.analysis_result.confidence_score), 0.8)

        agent_rows = self.db.query(AgentResult).filter(AgentResult.request_id == request.id).all()
        self.assertEqual(len(agent_rows), 5)
        rows_by_type = {row.agent_type: row for row in agent_rows}
        self.assertEqual(rows_by_type["cosmetic"].suspicious_items, MOCK_AGENT_RESULTS[0]["suspicious_items"])
        self.assertEqual(rows_by_type["environment"].suspicious_items, [])
        self.assertEqual(rows_by_type["medication"].suspicious_items, [])
        self.assertIsNone(rows_by_type["environment"].confidence)
        self.assertIsNone(rows_by_type["medication"].confidence)

        sensitivity_rows = {
            (row.factor_type, row.factor_key): row
            for row in self.db.query(UserFactorSensitivity).all()
        }
        self.assertEqual(
            set(sensitivity_rows.keys()),
            {
                ("ingredient", "retinol"),
                ("food", "dairy"),
                ("behavior", "sleep_shortage"),
            },
        )
        self.assertAlmostEqual(
            float(sensitivity_rows[("ingredient", "retinol")].sensitivity_score),
            0.25,
        )
        self.assertAlmostEqual(float(sensitivity_rows[("food", "dairy")].sensitivity_score), 0.17)
        self.assertAlmostEqual(
            float(sensitivity_rows[("behavior", "sleep_shortage")].sensitivity_score),
            0.20,
        )
        for row in sensitivity_rows.values():
            self.assertEqual(row.trigger_count, 1)
            self.assertEqual(row.last_triggered_at, skin_log.logged_at)

        baseline = self.db.query(UserBaseline).filter(UserBaseline.user_id == 1).one()
        self.assertEqual(baseline.analysis_count, 1)

    @patch(
        "app.services.analysis_orchestrator.update_user_profile_from_agent_results",
        side_effect=RuntimeError("profile update failed"),
    )
    @patch("app.services.analysis_orchestrator.analyze_with_llm")
    @patch("app.services.analysis_orchestrator.build_analysis_context")
    def test_profile_update_failure_rolls_back_analysis_payload_and_marks_failed(
        self,
        mock_builder,
        mock_llm,
        mock_profile_update,
    ):
        skin_log = self._create_skin_logs()
        mock_builder.return_value = MOCK_CONTEXT
        mock_llm.return_value = MOCK_LLM_RESULT_WITH_AGENTS

        with self.assertRaises(RuntimeError):
            run_analysis(
                self.db,
                user_id=1,
                skin_log_id=skin_log.id,
                lookback_days=14,
            )

        failed = self.db.query(AnalysisRequest).filter(AnalysisRequest.status == "failed").one()
        self.assertEqual(failed.skin_log_id, skin_log.id)
        self.assertEqual(self.db.query(AnalysisResult).count(), 0)
        self.assertEqual(self.db.query(AgentResult).count(), 0)
        self.assertEqual(self.db.query(UserFactorSensitivity).count(), 0)
        self.assertEqual(self.db.query(UserBaseline).count(), 0)
        mock_profile_update.assert_called_once()

    @patch(
        "app.services.skin_tendency_updater.get_skin_tendency",
        side_effect=SkinTendencyLLMError("skin tendency failed"),
    )
    @patch("app.services.analysis_orchestrator.analyze_with_llm")
    @patch("app.services.analysis_orchestrator.build_analysis_context")
    def test_skin_tendency_failure_keeps_analysis_done(
        self,
        mock_builder,
        mock_llm,
        mock_skin_tendency,
    ):
        skin_log = self._create_skin_logs()
        self.db.add(UserBaseline(user_id=1, analysis_count=2))
        self.db.commit()
        mock_builder.return_value = MOCK_CONTEXT
        mock_llm.return_value = MOCK_LLM_RESULT_WITH_AGENTS

        request = run_analysis(
            self.db,
            user_id=1,
            skin_log_id=skin_log.id,
            lookback_days=14,
        )

        self.assertEqual(request.status, "done")
        self.assertEqual(self.db.query(AnalysisResult).count(), 1)
        self.assertEqual(self.db.query(AgentResult).count(), 5)
        baseline = self.db.query(UserBaseline).filter(UserBaseline.user_id == 1).one()
        self.assertEqual(baseline.analysis_count, 3)
        self.assertIsNone(baseline.skin_tendency)
        mock_skin_tendency.assert_called_once()

    def test_missing_or_other_user_skin_log_returns_404_without_request(self):
        self._create_skin_logs(user_id=2)
        for skin_log_id in [999, self.db.query(SkinLog).filter(SkinLog.user_id == 2).first().id]:
            response = self.client.post(
                "/users/me/analysis",
                json={"skin_log_id": skin_log_id},
            )
            self.assertEqual(response.status_code, 404)
        self.assertEqual(self.db.query(AnalysisRequest).count(), 0)

    def test_less_than_7_recent_skin_log_days_returns_400_without_request(self):
        skin_log = self._create_skin_logs(days=6)
        response = self.client.post(
            "/users/me/analysis",
            json={"skin_log_id": skin_log.id},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.db.query(AnalysisRequest).count(), 0)

    def test_skin_log_id_is_required(self):
        response = self.client.post(
            "/users/me/analysis",
            json={},
        )
        self.assertEqual(response.status_code, 422)

    def test_duplicate_pending_processing_done_return_400_and_failed_retries(self):
        for status_value in ["pending", "processing", "done"]:
            self._clear_data()
            skin_log = self._create_skin_logs()
            self._create_request(skin_log.id, status_value)
            response = self.client.post(
                "/users/me/analysis",
                json={"skin_log_id": skin_log.id},
            )
            self.assertEqual(response.status_code, 400)

        self._clear_data()
        skin_log = self._create_skin_logs()
        self._create_request(skin_log.id, "failed")
        response = self.client.post(
            "/users/me/analysis",
            json={"skin_log_id": skin_log.id},
        )
        self.assertEqual(response.status_code, 202)

    def test_builder_failure_and_llm_failure_save_failed(self):
        cases = [
            ("app.services.analysis_orchestrator.build_analysis_context", AnalysisContextError("builder"), 500),
            ("app.services.analysis_orchestrator.analyze_with_llm", AnalysisLLMError("llm"), 502),
        ]
        for target, patched_value, expected_status in cases:
            self._clear_data()
            skin_log = self._create_skin_logs()
            patches = [
                patch("app.services.analysis_orchestrator.build_analysis_context", return_value=MOCK_CONTEXT),
                patch("app.services.analysis_orchestrator.analyze_with_llm", return_value=MOCK_LLM_RESULT),
            ]
            patches[0 if target.endswith("build_analysis_context") else 1] = patch(
                target, side_effect=patched_value
            )

            with patches[0], patches[1]:
                with self.assertRaises(type(patched_value)):
                    run_analysis(
                        self.db,
                        user_id=1,
                        skin_log_id=skin_log.id,
                        lookback_days=14,
                    )
            failed = self.db.query(AnalysisRequest).filter(AnalysisRequest.status == "failed").first()
            self.assertIsNotNone(failed)

    def test_confidence_score_bool_or_out_of_range_saves_failed_and_returns_502(self):
        for score in [True, 1.1, -0.1]:
            self._clear_data()
            skin_log = self._create_skin_logs()
            with patch("app.services.analysis_orchestrator.build_analysis_context", return_value=MOCK_CONTEXT), patch(
                "app.services.analysis_orchestrator.analyze_with_llm",
                return_value={**MOCK_LLM_RESULT, "confidence_score": score},
            ):
                with self.assertRaises(Exception):
                    run_analysis(
                        self.db,
                        user_id=1,
                        skin_log_id=skin_log.id,
                        lookback_days=14,
                    )
            self.assertIsNotNone(
                self.db.query(AnalysisRequest).filter(AnalysisRequest.status == "failed").first()
            )

    def test_disclaimer_is_added_once_at_end(self):
        skin_log = self._create_skin_logs()
        report = f"앞문장 {DISCLAIMER} 중간 {DISCLAIMER}"
        with patch("app.services.analysis_orchestrator.build_analysis_context", return_value=MOCK_CONTEXT), patch(
            "app.services.analysis_orchestrator.analyze_with_llm",
            return_value={**MOCK_LLM_RESULT, "report_text": report},
        ):
            request = run_analysis(
                self.db,
                user_id=1,
                skin_log_id=skin_log.id,
                lookback_days=14,
            )
        text = request.analysis_result.report_text
        self.assertEqual(text.count(DISCLAIMER), 1)
        self.assertTrue(text.endswith(DISCLAIMER))

    def test_get_detail_and_ownership(self):
        skin_log = self._create_skin_logs()
        request = self._create_request(skin_log.id, "done")
        self.db.add(
            AnalysisResult(
                request_id=request.id,
                primary_cause="원인",
                contributing_factors=["a"],
                report_text=f"리포트\n\n{DISCLAIMER}",
                confidence_score=0.5,
            )
        )
        self.db.add(
            AgentResult(
                request_id=request.id,
                agent_type="cosmetic",
                suspicious_items=[
                    {
                        "factor_type": "ingredient",
                        "factor_key": "retinol",
                        "label": "?덊떚?",
                        "confidence": 0.82,
                    }
                ],
                reason="?덊떚? ?먭레 媛?μ꽦",
                confidence=0.82,
            )
        )
        other_log = self._create_skin_logs(user_id=2, target_date=date(2026, 5, 1))
        other_request = self._create_request(other_log.id, "done", user_id=2)
        self.db.commit()

        response = self.client.get(f"/users/me/analysis/{request.id}")
        self.assertEqual(response.status_code, 200)
        result = response.json()["result"]
        self.assertIsNotNone(result["primary_cause"])
        self.assertEqual(result["contributing_factors"], ["a"])
        self.assertIsNotNone(result["report_text"])
        self.assertEqual(result["confidence_score"], 0.5)
        self.assertEqual(len(result["agent_results"]), 1)
        self.assertEqual(result["agent_results"][0]["agent_type"], "cosmetic")
        self.assertEqual(result["agent_results"][0]["suspicious_items"][0]["factor_key"], "retinol")
        self.assertEqual(result["agent_results"][0]["confidence"], 0.82)
        self.assertEqual(self.client.get(f"/users/me/analysis/{other_request.id}").status_code, 404)

    def test_get_detail_returns_empty_agent_results_without_agent_rows(self):
        skin_log = self._create_skin_logs()
        request = self._create_request(skin_log.id, "done")
        self.db.add(
            AnalysisResult(
                request_id=request.id,
                primary_cause="cause",
                contributing_factors=[],
                report_text="report",
                confidence_score=0.5,
            )
        )
        self.db.commit()

        response = self.client.get(f"/users/me/analysis/{request.id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["result"]["agent_results"], [])

    def test_get_progress_returns_record_summary_and_skin_timeline(self):
        skin_log = self._create_skin_logs()
        older_same_day = SkinLog(
            user_id=1,
            logged_at=skin_log.logged_at,
            overall_score=1,
            created_at=datetime(2026, 6, 1, 9, 0, 0),
        )
        latest_same_day = SkinLog(
            user_id=1,
            logged_at=skin_log.logged_at,
            overall_score=5,
            created_at=datetime(2026, 6, 1, 10, 0, 0),
        )
        skin_log.created_at = datetime(2026, 6, 1, 8, 0, 0)
        self.db.add_all([older_same_day, latest_same_day])
        self.db.commit()
        request = self._create_request(skin_log.id, "processing")

        response = self.client.get(f"/users/me/analysis/{request.id}/progress")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["request_id"], request.id)
        self.assertEqual(data["status"], "processing")
        self.assertEqual(data["summary"]["skin_days"], 7)
        self.assertEqual(len(data["skin_timeline"]), 7)
        self.assertEqual(
            len({item["date"] for item in data["skin_timeline"]}),
            len(data["skin_timeline"]),
        )
        self.assertEqual(data["skin_timeline"][-1]["score"], 5)

    def test_get_list_ordering_and_limit(self):
        skin_log = self._create_skin_logs()
        older = self._create_request(skin_log.id, "done", requested_at=datetime(2026, 6, 1, 10, 0, 0))
        same_time_first = self._create_request(skin_log.id, "failed", requested_at=datetime(2026, 6, 2, 10, 0, 0))
        same_time_second = self._create_request(skin_log.id, "failed", requested_at=datetime(2026, 6, 2, 10, 0, 0))
        self.db.add(
            AnalysisResult(
                request_id=same_time_second.id,
                primary_cause="cause",
                contributing_factors=["a"],
                report_text="report",
                confidence_score=0.5,
            )
        )
        self.db.add(
            AgentResult(
                request_id=same_time_second.id,
                agent_type="cosmetic",
                suspicious_items=[],
                reason="retinol suspicious",
                confidence=0.82,
            )
        )
        self.db.commit()

        response = self.client.get("/users/me/analysis?limit=2")
        self.assertEqual(response.status_code, 200)
        items = response.json()["items"]
        ids = [item["request_id"] for item in items]
        self.assertEqual(ids, [same_time_second.id, same_time_first.id])
        self.assertNotIn("agent_results", items[0]["result"])
        self.assertNotIn(older.id, ids)
        self.assertEqual(self.client.get("/users/me/analysis?limit=0").status_code, 422)
        self.assertEqual(self.client.get("/users/me/analysis?limit=101").status_code, 422)

    @patch("app.services.analysis_orchestrator.analyze_with_llm")
    @patch("app.services.analysis_orchestrator.build_analysis_context")
    def test_past_skin_log_uses_logged_at_as_14_day_reference(self, mock_builder, mock_llm):
        target = date(2026, 5, 1)
        skin_log = self._create_skin_logs(target_date=target)
        self._create_skin_logs(target_date=date(2026, 6, 1), days=2)
        mock_builder.return_value = MOCK_CONTEXT
        mock_llm.return_value = MOCK_LLM_RESULT

        response = self.client.post(
            "/users/me/analysis",
            json={"skin_log_id": skin_log.id},
        )

        self.assertEqual(response.status_code, 202)

    def _create_skin_logs(self, user_id=1, target_date=date(2026, 6, 2), days=7):
        target_log = None
        for offset in range(days):
            log = SkinLog(
                user_id=user_id,
                logged_at=target_date - timedelta(days=offset),
                overall_score=3,
            )
            self.db.add(log)
            if offset == 0:
                target_log = log
        self.db.commit()
        self.db.refresh(target_log)
        return target_log

    def _create_request(self, skin_log_id, status_value, user_id=1, requested_at=None):
        request = AnalysisRequest(
            user_id=user_id,
            skin_log_id=skin_log_id,
            lookback_days=14,
            status=status_value,
        )
        if requested_at is not None:
            request.requested_at = requested_at
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        return request

    def _clear_data(self):
        self.db.query(AnalysisResult).delete()
        self.db.query(AnalysisRequest).delete()
        self.db.query(SkinLog).delete()
        self.db.commit()

    def _high_sugar_context(self, trigger_day):
        start = trigger_day - timedelta(days=13)
        exposure_offsets = {0, 4, 8}
        low_score_offsets = {1, 2, 3, 5, 6, 7, 9, 10, 11}
        timeline = []
        for offset in range(14):
            foods = []
            if offset in exposure_offsets:
                foods = [
                    {
                        "name": "sweet food",
                        "skin_tags": ["고당류"],
                        "flags": [],
                    }
                ]
            timeline.append(
                {
                    "date": (start + timedelta(days=offset)).isoformat(),
                    "skin": {"overall_score": 2 if offset in low_score_offsets else 4},
                    "diet": [{"meal": "점심", "foods": foods}] if foods else [],
                    "environment": None,
                    "behavior": None,
                }
            )
        return {
            "meta": {"trigger_date": trigger_day.isoformat()},
            "daily_timeline": timeline,
            "context": {},
            "summary": {},
            "candidate_signals": [],
        }

    def _restore_override(self, dependency, previous):
        if previous is None:
            app.dependency_overrides.pop(dependency, None)
        else:
            app.dependency_overrides[dependency] = previous


if __name__ == "__main__":
    unittest.main()
