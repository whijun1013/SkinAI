import os
import sys
import json
import argparse
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.services.skin_factor_rules import calculate_skin_factors, calculate_skin_factors_from_raw_material_text

def build_json(
    input_file: str, 
    output_file: str, 
    raw_material_dictionary: str = None,
    limit: int = 0,
    raw_material_column: str = None
):
    print(f"Reading excel file: {input_file}")
    df = pd.read_excel(input_file)
    
    if limit > 0:
        df = df.head(limit)
        
    # Load raw material dictionary if we are using the raw_material_column
    raw_material_dict = []
    if raw_material_column and raw_material_dictionary:
        if os.path.exists(raw_material_dictionary):
            with open(raw_material_dictionary, "r", encoding="utf-8") as f:
                raw_material_dict = json.load(f)
            print(f"Loaded raw material dictionary with {len(raw_material_dict)} entries.")
        else:
            print(f"Warning: raw_material_dictionary not found at {raw_material_dictionary}. Text-based factors will not be confirmed.")
    
    # Expected columns based on prompt
    cols = {
        'code': '식품코드',
        'name': '식품명',
        'data_type': '데이터구분명',
        'cat_major': '식품대분류명',
        'rep_food': '대표식품명',
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
    
    results = []
    
    for idx, row in df.iterrows():
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
            sugar=sugar,
            sodium=sodium,
            fat=fat,
            carbohydrate=carb,
            category=cat
        )
        
        # Parse raw material text if available
        if raw_material_column and raw_material_column in df.columns:
            raw_mat_text = str(row.get(raw_material_column, ""))
            if raw_mat_text and raw_mat_text != "nan":
                text_factors = calculate_skin_factors_from_raw_material_text(raw_mat_text, raw_material_dict)
                # Merge factors. Confirmed (from text) overrides estimated (from name)
                # Specifically, if text_factors gives dairy_confirmed, remove possible_dairy from name
                text_keys = {f["key"]: f for f in text_factors}
                
                merged = []
                for f in factors:
                    # if name estimation says possible_dairy but text gives dairy_confirmed, drop possible_dairy
                    if f["key"] == "possible_dairy" and "dairy_confirmed" in text_keys:
                        continue
                    # if text factor has the exact same key, text factor will be appended later and we can skip this one or keep it?
                    # Keep text factor only if duplicate
                    if f["key"] in text_keys:
                        continue
                    merged.append(f)
                
                merged.extend(text_factors)
                factors = merged
        
        item = {
            "api_food_code": str(row.get(cols['code'], "")),
            "name": name,
            "display_name": name,
            "normalized_name": name.replace(" ", ""),
            "data_type": str(row.get(cols['data_type'], "")),
            "category_major": cat,
            "representative_food": str(row.get(cols['rep_food'], "")),
            "category_middle": str(row.get(cols['cat_middle'], "")),
            "category_small": str(row.get(cols['cat_small'], "")),
            "category_detail": str(row.get(cols['cat_detail'], "")),
            "serving_basis": str(row.get(cols['serving'], "")),
            "source": "public_api",
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
        results.append(item)
        
    out_dir = os.path.dirname(os.path.abspath(output_file))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        
    print(f"Generated {len(results)} items -> {output_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--raw-material-column", default=None, help="Name of the column containing raw material text")
    parser.add_argument("--raw-material-dictionary", default="data/raw_material_dictionary.json", help="Path to raw material dictionary JSON")
    args = parser.parse_args()
    
    build_json(args.input, args.output, args.raw_material_dictionary, args.limit, args.raw_material_column)
