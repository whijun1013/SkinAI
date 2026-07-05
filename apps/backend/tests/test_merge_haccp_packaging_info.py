from data_tools.merge_haccp_packaging_info import merge_food_with_haccp, normalize_name


def test_normalize_name_for_haccp_matching():
    assert normalize_name("바나나맛 우유 (프로모션)") == "바나나맛우유"


def test_merge_haccp_by_name_adds_brand_barcode_and_raw_fields():
    food_items = [
        {
            "name": "바나나맛 우유",
            "source": "curated_skin_factor",
            "skin_factors": [{"key": "high_sugar", "evidence": ["nutrition:sugar"]}],
        }
    ]
    haccp_items = [
        {
            "product_name": "바나나맛 우유",
            "barcode": "8801000000000",
            "manufacturer": "테스트제조",
            "seller": "테스트브랜드",
            "product_type": "유가공품",
            "raw_material_text": "원유, 설탕",
            "allergen_text": "우유",
            "skin_factors": [{"key": "dairy_confirmed", "evidence": ["allergen:우유"], "confidence": "high"}],
        }
    ]

    merged, stats = merge_food_with_haccp(food_items, haccp_items)
    item = merged[0]

    assert stats["matched_by_name"] == 1
    assert item["barcode"] == "8801000000000"
    assert item["brand"] == "테스트브랜드"
    assert item["product_type"] == "유가공품"
    assert item["raw_material_text"] == "원유, 설탕"
    assert item["allergen_text"] == "우유"
    assert {factor["key"] for factor in item["skin_factors"]} == {"high_sugar", "dairy_confirmed"}


def test_merge_haccp_by_barcode_preserves_existing_brand():
    food_items = [{"name": "다른 이름", "barcode": "123", "brand": "기존브랜드"}]
    haccp_items = [{"product_name": "HACCP 이름", "barcode": "123", "seller": "신규브랜드"}]

    merged, stats = merge_food_with_haccp(food_items, haccp_items)

    assert stats["matched_by_barcode"] == 1
    assert merged[0]["brand"] == "기존브랜드"
