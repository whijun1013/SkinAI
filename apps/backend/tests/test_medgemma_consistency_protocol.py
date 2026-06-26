import json
import tempfile
import unittest
from pathlib import Path

from data_tools.medgemma.worker.test_medgemma_output_prompt import (
    _build_cross_image_diagnostics,
    _build_consistency_metrics,
    _compare_baseline_report,
    _evaluate_labels,
    _parse_json,
    _validate_result,
)


def _image_result(name: str, scores: tuple[int, int, int], confidence: float = 0.9) -> dict:
    result = {
        "active_lesion": scores[0],
        "redness": scores[1],
        "barrier": scores[2],
        "photo_quality": "pass",
        "confidence": confidence,
    }
    return {
        "image": name,
        "metrics": {
            "modal_score_tuple": {key: value for key, value in zip(("active_lesion", "redness", "barrier"), scores)},
            "photo_quality_counts": {"pass": 2},
            "confidence": {"mean": confidence},
        },
        "runs": [
            {
                "success": True,
                "result": result,
                "raw_json_only": True,
                "generated_token_count": 20,
            },
            {
                "success": True,
                "result": result,
                "raw_json_only": True,
                "generated_token_count": 20,
            },
        ],
    }


class TestMedGemmaConsistencyProtocol(unittest.TestCase):
    def test_fenced_output_is_schema_valid_but_not_raw_json_only(self):
        text = (
            "```json\n"
            '{"active_lesion":1,"redness":2,"barrier":0,'
            '"photo_quality":"pass","confidence":0.8}'
            "\n```"
        )
        parsed, raw_json_only = _parse_json(text)
        self.assertFalse(raw_json_only)
        self.assertEqual(_validate_result(parsed), [])

    def test_format_noncompliance_does_not_hide_measurement_consistency(self):
        result = {
            "active_lesion": 1,
            "redness": 2,
            "barrier": 0,
            "photo_quality": "pass",
            "confidence": 0.8,
        }
        runs = [
            {"success": True, "result": result, "raw_json_only": False}
            for _ in range(20)
        ]
        metrics = _build_consistency_metrics(
            runs,
            max_score_range=1,
            max_mad=0.25,
            max_confidence_range=0.05,
            min_exact_match_rate=0.95,
            min_raw_json_only_rate=1.0,
        )
        self.assertTrue(metrics["measurement_consistency_passed"])
        self.assertFalse(metrics["format_compliance_passed"])
        self.assertTrue(metrics["passed"])
        self.assertEqual(metrics["measurement_failure_reasons"], [])

    def test_diagnostics_warn_about_anchor_score_quantization(self):
        rows = [_image_result(f"image-{index}.jpg", (7, 7, 4)) for index in range(10)]
        diagnostics = _build_cross_image_diagnostics(rows, max_tokens=160)
        self.assertTrue(any("0/4/7" in warning for warning in diagnostics["warnings"]))
        self.assertEqual(diagnostics["repeat_scope"], "single_process_single_model_load")

    def test_labeled_evaluation_reports_accuracy_and_calibration(self):
        rows = [
            _image_result("a.jpg", (1, 2, 0), confidence=0.8),
            _image_result("b.jpg", (0, 0, 0), confidence=0.9),
        ]
        labels = {
            "a.jpg": {"active_lesion": 2, "redness": 2, "barrier": 0, "photo_quality": "pass"},
            "b.jpg": {"active_lesion": 3, "redness": 0, "barrier": 0, "photo_quality": "pass"},
        }
        evaluation = _evaluate_labels(rows, labels)
        self.assertTrue(evaluation["ground_truth_accuracy_evaluated"])
        self.assertEqual(evaluation["labeled_image_count"], 2)
        self.assertEqual(evaluation["signals"]["active_lesion"]["mae"], 2.0)
        self.assertEqual(evaluation["signals"]["active_lesion"]["presence_false_negative_count"], 1)
        self.assertIsNotNone(evaluation["confidence_brier_score"])

    def test_baseline_comparison_detects_cross_process_score_drift(self):
        current = _image_result("a.jpg", (4, 4, 0))
        current["image_sha256"] = "same-image"
        baseline = _image_result("a.jpg", (1, 4, 0))
        baseline["image_sha256"] = "same-image"
        report = {
            "protocol": {
                "prompt_sha256": "6b5e24bcc924a98a3b84dffb0fe902d0e175c4a02e264e0780fed9b6ae1e7e50",
                "model_revision": "revision-1",
            },
            "images": [baseline],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "baseline.json"
            path.write_text(json.dumps(report), encoding="utf-8")
            comparison = _compare_baseline_report([current], str(path), max_score_delta=1)
        self.assertFalse(comparison["passed"])
        self.assertIn("cross-run score delta exceeds 1", comparison["failure_reasons"])


if __name__ == "__main__":
    unittest.main()
