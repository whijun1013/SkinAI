import os
import sys
import json
import argparse
from typing import List, Dict, Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.services.skin_factor_rules import calculate_skin_factors, calculate_skin_factors_from_raw_material_text

import re


ALLERGEN_SKIN_FACTOR_MAP = {
    "우유": {
        "key": "dairy_confirmed",
        "label": "유제품",
        "level": "high",
        "confidence": "high",
    },
}


def extract_nutrition(item: dict) -> dict:
    nut = item.get("nutrition", {})
    if nut and any(v is not None for v in [nut.get("calories"), nut.get("protein"), nut.get("fat"), nut.get("carbohydrate"), nut.get("sugar"), nut.get("sodium")]):
        return {
            "calories": nut.get("calories"),
            "protein": nut.get("protein"),
            "fat": nut.get("fat"),
            "carbohydrate": nut.get("carbohydrate"),
            "sugar": nut.get("sugar"),
            "sodium": nut.get("sodium")
        }

    try:
        def safe_float(v):
            if v is None or str(v).strip() == "":
                return None
            return float(v)

        return {
            "calories": safe_float(item.get("calories")),
            "protein": safe_float(item.get("protein")),
            "fat": safe_float(item.get("fat")),
            "carbohydrate": safe_float(item.get("carbohydrate")),
            "sugar": safe_float(item.get("sugar")),
            "sodium": safe_float(item.get("sodium"))
        }
    except Exception:
        return {}


def normalize_food_name_for_dedupe(name: str) -> str:
    if not name:
        return ""
    n = str(name).lower()
    n = re.sub(r'\(.*?\)', '', n)
    n = re.sub(r'\[.*?\]', '', n)
    n = n.replace("모차렐라", "모짜렐라")
    n = n.replace(" ", "").replace("_", "")
    return n


def normalize_name(name: str) -> str:
    if not name:
        return ""
    return str(name).replace(" ", "").lower()


def count_nutrition_nulls(item: dict) -> int:
    nut = item.get("nutrition") or {}
    return sum(1 for k in ["calories", "protein", "fat", "carbohydrate", "sugar", "sodium"] if nut.get(k) is None)


def extract_factors_from_allergen_text(allergen_text: str) -> list[dict[str, Any]]:
    if not allergen_text:
        return []

    factors_by_key = {}
    for allergen, factor in ALLERGEN_SKIN_FACTOR_MAP.items():
        if allergen not in allergen_text:
            continue
        item = {
            **factor,
            "source": "haccp_allergen_text",
            "evidence": [f"allergen:{allergen}"],
        }
        factors_by_key[item["key"]] = item
    return list(factors_by_key.values())


def merge_skin_factors(factors: list[dict[str, Any]], text_factors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    text_keys = {f["key"] for f in text_factors}
    merged: dict[str, dict[str, Any]] = {}

    for factor in factors:
        if factor["key"] == "possible_dairy" and "dairy_confirmed" in text_keys:
            continue
        if factor["key"] in text_keys:
            continue
        merged[factor["key"]] = factor.copy()

    for factor in text_factors:
        key = factor["key"]
        if key not in merged:
            merged[key] = factor.copy()
            continue

        existing_evidence = merged[key].setdefault("evidence", [])
        for evidence in factor.get("evidence", []):
            if evidence not in existing_evidence:
                existing_evidence.append(evidence)

        if factor.get("confidence") == "high":
            merged[key]["confidence"] = "high"
        if factor.get("source") == "haccp_allergen_text":
            merged[key]["source"] = "haccp_allergen_text"

    return list(merged.values())


def first_non_empty(items: List[Dict[str, Any]], key: str):
    for item in items:
        value = item.get(key)
        if value not in (None, ""):
            return value
    return None

def dedupe_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    source_priority = {
        "curated_skin_factor": 4,
        "public_api": 3,
        "gpt_estimate": 2,
        "dummy": 1
    }

    general_food_cats = ["음식", "밥류", "면류", "국/탕류", "반찬류", "구이/볶음류", "한식", "중식", "일식", "양식"]

    grouped = {}
    for item in items:
        nn = item.get("dedupe_name") or normalize_food_name_for_dedupe(item.get("name"))
        if not nn:
            continue

        if nn not in grouped:
            grouped[nn] = []
        grouped[nn].append(item)

    deduped = []
    for nn, group in grouped.items():
        if len(group) == 1:
            deduped.append(group[0])
            continue

        group.sort(key=lambda x: (
            source_priority.get(x.get("source"), 0),
            1 if any(c in str(x.get("category_major") or x.get("category", "")) for c in general_food_cats) else 0,
            -count_nutrition_nulls(x),
            -len(str(x.get("name", ""))),
            bool(x.get("api_food_code"))
        ), reverse=True)

        best = group[0].copy()

        if count_nutrition_nulls(best) > 0:
            for other in group[1:]:
                if count_nutrition_nulls(other) < count_nutrition_nulls(best):
                    best["nutrition"] = other.get("nutrition", {}).copy()

        best["raw_material_text"] = best.get("raw_material_text") or first_non_empty(group, "raw_material_text")
        best["allergen_text"] = best.get("allergen_text") or first_non_empty(group, "allergen_text")
                    
        # Merge skin_factors
        merged_factors = {f["key"]: f.copy() for f in best.get("skin_factors", [])}
        for other in group[1:]:
            for f in other.get("skin_factors", []):
                k = f["key"]
                if k not in merged_factors:
                    merged_factors[k] = f.copy()
                else:
                    for ev in f.get("evidence", []):
                        if ev not in merged_factors[k].get("evidence", []):
                            merged_factors[k].setdefault("evidence", []).append(ev)

        best["skin_factors"] = list(merged_factors.values())

        if "dedupe_name" in best:
            del best["dedupe_name"]

        deduped.append(best)

    return deduped


def build_curated(args):
    raw_dict = []
    if args.raw_material_dictionary and os.path.exists(args.raw_material_dictionary):
        with open(args.raw_material_dictionary, "r", encoding="utf-8") as f:
            raw_dict = json.load(f)

    items = []

    if args.excel_input and os.path.exists(args.excel_input):
        import pandas as pd

        print(f"Loading Excel: {args.excel_input}")
        df = pd.read_excel(args.excel_input)
        if args.limit > 0:
            df = df.head(args.limit)

        cols = {
            'code': '식품코드',
            'name': '식품명',
            'cat_major': '식품대분류명',
            'cat_middle': '식품중분류명',
            'cat_small': '식품소분류명',
            'cat_detail': '식품세분류명',
            'serving': '영양성분함량기준량',
            'calories': '에너지(kcal)',
            'protein': '단백질(g)',
            'fat': '지방(g)',
            'carb': '탄수화물(g)',
            'sugar': '당류(g)',
            'sodium': '나트륨(mg)'
        }

        for _, row in df.iterrows():
            name = str(row.get(cols['name'], ""))
            if not name or name == "nan":
                continue

            cat = str(row.get(cols['cat_major'], ""))

            sugar = row.get(cols['sugar'])
            sodium = row.get(cols['sodium'])
            fat = row.get(cols['fat'])
            carb = row.get(cols['carb'])
            calories = row.get(cols['calories'])
            protein = row.get(cols['protein'])

            factors = calculate_skin_factors(
                name=name,
                sugar=float(sugar) if pd.notnull(sugar) else None,
                sodium=float(sodium) if pd.notnull(sodium) else None,
                fat=float(fat) if pd.notnull(fat) else None,
                carbohydrate=float(carb) if pd.notnull(carb) else None,
                category=cat
            )

            item = {
                "api_food_code": str(row.get(cols['code'], "")),
                "name": name,
                "display_name": name,
                "normalized_name": normalize_name(name),
                "dedupe_name": normalize_food_name_for_dedupe(name),
                "category": cat,
                "category_major": cat,
                "category_middle": str(row.get(cols['cat_middle'], "")),
                "category_small": str(row.get(cols['cat_small'], "")),
                "category_detail": str(row.get(cols['cat_detail'], "")),
                "serving_basis": str(row.get(cols['serving'], "")),
                "source": "curated_skin_factor",
                "nutrition": {
                    "calories": float(calories) if pd.notnull(calories) else None,
                    "protein": float(protein) if pd.notnull(protein) else None,
                    "fat": float(fat) if pd.notnull(fat) else None,
                    "carbohydrate": float(carb) if pd.notnull(carb) else None,
                    "sugar": float(sugar) if pd.notnull(sugar) else None,
                    "sodium": float(sodium) if pd.notnull(sodium) else None
                },
                "skin_factors": factors
            }
            items.append(item)

    for json_file in [args.processed_json, args.mfds_json]:
        if json_file and os.path.exists(json_file):
            print(f"Loading JSON: {json_file}")
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if args.limit > 0:
                    data = data[:args.limit]
                for d in data:
                    d["source"] = "public_api"

                    nut = extract_nutrition(d)
                    d["nutrition"] = nut

                    factors = calculate_skin_factors(
                        name=d.get("name", ""),
                        sugar=nut.get("sugar"),
                        sodium=nut.get("sodium"),
                        fat=nut.get("fat"),
                        carbohydrate=nut.get("carbohydrate"),
                        category=d.get("category_major") or d.get("category", "")
                    )

                    text_factors = []
                    raw_text = d.get("raw_material_text") or ""
                    if raw_text and raw_dict:
                        text_factors.extend(calculate_skin_factors_from_raw_material_text(raw_text, raw_dict))
                    text_factors.extend(extract_factors_from_allergen_text(d.get("allergen_text") or ""))
                    if text_factors:
                        factors = merge_skin_factors(factors, text_factors)

                    d["skin_factors"] = factors
                    if not d.get("normalized_name"):
                        d["normalized_name"] = normalize_name(d.get("name", ""))
                    d["dedupe_name"] = normalize_food_name_for_dedupe(d.get("name", ""))
                    items.append(d)

    print(f"Total items before dedupe: {len(items)}")
    deduped = dedupe_items(items)
    print(f"Total items after dedupe: {len(deduped)}")
    print(f"Removed duplicates: {len(items) - len(deduped)}")

    factor_counts = {}
    cat_counts = {}
    null_count = 0

    for item in deduped:
        c = item.get("category_major") or item.get("category", "Unknown")
        cat_counts[c] = cat_counts.get(c, 0) + 1

        if count_nutrition_nulls(item) > 0:
            null_count += 1

        for f in item.get("skin_factors", []):
            k = f.get("key")
            if k:
                factor_counts[k] = factor_counts.get(k, 0) + 1

    print("\nSkin factor counts:")
    for k, v in factor_counts.items():
        print(f"  {k}: {v}")

    print(f"\nItems with nutrition nulls: {null_count} / {len(deduped)}")

    out_dir = os.path.dirname(os.path.abspath(args.output))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(deduped, f, ensure_ascii=False, indent=2)

    print(f"\nSaved curated items to {args.output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--excel-input", default="")
    parser.add_argument("--processed-json", default="")
    parser.add_argument("--mfds-json", default="")
    parser.add_argument("--raw-material-dictionary", default="")
    parser.add_argument("--output", required=True)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--source-priority", default="")

    args = parser.parse_args()
    build_curated(args)
