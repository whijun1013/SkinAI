import unittest
from data_tools.vision_poc.poc.probe_face_photos import (
    extract_json,
    normalize_probe_result,
    build_gpt4o_handoff_payload,
    score_to_level,
    validate_probe_result,
)

class TestMedGemmaProbeParser(unittest.TestCase):

    def test_extract_and_normalize_nested_schema(self):
        text = '''
        ```json
        {
          "is_face_photo": true,
          "usable_for_skin_observation": true,
          "capture_quality": {
            "lighting_quality": "good",
            "sharpness_quality": "acceptable",
            "face_angle_quality": "front_facing",
            "occlusion_flags": [],
            "quality_limitation_notes": ""
          },
          "visible_skin_regions": ["forehead"],
          "observed_skin_signals": {
            "redness": {
              "raw_score": 60,
              "level": "moderate",
              "regions": ["forehead"],
              "evidence": "mild flush",
              "uncertainty": "low"
            }
          },
          "gpt4o_handoff": {
            "usable_summary": "Moderate redness on forehead.",
            "do_not_overstate": ["diagnosis"],
            "recommended_report_tone": "cautious",
            "confidence": "high"
          },
          "recommendation_for_pipeline": "use"
        }
        ```
        '''
        raw = extract_json(text)
        normalized = normalize_probe_result(raw)

        self.assertTrue(normalized["is_face_photo"])
        self.assertEqual(normalized["capture_quality"]["lighting_quality"], "good")
        self.assertEqual(normalized["confidence"], "high")

        # Check calibrated outputs
        calibrated = normalized["calibrated_observations"]
        self.assertIn("redness", calibrated)
        self.assertEqual(calibrated["redness"]["raw_score"], 60)
        
        # Check payload
        payload = build_gpt4o_handoff_payload(normalized)
        self.assertEqual(payload["recommendation"], "use")
        self.assertEqual(payload["confidence"], "high")
        self.assertIn("observations", payload)
        self.assertNotIn("raw_score", payload["observations"]["redness"])
        self.assertNotIn("calibrated_score", payload["observations"]["redness"])
        self.assertEqual(payload["observations"]["redness"]["level"], "moderate")
        self.assertEqual(payload["summary_for_report_model"], "Moderate redness on forehead.")

    def test_backward_compatibility_flat_schema(self):
        text = '''
        {
          "is_face_photo": true,
          "usable_for_skin_observation": true,
          "visible_skin_regions": ["forehead"],
          "redness_score": 50,
          "acne_like_spot_score": 30,
          "texture_irregularity_score": 10,
          "lighting_quality": "acceptable",
          "occlusion_flags": ["glasses"],
          "uncertainty_notes": "A bit dark",
          "recommendation_for_pipeline": "review"
        }
        '''
        raw = extract_json(text)
        normalized = normalize_probe_result(raw)
        
        self.assertEqual(normalized["capture_quality"]["lighting_quality"], "acceptable")
        self.assertEqual(normalized["capture_quality"]["quality_limitation_notes"], "A bit dark")
        
        calibrated = normalized["calibrated_observations"]
        self.assertEqual(calibrated["redness"]["raw_score"], 50)
        self.assertEqual(calibrated["acne_like_spots"]["raw_score"], 30)

    def test_score_to_level_mapping(self):
        self.assertEqual(score_to_level(0), "none")
        self.assertEqual(score_to_level(15), "very_mild")
        self.assertEqual(score_to_level(20), "very_mild")
        self.assertEqual(score_to_level(21), "mild")
        self.assertEqual(score_to_level(40), "mild")
        self.assertEqual(score_to_level(41), "moderate")
        self.assertEqual(score_to_level(60), "moderate")
        self.assertEqual(score_to_level(61), "high")
        self.assertEqual(score_to_level(80), "high")
        self.assertEqual(score_to_level(81), "very_high")
        self.assertEqual(score_to_level(100), "very_high")

    def test_capture_quality_downgrades_recommendation(self):
        raw = {
            "is_face_photo": True,
            "usable_for_skin_observation": True,
            "capture_quality": {
                "lighting_quality": "poor",
                "sharpness_quality": "good",
                "face_angle_quality": "front_facing",
                "occlusion_flags": [],
            },
            "recommendation_for_pipeline": "use"  # Should be downgraded
        }
        normalized = normalize_probe_result(raw)
        self.assertEqual(normalized["recommendation_for_pipeline"], "review")
        self.assertEqual(normalized["confidence"], "low")

    def test_gpt4o_handoff_payload_format(self):
        raw = {
            "is_face_photo": True,
            "usable_for_skin_observation": True,
            "recommendation_for_pipeline": "use",
            "capture_quality": {"lighting_quality": "good"},
            "gpt4o_handoff": {
                "usable_summary": "Test summary",
            }
        }
        normalized = normalize_probe_result(raw)
        payload = build_gpt4o_handoff_payload(normalized)
        
        # Verify absence of diagnostic instructions
        self.assertIn("Do not treat this as diagnosis.", payload["guardrails"])
        self.assertEqual(payload["usable"], True)
        self.assertEqual(payload["summary_for_report_model"], "Test summary")
        for observation in payload["observations"].values():
            self.assertNotIn("raw_score", observation)
            self.assertNotIn("calibrated_score", observation)
            self.assertNotIn("raw_level", observation)

    def test_partial_capture_quality_defaults_to_medium_confidence(self):
        raw = {
            "is_face_photo": True,
            "usable_for_skin_observation": True,
            "visible_skin_regions": ["forehead"],
            "capture_quality": {"lighting_quality": "good"},
            "observed_skin_signals": {
                "redness": {
                    "raw_score": 10,
                    "level": "very_mild",
                    "regions": ["forehead"],
                    "evidence": "slight flush",
                    "uncertainty": "medium",
                },
                "acne_like_spots": {
                    "raw_score": 0,
                    "level": "none",
                    "regions": [],
                    "evidence": "",
                    "uncertainty": "low",
                },
                "texture_irregularity": {
                    "raw_score": 0,
                    "level": "none",
                    "regions": [],
                    "evidence": "",
                    "uncertainty": "low",
                },
            },
            "gpt4o_handoff": {"usable_summary": "Slight redness only."},
            "recommendation_for_pipeline": "use",
        }

        normalized = normalize_probe_result(raw)

        self.assertEqual(normalized["capture_quality"]["sharpness_quality"], "unknown")
        self.assertEqual(normalized["capture_quality"]["face_angle_quality"], "unknown")
        self.assertEqual(normalized["confidence"], "medium")
        self.assertIn("unknown:sharpness_quality", validate_probe_result(normalized))
        self.assertIn("unknown:face_angle_quality", validate_probe_result(normalized))

    def test_missing_nested_contract_is_reported(self):
        normalized = normalize_probe_result({
            "is_face_photo": True,
            "usable_for_skin_observation": True,
            "visible_skin_regions": ["forehead"],
            "lighting_quality": "good",
            "redness_score": 25,
            "recommendation_for_pipeline": "use",
        })

        issues = validate_probe_result(normalized)

        self.assertIn("missing:observed_skin_signals", issues)
        self.assertIn("missing:gpt4o_handoff", issues)
        self.assertIn("unknown:sharpness_quality", issues)
        self.assertIn("unknown:face_angle_quality", issues)


if __name__ == '__main__':
    unittest.main()
