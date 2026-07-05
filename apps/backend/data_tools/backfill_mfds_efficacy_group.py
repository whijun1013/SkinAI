import os
import httpx
import time
from dotenv import load_dotenv
from sqlalchemy.orm import Session
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine
from app.models.medication import Medication

load_dotenv()
API_KEY = os.getenv("MFDS_API_KEY")
BASE_URL = "https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07"

def backfill_efficacy_group():
    if not API_KEY:
        print("Warning: MFDS_API_KEY is not set.")
        return
        
    print("Starting efficacy_group backfill...")
    
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
                    
                items = data.get('body', {}).get('items', [])
                if not items:
                    break
                    
                total_count = data.get('body', {}).get('totalCount', 0)
                updated_in_page = 0
                
                for item in items:
                    item_seq = item.get("ITEM_SEQ")
                    efficacy_group = item.get("PRDLST_STDR_CODE")
                    
                    if not item_seq or not efficacy_group:
                        continue
                        
                    if len(efficacy_group) > 100:
                        efficacy_group = efficacy_group[:97] + "..."
                        
                    existing = db.query(Medication).filter(Medication.item_seq == item_seq).first()
                    if existing:
                        existing.efficacy_group = efficacy_group
                        updated_in_page += 1
                
                db.commit()
                total_fetched += len(items)
                
                print(f"Processed page {page_no}. Total fetched: {total_fetched}/{total_count}, Updated: {updated_in_page}")
                
                if total_fetched >= total_count or len(items) < num_of_rows:
                    break
                    
                page_no += 1
                time.sleep(0.1)
            
        print(f"Completed! Total MFDS list items processed: {total_fetched}")

if __name__ == "__main__":
    backfill_efficacy_group()
