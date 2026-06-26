import os
import sys
import json
import argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app.models.diet
import app.models.environment
import app.models.skin_log
from app.database import SessionLocal
from app.models.diet import FoodItem, DietLogItem

def import_curated_items(json_file: str, dry_run: bool, deactivate_missing: bool):
    print(f"Loading {json_file}...")
    with open(json_file, "r", encoding="utf-8") as f:
        curated_data = json.load(f)
        
    db = SessionLocal()
    
    total_input = len(curated_data)
    inserted = 0
    updated = 0
    skipped = 0
    
    print(f"Total curated input items: {total_input}")
    
    # Pre-fetch existing
    existing_by_code = {}
    existing_by_norm_name = {}
    
    all_existing = db.query(FoodItem).all()
    for item in all_existing:
        if item.api_food_code:
            existing_by_code[item.api_food_code] = item
        nn = item.name.replace(" ", "").lower() if item.name else ""
        if nn:
            if nn not in existing_by_norm_name:
                existing_by_norm_name[nn] = []
            existing_by_norm_name[nn].append(item)
            
    print(f"Loaded {len(all_existing)} existing items from DB.")
    
    # Tracking for deletion/legacy
    curated_matched_ids = set()
    
    for c_item in curated_data:
        code = c_item.get("api_food_code")
        nn = c_item.get("normalized_name") or str(c_item.get("name", "")).replace(" ", "").lower()
        
        target = None
        
        # 1. Match by code
        if code and code in existing_by_code:
            target = existing_by_code[code]
        # 2. Match by normalized name
        elif nn and nn in existing_by_norm_name:
            # pick the first one, or the one with same source
            candidates = existing_by_norm_name[nn]
            # sort to pick best candidate
            candidates.sort(key=lambda x: (
                1 if x.source in ['curated_skin_factor', 'public_api'] else 0,
                len(str(x.name))
            ), reverse=True)
            target = candidates[0]
            
        if target:
            # Update
            if not dry_run:
                target.name = c_item.get("name") or target.name
                target.category = c_item.get("category_major") or c_item.get("category") or target.category
                target.calories = c_item.get("nutrition", {}).get("calories")
                target.carbohydrate = c_item.get("nutrition", {}).get("carbohydrate")
                target.protein = c_item.get("nutrition", {}).get("protein")
                target.fat = c_item.get("nutrition", {}).get("fat")
                target.sugar = c_item.get("nutrition", {}).get("sugar")
                target.sodium = c_item.get("nutrition", {}).get("sodium")
                target.saturated_fat = c_item.get("nutrition", {}).get("saturated_fat")
                target.trans_fat = c_item.get("nutrition", {}).get("trans_fat")
                target.skin_factors = c_item.get("skin_factors")
                if "raw_material_text" in c_item:
                    target.raw_material_text = c_item.get("raw_material_text")
                if "allergen_text" in c_item:
                    target.allergen_text = c_item.get("allergen_text")
                target.source = "curated_skin_factor"
                
            curated_matched_ids.add(target.id)
            updated += 1
        else:
            # Insert
            if not dry_run:
                new_item = FoodItem(
                    api_food_code=code,
                    name=c_item.get("name"),
                    category=c_item.get("category_major") or c_item.get("category"),
                    calories=c_item.get("nutrition", {}).get("calories"),
                    carbohydrate=c_item.get("nutrition", {}).get("carbohydrate"),
                    protein=c_item.get("nutrition", {}).get("protein"),
                    fat=c_item.get("nutrition", {}).get("fat"),
                    sugar=c_item.get("nutrition", {}).get("sugar"),
                    sodium=c_item.get("nutrition", {}).get("sodium"),
                    saturated_fat=c_item.get("nutrition", {}).get("saturated_fat"),
                    trans_fat=c_item.get("nutrition", {}).get("trans_fat"),
                    raw_material_text=c_item.get("raw_material_text"),
                    allergen_text=c_item.get("allergen_text"),
                    source="curated_skin_factor",
                    skin_factors=c_item.get("skin_factors"),
                )
                db.add(new_item)
            inserted += 1
            
    # Handle duplicates/missing
    unmatched_existing = [item for item in all_existing if item.id not in curated_matched_ids]
    
    would_delete_duplicates_count = 0
    referenced_legacy_count = 0
    
    # Check references
    # Since we can't easily query all un-matched in one go if there are many, 
    # we use a bulk query for efficiency.
    unmatched_ids = [item.id for item in unmatched_existing]
    
    referenced_ids = set()
    if unmatched_ids:
        # split into chunks to avoid too large IN clause
        chunk_size = 10000
        for i in range(0, len(unmatched_ids), chunk_size):
            chunk = unmatched_ids[i:i+chunk_size]
            refs = db.query(DietLogItem.food_item_id).filter(DietLogItem.food_item_id.in_(chunk)).distinct().all()
            for (rid,) in refs:
                referenced_ids.add(rid)
                
    for item in unmatched_existing:
        if item.id in referenced_ids:
            referenced_legacy_count += 1
        else:
            would_delete_duplicates_count += 1
            
    print("\n--- Import Dry Run Stats ---" if dry_run else "\n--- Import Stats ---")
    print(f"Total Input: {total_input}")
    print(f"Inserted: {inserted}")
    print(f"Updated: {updated}")
    print(f"Skipped: {skipped}")
    print(f"Would delete (unreferenced duplicates): {would_delete_duplicates_count}")
    print(f"Referenced legacy (must keep): {referenced_legacy_count}")
    
    if not dry_run:
        db.commit()
        print("Changes committed to database.")
        
    db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--json-input", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--deactivate-missing",
        action="store_true",
        help="Reserved for compatibility. Missing-row cleanup is handled by merge_curated_food_items.py.",
    )
    
    args = parser.parse_args()
    if args.deactivate_missing:
        print(
            "--deactivate-missing is not supported by this importer. "
            "Use data_tools/merge_curated_food_items.py with an explicit dry-run before cleanup."
        )
        sys.exit(2)

    import_curated_items(args.json_input, args.dry_run, args.deactivate_missing)
