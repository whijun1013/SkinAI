import os
import sys
import json
import argparse
from typing import List, Dict, Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.services.skin_factor_rules import calculate_skin_factors, calculate_skin_factors_from_raw_material_text

import re


def safe_float(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    if text in {"-", "--", "—", "N/A", "n/a", "ND", "nd", "불검출"}:
        return None
    text = text.replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    return float(match.group(0))


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
    if nut and any(v is not None for v in [nut.get("calories"), nut.get("protein"), nut.get("fat"), nut.get("carbohydrate"), nut.get("sugar"), nut.get("sodium"), nut.get("saturated_fat"), nut.get("trans_fat")]):
        return {
            "calories": nut.get("calories"),
            "protein": nut.get("protein"),
            "fat": nut.get("fat"),
            "saturated_fat": nut.get("saturated_fat"),
            "trans_fat": nut.get("trans_fat"),
            "carbohydrate": nut.get("carbohydrate"),
            "sugar": nut.get("sugar"),
            "sodium": nut.get("sodium")
        }

    try:
        return {
            "calories": safe_float(item.get("calories")),
            "protein": safe_float(item.get("protein")),
            "fat": safe_float(item.get("fat")),
            "saturated_fat": safe_float(item.get("saturated_fat")),
            "trans_fat": safe_float(item.get("trans_fat")),
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


def is_searchable_food_item(item: Dict[str, Any]) -> bool:
    name = str(item.get("name", "")).replace(" ", "")
    cat = " ".join(str(item.get(k, "")) for k in ["category", "category_major", "category_middle", "category_small", "category_detail"])

    hard_exclude = [
        "파우더", "분말", "프리믹스", "믹스", "베이스", "생지", "반죽", "필링",
        "농축액", "추출물", "엑기스", "원액", "향료",
    ]
    for kw in hard_exclude:
        if kw in name or kw in cat:
            return False

    if name.endswith("소스") or "소스" in cat:
        return False

    exceptions = ["크림빵", "크림스프", "잼빵", "소스치킨", "아이스크림", "슈크림", "크림치즈", "생크림", "파스타", "치킨", "김치찌개"]
    for exc in exceptions:
        if exc in name:
            return True

    if "즉석섭취" in cat or "일반음식" in cat or "조리식품" in cat:
        return True

    keywords = [
        "파우더", "분말", "프리믹스", "믹스", "베이스", "생지", "반죽", "시트", "필링", "토핑", "페이스트", "퓨레", 
        "농축액", "추출물", "엑기스", "원액", "향료", "소스", "드레싱", "양념", "조미료", "시럽", "잼", "크림", 
        "글레이즈", "첨가물", "색소", "감미료", "안정제", "산미료", "보존료"
    ]
    
    for kw in keywords:
        if kw in name or kw in cat:
            return False
            
    return True


def count_nutrition_nulls(item: dict) -> int:
    nut = item.get("nutrition") or {}
    keys = ["calories", "protein", "fat", "saturated_fat", "trans_fat", "carbohydrate", "sugar", "sodium"]
    return sum(1 for k in keys if nut.get(k) is None)


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

SOURCE_PRIORITY = {
    "curated_skin_factor": 4,
    "public_api": 3,
    "gpt_estimate": 2,
    "dummy": 1,
}
GENERAL_FOOD_CATEGORIES = ["음식", "밥류", "면류", "국/탕류", "반찬류", "구이/볶음류", "한식", "중식", "일식", "양식"]


def _item_priority(item: Dict[str, Any]) -> tuple:
    category = str(item.get("category_major") or item.get("category", ""))
    return (
        SOURCE_PRIORITY.get(item.get("source"), 0),
        1 if any(value in category for value in GENERAL_FOOD_CATEGORIES) else 0,
        -count_nutrition_nulls(item),
        -len(str(item.get("name", ""))),
        bool(item.get("api_food_code")),
    )


def _merge_duplicate_group(group: List[Dict[str, Any]]) -> Dict[str, Any]:
    ranked = sorted(group, key=_item_priority, reverse=True)
    best = ranked[0].copy()

    if count_nutrition_nulls(best) > 0:
        for other in ranked[1:]:
            if count_nutrition_nulls(other) < count_nutrition_nulls(best):
                best["nutrition"] = (other.get("nutrition") or {}).copy()

    best["raw_material_text"] = best.get("raw_material_text") or first_non_empty(ranked, "raw_material_text")
    best["allergen_text"] = best.get("allergen_text") or first_non_empty(ranked, "allergen_text")

    nut = best.get("nutrition") or {}
    computed_factors = calculate_skin_factors(
        name=best.get("name", ""),
        sugar=nut.get("sugar"),
        sodium=nut.get("sodium"),
        fat=nut.get("fat"),
        saturated_fat=nut.get("saturated_fat"),
        trans_fat=nut.get("trans_fat"),
        carbohydrate=nut.get("carbohydrate"),
        category=best.get("category_major") or best.get("category", ""),
    )
    text_factors = []
    text_factor_sources = {"raw_material_dictionary", "haccp_allergen_text"}
    for other in ranked:
        for factor in other.get("skin_factors", []):
            if factor.get("source") in text_factor_sources:
                text_factors.append(factor)

    best["skin_factors"] = merge_skin_factors(computed_factors, text_factors)
    best.pop("dedupe_name", None)
    return best


def dedupe_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:

    grouped = {}
    for item in items:
        nn = item.get("dedupe_name") or normalize_food_name_for_dedupe(item.get("name"))
        if not nn:
            continue

        if nn not in grouped:
            grouped[nn] = []
        grouped[nn].append(item)

    deduped = []
    for group in grouped.values():
        deduped.append(_merge_duplicate_group(group))

    by_code: Dict[str, List[Dict[str, Any]]] = {}
    without_code: List[Dict[str, Any]] = []
    for item in deduped:
        code = str(item.get("api_food_code") or "").strip()
        if not code:
            without_code.append(item)
            continue
        by_code.setdefault(code, []).append(item)

    return [_merge_duplicate_group(group) for group in by_code.values()] + without_code


def build_curated(args):
    raw_dict = []
    if args.raw_material_dictionary and os.path.exists(args.raw_material_dictionary):
        with open(args.raw_material_dictionary, "r", encoding="utf-8") as f:
            raw_dict = json.load(f)

    items = []

    if args.excel_input:
        import pandas as pd

        for excel_file in args.excel_input:
            if not os.path.exists(excel_file):
                continue

            print(f"Loading Excel: {excel_file}")
            if args.limit > 0:
                df = pd.read_excel(excel_file, nrows=args.limit)
            else:
                df = pd.read_excel(excel_file)

            cols = {}
            for col in df.columns:
                c = str(col).strip()
                if c in ("식품코드", "코드"): cols['code'] = c
                elif c in ("식품명", "음식명", "제품명", "1회 제공량당 영양성분명"): cols['name'] = c
                elif c in ("식품대분류명", "대분류명", "대분류", "카테고리"): cols['cat_major'] = c
                elif c in ("식품중분류명", "중분류명", "중분류"): cols['cat_middle'] = c
                elif c in ("식품소분류명", "소분류명", "소분류"): cols['cat_small'] = c
                elif c in ("식품세분류명", "세분류명", "세분류"): cols['cat_detail'] = c
                elif c in ("영양성분함량기준량", "1회제공량", "1회 제공량", "1회(단위)", "1회 섭취참고량", "1인(회)분량 참고량", "식품중량"): cols['serving'] = c
                elif c in ("에너지(kcal)", "에너지", "열량(kcal)", "칼로리"): cols['calories'] = c
                elif c in ("단백질(g)", "단백질"): cols['protein'] = c
                elif c in ("지방(g)", "지방"): cols['fat'] = c
                elif c in ("포화지방(g)", "포화지방", "포화지방산(g)", "포화지방산"): cols['saturated_fat'] = c
                elif c in ("트랜스지방(g)", "트랜스지방", "트랜스지방산(g)", "트랜스지방산"): cols['trans_fat'] = c
                elif c in ("탄수화물(g)", "탄수화물"): cols['carb'] = c
                elif c in ("당류(g)", "당류", "총당류(g)"): cols['sugar'] = c
                elif c in ("나트륨(mg)", "나트륨"): cols['sodium'] = c
                elif c in ("원재료명", "원재료", "재료"): cols['raw_material'] = c
                elif c in ("알레르기", "알레르기 유발물질", "알레르기유발물질"): cols['allergen'] = c

            if 'name' not in cols:
                print(f"Skipping {excel_file} - missing name column")
                continue

            for _, row in df.iterrows():
                name = str(row.get(cols['name'], ""))
                if not name or name == "nan":
                    continue

                cat = str(row.get(cols['cat_major'], "")) if 'cat_major' in cols else ""

                sugar = row.get(cols['sugar']) if 'sugar' in cols else None
                sodium = row.get(cols['sodium']) if 'sodium' in cols else None
                fat = row.get(cols['fat']) if 'fat' in cols else None
                saturated_fat = row.get(cols['saturated_fat']) if 'saturated_fat' in cols else None
                trans_fat = row.get(cols['trans_fat']) if 'trans_fat' in cols else None
                carb = row.get(cols['carb']) if 'carb' in cols else None
                calories = row.get(cols['calories']) if 'calories' in cols else None
                protein = row.get(cols['protein']) if 'protein' in cols else None

                raw_text = str(row.get(cols['raw_material'], "")) if 'raw_material' in cols else ""
                if raw_text == "nan": raw_text = ""
                allergen_text = str(row.get(cols['allergen'], "")) if 'allergen' in cols else ""
                if allergen_text == "nan": allergen_text = ""

                factors = calculate_skin_factors(
                    name=name,
                    sugar=safe_float(sugar),
                    sodium=safe_float(sodium),
                    fat=safe_float(fat),
                    saturated_fat=safe_float(saturated_fat),
                    trans_fat=safe_float(trans_fat),
                    carbohydrate=safe_float(carb),
                    category=cat
                )

                text_factors = []
                if raw_text and raw_dict:
                    text_factors.extend(calculate_skin_factors_from_raw_material_text(raw_text, raw_dict))
                text_factors.extend(extract_factors_from_allergen_text(allergen_text))
                if text_factors:
                    factors = merge_skin_factors(factors, text_factors)

                item = {
                    "api_food_code": str(row.get(cols['code'], "")) if 'code' in cols else "",
                    "name": name,
                    "display_name": name,
                    "normalized_name": normalize_name(name),
                    "dedupe_name": normalize_food_name_for_dedupe(name),
                    "category": cat,
                    "category_major": cat,
                    "category_middle": str(row.get(cols['cat_middle'], "")) if 'cat_middle' in cols else "",
                    "category_small": str(row.get(cols['cat_small'], "")) if 'cat_small' in cols else "",
                    "category_detail": str(row.get(cols['cat_detail'], "")) if 'cat_detail' in cols else "",
                    "serving_basis": str(row.get(cols['serving'], "")) if 'serving' in cols else "",
                    "source": "curated_skin_factor",
                    "nutrition": {
                        "calories": safe_float(calories),
                        "protein": safe_float(protein),
                        "fat": safe_float(fat),
                        "saturated_fat": safe_float(saturated_fat),
                        "trans_fat": safe_float(trans_fat),
                        "carbohydrate": safe_float(carb),
                        "sugar": safe_float(sugar),
                        "sodium": safe_float(sodium)
                    },
                    "raw_material_text": raw_text,
                    "allergen_text": allergen_text,
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
                        saturated_fat=nut.get("saturated_fat"),
                        trans_fat=nut.get("trans_fat"),
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

    final_items = []
    filtered_count = 0
    for item in deduped:
        if is_searchable_food_item(item):
            final_items.append(item)
        else:
            filtered_count += 1
            
    print(f"Filtered non-searchable ingredient-like items: {filtered_count}")
    print(f"Final searchable food items: {len(final_items)}")
    
    deduped = final_items

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
    parser.add_argument("--excel-input", action="append", default=[])
    parser.add_argument("--processed-json", default="")
    parser.add_argument("--mfds-json", default="")
    parser.add_argument("--raw-material-dictionary", default="")
    parser.add_argument("--output", required=True)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--source-priority", default="")

    args = parser.parse_args()
    build_curated(args)
