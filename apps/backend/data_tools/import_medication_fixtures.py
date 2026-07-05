import os
import sys
from datetime import date, timedelta

# Add parent dir to path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.medication import Medication

def generate_mock_medications(count: int = 100):
    mocks = []
    base_date = date.today()
    for i in range(1, count + 1):
        is_cancelled = (i % 10 == 0) # Every 10th item is cancelled
        
        med = {
            "item_seq": f"MOCK2026{i:04d}",
            "name": f"Mock Medication {i} (Aspirin)" if not is_cancelled else f"Mock Cancelled Med {i}",
            "english_name": f"Mock Med EN {i}",
            "form": "Tablet" if i % 2 == 0 else "Capsule",
            "manufacturer": f"Mock Pharma {i % 5}",
            "valid_term": "36 months",
            "storage_method": "Room temperature",
            "material_name": "Aspirin 500mg" if i % 2 == 0 else "Ibuprofen 200mg",
            "license_status": "취하" if is_cancelled else "정상",
            "license_date": base_date - timedelta(days=1000 + i),
            "cancel_date": base_date - timedelta(days=i) if is_cancelled else None,
            "efficacy_group": "114 - 해열, 진통, 소염제",
            "prescription_type": "일반의약품" if i % 3 == 0 else "전문의약품",
            "source_updated_at": base_date,
            "is_active": not is_cancelled
        }
        mocks.append(med)
    return mocks

def import_medication_fixtures():
    print("Starting Medication fixture import...")
    mocks = generate_mock_medications(100)
    
    try:
        db = SessionLocal()
        inserted = 0
        updated = 0
        inactive = 0
        
        for mock in mocks:
            existing = db.query(Medication).filter(Medication.item_seq == mock["item_seq"]).first()
            if existing:
                # Update
                for key, value in mock.items():
                    setattr(existing, key, value)
                updated += 1
            else:
                # Insert
                new_med = Medication(**mock)
                db.add(new_med)
                inserted += 1
                
            if not mock["is_active"]:
                inactive += 1
                
        db.commit()
        print(f"Fixture Import Summary:")
        print(f" - Total Processed: {len(mocks)}")
        print(f" - Inserted: {inserted}")
        print(f" - Updated: {updated}")
        print(f" - Inactive (Cancelled): {inactive}")
        
    except Exception as e:
        print(f"Failed to import fixtures (DB connection issue?): {e}")
    finally:
        if 'db' in locals():
            db.close()

if __name__ == "__main__":
    import_medication_fixtures()
