import json
import os
import sys
import unittest

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.medgemma_trend_service import build_medgemma_visual_trends

class TestMedGemmaTrendService(unittest.TestCase):
    def setUp(self):
        fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "medgemma_report_scenarios.json")
        with open(fixture_path, "r", encoding="utf-8") as f:
            self.scenarios = json.load(f)

    def test_scenarios(self):
        for scenario in self.scenarios:
            timeline = scenario.get("skin_logs", [])
            handoffs = scenario.get("medgemma_results", [])
            expected = scenario.get("expected", {})

            result = build_medgemma_visual_trends(timeline, handoffs)

            if not expected.get("should_generate_visual_trend"):
                self.assertIsNone(result, f"Scenario {scenario['id']} should not generate a trend.")
                continue

            self.assertIsNotNone(result, f"Scenario {scenario['id']} should generate a trend.")

            # Check dominant signals
            expected_dominant = expected.get("expected_dominant_signals", [])
            self.assertEqual(
                set(result["dominant_signals"]),
                set(expected_dominant),
                f"Scenario {scenario['id']} dominant signals mismatch."
            )

            # Guardrails should not contain claims
            summary = result.get("summary_for_report", "")
            for claim in expected.get("must_not_claim", []):
                self.assertNotIn(claim, summary, f"Scenario {scenario['id']} summary contains invalid claim: {claim}")

    def test_empty_results(self):
        self.assertIsNone(build_medgemma_visual_trends([], []))

    def test_reject_is_excluded_from_trends(self):
        handoffs = [
            {"date": "2026-06-10", "recommendation": "reject", "usable": False, "signals": {"redness": 3}}
        ]
        result = build_medgemma_visual_trends([], handoffs)
        self.assertIsNone(result)

    def test_total_and_usable_days_are_reported_separately(self):
        handoffs = [
            {
                "date": "2026-06-10",
                "recommendation": "reject",
                "usable": False,
                "signals": {"redness": 3},
            },
            {
                "date": "2026-06-11",
                "recommendation": "use",
                "usable": True,
                "confidence": "high",
                "signals": {"barrier": 1},
            },
            {
                "date": "2026-06-12",
                "recommendation": "review",
                "usable": True,
                "confidence": "low",
                "signals": {"barrier": 2},
            },
        ]

        result = build_medgemma_visual_trends([], handoffs)

        self.assertIsNotNone(result)
        self.assertEqual(result["total_days"], 3)
        self.assertEqual(result["usable_days"], 2)

    def test_low_confidence_is_tracked(self):
        handoffs = [
            {"date": "2026-06-10", "recommendation": "review", "confidence": "low", "usable": True, "signals": {"redness": 1}}
        ]
        result = build_medgemma_visual_trends([], handoffs)
        self.assertIsNotNone(result)
        self.assertEqual(result["usable_days"], 1)

    def test_worsened_signals(self):
        handoffs = [
            {"date": "2026-06-01", "usable": True, "signals": {"barrier": 0}},
            {"date": "2026-06-02", "usable": True, "signals": {"barrier": 0}},
            {"date": "2026-06-03", "usable": True, "signals": {"barrier": 2}},
            {"date": "2026-06-04", "usable": True, "signals": {"barrier": 3}}
        ]
        result = build_medgemma_visual_trends([], handoffs)
        self.assertIn("barrier", result["worsened_signals"])

    def test_score_drop_overlap(self):
        timeline = [
            {"date": "2026-06-01", "score": 90},
            {"date": "2026-06-02", "score": 75} # drop of 15
        ]
        handoffs = [
            {"date": "2026-06-01", "usable": True, "signals": {"redness": 0}},
            {"date": "2026-06-02", "usable": True, "signals": {"redness": 2}}
        ]
        result = build_medgemma_visual_trends(timeline, handoffs)
        self.assertIn("redness", result["score_drop_overlap_signals"])

    def test_score_drop_overlap_uses_app_five_point_scale(self):
        timeline = [
            {"date": "2026-06-01", "score": 4},
            {"date": "2026-06-02", "score": 3},
        ]
        handoffs = [
            {
                "date": "2026-06-01",
                "usable": True,
                "signals": {"barrier": 0},
            },
            {
                "date": "2026-06-02",
                "usable": True,
                "signals": {"barrier": 2},
            }
        ]
        result = build_medgemma_visual_trends(timeline, handoffs)
        self.assertIn("barrier", result["score_drop_overlap_signals"])

    def test_does_not_mutate_input_order(self):
        timeline = [
            {"date": "2026-06-02", "score": 3},
            {"date": "2026-06-01", "score": 4},
        ]
        original_timeline = list(timeline)
        handoffs = [
            {
                "date": "2026-06-02",
                "usable": True,
                "signals": {"barrier": 1},
            }
        ]
        build_medgemma_visual_trends(timeline, handoffs)
        self.assertEqual(timeline, original_timeline)



    def test_build_primary_visual_context_confidence_filter(self):
        from app.services.medgemma_trend_service import build_primary_visual_context
        import os
        os.environ["MEDGEMMA_PRIMARY_VISUAL_MIN_CONFIDENCE"] = "medium"
        os.environ["MEDGEMMA_INCLUDE_REVIEW_IN_PRIMARY"] = "false"

        handoffs = [
            {"date": "2026-06-10", "recommendation": "use", "usable": True, "confidence": "high", "signals": {"redness": 3}},
            {"date": "2026-06-11", "recommendation": "use", "usable": True, "confidence": "low", "signals": {"barrier": 3}},
            {"date": "2026-06-12", "recommendation": "review", "usable": True, "confidence": "medium", "signals": {"active_lesion": 3}}
        ]

        result = build_primary_visual_context([], handoffs)
        self.assertIsNotNone(result)
        self.assertEqual(result["total_days"], 3)
        self.assertEqual(result["usable_days"], 2)
        self.assertEqual(result["confidence"], "medium")

    def test_build_primary_visual_context_empty(self):
        from app.services.medgemma_trend_service import build_primary_visual_context
        self.assertIsNone(build_primary_visual_context([], []))

    def test_build_primary_visual_context_all_excluded(self):
        from app.services.medgemma_trend_service import build_primary_visual_context
        import os
        os.environ["MEDGEMMA_PRIMARY_VISUAL_MIN_CONFIDENCE"] = "medium"
        handoffs = [
            {"date": "2026-06-10", "recommendation": "use", "usable": True, "confidence": "low", "signals": {"redness": 3}}
        ]
        self.assertIsNone(build_primary_visual_context([], handoffs))

if __name__ == "__main__":
    unittest.main()
