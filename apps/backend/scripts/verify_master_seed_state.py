import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.models.analysis  # noqa: F401
import app.models.behavior  # noqa: F401
import app.models.cosmetic  # noqa: F401
import app.models.diet  # noqa: F401
import app.models.environment  # noqa: F401
import app.models.medication  # noqa: F401
import app.models.period  # noqa: F401
import app.models.skin_log  # noqa: F401
import app.models.user  # noqa: F401
from app.database import SessionLocal
from app.database_seed import seed_cosmetics_data, seed_medications_data
from app.models.cosmetic import CosmeticIngredient, CosmeticProduct
from app.models.diet import FoodItem
from app.models.medication import Medication, MedicationIngredient


def _import_food_items(json_path: Path) -> None:
    from data_tools.import_curated_food_items import import_curated_items

    import_curated_items(str(json_path), dry_run=False, deactivate_missing=False)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed-missing", action="store_true")
    parser.add_argument("--food-json", default="data/food_items_curated.json")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        counts = {
            "food_item": db.query(FoodItem).count(),
            "food_item_with_skin_factors": db.query(FoodItem)
            .filter(FoodItem.skin_factors.isnot(None))
            .count(),
            "cosmetic_products": db.query(CosmeticProduct).count(),
            "cosmetic_ingredients": db.query(CosmeticIngredient).count(),
            "medication": db.query(Medication).count(),
            "medication_ingredient": db.query(MedicationIngredient).count(),
        }
        for key, value in counts.items():
            print(f"{key}: {value}")

        if not args.seed_missing:
            return 0

        if counts["cosmetic_products"] == 0 or counts["cosmetic_ingredients"] == 0:
            print("seeding cosmetics master data")
            seed_cosmetics_data(db)
            db.commit()
        if counts["medication"] == 0 or counts["medication_ingredient"] == 0:
            print("seeding medications master data")
            seed_medications_data(db)
            db.commit()
        if counts["food_item"] == 0:
            json_path = Path(args.food_json)
            if not json_path.is_absolute():
                json_path = Path.cwd() / json_path
            if not json_path.exists():
                raise FileNotFoundError(
                    f"food json not found: {json_path}. Build or place food_items_curated.json first."
                )
            print(f"seeding food items from {json_path}")
            _import_food_items(json_path)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
