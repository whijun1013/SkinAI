import os
import sys
import unittest

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.medgemma_trend_service import (
    build_medgemma_visual_trends,
    build_primary_visual_context,
)


def _handoff(date, active="none", redness="none", barrier="none", **extra):
    return {
        "date": date,
        "signals": {
            "active_lesion": active,
            "redness": redness,
            "barrier": barrier,
        },
        **extra,
    }


class TestMedGemmaTrendService(unittest.TestCase):
    def test_empty_or_explicitly_unusable_results_are_excluded(self):
        self.assertIsNone(build_medgemma_visual_trends([], []))
        self.assertIsNone(
            build_medgemma_visual_trends(
                [], [_handoff("2026-06-10", redness="severe", usable=False)]
            )
        )

    def test_missing_usable_defaults_to_gateway_accepted(self):
        result = build_medgemma_visual_trends(
            [], [_handoff("2026-06-10", redness="moderate")]
        )
        self.assertEqual(result["usable_days"], 1)
        self.assertEqual(result["dominant_signals"], ["redness"])

    def test_moderate_average_or_severe_peak_is_dominant(self):
        handoffs = [
            _handoff("2026-06-10", redness="mild", barrier="none"),
            _handoff("2026-06-11", redness="severe", barrier="severe"),
            _handoff("2026-06-12", redness="moderate", barrier="none"),
        ]
        result = build_medgemma_visual_trends([], handoffs)
        self.assertEqual(set(result["dominant_signals"]), {"redness", "barrier"})

    def test_worsening_uses_ordinal_order(self):
        handoffs = [
            _handoff("2026-06-10", active="none"),
            _handoff("2026-06-11", active="mild"),
            _handoff("2026-06-12", active="moderate"),
            _handoff("2026-06-13", active="severe"),
        ]
        result = build_medgemma_visual_trends(
            [{"date": "2026-06-10", "score": 4}, {"date": "2026-06-13", "score": 2}],
            handoffs,
        )
        self.assertIn("active_lesion", result["worsened_signals"])
        self.assertIn("active_lesion", result["score_drop_overlap_signals"])

    def test_invalid_levels_are_not_silently_treated_as_none(self):
        result = build_medgemma_visual_trends(
            [], [_handoff("2026-06-10", redness="high")]
        )
        self.assertEqual(result["dominant_signals"], [])

    def test_primary_context_has_no_model_confidence(self):
        result = build_primary_visual_context(
            [], [_handoff("2026-06-10", barrier="moderate")]
        )
        self.assertEqual(result["role"], "primary_skin_visual_interpretation")
        self.assertNotIn("confidence", result)


if __name__ == "__main__":
    unittest.main()
