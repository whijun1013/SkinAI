import sys
import os
import json
import argparse
from typing import List, Dict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sqlalchemy.orm import Session
from app.database import SessionLocal
import app.models.environment
from app.models.diet import FoodItem

def load_existing_foods(db: Session) -> Dict[str, FoodItem]:
    rows = db.query(FoodItem).all()
    code_map = {r.api_food_code: r for r in rows if r.api_food_code}
    name_map = {r.name.replace(" ", ""): r for r in rows}
    return code_map, name_map

def import_json(db: Session, filepath: str) -> dict:
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return {}
        
    with open(filepath, "r", encoding="utf-8") as f:
        items = json.load(f)
        
    print(f"Loaded {len(items)} items from JSON.")
    
    code_map, name_map = load_existing_foods(db)
    
    saved = 0
    updated = 0
    batch = []
    
    stats = {"total_input": len(items), "saved": 0, "updated": 0, "with_factors": 0, "factor_counts": {}}
    
    for item in items:
        code = item.get("api_food_code")
        name = item.get("name")
        normalized = item.get("normalized_name") or name.replace(" ", "")
        
        nutr = item.get("nutrition", {})
        factors = item.get("skin_factors", [])
        
        if factors:
            stats["with_factors"] += 1
            for f in factors:
                key = f["key"]
                stats["factor_counts"][key] = stats["factor_counts"].get(key, 0) + 1
        
        existing = None
        if code and code in code_map:
            existing = code_map[code]
        elif normalized in name_map:
            existing = name_map[normalized]
            
        if existing:
            # Update
            existing.skin_factors = factors
            existing.calories = nutr.get("calories")
            existing.carbohydrate = nutr.get("carbohydrate")
            existing.sugar = nutr.get("sugar")
            existing.protein = nutr.get("protein")
            existing.fat = nutr.get("fat")
            existing.saturated_fat = nutr.get("saturated_fat")
            existing.trans_fat = nutr.get("trans_fat")
            existing.sodium = nutr.get("sodium")
            existing.category = item.get("category_major")
            if "raw_material_text" in item:
                existing.raw_material_text = item.get("raw_material_text")
            if "allergen_text" in item:
                existing.allergen_text = item.get("allergen_text")
            updated += 1
        else:
            # Insert
            food = FoodItem(
                api_food_code=code,
                name=name,
                category=item.get("category_major"),
                calories=nutr.get("calories"),
                carbohydrate=nutr.get("carbohydrate"),
                sugar=nutr.get("sugar"),
                protein=nutr.get("protein"),
                fat=nutr.get("fat"),
                saturated_fat=nutr.get("saturated_fat"),
                trans_fat=nutr.get("trans_fat"),
                sodium=nutr.get("sodium"),
                skin_factors=factors,
                raw_material_text=item.get("raw_material_text"),
                allergen_text=item.get("allergen_text"),
                source="public_api"
            )
            batch.append(food)
            saved += 1
            if code:
                code_map[code] = food
            name_map[normalized] = food
            
        if len(batch) >= 500:
            db.add_all(batch)
            db.commit()
            batch = []
            
    if batch:
        db.add_all(batch)
        db.commit()
        
    db.commit() # Ensure updates are committed
    
    stats["saved"] = saved
    stats["updated"] = updated
    
    return stats

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/food_skin_factor_items.json")
    args = parser.parse_args()
    
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), args.input)
    
    db = SessionLocal()
    try:
        stats = import_json(db, path)
        print("\n=== Import Results ===")
        print(f"Total Input: {stats.get('total_input')}")
        print(f"Saved (New): {stats.get('saved')}")
        print(f"Updated (Existing): {stats.get('updated')}")
        print(f"Items with skin_factors: {stats.get('with_factors')}")
        print("Factor counts:")
        for k, v in stats.get("factor_counts", {}).items():
            print(f"  {k}: {v}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
