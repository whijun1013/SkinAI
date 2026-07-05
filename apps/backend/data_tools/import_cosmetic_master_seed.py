import argparse
import json
import os
import sys
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.cosmetic import CosmeticProduct, UserCosmetic  # noqa: F401
from app.models.medication import UserMedication  # noqa: F401
from app.models.user import User  # noqa: F401


BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_SEED = BACKEND_DIR / "data" / "cosmetic_master_seed.json"


def get_args():
    parser = argparse.ArgumentParser(description="Import cosmetic master seed JSON into DB.")
    parser.add_argument("--file", default=str(DEFAULT_SEED), help="Path to seed JSON file.")
    parser.add_argument("--dry-run", action="store_true", help="Run without committing to DB.")
    parser.add_argument("--apply", action="store_true", help="Commit changes to DB.")
    return parser.parse_args()


def resolve_file(path: str) -> Path:
    candidate = Path(path)
    if candidate.is_absolute():
        return candidate
    return BACKEND_DIR / path


def main() -> int:
    args = get_args()
    if not args.dry_run and not args.apply:
        args.dry_run = True

    file_path = resolve_file(args.file)
    if not file_path.exists():
        print(f"[import] seed_file_missing path={file_path}")
        return 1

    with file_path.open("r", encoding="utf-8-sig") as file:
        seed_data = json.load(file)

    db = SessionLocal()
    try:
        new_items = 0
        updated_items = 0
        skipped_items = 0

        for item in seed_data:
            source = item.get("source")
            source_product_id = item.get("source_product_id")
            normalized_name = item.get("normalized_name")
            ingredients = (item.get("ingredients") or "").strip()

            if not source or not source_product_id or not item.get("brand") or not item.get("product_name") or not ingredients:
                skipped_items += 1
                continue

            existing = db.query(CosmeticProduct).filter_by(
                source=source,
                source_product_id=source_product_id,
            ).first()
            if not existing and normalized_name:
                existing = db.query(CosmeticProduct).filter_by(normalized_name=normalized_name).first()
            if not existing:
                existing = db.query(CosmeticProduct).filter_by(
                    brand=item["brand"],
                    product_name=item["product_name"],
                ).first()

            if existing:
                changed = False
                if not existing.ingredients:
                    existing.ingredients = ingredients
                    changed = True
                if not existing.image_url and item.get("image_url"):
                    existing.image_url = item.get("image_url")
                    changed = True
                if existing.product_url:
                    existing.product_url = None
                    changed = True
                if changed:
                    updated_items += 1
                else:
                    skipped_items += 1
                continue

            db.add(
                CosmeticProduct(
                    source=source,
                    source_product_id=source_product_id,
                    brand=item["brand"],
                    product_name=item["product_name"],
                    normalized_name=normalized_name,
                    category=item.get("category"),
                    ingredients=ingredients,
                    image_url=item.get("image_url"),
                    product_url=None,
                    status=item.get("status", "active"),
                )
            )
            new_items += 1

        if args.apply:
            db.commit()
        else:
            db.rollback()

        print(
            "[import] summary "
            f"mode={'apply' if args.apply else 'dry-run'} total={len(seed_data)} "
            f"new={new_items} updated={updated_items} skipped={skipped_items}"
        )
        return 0
    except Exception as exc:
        db.rollback()
        print(f"[import] failed error={exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
