import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data_tools.build_curated_food_items import (
    count_nutrition_nulls,
    dedupe_items,
    extract_factors_from_allergen_text,
    merge_skin_factors,
    normalize_name,
)


class TestBuildCuratedFoodItems(unittest.TestCase):
    def test_normalize_name(self):
        self.assertEqual(normalize_name("  소 고 기  "), "소고기")
        self.assertEqual(normalize_name("Milk"), "milk")
        self.assertEqual(normalize_name(None), "")

    def test_count_nutrition_nulls(self):
        item1 = {"nutrition": {"calories": 100, "protein": 10, "fat": None, "carbohydrate": None, "sugar": None, "sodium": None}}
        self.assertEqual(count_nutrition_nulls(item1), 6)

        item2 = {"nutrition": None}
        self.assertEqual(count_nutrition_nulls(item2), 8)

    def test_dedupe_items_preserves_raw_text_from_duplicate(self):
        items = [
            {
                "id": 1,
                "api_food_code": "code1",
                "name": "라면",
                "normalized_name": "라면",
                "source": "public_api",
                "category": "분식",
                "nutrition": {"calories": 100, "protein": 10},
                "raw_material_text": "면, 분말스프",
            },
            {
                "id": 2,
                "api_food_code": None,
                "name": "라 면",
                "normalized_name": "라면",
                "source": "curated_skin_factor",
                "category": "면류",
                "nutrition": {"calories": 100, "protein": 10, "fat": 5, "carbohydrate": 20, "sugar": 1, "sodium": 500}
            },
            {
                "id": 3,
                "api_food_code": "code2",
                "name": "라면 (매운맛)",
                "normalized_name": "라면",
                "source": "public_api",
                "category": None,
                "nutrition": {"calories": 100}
            }
        ]

        deduped = dedupe_items(items)
        self.assertEqual(len(deduped), 1)
        self.assertEqual(deduped[0]["id"], 2)
        self.assertEqual(deduped[0]["raw_material_text"], "면, 분말스프")

    def test_dedupe_items_recalculates_nutrition_factors_from_final_nutrition(self):
        items = [
            {
                "api_food_code": "code1",
                "name": "sample food",
                "normalized_name": "samplefood",
                "dedupe_name": "samplefood",
                "source": "public_api",
                "category": "",
                "nutrition": {"saturated_fat": 3.0},
                "skin_factors": [
                    {
                        "key": "high_saturated_fat",
                        "label": "high saturated fat",
                        "source": "nutrition_rule",
                        "evidence": ["saturated_fat 3.0g"],
                    }
                ],
            },
            {
                "api_food_code": "code2",
                "name": "sample food",
                "normalized_name": "samplefood",
                "dedupe_name": "samplefood",
                "source": "public_api",
                "category": "",
                "nutrition": {
                    "calories": 100,
                    "protein": 5,
                    "fat": 4,
                    "saturated_fat": 1.0,
                    "trans_fat": 0,
                    "carbohydrate": 10,
                    "sugar": 1,
                    "sodium": 100,
                },
                "skin_factors": [],
            },
        ]

        deduped = dedupe_items(items)
        keys = [factor["key"] for factor in deduped[0]["skin_factors"]]
        self.assertEqual(deduped[0]["nutrition"]["saturated_fat"], 1.0)
        self.assertNotIn("high_saturated_fat", keys)

    def test_dedupe_items_removes_duplicate_api_food_codes(self):
        items = [
            {
                "id": 1,
                "api_food_code": "same-code",
                "name": "대표 음식",
                "source": "curated_skin_factor",
                "category": "음식",
                "nutrition": {"calories": 100},
                "skin_factors": [],
            },
            {
                "id": 2,
                "api_food_code": "same-code",
                "name": "잘못 연결된 다른 이름",
                "source": "public_api",
                "category": "기타",
                "nutrition": {},
                "skin_factors": [],
            },
        ]

        deduped = dedupe_items(items)

        self.assertEqual(len(deduped), 1)
        self.assertEqual(deduped[0]["id"], 1)
        self.assertEqual(deduped[0]["api_food_code"], "same-code")

    def test_extract_factors_from_allergen_text_uses_allergen_source(self):
        factors = extract_factors_from_allergen_text("대두, 우유 함유")

        self.assertEqual(len(factors), 1)
        self.assertEqual(factors[0]["key"], "dairy_confirmed")
        self.assertEqual(factors[0]["source"], "haccp_allergen_text")
        self.assertIn("allergen:우유", factors[0]["evidence"])

    def test_merge_skin_factors_merges_raw_and_allergen_evidence(self):
        raw_factor = {
            "key": "dairy_confirmed",
            "label": "유제품",
            "level": "high",
            "confidence": "high",
            "source": "raw_material_dictionary",
            "evidence": ["raw_material:탈지분유"],
        }
        allergen_factor = extract_factors_from_allergen_text("우유")[0]

        merged = merge_skin_factors([], [raw_factor, allergen_factor])

        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["key"], "dairy_confirmed")
        self.assertIn("raw_material:탈지분유", merged[0]["evidence"])
        self.assertIn("allergen:우유", merged[0]["evidence"])

    def test_dairy_confirmed_removes_possible_dairy(self):
        factors = [
            {"key": "possible_dairy", "label": "유제품(추정)", "source": "keyword_rule"},
        ]
        text_factors = extract_factors_from_allergen_text("우유")

        merged = merge_skin_factors(factors, text_factors)

        keys = {factor["key"] for factor in merged}
        self.assertNotIn("possible_dairy", keys)
        self.assertIn("dairy_confirmed", keys)

    def test_extract_nutrition_includes_saturated_and_trans_fat(self):
        from data_tools.build_curated_food_items import extract_nutrition
        
        item = {
            "nutrition": {
                "calories": 100,
                "protein": 10,
                "fat": 5,
                "saturated_fat": 2.5,
                "trans_fat": 0.2,
                "carbohydrate": 20,
                "sugar": 1,
                "sodium": 500
            }
        }
        
        nut = extract_nutrition(item)
        self.assertEqual(nut["saturated_fat"], 2.5)
        self.assertEqual(nut["trans_fat"], 0.2)



    def test_is_searchable_food_item(self):
        from data_tools.build_curated_food_items import is_searchable_food_item
        
        self.assertFalse(is_searchable_food_item({'name': '딸기파우더', 'category': '기타가공품'}))
        self.assertFalse(is_searchable_food_item({'name': '크림치즈폼파우더', 'category': '기타가공품'}))
        self.assertFalse(is_searchable_food_item({'name': '아이스크림믹스', 'category': '아이스크림믹스류'}))
        self.assertFalse(is_searchable_food_item({'name': '초코시트', 'category': '빵류'}))
        self.assertFalse(is_searchable_food_item({'name': '냉동생지', 'category': '빵류'}))
        self.assertFalse(is_searchable_food_item({'name': '슈크림빵생지', 'category': '빵류'}))
        self.assertFalse(is_searchable_food_item({'name': '치킨농축액', 'category': '식육추출가공품'}))
        self.assertFalse(is_searchable_food_item({'name': '인스턴트누들 치킨향(합성향료 함유)', 'category': '면류'}))
        self.assertFalse(is_searchable_food_item({'name': '마늘소스', 'category': '소스류'}))
        self.assertFalse(is_searchable_food_item({'name': '토마토소스', 'category': '소스류'}))
        self.assertFalse(is_searchable_food_item({'name': '돈까스소스', 'category': '조리식품'}))
        self.assertFalse(is_searchable_food_item({'name': '치즈소스 치킨', 'category': '소스류'})) # category has 소스
        self.assertTrue(is_searchable_food_item({'name': '크림빵', 'category': '빵류'}))
        self.assertTrue(is_searchable_food_item({'name': '토마토소스파스타', 'category': '조리식품'}))
        self.assertTrue(is_searchable_food_item({'name': '치킨', 'category': '조리식품'}))
        self.assertTrue(is_searchable_food_item({'name': '김치찌개', 'category': '조리식품'}))

if __name__ == "__main__":
    unittest.main()
