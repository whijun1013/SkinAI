import os
import sys
import json
import argparse
import re
from sqlalchemy import text
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app.models.diet
import app.models.environment
import app.models.skin_log
from app.database import SessionLocal
from app.models.diet import FoodItem, DietLogItem

def normalize_food_name_for_dedupe(name: str) -> str:
    if not name:
        return ""
    n = str(name).lower()
    n = re.sub(r'\(.*?\)', '', n)
    n = re.sub(r'\[.*?\]', '', n)
    n = n.replace("모차렐라", "모짜렐라")
    n = n.replace(" ", "").replace("_", "")
    return n

def merge_items():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json-input", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rewrite-refs", action="store_true")
    parser.add_argument("--delete-unreferenced-duplicates", action="store_true")
    parser.add_argument("--name-query", default="")
    parser.add_argument("--sample-limit", type=int, default=0, help="Print sample of deleted items")
    parser.add_argument("--dry-run-confirmed", action="store_true", help="Confirm that dry-run results are ok to proceed with apply")
    args = parser.parse_args()
    
    if args.apply and not args.dry_run_confirmed:
        print("ERROR: You must pass --dry-run-confirmed to actually apply changes to DB.")
        sys.exit(1)

    db = SessionLocal()
    print(f"Loading {args.json_input}...")
    with open(args.json_input, "r", encoding="utf-8") as f:
        curated_data = json.load(f)
        
    print("Loading all DB items...")
    all_db_items = db.query(FoodItem).all()
    
    print("Loading DietLogItem reference counts...")
    from sqlalchemy import func
    ref_counts_raw = db.query(DietLogItem.food_item_id, func.count(DietLogItem.id)).group_by(DietLogItem.food_item_id).all()
    item_ref_counts = {item_id: count for item_id, count in ref_counts_raw}
    
    db_groups = {}
    for item in all_db_items:
        nn = normalize_food_name_for_dedupe(item.name)
        if nn not in db_groups:
            db_groups[nn] = []
        db_groups[nn].append(item)
        
    stats = {
        "total_curated_input": len(curated_data),
        "db_groups": len(db_groups),
        "inserts": 0,
        "updates": 0,
        "fk_rewrites": 0,
        "delete_candidates": 0,
        "would_delete": 0,
        "deleted": 0,
        "referenced_duplicates": 0,
        "skipped": 0
    }
    
    for i, c_item in enumerate(curated_data):
        if i % 10000 == 0 and i > 0:
            print(f"Processed {i} items...")
            
        nn = c_item.get("dedupe_name") or normalize_food_name_for_dedupe(c_item.get("name"))
        if args.name_query and args.name_query not in nn:
            continue
            
        group = db_groups.get(nn, [])
        
        if group:
            # find target
            c_code = c_item.get("api_food_code")
            target = next((item for item in group if item.api_food_code == c_code and c_code), None)
            if not target:
                # pick one with most references
                ref_counts = []
                for item in group:
                    c = item_ref_counts.get(item.id, 0)
                    ref_counts.append((c, item))
                ref_counts.sort(key=lambda x: x[0], reverse=True)
                target = ref_counts[0][1]
                
            if args.apply:
                target.name = c_item.get("name") or target.name
                target.category = c_item.get("category_major") or c_item.get("category") or target.category
                target.calories = c_item.get("nutrition", {}).get("calories")
                target.carbohydrate = c_item.get("nutrition", {}).get("carbohydrate")
                target.protein = c_item.get("nutrition", {}).get("protein")
                target.fat = c_item.get("nutrition", {}).get("fat")
                target.sugar = c_item.get("nutrition", {}).get("sugar")
                target.sodium = c_item.get("nutrition", {}).get("sodium")
                target.skin_factors = c_item.get("skin_factors")
                target.source = "curated_skin_factor"
                
                # API code logic: only update if it doesn't conflict, but since we are merging, 
                # we can just use the curated code. Handle unique constraint.
                if c_item.get("api_food_code") and c_item.get("api_food_code") != target.api_food_code:
                    # check if any other item in DB has this code
                    conflict = next((x for x in all_db_items if x.api_food_code == c_item.get("api_food_code") and x.id != target.id), None)
                    if not conflict:
                        target.api_food_code = c_item.get("api_food_code")
                        
            stats["updates"] += 1
            
            for dup in group:
                if dup.id == target.id:
                    continue
                    
                c = item_ref_counts.get(dup.id, 0)
                if c > 0:
                    stats["referenced_duplicates"] += 1
                    stats["fk_rewrites"] += c
                    if args.apply and args.rewrite_refs:
                        db.query(DietLogItem).filter(DietLogItem.food_item_id == dup.id).update({"food_item_id": target.id})
                
                stats["delete_candidates"] += 1
                if args.apply and args.delete_unreferenced_duplicates:
                    if args.rewrite_refs or c == 0:
                        db.delete(dup)
                        stats["deleted"] += 1
                        if args.sample_limit > 0 and stats["deleted"] <= args.sample_limit:
                            print(f"[DELETE] id={dup.id} name='{dup.name}' source='{dup.source}' factors={len(dup.skin_factors or [])}")
                    else:
                        stats["skipped"] += 1
                elif not args.apply:
                    if args.rewrite_refs or c == 0:
                        stats["would_delete"] += 1
                        if args.sample_limit > 0 and stats["would_delete"] <= args.sample_limit:
                            print(f"[DRY-RUN DELETE] id={dup.id} name='{dup.name}' source='{dup.source}' factors={len(dup.skin_factors or [])}")
                    else:
                        stats["skipped"] += 1
        else:
            stats["inserts"] += 1
            if args.apply:
                # check unique code
                c_code = c_item.get("api_food_code")
                if c_code:
                    conflict = next((x for x in all_db_items if x.api_food_code == c_code), None)
                    if conflict:
                        c_code = None
                new_item = FoodItem(
                    api_food_code=c_code,
                    name=c_item.get("name"),
                    category=c_item.get("category_major") or c_item.get("category"),
                    calories=c_item.get("nutrition", {}).get("calories"),
                    carbohydrate=c_item.get("nutrition", {}).get("carbohydrate"),
                    protein=c_item.get("nutrition", {}).get("protein"),
                    fat=c_item.get("nutrition", {}).get("fat"),
                    sugar=c_item.get("nutrition", {}).get("sugar"),
                    sodium=c_item.get("nutrition", {}).get("sodium"),
                    source="curated_skin_factor",
                    skin_factors=c_item.get("skin_factors")
                )
                db.add(new_item)
                
    if args.apply:
        db.commit()
        print("Changes committed to database.")
        
    print("\n--- Dry Run Stats ---" if not args.apply else "\n--- Apply Stats ---")
    for k, v in stats.items():
        print(f"  {k}: {v}")

    db.close()

if __name__ == "__main__":
    merge_items()
