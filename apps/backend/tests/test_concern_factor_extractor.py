import unittest
from app.services.concern_factor_extractor import extract_concern_factors


class TestConcernFactorExtractor(unittest.TestCase):
    def test_extract_from_concern_note(self):
        factors = extract_concern_factors("요즘 피곤해서 단것을 많이 먹었어요")
        keys = [f["factor_key"] for f in factors]
        self.assertIn("sleep_shortage", keys)
        self.assertIn("high_sugar", keys)
        for factor in factors:
            self.assertEqual(factor["source"], "concern_note")

    def test_extract_single_keyword(self):
        factors = extract_concern_factors("스트레스가 심했던 것 같아요")
        keys = [f["factor_key"] for f in factors]
        self.assertIn("stress_high", keys)

    def test_extract_empty_or_none(self):
        self.assertEqual(extract_concern_factors(""), [])
        self.assertEqual(extract_concern_factors(None), [])

    def test_no_duplicate_keys(self):
        factors = extract_concern_factors("잠도 못 자고 수면이 부족했어요")
        keys = [f["factor_key"] for f in factors]
        self.assertEqual(len(keys), len(set(keys)))


if __name__ == "__main__":
    unittest.main()
