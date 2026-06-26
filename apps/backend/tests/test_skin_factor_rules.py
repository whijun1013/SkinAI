import unittest
from app.services.skin_factor_rules import calculate_skin_factors_from_raw_material_text, calculate_skin_factors

class TestSkinFactorRules(unittest.TestCase):
    def setUp(self):
        self.dictionary = [
            {
                "name": "탈지분유",
                "normalized_name": "탈지분유",
                "aliases": ["skim milk powder"],
                "skin_factors": [
                    {
                        "key": "dairy_confirmed",
                        "label": "유제품",
                        "level": "high",
                        "confidence": "high",
                        "source": "raw_material_dictionary"
                    }
                ]
            },
            {
                "name": "유청분말",
                "normalized_name": "유청분말",
                "aliases": ["whey powder"],
                "skin_factors": [
                    {
                        "key": "dairy_confirmed",
                        "label": "유제품",
                        "level": "high",
                        "confidence": "high",
                        "source": "raw_material_dictionary"
                    }
                ]
            },
            {
                "name": "크림향",
                "normalized_name": "크림향",
                "aliases": [],
                "skin_factors": [
                    {
                        "key": "possible_dairy",
                        "label": "유제품(추정)",
                        "level": "medium",
                        "confidence": "low",
                        "source": "raw_material_dictionary"
                    }
                ]
            }
        ]

    def test_calculate_skin_factors_from_raw_material_text(self):
        # 1. 원재료 텍스트 "탈지분유, 유청분말" -> dairy_confirmed
        text = "탈지분유, 유청분말, 설탕"
        factors = calculate_skin_factors_from_raw_material_text(text, self.dictionary)
        self.assertEqual(len(factors), 1)
        self.assertEqual(factors[0]["key"], "dairy_confirmed")
        self.assertIn("raw_material:탈지분유", factors[0]["evidence"])
        self.assertIn("raw_material:유청분말", factors[0]["evidence"])

        # 2. 원재료 텍스트 "크림향, 설탕" -> possible_dairy
        text2 = "크림향, 설탕"
        factors2 = calculate_skin_factors_from_raw_material_text(text2, self.dictionary)
        self.assertEqual(len(factors2), 1)
        self.assertEqual(factors2[0]["key"], "possible_dairy")
        self.assertIn("raw_material:크림향", factors2[0]["evidence"])

        # 3. 빈 원재료 텍스트 -> 빈 배열
        factors3 = calculate_skin_factors_from_raw_material_text("", self.dictionary)
        self.assertEqual(factors3, [])
        
        # 4. 일치하는 것 없음
        factors4 = calculate_skin_factors_from_raw_material_text("밀가루, 소금", self.dictionary)
        self.assertEqual(factors4, [])
        
        # 5. 괄호 파싱 테스트: "카제인나트륨(우유)" -> dairy_confirmed
        text5 = "카제인나트륨(우유)"
        factors5 = calculate_skin_factors_from_raw_material_text(text5, self.dictionary)
        # 괄호 안의 우유가 추출되어야 함 (위 dictionary에 우유는 없지만, 만약 우유가 있다면 dairy_confirmed)
        # 우리 테스트용 dictionary엔 우유가 없음! 탈지분유로 대체 테스트.
        text5_alt = "카제인나트륨(탈지분유)"
        factors5_alt = calculate_skin_factors_from_raw_material_text(text5_alt, self.dictionary)
        self.assertEqual(len(factors5_alt), 1)
        self.assertEqual(factors5_alt[0]["key"], "dairy_confirmed")
        self.assertIn("raw_material:탈지분유", factors5_alt[0]["evidence"])

    def test_legacy_calculate_skin_factors(self):
        # 치즈케이크 -> possible_dairy (이전엔 치즈 키워드 때문에 confirmed였으나 이젠 possible_dairy만)
        factors = calculate_skin_factors(name="치즈케이크")
        keys = [f["key"] for f in factors]
        self.assertNotIn("dairy_confirmed", keys)
        self.assertIn("possible_dairy", keys)

        # 우유 -> possible_dairy
        factors2 = calculate_skin_factors(name="우유")
        keys2 = [f["key"] for f in factors2]
        self.assertNotIn("dairy_confirmed", keys2)
        self.assertIn("possible_dairy", keys2)

    def test_nutrition_rules(self):
        # High Sugar
        factors = calculate_skin_factors(name="test", sugar=18.0)
        self.assertEqual(factors[0]["key"], "high_sugar")
        self.assertEqual(factors[0]["level"], "high")

        factors = calculate_skin_factors(name="test", sugar=15.0)
        self.assertEqual(factors[0]["key"], "high_sugar")
        self.assertEqual(factors[0]["level"], "medium")

        # High Fat
        factors = calculate_skin_factors(name="test", fat=9.0)
        self.assertEqual(factors[0]["key"], "high_fat")
        self.assertEqual(factors[0]["level"], "high")

        # High Saturated Fat
        factors = calculate_skin_factors(name="test", saturated_fat=3.0)
        self.assertEqual(factors[0]["key"], "high_saturated_fat")
        self.assertEqual(factors[0]["level"], "high")

        factors = calculate_skin_factors(name="test", saturated_fat=1.5)
        keys = [f["key"] for f in factors]
        self.assertNotIn("high_saturated_fat", keys)

        # Trans Fat Present
        factors = calculate_skin_factors(name="test", trans_fat=0.2)
        self.assertEqual(factors[0]["key"], "trans_fat_present")
        self.assertEqual(factors[0]["level"], "high")

        # High Sodium
        factors = calculate_skin_factors(name="test", sodium=650.0)
        self.assertEqual(factors[0]["key"], "high_sodium")
        self.assertEqual(factors[0]["level"], "high")

        factors = calculate_skin_factors(name="test", sodium=500.0)
        self.assertEqual(factors[0]["key"], "high_sodium")
        self.assertEqual(factors[0]["level"], "medium")

if __name__ == "__main__":
    unittest.main()
