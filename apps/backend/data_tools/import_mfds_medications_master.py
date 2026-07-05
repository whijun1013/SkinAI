import os
import sys
import gzip
import json
from datetime import datetime
from sqlalchemy.orm import Session

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import engine
from app.models.medication import Medication

def parse_date(date_str: str):
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str).date()
    except:
        return None

def import_master_data():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    input_path = os.path.join(os.path.dirname(current_dir), "data", "mfds_medications_master.json.gz")
    
    if not os.path.exists(input_path):
        print(f"File not found: {input_path}")
        return
        
    print(f"Importing master medication DB from {input_path}...")
    
    with gzip.open(input_path, 'rt', encoding='utf-8') as f:
        data = json.load(f)
        
    with Session(engine) as db:
        inserted = 0
        updated = 0
        
        for item in data:
            item_seq = item.get("item_seq")
            if not item_seq:
                continue
                
            existing = db.query(Medication).filter(Medication.item_seq == item_seq).first()
            if existing:
                existing.name = item.get("name") or existing.name
                existing.english_name = item.get("english_name") or existing.english_name
                existing.form = item.get("form") or existing.form
                existing.manufacturer = item.get("manufacturer") or existing.manufacturer
                existing.valid_term = item.get("valid_term") or existing.valid_term
                existing.storage_method = item.get("storage_method") or existing.storage_method
                existing.material_name = item.get("material_name") or existing.material_name
                existing.license_status = item.get("license_status") or existing.license_status
                existing.license_date = parse_date(item.get("license_date")) or existing.license_date
                existing.cancel_date = parse_date(item.get("cancel_date")) or existing.cancel_date
                existing.efficacy_group = item.get("efficacy_group") or existing.efficacy_group
                existing.prescription_type = item.get("prescription_type") or existing.prescription_type
                existing.source_updated_at = parse_date(item.get("source_updated_at")) or existing.source_updated_at
                existing.is_active = item.get("is_active", existing.is_active)
                updated += 1
            else:
                new_med = Medication(
                    item_seq=item_seq,
                    name=item.get("name"),
                    english_name=item.get("english_name"),
                    form=item.get("form"),
                    manufacturer=item.get("manufacturer"),
                    valid_term=item.get("valid_term"),
                    storage_method=item.get("storage_method"),
                    material_name=item.get("material_name"),
                    license_status=item.get("license_status"),
                    license_date=parse_date(item.get("license_date")),
                    cancel_date=parse_date(item.get("cancel_date")),
                    efficacy_group=item.get("efficacy_group"),
                    prescription_type=item.get("prescription_type"),
                    source_updated_at=parse_date(item.get("source_updated_at")),
                    is_active=item.get("is_active", True)
                )
                db.add(new_med)
                inserted += 1
                
        db.commit()
        print(f"Import completed! Inserted: {inserted}, Updated: {updated}")

if __name__ == "__main__":
    import_master_data()
