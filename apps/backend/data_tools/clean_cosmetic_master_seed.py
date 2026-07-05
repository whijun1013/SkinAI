import argparse
import json
import sys
from pathlib import Path
from typing import Any


BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = BACKEND_DIR / "data" / "cosmetic_master_seed.json"

sys.path.append(str(BACKEND_DIR))

from app.adapters.primary_retailer_crawler_adapter import is_cosmetic_product_name, normalize_name

PLACEHOLDER_NAMES = {
    "상품명",
    "가품 피해 방지 안내",
    "화장품",
    "제품명",
}


def _text(value: Any) -> str:
    return str(value or "").strip()


def is_valid_seed_item(item: dict[str, Any]) -> tuple[bool, str]:
    brand = _text(item.get("brand"))
    product_name = _text(item.get("product_name"))
    ingredients = _text(item.get("ingredients"))
    if not brand or not product_name or not ingredients:
        return False, "missing_required"
    if product_name in PLACEHOLDER_NAMES:
        return False, "placeholder_name"
    if not is_cosmetic_product_name(product_name):
        return False, "non_cosmetic_keyword"
    return True, ""


def quality_score(item: dict[str, Any]) -> tuple[int, int, int]:
    return (
        1 if _text(item.get("image_url")) else 0,
        1 if item.get("source") != "local" else 0,
        len(_text(item.get("ingredients"))),
    )


def clean_items(items: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    stats = {
        "input": len(items),
        "removed_missing_required": 0,
        "removed_placeholder_name": 0,
        "removed_non_cosmetic_keyword": 0,
        "deduped": 0,
        "output": 0,
    }
    by_key: dict[str, dict[str, Any]] = {}

    for item in items:
        valid, reason = is_valid_seed_item(item)
        if not valid:
            stats[f"removed_{reason}"] += 1
            continue

        cleaned = dict(item)
        cleaned.pop("product_url", None)
        cleaned["brand"] = _text(cleaned.get("brand"))
        cleaned["product_name"] = _text(cleaned.get("product_name"))
        cleaned["ingredients"] = _text(cleaned.get("ingredients"))
        cleaned["normalized_name"] = _text(cleaned.get("normalized_name")) or normalize_name(cleaned["product_name"])

        key = cleaned["normalized_name"]
        existing = by_key.get(key)
        if existing is None or quality_score(cleaned) > quality_score(existing):
            if existing is not None:
                stats["deduped"] += 1
            by_key[key] = cleaned
        else:
            stats["deduped"] += 1

    output = sorted(by_key.values(), key=lambda item: (item.get("brand") or "", item.get("product_name") or ""))
    stats["output"] = len(output)
    return output, stats


def load_items(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(path)
    with path.open("r", encoding="utf-8-sig") as file:
        data = json.load(file)
    if not isinstance(data, list):
        raise ValueError(f"expected JSON array: {path}")
    return [item for item in data if isinstance(item, dict)]


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean local cosmetic master seed JSON.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--output", help="Output path. Defaults to --input when --apply is used.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        args.dry_run = True

    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = BACKEND_DIR / input_path
    output_path = Path(args.output) if args.output else input_path
    if not output_path.is_absolute():
        output_path = BACKEND_DIR / output_path

    cleaned, stats = clean_items(load_items(input_path))
    print(json.dumps(stats, ensure_ascii=False, indent=2))

    if args.apply:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8") as file:
            json.dump(cleaned, file, ensure_ascii=False, indent=2)
        print(f"[clean-cosmetic-seed] wrote path={output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
