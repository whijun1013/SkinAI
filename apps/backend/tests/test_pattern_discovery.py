import os
import sys
import unittest
from datetime import date, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.pattern_discovery import (
    _evidence_level,
    _evidence_level_before_after,
    discover_patterns,
)


def _skin_day(logged_at: date, score: int, *, foods=None, sleep_hours=None, stress_level=None):
    behavior = None
    if sleep_hours is not None or stress_level is not None:
        behavior = {}
        if sleep_hours is not None:
            behavior["sleep_hours"] = sleep_hours
        if stress_level is not None:
            behavior["stress_level"] = stress_level
    return {
        "date": logged_at.isoformat(),
        "skin": {"overall_score": score},
        "diet": [{"meal": "점심", "foods": foods or []}] if foods else [],
        "environment": None,
        "behavior": behavior,
    }


def _skin_day_with_signals(
    logged_at: date,
    *,
    active_lesion: str = "none",
    redness: str = "none",
    barrier: str = "none",
    foods=None,
    sleep_hours=None,
    stress_level=None,
):
    """MedGemma 신호 포함 타임라인 항목 생성."""
    behavior = None
    if sleep_hours is not None or stress_level is not None:
        behavior = {}
        if sleep_hours is not None:
            behavior["sleep_hours"] = sleep_hours
        if stress_level is not None:
            behavior["stress_level"] = stress_level
    return {
        "date": logged_at.isoformat(),
        "skin": {
            "overall_score": None,
            "medgemma": {
                "signals": {
                    "active_lesion": active_lesion,
                    "redness": redness,
                    "barrier": barrier,
                }
            },
        },
        "diet": [{"meal": "점심", "foods": foods or []}] if foods else [],
        "environment": None,
        "behavior": behavior,
    }


def _food(*, tags=None, flags=None, skin_factors=None):
    return {
        "name": "test food",
        "skin_tags": tags or [],
        "flags": flags or [],
        "skin_factors": skin_factors or [],
    }


class TestPatternDiscovery(unittest.TestCase):
    def _context(self, timeline):
        return {
            "meta": {
                "trigger_date": "2026-06-01",
            },
            "daily_timeline": timeline,
        }

    # ── overall_score fallback 경로 ───────────────────────────────────────────

    def test_discovers_supported_mvp_candidates_with_structured_evidence(self):
        start = date(2026, 5, 19)
        exposure_offsets = {0, 4, 8}
        low_score_offsets = {1, 2, 3, 5, 6, 7, 9, 10, 11}
        timeline = []
        for offset in range(14):
            logged_at = start + timedelta(days=offset)
            foods = []
            sleep_hours = 7
            if offset in exposure_offsets:
                foods = [
                    _food(
                        tags=["고당류", "고나트륨"],
                        flags=["유제품", "고혈당지수"],
                    )
                ]
                sleep_hours = 5
            score = 2 if offset in low_score_offsets else 4
            timeline.append(_skin_day(logged_at, score, foods=foods, sleep_hours=sleep_hours))

        result = discover_patterns(self._context(timeline))

        by_key = {item["factor_key"]: item for item in result}
        self.assertEqual(
            set(by_key),
            {"high_sugar", "dairy", "high_gi", "sleep_shortage"},
        )
        high_sugar = by_key["high_sugar"]
        self.assertEqual(high_sugar["factor_type"], "food")
        self.assertEqual(high_sugar["label"], "고당류")
        self.assertEqual(high_sugar["evidence_level"], "strong")
        self.assertEqual(high_sugar["trigger_day"], "2026-06-01")
        self.assertEqual(high_sugar["lag_min_days"], 1)
        self.assertEqual(high_sugar["lag_max_days"], 3)
        self.assertEqual(high_sugar["exposure_days"], 3)
        self.assertGreaterEqual(high_sugar["comparison_days"], 3)
        self.assertGreaterEqual(high_sugar["effect_size"], 0.7)
        self.assertGreaterEqual(high_sugar["direction_consistency"], 0.6)
        self.assertIn("최근 기록에서 고당류 이후 1~3일 사이", high_sugar["pattern"])
        self.assertIsNotNone(high_sugar["confounder_notes"])
        # fallback 경로: affected_signal 없음
        self.assertIsNone(high_sugar["affected_signal"])

        sleep = by_key["sleep_shortage"]
        self.assertEqual(sleep["factor_type"], "behavior")
        self.assertEqual(sleep["label"], "수면 부족")
        self.assertEqual(sleep["lag_min_days"], 0)
        self.assertEqual(sleep["lag_max_days"], 2)

    def test_discovers_new_db_food_factor_keys_without_legacy_labels(self):
        start = date(2026, 5, 19)
        exposure_offsets = {0, 4, 8}
        response_offsets = {1, 2, 3, 5, 6, 7, 9, 10, 11}
        timeline = []
        for offset in range(14):
            foods = []
            if offset in exposure_offsets:
                foods = [
                    _food(
                        skin_factors=[
                            {"key": "possible_dairy", "label": "유제품(추정)"},
                            {"key": "high_gl_candidate", "label": "고혈당지수(추정)"},
                        ]
                    )
                ]
            score = 2 if offset in response_offsets else 4
            timeline.append(_skin_day(start + timedelta(days=offset), score, foods=foods))

        result = discover_patterns(self._context(timeline))

        by_key = {item["factor_key"]: item for item in result}
        self.assertIn("dairy", by_key)
        self.assertIn("high_gi", by_key)

    def test_uses_weak_level_when_exposure_exists_without_score_evidence(self):
        start = date(2026, 5, 19)
        timeline = [
            _skin_day(
                start,
                4,
                foods=[_food(tags=["고당류"])],
            )
        ]

        result = discover_patterns(self._context(timeline))

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["factor_key"], "high_sugar")
        self.assertEqual(result[0]["evidence_level"], "weak")
        self.assertEqual(result[0]["comparison_days"], 0)
        self.assertIn("비교 가능한 피부 기록이 아직 부족", result[0]["evidence"])

    def test_returns_empty_without_trigger_day(self):
        result = discover_patterns(
            {
                "meta": {},
                "daily_timeline": [
                    _skin_day(
                        date(2026, 5, 19),
                        4,
                        foods=[_food(flags=["유제품"])],
                    )
                ],
            }
        )

        self.assertEqual(result, [])

    # ── MedGemma 3신호 경로 ───────────────────────────────────────────────────

    def test_uses_medgemma_signals_when_available(self):
        """MedGemma 신호가 있으면 overall_score 대신 신호를 사용한다."""
        start = date(2026, 5, 19)
        exposure_offsets = {0, 4, 8}
        timeline = []
        for offset in range(14):
            logged_at = start + timedelta(days=offset)
            foods = [_food(tags=["고당류"])] if offset in exposure_offsets else []
            # 노출 다음 날 active_lesion 상승
            active_lesion = "severe" if offset in {1, 5, 9} else "none"
            timeline.append(
                _skin_day_with_signals(logged_at, active_lesion=active_lesion, foods=foods)
            )

        result = discover_patterns(self._context(timeline))

        by_key = {item["factor_key"]: item for item in result}
        self.assertIn("high_sugar", by_key)
        high_sugar = by_key["high_sugar"]
        self.assertEqual(high_sugar["affected_signal"], "active_lesion")
        self.assertEqual(high_sugar["affected_signal_label"], "여드름/뾰루지")
        self.assertGreater(high_sugar["effect_size"], 0)

    def test_picks_strongest_signal_per_factor(self):
        """factor × 신호 조합 중 effect_size가 가장 큰 신호를 선택한다."""
        start = date(2026, 5, 19)
        exposure_offsets = {0, 4, 8}
        timeline = []
        for offset in range(14):
            logged_at = start + timedelta(days=offset)
            foods = [_food(tags=["고당류"])] if offset in exposure_offsets else []
            # active_lesion은 약하게, redness는 강하게 반응
            active_lesion = "mild" if offset in {1, 5, 9} else "none"
            redness = "severe" if offset in {1, 5, 9} else "none"
            timeline.append(
                _skin_day_with_signals(
                    logged_at,
                    active_lesion=active_lesion,
                    redness=redness,
                    foods=foods,
                )
            )

        result = discover_patterns(self._context(timeline))

        by_key = {item["factor_key"]: item for item in result}
        self.assertIn("high_sugar", by_key)
        # redness가 더 강하게 반응했으므로 redness가 선택되어야 함
        self.assertEqual(by_key["high_sugar"]["affected_signal"], "redness")

    def test_barrier_uses_ordinal_signal(self):
        """barrier ordinal 신호를 분석용 점수로 변환한다."""
        start = date(2026, 5, 19)
        exposure_offsets = {0, 4, 8}
        timeline = []
        for offset in range(14):
            logged_at = start + timedelta(days=offset)
            sleep_hours = 4 if offset in exposure_offsets else 8
            barrier = "severe" if offset in {1, 5, 9} else "none"
            timeline.append(
                _skin_day_with_signals(logged_at, barrier=barrier, sleep_hours=sleep_hours)
            )

        result = discover_patterns(self._context(timeline))

        by_key = {item["factor_key"]: item for item in result}
        self.assertIn("sleep_shortage", by_key)
        sleep = by_key["sleep_shortage"]
        self.assertEqual(sleep["affected_signal"], "barrier")

    def test_evidence_threshold_boundaries_on_zero_to_three_scale(self):
        self.assertEqual(
            _evidence_level(
                exposure_days=3,
                comparison_days=3,
                effect_size=0.7,
                direction_consistency=0.6,
            ),
            "strong",
        )
        self.assertEqual(
            _evidence_level(
                exposure_days=2,
                comparison_days=2,
                effect_size=0.4,
                direction_consistency=0.5,
            ),
            "moderate",
        )
        self.assertEqual(
            _evidence_level(
                exposure_days=3,
                comparison_days=3,
                effect_size=0.39,
                direction_consistency=1.0,
            ),
            "weak",
        )
        self.assertEqual(_evidence_level_before_after(3, 3, 0.7), "strong")
        self.assertEqual(_evidence_level_before_after(3, 3, 0.4), "moderate")
        self.assertEqual(_evidence_level_before_after(2, 3, 0.7), "weak")

    def test_daily_patterns_ignore_exposure_before_analysis_window(self):
        start = date(2026, 5, 28)
        timeline = []
        for offset in range(14):
            logged_at = start + timedelta(days=offset)
            foods = [_food(tags=["고당류"])] if offset in {0, 1, 2} else []
            timeline.append(_skin_day(logged_at, 4, foods=foods))

        context = self._context(timeline)
        context["analysis_window_start_date"] = "2026-06-08"
        result = discover_patterns(context)

        self.assertNotIn("high_sugar", {item["factor_key"] for item in result})

    def test_before_after_patterns_keep_full_base_timeline(self):
        start = date(2026, 6, 3)
        timeline = []
        for offset in range(8):
            logged_at = start + timedelta(days=offset)
            barrier = "mild" if offset < 5 else "severe"
            timeline.append(
                _skin_day_with_signals(
                    logged_at,
                    barrier=barrier,
                    sleep_hours=8 if offset < 5 else 4,
                )
            )

        context = self._context(timeline)
        context["analysis_window_start_date"] = "2026-06-10"
        context["factor_methods"] = {"sleep_hours": "before_after"}
        context["factor_changepoints"] = {"sleep_hours": date(2026, 6, 8)}
        result = discover_patterns(context)
        sleep = next(item for item in result if item["factor_key"] == "sleep_shortage")

        self.assertEqual(sleep["analysis_method"], "before_after")
        self.assertEqual(sleep["affected_signal"], "barrier")

    def test_falls_back_to_overall_score_when_no_signals(self):
        """MedGemma 신호가 없으면 overall_score fallback을 사용한다."""
        start = date(2026, 5, 19)
        timeline = []
        for offset in range(14):
            logged_at = start + timedelta(days=offset)
            foods = [_food(tags=["고당류"])] if offset in {0, 4, 8} else []
            score = 2 if offset in {1, 2, 3, 5, 6, 7, 9, 10, 11} else 5
            timeline.append(_skin_day(logged_at, score, foods=foods))

        result = discover_patterns(self._context(timeline))

        by_key = {item["factor_key"]: item for item in result}
        self.assertIn("high_sugar", by_key)
        self.assertIsNone(by_key["high_sugar"]["affected_signal"])

    def test_excludes_p2_factor_keys(self):
        """excluded_factor_keys에 포함된 요인은 P3 결과에서 제외된다."""
        start = date(2026, 5, 19)
        exposure_offsets = {0, 4, 8}
        timeline = []
        for offset in range(14):
            logged_at = start + timedelta(days=offset)
            foods = [_food(tags=["고당류"], flags=["유제품"])] if offset in exposure_offsets else []
            score = 2 if offset in {1, 2, 3, 5, 6, 7, 9, 10, 11} else 5
            timeline.append(_skin_day(logged_at, score, foods=foods))

        result = discover_patterns(
            self._context(timeline),
            excluded_factor_keys={"high_sugar"},
        )

        keys = {item["factor_key"] for item in result}
        self.assertNotIn("high_sugar", keys)
        self.assertIn("dairy", keys)


if __name__ == "__main__":
    unittest.main()
