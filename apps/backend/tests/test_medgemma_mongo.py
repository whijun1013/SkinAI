import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.mongo import update_skin_ai_result_medgemma


class TestMedGemmaMongo(unittest.IsolatedAsyncioTestCase):
    @patch("app.mongo.get_mongo_db")
    async def test_stores_valid_nested_signals_and_protocol_metadata(self, mock_get_db):
        collection = MagicMock()
        collection.insert_one = AsyncMock(return_value=SimpleNamespace(inserted_id="result-id"))
        mock_get_db.return_value.__getitem__.return_value = collection

        result_id = await update_skin_ai_result_medgemma(
            skin_log_id=10,
            user_id=20,
            medgemma={
                "signals": {"active_lesion": "mild", "redness": "moderate", "barrier": "none"},
            },
            model_version="skin_signal_v3_ordinal",
            model_revision="revision-1",
            prompt_version="skin_signal_v3_ordinal",
            prompt_sha256="prompt-hash",
        )

        self.assertEqual(result_id, "result-id")
        document = collection.insert_one.await_args.args[0]
        self.assertEqual(
            document["signals"],
            {"active_lesion": "mild", "redness": "moderate", "barrier": "none"},
        )
        self.assertEqual(document["prompt_sha256"], "prompt-hash")
        self.assertEqual(document["model_revision"], "revision-1")

    @patch("app.mongo.get_mongo_db")
    async def test_rejects_partial_or_out_of_range_signals_before_database_access(self, mock_get_db):
        invalid_results = [
            {"signals": {"redness": "moderate"}},  # 3신호 중 1개만 있음 (partial)
            {"signals": {"active_lesion": "mild", "redness": "invalid_level", "barrier": "none"}},
        ]
        for medgemma in invalid_results:
            with self.subTest(medgemma=medgemma):
                result = await update_skin_ai_result_medgemma(
                    skin_log_id=10,
                    user_id=20,
                    medgemma=medgemma,
                )
                self.assertIsNone(result)
        mock_get_db.assert_not_called()

    @patch("app.mongo.get_mongo_db")
    async def test_rejects_integer_signals(self, mock_get_db):
        """정수형 신호(구 계약)는 저장 전에 거부된다."""
        result = await update_skin_ai_result_medgemma(
            skin_log_id=10,
            user_id=20,
            medgemma={
                "signals": {"active_lesion": 0, "redness": 0, "barrier": 0},
            },
        )
        self.assertIsNone(result)
        mock_get_db.assert_not_called()


if __name__ == "__main__":
    unittest.main()
