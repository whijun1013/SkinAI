import argparse
import json
import sys
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from data_tools.audit_master_data import DATA_DIR, build_report


DEFAULT_MIN_TOTALS = {
    "food": 100_000,
    "medications": 1_000,
    "cosmetics": 1_000,
}


def validate_report(
    report: dict[str, Any],
    *,
    min_totals: dict[str, int] | None = None,
    max_duplicate_normalized: int = 0,
    strict_cosmetic_images: bool = False,
    max_cosmetic_missing_image_ratio: float = 0.2,
) -> list[str]:
    min_totals = min_totals or DEFAULT_MIN_TOTALS
    issues: list[str] = []

    for dataset, min_total in min_totals.items():
        result = report.get(dataset) or {}
        if result.get("missing"):
            issues.append(f"{dataset}:missing_file")
            continue
        total = int(result.get("total") or 0)
        if total < min_total:
            issues.append(f"{dataset}:total_below_min:{total}<{min_total}")
        duplicate_count = int(result.get("duplicate_normalized_name_count") or 0)
        if duplicate_count > max_duplicate_normalized:
            issues.append(f"{dataset}:duplicate_normalized_name_count:{duplicate_count}")

    cosmetics = report.get("cosmetics") or {}
    missing_ingredients_ratio = float(cosmetics.get("missing_ingredients_ratio") or 0)
    if missing_ingredients_ratio > 0:
        issues.append(f"cosmetics:missing_ingredients_ratio:{missing_ingredients_ratio}")
    if strict_cosmetic_images:
        missing_image_ratio = float(cosmetics.get("missing_image_ratio") or 0)
        if missing_image_ratio > max_cosmetic_missing_image_ratio:
            issues.append(
                "cosmetics:missing_image_ratio:"
                f"{missing_image_ratio}>{max_cosmetic_missing_image_ratio}"
            )

    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Luvel master data before production import.")
    parser.add_argument("--data-dir", default=str(DATA_DIR), help="Directory containing backend data JSON files.")
    parser.add_argument("--audit-json", help="Use an existing audit JSON instead of scanning data files.")
    parser.add_argument("--output", help="Optional validation report output path.")
    parser.add_argument("--strict-cosmetic-images", action="store_true", help="Fail when cosmetic image coverage is below threshold.")
    parser.add_argument("--max-cosmetic-missing-image-ratio", type=float, default=0.2)
    args = parser.parse_args()

    if args.audit_json:
        report = json.loads(Path(args.audit_json).read_text(encoding="utf-8"))
    else:
        report = build_report(Path(args.data_dir), limit=None)

    issues = validate_report(
        report,
        strict_cosmetic_images=args.strict_cosmetic_images,
        max_cosmetic_missing_image_ratio=args.max_cosmetic_missing_image_ratio,
    )
    validation = {
        "ok": not issues,
        "issues": issues,
        "totals": {key: (report.get(key) or {}).get("total", 0) for key in DEFAULT_MIN_TOTALS},
    }
    text = json.dumps(validation, ensure_ascii=False, indent=2)
    print(text)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(text + "\n", encoding="utf-8")
    return 0 if not issues else 1


if __name__ == "__main__":
    raise SystemExit(main())
