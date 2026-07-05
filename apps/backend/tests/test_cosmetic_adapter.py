from app.adapters.primary_retailer_crawler_adapter import (
    clean_product_name,
    is_cosmetic_product_name,
    normalize_name,
)


def test_primary_retailer_adapter_clean_name():
    assert clean_product_name("[1+1 기획] Test Product 50ml 기획세트") == "Test Product"
    assert clean_product_name("Test Product 2 (증정)") == "Test Product 2"


def test_normalize_name_keeps_korean_and_ascii():
    assert normalize_name("라운드랩 1025 Dokdo-Toner!") == "라운드랩1025dokdotoner"


def test_non_cosmetic_tool_name_is_filtered():
    assert is_cosmetic_product_name("진정 토너")
    assert not is_cosmetic_product_name("메이크업 브러쉬 세트")
