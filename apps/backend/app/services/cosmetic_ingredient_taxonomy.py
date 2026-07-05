from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class IngredientGroup:
    key: str
    label: str
    keywords: tuple[str, ...]


INGREDIENT_GROUPS: tuple[IngredientGroup, ...] = (
    IngredientGroup("retinoid", "Retinoid", ("retinol", "retinal", "retinoid", "retinyl", "tretinoin", "adapalene")),
    IngredientGroup("exfoliating_acid", "Exfoliating acid", ("glycolic acid", "lactic acid", "mandelic acid", "salicylic acid", "aha", "bha", "pha")),
    IngredientGroup("vitamin_c", "Vitamin C", ("ascorbic acid", "vitamin c", "ascorbyl", "ethyl ascorbic")),
    IngredientGroup("niacinamide", "Niacinamide", ("niacinamide",)),
    IngredientGroup("azelaic_acid", "Azelaic acid", ("azelaic acid",)),
    IngredientGroup("benzoyl_peroxide", "Benzoyl peroxide", ("benzoyl peroxide",)),
    IngredientGroup("fragrance_essential_oil", "Fragrance / essential oil", ("fragrance", "parfum", "limonene", "linalool", "citral", "geraniol", "eugenol", "essential oil")),
    IngredientGroup("drying_alcohol", "Drying alcohol", ("alcohol denat", "sd alcohol", "ethanol", "isopropyl alcohol")),
    IngredientGroup("preservative_sensitizer", "Preservative sensitizer", ("methylisothiazolinone", "methylchloroisothiazolinone", "formaldehyde", "dmdm hydantoin", "imidazolidinyl urea")),
    IngredientGroup("sulfate_surfactant", "Sulfate surfactant", ("sodium lauryl sulfate", "sodium laureth sulfate", "ammonium lauryl sulfate", "sls", "sles")),
    IngredientGroup("sunscreen_filter", "Sunscreen filter", ("avobenzone", "oxybenzone", "octinoxate", "octocrylene", "homosalate", "zinc oxide", "titanium dioxide")),
    IngredientGroup("barrier_support", "Barrier support", ("ceramide", "cholesterol", "panthenol", "madecassoside", "centella", "allantoin", "beta glucan")),
)


FUNCTIONAL_GROUP_KEYS = {
    "retinoid",
    "exfoliating_acid",
    "vitamin_c",
    "niacinamide",
    "azelaic_acid",
    "benzoyl_peroxide",
}


IRRITANT_GROUP_KEYS = {
    "fragrance_essential_oil",
    "drying_alcohol",
    "preservative_sensitizer",
    "sulfate_surfactant",
}


def normalize_ingredient_name(name: str) -> str:
    value = name.lower().replace("-", " ")
    value = re.sub(r"[^a-z0-9가-힣]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def classify_ingredient_name(name: str) -> list[dict[str, str]]:
    normalized = normalize_ingredient_name(name)
    groups: list[dict[str, str]] = []
    for group in INGREDIENT_GROUPS:
        if any(normalize_ingredient_name(keyword) in normalized for keyword in group.keywords):
            groups.append({"key": group.key, "label": group.label, "ingredient": name})
    return groups


def is_functional_cosmetic_ingredient(name: str) -> bool:
    return any(group["key"] in FUNCTIONAL_GROUP_KEYS for group in classify_ingredient_name(name))


def is_taxonomy_irritant_candidate(name: str) -> bool:
    return any(group["key"] in IRRITANT_GROUP_KEYS for group in classify_ingredient_name(name))
