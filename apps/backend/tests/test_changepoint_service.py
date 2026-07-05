import unittest

from app.services.changepoint_service import _cusum


class TestCusum(unittest.TestCase):
    def test_returns_actual_start_of_sustained_one_grade_increase(self):
        self.assertEqual(_cusum([0.0] * 7 + [1.0] * 3), 7)

    def test_detects_both_increase_and_decrease_at_boundary(self):
        self.assertEqual(_cusum([0.0] * 7 + [2.0] * 7), 7)
        self.assertEqual(_cusum([3.0] * 7 + [1.0] * 7), 7)

    def test_ignores_flat_series_and_isolated_spike(self):
        self.assertIsNone(_cusum([1.0] * 14))
        self.assertIsNone(_cusum([0.0] * 6 + [3.0] + [0.0] * 7))

    def test_requires_minimum_data_and_segment_days(self):
        self.assertIsNone(_cusum([0.0] * 4 + [2.0] * 2))
        self.assertIsNone(_cusum([0.0] * 12 + [2.0] * 2))

    def test_standardized_factor_detection_is_scale_independent(self):
        small_scale = _cusum(
            [3.0] * 7 + [6.0] * 7,
            k=0.5,
            h=4.0,
            standardize=True,
        )
        large_scale = _cusum(
            [30.0] * 7 + [60.0] * 7,
            k=0.5,
            h=4.0,
            standardize=True,
        )
        self.assertEqual(small_scale, 7)
        self.assertEqual(large_scale, 7)


if __name__ == "__main__":
    unittest.main()
