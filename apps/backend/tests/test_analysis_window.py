import unittest
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services.analysis_orchestrator import (
    BASE_ANALYSIS_LOOKBACK_DAYS,
    _resolve_analysis_window_start,
    create_analysis_request,
)


class TestAnalysisWindow(unittest.TestCase):
    def test_default_window_is_fourteen_dates_including_target(self):
        target = date(2026, 6, 14)
        self.assertEqual(
            _resolve_analysis_window_start(target, None),
            date(2026, 6, 1),
        )

    def test_ignores_future_and_out_of_range_changepoints(self):
        target = date(2026, 6, 14)
        self.assertEqual(
            _resolve_analysis_window_start(target, date(2026, 6, 15)),
            date(2026, 6, 1),
        )
        self.assertEqual(
            _resolve_analysis_window_start(target, date(2026, 5, 31)),
            date(2026, 6, 1),
        )

    def test_recent_changepoint_does_not_shorten_window(self):
        target = date(2026, 6, 14)
        self.assertEqual(
            _resolve_analysis_window_start(
                target,
                datetime(2026, 6, 12, 10, 0),
            ),
            date(2026, 6, 1),
        )

    def test_normalizes_datetime_target_and_keeps_fourteen_day_window(self):
        self.assertEqual(
            _resolve_analysis_window_start(
                datetime(2026, 6, 14, 10, 30),
                date(2026, 6, 12),
            ),
            date(2026, 6, 1),
        )

    @patch("app.services.analysis_orchestrator._ensure_enough_skin_log_days")
    @patch("app.services.analysis_orchestrator.get_user_changepoint_summary")
    @patch("app.services.analysis_orchestrator._ensure_no_duplicate_request")
    @patch("app.services.analysis_orchestrator._get_owned_skin_log")
    def test_request_always_uses_base_window_not_changepoint_or_argument(
        self,
        mock_get_skin_log,
        mock_no_duplicate,
        mock_changepoint,
        mock_ensure_enough,
    ):
        target = date(2026, 6, 14)
        mock_get_skin_log.return_value = SimpleNamespace(logged_at=target)
        mock_changepoint.return_value = {
            "window_start_date": date(2026, 6, 12),
        }
        db = MagicMock()

        request = create_analysis_request(
            db,
            user_id=1,
            skin_log_id=10,
            lookback_days=3,
        )

        self.assertEqual(request.lookback_days, BASE_ANALYSIS_LOOKBACK_DAYS)
        mock_changepoint.assert_not_called()
        mock_ensure_enough.assert_called_once_with(
            db,
            1,
            target,
            BASE_ANALYSIS_LOOKBACK_DAYS,
        )


if __name__ == "__main__":
    unittest.main()
