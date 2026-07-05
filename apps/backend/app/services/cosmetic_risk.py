from collections.abc import Iterable

from app.models.cosmetic import CosmeticIngredient


def summarize_cosmetic_ingredients(ingredients: Iterable[CosmeticIngredient]) -> dict:
    ingredients = list(ingredients)
    known_scores = [
        ingredient.comedogenic
        for ingredient in ingredients
        if ingredient.comedogenic is not None
    ]
    irritant_count = sum(1 for ingredient in ingredients if ingredient.is_irritant)
    banned_count = sum(1 for ingredient in ingredients if ingredient.is_banned)
    restricted_count = sum(1 for ingredient in ingredients if ingredient.restriction_limit)
    comedogenic_count = sum(1 for score in known_scores if score > 0)
    comedogenic_average = sum(known_scores) / len(known_scores) if known_scores else 0.0
    comedogenic_coverage = (
        round(len(known_scores) / len(ingredients) * 100, 2) if ingredients else 0.0
    )
    risk_ingredients = [
        ingredient
        for ingredient in ingredients
        if (
            ingredient.is_banned
            or ingredient.restriction_limit
            or ingredient.is_irritant
            or (ingredient.comedogenic is not None and ingredient.comedogenic >= 3)
        )
    ]

    if (
        banned_count > 0
        or irritant_count >= 2
        or restricted_count > 0
        or comedogenic_average >= 1.5
    ):
        safety_grade = "경고 (Red)"
    elif (
        irritant_count == 1
        or comedogenic_average >= 0.5
        or comedogenic_count > 0
        or comedogenic_coverage < 30.0
    ):
        safety_grade = "주의 (Yellow)"
    else:
        safety_grade = "안전 (Green)"

    return {
        "irritant_count": irritant_count,
        "comedogenic_count": comedogenic_count,
        "comedogenic_average": round(comedogenic_average, 2),
        "comedogenic_coverage": comedogenic_coverage,
        "safety_grade": safety_grade,
        "banned_count": banned_count,
        "restricted_count": restricted_count,
        "risk_ingredients": risk_ingredients,
        "irritant_ingredients": sorted(
            {ingredient.name for ingredient in ingredients if ingredient.is_irritant}
        ),
        "high_comedogenic": sorted(
            {
                ingredient.name
                for ingredient in ingredients
                if ingredient.comedogenic is not None and ingredient.comedogenic >= 3
            }
        ),
        "banned_ingredients": sorted(
            {ingredient.name for ingredient in ingredients if ingredient.is_banned}
        ),
    }
