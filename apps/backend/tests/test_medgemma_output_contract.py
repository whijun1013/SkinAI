import json
import unittest

from app.services.medgemma_service import (
    MEDGEMMA_ASSISTANT_PREFILL,
    SKIN_SIGNAL_PROMPT_VERSION,
    extract_json_with_metadata,
    get_medgemma_prompt_sha256,
    parse_medgemma_output,
    validate_medgemma_output,
)


VALID_OUTPUT = {
    "active_lesion": "mild",
    "redness": "moderate",
    "barrier": "none",
}


class TestMedGemmaOutputContract(unittest.TestCase):
    def test_prompt_protocol_identity(self):
        self.assertEqual(SKIN_SIGNAL_PROMPT_VERSION, "skin_signal_v3_ordinal")
        self.assertEqual(MEDGEMMA_ASSISTANT_PREFILL, "{")
        self.assertEqual(
            get_medgemma_prompt_sha256(),
            "4933f38a3d28c5aa28d67dff5dd4cd4086277538ff11f5615bdefa09a9ff7f62",
        )

    def test_fenced_json_is_recoverable_but_not_raw_json_only(self):
        parsed, raw_json_only = extract_json_with_metadata(
            f"```json\n{json.dumps(VALID_OUTPUT)}\n```"
        )
        self.assertEqual(parsed, VALID_OUTPUT)
        self.assertFalse(raw_json_only)

        validated, raw_json_only = parse_medgemma_output(json.dumps(VALID_OUTPUT))
        self.assertEqual(validated, VALID_OUTPUT)
        self.assertTrue(raw_json_only)

    def test_rejects_invalid_types_ranges_and_shape(self):
        invalid_payloads = [
            {**VALID_OUTPUT, "active_lesion": 1},            # int not allowed
            {**VALID_OUTPUT, "redness": "high"},              # invalid level string
            {**VALID_OUTPUT, "confidence": 0.9},              # extra field forbidden
            {**VALID_OUTPUT, "photo_quality": "pass"},        # extra field forbidden
            {**VALID_OUTPUT, "extra": "not allowed"},         # extra field forbidden
            {"active_lesion": "none", "redness": "none"},     # missing barrier
        ]
        for payload in invalid_payloads:
            with self.subTest(payload=payload), self.assertRaises(Exception):
                validate_medgemma_output(payload)


if __name__ == "__main__":
    unittest.main()
