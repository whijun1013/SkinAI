import unittest
from datetime import date

from app.services.concern_verdict_service import _determine_verdict, evaluate_concern_verdicts
from app.services.pattern_discovery import SKIN_SIGNALS


def _medgemma_skin(overall_score, redness_level):
    return {
        "overall_score": overall_score,
        "medgemma": {"signals": {"redness": redness_level}},
    }


class TestConcernVerdictService(unittest.TestCase):
    def setUp(self):
        self.factors = [
            {
                "factor_type": "behavior",
                "factor_key": "sleep_shortage",
                "label": "수면 부족",
                "source": "suspected_factor",
                "mentioned_as": "수면",
            }
        ]

    def test_evaluate_confirmed_verdict_using_medgemma_signal(self):
        context = {
            "meta": {"trigger_date": "2026-06-10"},
            "daily_timeline": [
                {"date": "2026-06-03", "skin": _medgemma_skin(4, "mild"), "behavior": {"sleep_hours": 8}},
                {"date": "2026-06-04", "skin": _medgemma_skin(4, "mild"), "behavior": {"sleep_hours": 8}},
                {"date": "2026-06-05", "skin": _medgemma_skin(4, "mild"), "behavior": {"sleep_hours": 8}},

                # Exposed days: redness worsens (level goes up)
                {"date": "2026-06-08", "skin": _medgemma_skin(2, "severe"), "behavior": {"sleep_hours": 4}},
                {"date": "2026-06-09", "skin": _medgemma_skin(2, "severe"), "behavior": {"sleep_hours": 4}},
                {"date": "2026-06-10", "skin": _medgemma_skin(2, "severe"), "behavior": {"sleep_hours": 4}},
            ]
        }
        verdicts = evaluate_concern_verdicts(self.factors, context)
        # 요인 1개 x 3신호 = 3개 판정
        self.assertEqual(len(verdicts), len(SKIN_SIGNALS))

        redness_verdict = next(v for v in verdicts if v["signal"] == "redness")
        self.assertEqual(redness_verdict["verdict"], "confirmed")
        self.assertEqual(redness_verdict["outcome_metric"], "medgemma:redness")
        self.assertEqual(redness_verdict["exposure_days"], 3)
        self.assertEqual(redness_verdict["comparison_days"], 3)
        self.assertGreaterEqual(redness_verdict["effect_size"], 0.7)

        # redness 외 신호는 관찰 데이터가 없으므로 inconclusive로 남되, 침묵하지 않고 항목은 유지된다.
        other_verdicts = [v for v in verdicts if v["signal"] != "redness"]
        self.assertEqual(len(other_verdicts), len(SKIN_SIGNALS) - 1)
        for verdict in other_verdicts:
            self.assertEqual(verdict["verdict"], "inconclusive")
            self.assertIsNone(verdict["effect_size"])

    def test_evaluate_fallback_to_overall_score_when_no_medgemma(self):
        context = {
            "meta": {"trigger_date": "2026-06-10"},
            "daily_timeline": [
                {"date": "2026-06-03", "skin": {"overall_score": 4}, "behavior": {"sleep_hours": 8}},
                {"date": "2026-06-04", "skin": {"overall_score": 4}, "behavior": {"sleep_hours": 8}},
                {"date": "2026-06-05", "skin": {"overall_score": 4}, "behavior": {"sleep_hours": 8}},

                {"date": "2026-06-08", "skin": {"overall_score": 3}, "behavior": {"sleep_hours": 4}},
                {"date": "2026-06-09", "skin": {"overall_score": 3}, "behavior": {"sleep_hours": 4}},
            ]
        }
        verdicts = evaluate_concern_verdicts(self.factors, context)
        self.assertEqual(len(verdicts), 1)
        verdict = verdicts[0]
        self.assertIsNone(verdict["signal"])
        self.assertEqual(verdict["outcome_metric"], "overall_score")
        self.assertEqual(verdict["verdict"], "partial")  # Effect size = 1.0, but only 2 exposure days

    def test_evaluate_inconclusive_due_to_missing_data(self):
        context = {
            "meta": {"trigger_date": "2026-06-10"},
            "daily_timeline": [
                {"date": "2026-06-10", "skin": {"overall_score": 2}, "behavior": {"sleep_hours": 4}},
            ]
        }
        verdicts = evaluate_concern_verdicts(self.factors, context)
        self.assertEqual(len(verdicts), 1)
        self.assertEqual(verdicts[0]["verdict"], "inconclusive")
        self.assertIsNone(verdicts[0]["effect_size"])

    def test_evaluate_low_verdict_no_effect(self):
        context = {
            "meta": {"trigger_date": "2026-06-10"},
            "daily_timeline": [
                {"date": "2026-06-03", "skin": {"overall_score": 4}, "behavior": {"sleep_hours": 8}},
                {"date": "2026-06-04", "skin": {"overall_score": 4}, "behavior": {"sleep_hours": 8}},
                {"date": "2026-06-05", "skin": {"overall_score": 4}, "behavior": {"sleep_hours": 8}},

                {"date": "2026-06-08", "skin": {"overall_score": 4}, "behavior": {"sleep_hours": 4}},
                {"date": "2026-06-09", "skin": {"overall_score": 4}, "behavior": {"sleep_hours": 4}},
                {"date": "2026-06-10", "skin": {"overall_score": 4}, "behavior": {"sleep_hours": 4}},
            ]
        }
        verdicts = evaluate_concern_verdicts(self.factors, context)
        self.assertEqual(len(verdicts), 1)
        self.assertEqual(verdicts[0]["verdict"], "low")
        self.assertEqual(verdicts[0]["effect_size"], 0.0)

    def test_verdict_threshold_boundaries_on_zero_to_three_scale(self):
        self.assertEqual(_determine_verdict(0.5, 3), "confirmed")
        self.assertEqual(_determine_verdict(0.5, 2), "partial")
        self.assertEqual(_determine_verdict(0.25, 2), "partial")
        self.assertEqual(_determine_verdict(0.24, 3), "weak")
        self.assertEqual(_determine_verdict(0.0, 3), "low")

    def test_daily_correlation_ignores_exposure_before_analysis_window(self):
        context = {
            "meta": {"trigger_date": "2026-06-10"},
            "analysis_window_start_date": "2026-06-08",
            "daily_timeline": [
                {"date": "2026-06-03", "skin": {"overall_score": 2}, "behavior": {"sleep_hours": 4}},
                {"date": "2026-06-04", "skin": {"overall_score": 2}, "behavior": {"sleep_hours": 4}},
                {"date": "2026-06-05", "skin": {"overall_score": 2}, "behavior": {"sleep_hours": 4}},
                {"date": "2026-06-08", "skin": {"overall_score": 4}, "behavior": {"sleep_hours": 8}},
                {"date": "2026-06-09", "skin": {"overall_score": 4}, "behavior": {"sleep_hours": 8}},
                {"date": "2026-06-10", "skin": {"overall_score": 4}, "behavior": {"sleep_hours": 8}},
            ],
        }

        verdicts = evaluate_concern_verdicts(self.factors, context)

        self.assertEqual(len(verdicts), 1)
        self.assertEqual(verdicts[0]["verdict"], "inconclusive")

    def test_before_after_keeps_data_before_analysis_window(self):
        context = {
            "meta": {"trigger_date": "2026-06-10"},
            "analysis_window_start_date": "2026-06-10",
            "factor_methods": {"sleep_hours": "before_after"},
            "factor_changepoints": {"sleep_hours": date(2026, 6, 8)},
            "daily_timeline": [
                {"date": "2026-06-03", "skin": _medgemma_skin(4, "mild"), "behavior": {"sleep_hours": 8}},
                {"date": "2026-06-04", "skin": _medgemma_skin(4, "mild"), "behavior": {"sleep_hours": 8}},
                {"date": "2026-06-05", "skin": _medgemma_skin(4, "mild"), "behavior": {"sleep_hours": 8}},
                {"date": "2026-06-08", "skin": _medgemma_skin(2, "severe"), "behavior": {"sleep_hours": 4}},
                {"date": "2026-06-09", "skin": _medgemma_skin(2, "severe"), "behavior": {"sleep_hours": 4}},
                {"date": "2026-06-10", "skin": _medgemma_skin(2, "severe"), "behavior": {"sleep_hours": 4}},
            ],
        }

        verdicts = evaluate_concern_verdicts(self.factors, context)
        redness = next(item for item in verdicts if item["signal"] == "redness")

        self.assertEqual(redness["analysis_method"], "before_after")
        self.assertEqual(redness["verdict"], "confirmed")

    def test_daily_window_falls_back_when_medgemma_exists_only_before_window(self):
        context = {
            "meta": {"trigger_date": "2026-06-14"},
            "analysis_window_start_date": "2026-06-08",
            "daily_timeline": [
                {"date": "2026-06-03", "skin": _medgemma_skin(4, "mild"), "behavior": {"sleep_hours": 8}},
                {"date": "2026-06-08", "skin": {"overall_score": 3}, "behavior": {"sleep_hours": 4}},
                {"date": "2026-06-09", "skin": {"overall_score": 3}, "behavior": {"sleep_hours": 4}},
                {"date": "2026-06-10", "skin": {"overall_score": 4}, "behavior": {"sleep_hours": 8}},
            ],
        }

        verdicts = evaluate_concern_verdicts(self.factors, context)

        self.assertEqual(len(verdicts), 1)
        self.assertIsNone(verdicts[0]["signal"])
        self.assertEqual(verdicts[0]["outcome_metric"], "overall_score")

if __name__ == "__main__":
    unittest.main()
