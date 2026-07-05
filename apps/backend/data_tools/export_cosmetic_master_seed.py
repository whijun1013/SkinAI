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
DEFAULT_OUTPUT = BACKEND_DIR / "data" / "cosmetic_master_seed.json"


def get_args():
    parser = argparse.ArgumentParser(description="Export local cosmetic DB rows to local seed JSON.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    return parser.parse_args()


def main() -> int:
    args = get_args()
    output = Path(args.output)
    if not output.is_absolute():
        output = BACKEND_DIR / output

    db = SessionLocal()
    try:
        rows = (
            db.query(CosmeticProduct)
            .filter(CosmeticProduct.ingredients.isnot(None))
            .filter(CosmeticProduct.ingredients != "")
            .order_by(CosmeticProduct.id.asc())
            .all()
        )
        records = []
        for row in rows:
            if not row.brand or not row.product_name or not row.ingredients:
                continue
            records.append(
                {
                    "source": row.source or "local",
                    "source_product_id": row.source_product_id or f"local_{row.id}",
                    "brand": row.brand,
                    "product_name": row.product_name,
                    "normalized_name": row.normalized_name,
                    "category": row.category,
                    "ingredients": row.ingredients,
                    "image_url": row.image_url,
                    "status": row.status or "active",
                }
            )

        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("w", encoding="utf-8") as file:
            json.dump(records, file, ensure_ascii=False, indent=2)
        print(f"[export] wrote path={output} records={len(records)}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
