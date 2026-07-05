import argparse
import gzip
import json
from collections import Counter
from pathlib import Path
from typing import Any, Iterator


BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
STREAM_THRESHOLD_BYTES = 10 * 1024 * 1024


def _open_text(path: Path):
    if path.suffix == ".gz":
        return gzip.open(path, "rt", encoding="utf-8-sig")
    return path.open("r", encoding="utf-8-sig")


def iter_json_array(path: Path) -> Iterator[dict[str, Any]]:
    with _open_text(path) as file:
        started_array = False
        in_object = False
        in_string = False
        escaped = False
        depth = 0
        object_chars: list[str] = []

        while True:
            chunk = file.read(65536)
            if not chunk:
                return

            for char in chunk:
                if not started_array:
                    if char.isspace():
                        continue
                    if char != "[":
                        raise ValueError(f"expected JSON array: {path}")
                    started_array = True
                    continue

                if not in_object:
                    if char == "{":
                        in_object = True
                        depth = 1
                        object_chars = [char]
                    elif char == "]":
                        return
                    continue

                object_chars.append(char)
                if escaped:
                    escaped = False
                    continue
                if char == "\\" and in_string:
                    escaped = True
                    continue
                if char == '"':
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if char == "{":
                    depth += 1
                elif char == "}":
                    depth -= 1
                    if depth == 0:
                        item = json.loads("".join(object_chars))
                        if isinstance(item, dict):
                            yield item
                        in_object = False
                        object_chars = []


def iter_json_items(path: Path) -> Iterator[dict[str, Any]]:
    if not path.exists():
        return
    if path.stat().st_size > STREAM_THRESHOLD_BYTES:
        yield from iter_json_array(path)
        return
    with _open_text(path) as file:
        data = json.load(file)
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                yield item


def normalized_name(value: Any) -> str:
    return str(value or "").strip().lower()


def audit_items(
    path: Path,
    *,
    name_keys: tuple[str, ...],
    source_key: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    if not path.exists():
        return {"path": str(path), "missing": True, "total": 0}

    total = 0
    exact_names: Counter[str] = Counter()
    normalized_names: Counter[str] = Counter()
    normalized_examples: dict[str, str] = {}
    source_counts: Counter[str] = Counter()
    brand_counts: Counter[str] = Counter()
    category_counts: Counter[str] = Counter()
    missing_ingredients = 0
    missing_image = 0
    skin_relevant_ingredients = 0
    ingredient_rows = 0

    for item in iter_json_items(path):
        total += 1
        name = next((item.get(key) for key in name_keys if item.get(key)), "")
        if name:
            exact_names[str(name)] += 1
            normalized = normalized_name(name)
            normalized_names[normalized] += 1
            normalized_examples.setdefault(normalized, str(name))
        if source_key:
            source_counts[str(item.get(source_key) or "unknown")] += 1
        if item.get("brand"):
            brand_counts[str(item["brand"])] += 1
        if item.get("category"):
            category_counts[str(item["category"])] += 1
        if "ingredients" in item and not item.get("ingredients"):
            missing_ingredients += 1
        if "image_url" in item and not item.get("image_url"):
            missing_image += 1
        if "is_skin_relevant" in item:
            ingredient_rows += 1
            if item.get("is_skin_relevant") is True:
                skin_relevant_ingredients += 1
        if limit is not None and total >= limit:
            break

    exact_dup = sum(count - 1 for count in exact_names.values() if count > 1)
    normalized_dup = sum(count - 1 for count in normalized_names.values() if count > 1)
    top_duplicate_names = [
        {"name": normalized_examples.get(name_key, name_key), "count": count}
        for name_key, count in normalized_names.most_common()
        if count > 1
    ][:20]
    result: dict[str, Any] = {
        "path": str(path),
        "missing": False,
        "total": total,
        "sampled": limit is not None,
        "duplicate_exact_name_count": exact_dup,
        "duplicate_normalized_name_count": normalized_dup,
        "top_duplicate_names": top_duplicate_names,
        "top_sources": source_counts.most_common(10),
        "top_brands": brand_counts.most_common(10),
        "top_categories": category_counts.most_common(10),
    }
    if total and "ingredients" in next(iter_json_items(path), {}):
        result["missing_ingredients_count"] = missing_ingredients
        result["missing_ingredients_ratio"] = round(missing_ingredients / total, 4)
    if total and "image_url" in next(iter_json_items(path), {}):
        result["missing_image_count"] = missing_image
        result["missing_image_ratio"] = round(missing_image / total, 4)
    if total and missing_ingredients and "missing_ingredients_ratio" not in result:
        result["missing_ingredients_ratio"] = round(missing_ingredients / total, 4)
    if total and missing_image and "missing_image_ratio" not in result:
        result["missing_image_ratio"] = round(missing_image / total, 4)
    if ingredient_rows:
        result["skin_relevant_ingredient_ratio"] = round(skin_relevant_ingredients / ingredient_rows, 4)
    return result


def build_report(data_dir: Path, *, limit: int | None) -> dict[str, Any]:
    return {
        "food": audit_items(
            data_dir / "food_items_curated.json",
            name_keys=("name", "food_name"),
            source_key="source",
            limit=limit,
        ),
        "medications": audit_items(
            data_dir / "skin_affecting_drugs.json",
            name_keys=("name", "drug_name", "product_name", "item_name"),
            source_key="source",
            limit=limit,
        ),
        "cosmetics": audit_items(
            data_dir / "cosmetic_master_seed.json",
            name_keys=("product_name", "name"),
            source_key="source",
            limit=limit,
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit Luvel master data JSON coverage without connecting to DB.")
    parser.add_argument("--data-dir", default=str(DATA_DIR), help="Directory containing backend data JSON files.")
    parser.add_argument("--output", help="Optional JSON report output path.")
    parser.add_argument("--limit", type=int, default=50000, help="Maximum rows per dataset. Use 0 for a full scan.")
    args = parser.parse_args()

    if args.limit < 0:
        parser.error("--limit must be 0 or greater.")

    report = build_report(Path(args.data_dir), limit=None if args.limit == 0 else args.limit)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    print(text)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(text + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
