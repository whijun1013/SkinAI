from app.services.cosmetic_ingredient_taxonomy import (
    classify_ingredient_name,
    is_functional_cosmetic_ingredient,
    is_taxonomy_irritant_candidate,
)


def test_classifies_functional_and_irritant_cosmetic_ingredients():
    retinol_groups = {item["key"] for item in classify_ingredient_name("Retinol")}
    fragrance_groups = {item["key"] for item in classify_ingredient_name("Fragrance")}
    alcohol_groups = {item["key"] for item in classify_ingredient_name("Alcohol Denat.")}

    assert "retinoid" in retinol_groups
    assert "fragrance_essential_oil" in fragrance_groups
    assert "drying_alcohol" in alcohol_groups
    assert is_functional_cosmetic_ingredient("Retinol") is True
    assert is_taxonomy_irritant_candidate("Fragrance") is True
    assert is_taxonomy_irritant_candidate("Alcohol Denat.") is True
    assert is_functional_cosmetic_ingredient("Water") is False
