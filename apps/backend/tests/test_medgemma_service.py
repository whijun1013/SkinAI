import os
import sys
import unittest

from pydantic import ValidationError

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.medgemma_service import (
    SKIN_SIGNAL_PROMPT_VERSION,
    build_medgemma_display_summary,
    build_medgemma_handoff_payload,
    build_user_facing_observations,
    get_medgemma_prompt,
    get_medgemma_prompt_sha256,
    ordinal_signal_to_score,
    parse_medgemma_output,
    validate_medgemma_output,
)


VALID_OUTPUT = {
    "active_lesion": "mild",
    "redness": "moderate",
    "barrier": "none",
}


class TestMedGemmaService(unittest.TestCase):
    def test_prompt_uses_ordinal_gateway_contract(self):
        prompt = get_medgemma_prompt()
        self.assertEqual(SKIN_SIGNAL_PROMPT_VERSION, "skin_signal_v3_ordinal")
        self.assertIn('"moderate"', prompt)
        self.assertIn("quality gateway", prompt)
        self.assertIn("Do not output fields like photo_quality", prompt)
        self.assertEqual(len(get_medgemma_prompt_sha256()), 64)

    def test_validate_accepts_only_complete_ordinal_contract(self):
        self.assertEqual(validate_medgemma_output(VALID_OUTPUT), VALID_OUTPUT)
        for invalid in (
            {**VALID_OUTPUT, "redness": 4},
            {**VALID_OUTPUT, "redness": "high"},
            {**VALID_OUTPUT, "confidence": 0.9},
            {"active_lesion": "none", "redness": "none"},
        ):
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                validate_medgemma_output(invalid)

    def test_parse_requires_raw_json_only(self):
        parsed, raw_json_only = parse_medgemma_output(
            '{"active_lesion":"mild","redness":"moderate","barrier":"none"}'
        )
        self.assertEqual(parsed, VALID_OUTPUT)
        self.assertTrue(raw_json_only)

        for invalid_text in (
            '```json\n{"active_lesion":"mild","redness":"moderate","barrier":"none"}\n```',
            'Result: {"active_lesion":"mild","redness":"moderate","barrier":"none"}',
        ):
            with self.subTest(text=invalid_text), self.assertRaises(ValueError):
                parse_medgemma_output(invalid_text)

    def test_handoff_accepts_raw_and_stored_signal_shapes(self):
        expected_signals = dict(VALID_OUTPUT)
        raw = build_medgemma_handoff_payload(VALID_OUTPUT)
        stored = build_medgemma_handoff_payload({"signals": VALID_OUTPUT})

        self.assertEqual(raw["signals"], expected_signals)
        self.assertEqual(stored["signals"], expected_signals)
        self.assertTrue(raw["usable"])
        self.assertIsNone(build_medgemma_handoff_payload({**VALID_OUTPUT, "redness": 5}))

    def test_ordinal_conversion_is_strict(self):
        self.assertEqual(ordinal_signal_to_score("none"), 0)
        self.assertEqual(ordinal_signal_to_score("severe"), 3)
        self.assertIsNone(ordinal_signal_to_score("high"))
        self.assertIsNone(ordinal_signal_to_score(3))

    def test_user_facing_formatters_use_ordinal_values(self):
        result = {"signals": VALID_OUTPUT}
        self.assertEqual(
            build_medgemma_display_summary(result),
            "업로드된 사진에서 트러블/여드름 및 염증성 홍반 신호가 관찰되었습니다.",
        )
        observations = build_user_facing_observations(result)
        self.assertEqual(observations["active_lesion"]["score"], "mild")
        self.assertEqual(observations["active_lesion"]["level_label"], "경미함")
        self.assertEqual(observations["redness"]["level_label"], "중간")
        self.assertEqual(observations["barrier"]["level_label"], "없음")


if __name__ == "__main__":
    unittest.main()
