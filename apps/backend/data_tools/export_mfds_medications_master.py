import os
import sys
import gzip
import json
from datetime import date
from sqlalchemy.orm import Session

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import engine
from app.models.medication import Medication

def custom_serializer(obj):
    if isinstance(obj, date):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

def export_master_data():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(os.path.dirname(current_dir), "data", "mfds_medications_master.json.gz")
    
    print(f"Exporting master medication DB to {output_path}...")
    
    with Session(engine) as db:
        meds = db.query(Medication).filter(Medication.item_seq.isnot(None)).all()
        
        data_to_export = []
        for med in meds:
            data_to_export.append({
                "item_seq": med.item_seq,
                "name": med.name,
                "english_name": med.english_name,
                "form": med.form,
                "manufacturer": med.manufacturer,
                "valid_term": med.valid_term,
                "storage_method": med.storage_method,
                "material_name": med.material_name,
                "license_status": med.license_status,
                "license_date": med.license_date,
                "cancel_date": med.cancel_date,
                "efficacy_group": med.efficacy_group,
                "prescription_type": med.prescription_type,
                "source_updated_at": med.source_updated_at,
                "is_active": med.is_active
            })
            
    with gzip.open(output_path, 'wt', encoding='utf-8') as f:
        json.dump(data_to_export, f, ensure_ascii=False, indent=2, default=custom_serializer)
        
    print(f"Export completed! Total records exported: {len(data_to_export)}")

if __name__ == "__main__":
    export_master_data()
