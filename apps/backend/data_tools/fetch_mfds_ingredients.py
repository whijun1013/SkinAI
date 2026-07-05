import os
import httpx
import time
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from sqlalchemy.dialects.mysql import insert
import sys

# Add parent dir to path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine, Base
from app.models.cosmetic import CosmeticIngredient, CosmeticProduct, UserCosmetic
from app.models.medication import Medication, MedicationIngredient, UserMedication
from app.models.user import User, SocialAccount

load_dotenv()

API_KEY = os.getenv("MFDS_API_KEY")
if not API_KEY:
    raise ValueError("MFDS_API_KEY is not set in the environment variables.")

BASE_URL = "https://apis.data.go.kr/1471000/CsmtcsIngdCpntInfoService01/getCsmtcsIngdCpntInfoService01"

def fetch_and_seed_mfds():
    print("Starting MFDS ingredients sync...")
    with Session(engine) as db:
        page_no = 1
        num_of_rows = 100
        total_fetched = 0
        
        with httpx.Client(timeout=15.0) as client:
            while True:
                params = {
                    'ServiceKey': API_KEY,
                    'pageNo': str(page_no),
                    'numOfRows': str(num_of_rows),
                    'type': 'json'
                }
                
                print(f"Fetching page {page_no}...")
                try:
                    res = client.get(BASE_URL, params=params)
                    res.raise_for_status()
                    data = res.json()
                except Exception as e:
                    print(f"Error fetching page {page_no}: {e}")
                    break
                    
                header = data.get('header', {})
                if header.get('resultCode') != '00':
                    print(f"API Error: {header.get('resultMsg')}")
                    break
                    
                body = data.get('body', {})
                items = body.get('items', [])
                total_count = body.get('totalCount', 0)
                
                if not items:
                    break
                    
                ingredients_to_insert = []
                for item in items:
                    kor_name = item.get('INGR_KOR_NAME')
                    if not kor_name:
                        continue
                        
                    kor_name = kor_name.strip()
                    if len(kor_name) > 255:
                        kor_name = kor_name[:255]
                    eng_name = item.get('INGR_ENG_NAME')
                    cas_no = item.get('CAS_NO')
                    origin = item.get('ORIGIN_MAJOR_KOR_NAME')
                    
                    # We use MySQL's ON DUPLICATE KEY UPDATE via sqlalchemy insert()
                    # But to keep it DB agnostic for now, we can query and update, or just ignore existing
                    ingredients_to_insert.append({
                        "name": kor_name,
                        "english_name": eng_name.strip() if eng_name else None,
                        "cas_no": cas_no.strip() if cas_no else None,
                        "origin": origin.strip() if origin else None
                    })
                
                # Simple batch insert with update on duplicate name
                for ing_data in ingredients_to_insert:
                    existing = db.query(CosmeticIngredient).filter(CosmeticIngredient.name == ing_data['name']).first()
                    if existing:
                        if ing_data['english_name']: existing.english_name = ing_data['english_name']
                        if ing_data['cas_no']: existing.cas_no = ing_data['cas_no']
                        if ing_data['origin']: existing.origin = ing_data['origin']
                    else:
                        new_ing = CosmeticIngredient(
                            name=ing_data['name'],
                            english_name=ing_data['english_name'],
                            cas_no=ing_data['cas_no'],
                            origin=ing_data['origin']
                        )
                        db.add(new_ing)
                
                db.commit()
                total_fetched += len(ingredients_to_insert)
                
                print(f"Processed page {page_no}. Total processed: {total_fetched}/{total_count}")
                
                if total_fetched >= total_count or len(items) < num_of_rows:
                    break
                    
                page_no += 1
                time.sleep(0.1)  # Rate limiting
            
        print(f"Completed! Total MFDS ingredients updated/inserted: {total_fetched}")

if __name__ == "__main__":
    fetch_and_seed_mfds()
