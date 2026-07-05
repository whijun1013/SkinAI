import argparse
import json
import re
from pathlib import Path
from typing import Any


BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_FOOD = BACKEND_DIR / "data" / "food_items_curated.json"
DEFAULT_HACCP = BACKEND_DIR / "data" / "haccp_packaging_skin_factor_items.json"


def normalize_name(value: str | None) -> str:
    text = (value or "").lower()
    text = re.sub(r"\(.*?\)|\[.*?\]", "", text)
    return re.sub(r"[^0-9a-z가-힣]", "", text)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _merge_skin_factors(existing: Any, incoming: Any) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    factors: list[Any] = []
    if isinstance(existing, list):
        factors.extend(existing)
    if isinstance(incoming, list):
        factors.extend(incoming)

    for source in factors:
        if not isinstance(source, dict) or not source.get("key"):
            continue
        key = str(source["key"])
        if key not in merged:
            merged[key] = dict(source)
            continue
        current = merged[key]
        for evidence in source.get("evidence") or []:
            current.setdefault("evidence", [])
            if evidence not in current["evidence"]:
                current["evidence"].append(evidence)
        if source.get("confidence") == "high":
            current["confidence"] = "high"
        if source.get("level") == "high":
            current["level"] = "high"
        if source.get("source"):
            current["source"] = source["source"]
    return list(merged.values())


def build_haccp_index(haccp_items: list[dict[str, Any]]) -> tuple[dict[str, dict], dict[str, dict]]:
    by_barcode: dict[str, dict] = {}
    by_name: dict[str, dict] = {}
    for item in haccp_items:
        barcode = _text(item.get("barcode"))
        name_key = normalize_name(item.get("product_name"))
        if barcode:
            by_barcode.setdefault(barcode, item)
        if name_key:
            by_name.setdefault(name_key, item)
    return by_barcode, by_name


def merge_food_with_haccp(
    food_items: list[dict[str, Any]],
    haccp_items: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    by_barcode, by_name = build_haccp_index(haccp_items)
    stats = {
        "food_input": len(food_items),
        "haccp_input": len(haccp_items),
        "matched_by_barcode": 0,
        "matched_by_name": 0,
        "barcode_added": 0,
        "brand_added": 0,
        "raw_material_added": 0,
        "allergen_added": 0,
        "skin_factors_merged": 0,
    }

    output = []
    for food in food_items:
        merged = dict(food)
        haccp = None
        barcode = _text(merged.get("barcode"))
        if barcode and barcode in by_barcode:
            haccp = by_barcode[barcode]
            stats["matched_by_barcode"] += 1
        else:
            name_key = normalize_name(merged.get("name"))
            if name_key in by_name:
                haccp = by_name[name_key]
                stats["matched_by_name"] += 1

        if not haccp:
            output.append(merged)
            continue

        haccp_barcode = _text(haccp.get("barcode"))
        if haccp_barcode and not _text(merged.get("barcode")):
            merged["barcode"] = haccp_barcode
            stats["barcode_added"] += 1

        brand = _text(haccp.get("seller")) or _text(haccp.get("manufacturer"))
        if brand and not _text(merged.get("brand")):
            merged["brand"] = brand
            stats["brand_added"] += 1

        if _text(haccp.get("product_type")) and not _text(merged.get("product_type")):
            merged["product_type"] = haccp["product_type"]

        if _text(haccp.get("raw_material_text")) and not _text(merged.get("raw_material_text")):
            merged["raw_material_text"] = haccp["raw_material_text"]
            stats["raw_material_added"] += 1

        if _text(haccp.get("allergen_text")) and not _text(merged.get("allergen_text")):
            merged["allergen_text"] = haccp["allergen_text"]
            stats["allergen_added"] += 1

        existing_factor_count = len(merged.get("skin_factors") or [])
        merged["skin_factors"] = _merge_skin_factors(merged.get("skin_factors"), haccp.get("skin_factors"))
        if len(merged["skin_factors"]) > existing_factor_count:
            stats["skin_factors_merged"] += 1

        output.append(merged)

    return output, stats


def load_json_array(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig") as file:
        data = json.load(file)
    if not isinstance(data, list):
        raise ValueError(f"expected JSON array: {path}")
    return [item for item in data if isinstance(item, dict)]


def main() -> int:
    parser = argparse.ArgumentParser(description="Merge HACCP packaging metadata into curated food JSON.")
    parser.add_argument("--food", default=str(DEFAULT_FOOD))
    parser.add_argument("--haccp", default=str(DEFAULT_HACCP))
    parser.add_argument("--output", help="Output path. Defaults to --food when --apply is used.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        args.dry_run = True

    food_path = Path(args.food)
    haccp_path = Path(args.haccp)
    if not food_path.is_absolute():
        food_path = BACKEND_DIR / food_path
    if not haccp_path.is_absolute():
        haccp_path = BACKEND_DIR / haccp_path
    output_path = Path(args.output) if args.output else food_path
    if not output_path.is_absolute():
        output_path = BACKEND_DIR / output_path

    merged, stats = merge_food_with_haccp(load_json_array(food_path), load_json_array(haccp_path))
    print(json.dumps(stats, ensure_ascii=False, indent=2))

    if args.apply:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8") as file:
            json.dump(merged, file, ensure_ascii=False, indent=2)
        print(f"[merge-haccp] wrote path={output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
