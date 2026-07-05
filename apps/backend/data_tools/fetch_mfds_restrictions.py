import os
import time
import httpx
from dotenv import load_dotenv
from sqlalchemy.orm import Session
import sys

# Add parent dir to path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine
from app.models.cosmetic import CosmeticIngredient

load_dotenv()

API_KEY = os.getenv("MFDS_API_KEY")
if not API_KEY:
    raise ValueError("MFDS_API_KEY is not set in the environment variables.")

# Try standard operation endpoint for Korean data portal
BASE_URL = "https://apis.data.go.kr/1471000/CsmtcsUseRstrcInfoService/getCsmtcsUseRstrcInfoService"

def fetch_and_seed_restrictions():
    print("Starting MFDS Restriction API sync...")
    
    with Session(engine) as db:
        page_no = 1
        num_of_rows = 100
        total_fetched = 0
        
        with httpx.Client(timeout=15.0) as client:
            while True:
                # Some API keys need to be passed exactly as unencoded query strings,
                # but we'll try httpx params first.
                params = {
                    'ServiceKey': API_KEY,
                    'pageNo': str(page_no),
                    'numOfRows': str(num_of_rows),
                    'type': 'json'
                }
                
                print(f"Fetching restriction page {page_no}...")
                try:
                    # In case httpx double-encodes the key and fails with 400/403, 
                    # we can also build the URL manually if needed in the future.
                    res = client.get(BASE_URL, params=params)
                    if res.status_code != 200:
                        print(f"Error: API returned status {res.status_code}. The API key might need registration for this specific service.")
                        break
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
                    
                for item in items:
                    # Usually, the fields are ITEM_KOR_NAME, USE_LMT_DIV_NM (e.g. 배합금지), RSTRC_CN (한도)
                    # We will use flexible gets to avoid KeyError
                    kor_name = item.get('ITEM_KOR_NAME', '').strip()
                    if not kor_name:
                        continue
                    
                    limit_type = item.get('USE_LMT_DIV_NM', '')
                    rstrc_cn = item.get('RSTRC_CN', '')
                    
                    # Update database if ingredient exists, or insert if new
                    existing = db.query(CosmeticIngredient).filter(CosmeticIngredient.name == kor_name).first()
                    
                    is_banned = False
                    if '배합금지' in limit_type or '사용금지' in limit_type:
                        is_banned = True
                    
                    restriction_limit = rstrc_cn if rstrc_cn else limit_type
                    if is_banned and not rstrc_cn:
                        restriction_limit = "배합 금지"
                    
                    if existing:
                        existing.is_banned = is_banned
                        existing.restriction_limit = restriction_limit
                        # Populate is_irritant for ERD compatibility
                        existing.is_irritant = is_banned or (restriction_limit is not None and restriction_limit != '')
                    else:
                        new_ing = CosmeticIngredient(
                            name=kor_name,
                            is_banned=is_banned,
                            restriction_limit=restriction_limit,
                            is_irritant=is_banned or (restriction_limit is not None and restriction_limit != '')
                        )
                        db.add(new_ing)
                
                db.commit()
                total_fetched += len(items)
                print(f"Processed restriction page {page_no}. Total processed: {total_fetched}/{total_count}")
                
                if total_fetched >= total_count or len(items) < num_of_rows:
                    break
                    
                page_no += 1
                time.sleep(0.1)
                
        print(f"Completed! Total MFDS restrictions processed: {total_fetched}")

if __name__ == "__main__":
    fetch_and_seed_restrictions()
