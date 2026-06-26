import json
import re
import os
from sqlalchemy.orm import Session
from app.models.cosmetic import CosmeticProduct, CosmeticIngredient
from app.models.medication import Medication, MedicationIngredient

COMEDOGENIC_DICT = {
    '스테아릭애씨드': 3, 'stearic acid': 3,
    '코코넛오일': 4, 'coconut oil': 4,
    '이소프로필미리스테이트': 5, 'isopropyl myristate': 5,
    '조류추출물': 5, 'algae extract': 5,
    '소듐라우릴설페이트': 5, 'sodium lauryl sulfate': 5,
    '밀배아오일': 5, 'wheat germ oil': 5,
    '쉐어버터': 3, 'shea butter': 3,
    '라놀린': 1, 'lanolin': 1,
    '미네랄오일': 2, 'mineral oil': 2,
    '세틸알코올': 2, 'cetyl alcohol': 2,
    '스쿠알란': 1, 'squalane': 1,
    '디메티콘': 1, 'dimethicone': 1
}



def clean_ingredient_name(name: str) -> str:
    # Remove zero-width space and other non-printing characters
    cleaned = name.replace('\u200b', '').replace('\u200c', '').replace('\u200d', '').replace('\ufeff', '')
    # Remove quotes and brackets
    cleaned = cleaned.replace('"', '').replace("'", '').replace('[', '').replace(']', '').replace('{', '').replace('}', '')

    # If there's a colon, the actual ingredient is usually the part after it (e.g. "01 오트 : 마이카" -> " 마이카")
    if ':' in cleaned:
        cleaned = cleaned.split(':')[-1]

    # Remove specific prefixes
    cleaned = re.sub(r'^(?:STEP\d*\s*전성분\s*|전성분\s*|본품\s*|증정품\s*)', '', cleaned, flags=re.IGNORECASE)
    # Remove option numbers at start like '4호 ' or '1.'
    cleaned = re.sub(r'^\d+호\s*', '', cleaned)
    cleaned = re.sub(r'^\d+\.\s*', '', cleaned)

    # Remove leading weird bullets, dashes, colons, stars, hashes
    cleaned = re.sub(r'^[\s\-:.*#※|■●★•]+', '', cleaned)
    cleaned = cleaned.strip()

    # Validation filters to return empty string for non-ingredients
    if not cleaned or cleaned.isdigit():
        return ''
    # Option names like '04 피넛브라운', '01오트', '21NW호'
    if re.match(r'^\d{2,3}\s*[#가-힣a-zA-Z\s]+$', cleaned) or re.match(r'^[\w\d]+호$', cleaned):
        return ''
    # Product names mixed in ingredients
    bad_keywords = ['기획', '단품', '미니', '틴트', '팔레트', '증정', '클렌저', '산화제', '염모제', '불러도돼', '클렌징', '마스크', '패드']
    if any(k in cleaned for k in bad_keywords):
        return ''
    # Meaningless single special characters or remnants
    if len(cleaned) < 2 and not cleaned.isalpha():
        return ''

    return cleaned

def seed_cosmetics_data(db: Session):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(
        os.path.dirname(current_dir),
        "data", "oliveyoung_db.json"
    )

    if not os.path.exists(json_path):
        print(f"[Seed] Source JSON database not found at: {json_path}")
        return

    try:
        existing_products = set(
            db.query(CosmeticProduct.brand, CosmeticProduct.product_name).all()
        )
    except Exception as e:
        print(f"[Seed] Failed to fetch existing products: {e}")
        existing_products = set()

    ingredient_cache = {ing.name.lower(): ing for ing in db.query(CosmeticIngredient).all()}

    print(f"[Seed] Reading cosmetics data from {json_path}...")
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        new_products = []
        seen_products = set()
        for item in data:
            brand = item.get("brand", "").strip()
            product_name = item.get("product_name", "").strip()
            original_ingredients_text = (item.get("ingredients") or item.get("ingredients_text") or "").strip()

            if not brand or not product_name or not original_ingredients_text:
                continue

            if product_name in ['상품명', '가품 피해 방지 안내'] or brand == "GPT Dummy":
                continue

            if (brand, product_name) in existing_products or (brand, product_name) in seen_products:
                continue

            seen_products.add((brand, product_name))

            # Copy for parsing
            parsed_text = original_ingredients_text

            # Fix hyphen line-breaks like 폴리글리세릴\n-10라우레이트
            parsed_text = re.sub(r'\n\s*-', '-', parsed_text)

            # Remove option blocks like [01 핑크]
            parsed_text = re.sub(r'\[.*?\]', '', parsed_text)

            # Remove concentration formats with commas like 150,000 ppm, 10%
            parsed_text = re.sub(r'\d+(?:,\d+)*(?:\.\d+)?\s*(?:ppm|ppb|%|PPM|PPB)', '', parsed_text)
            parsed_text = parsed_text.replace("함유", "")

            # Remove everything inside parentheses
            parsed_text = re.sub(r'\([^\)]*\)', '', parsed_text)

            # Normalize alternate delimiters, split, and clean non-printing characters
            normalized_text = re.sub(r'[\n∙·@]+', ',', parsed_text)
            raw_ings = [clean_ingredient_name(ing) for ing in normalized_text.split(",") if ing.strip()]
            raw_ings = [ing for ing in raw_ings if ing]
            product_ing_objs = []
            seen_in_product = set()

            for ing_name in raw_ings:
                # Limit ingredient name length to avoid db constraints
                if len(ing_name) > 100:
                    ing_name = ing_name[:100]

                ing_lower = ing_name.lower()

                if ing_lower in seen_in_product:
                    continue
                seen_in_product.add(ing_lower)

                if ing_lower in ingredient_cache:
                    product_ing_objs.append(ingredient_cache[ing_lower])
                    continue

                comedogenic_score = None

                for key, score in COMEDOGENIC_DICT.items():
                    if key in ing_lower:
                        comedogenic_score = max(comedogenic_score or 0, score)

                new_ing = CosmeticIngredient(
                    name=ing_name,
                    comedogenic=comedogenic_score,
                    comedogenic_source="Fulton scale legacy rabbit-ear data; ingredient-level only" if comedogenic_score is not None else None
                )
                db.add(new_ing)
                ingredient_cache[ing_lower] = new_ing
                product_ing_objs.append(new_ing)

            new_prod = CosmeticProduct(
                brand=brand,
                product_name=product_name,
                ingredients=original_ingredients_text,
                category=item.get("category", ""),
                image_url=item.get("image_url", ""),
                ingredients_list=product_ing_objs
            )
            new_products.append(new_prod)

        if new_products:
            print(f"[Seed] Preparing insert of {len(new_products)} new products and their ingredient mappings...")
            db.add_all(new_products)
            db.commit()
            print(f"[Seed] Successfully seeded {len(new_products)} new cosmetics into the database.")
        else:
            print("[Seed] No new cosmetics found to seed.")

    except Exception as e:
        db.rollback()
        print(f"[Seed] Failed to seed cosmetics database: {e}")

def clean_med_name(name: str) -> str:
    cleaned = name.replace('\u200b', '').replace('\u200c', '').replace('\u200d', '').replace('\ufeff', '')
    return cleaned.strip()

def seed_medications_data(db: Session):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(
        os.path.dirname(current_dir),
        "data", "skin_affecting_drugs.json"
    )

    if not os.path.exists(json_path):
        print(f"[Seed] Source JSON database not found at: {json_path}")
        return

    try:
        existing_meds = set(db.query(Medication.name).all())
        existing_meds = {m[0] for m in existing_meds}
    except Exception as e:
        print(f"[Seed] Failed to fetch existing medications: {e}")
        existing_meds = set()

    ingredient_cache = {ing.name.lower(): ing for ing in db.query(MedicationIngredient).all()}

    print(f"[Seed] Reading medications data from {json_path}...")
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        new_meds = []
        for item in data:
            item_name = item.get("item_name", "").strip()
            if not item_name or item_name in existing_meds:
                continue

            drug_class = item.get("category", "")
            active_ingredients = item.get("active_ingredients", [])

            med_ing_objs = []
            seen_in_med = set()

            for ai in active_ingredients:
                ko_name = ai.get("ko", "").strip()
                if not ko_name:
                    continue
                ko_name = clean_med_name(ko_name)
                if len(ko_name) > 100:
                    ko_name = ko_name[:100]

                ko_lower = ko_name.lower()
                if ko_lower in seen_in_med:
                    continue
                seen_in_med.add(ko_lower)

                if ko_lower in ingredient_cache:
                    med_ing_objs.append(ingredient_cache[ko_lower])
                    continue

                new_ing = MedicationIngredient(
                    name=ko_name,
                    drug_class=drug_class,
                    is_skin_relevant=True
                )
                db.add(new_ing)
                ingredient_cache[ko_lower] = new_ing
                med_ing_objs.append(new_ing)

            # Some tablet info logic
            tablet_info = item.get("tablet_info", {})
            form = tablet_info.get("shape", "") if isinstance(tablet_info, dict) else ""

            new_med = Medication(
                name=item_name,
                form=form
            )
            new_med.ingredients_list = med_ing_objs
            db.add(new_med)
            new_meds.append(new_med)

        if new_meds:
            print(f"[Seed] Preparing insert of {len(new_meds)} new medications and their ingredient mappings...")
            db.commit()
            print(f"[Seed] Successfully seeded {len(new_meds)} new medications into the database.")
        else:
            print("[Seed] No new medications to seed.")

    except Exception as e:
        db.rollback()
        print(f"[Seed] Failed to seed medications database: {e}")
