import sys
import os

# Add parent dir to path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.database_seed import seed_cosmetics_data, seed_medications_data

def main():
    print("Starting master data seed...")
    db = SessionLocal()
    try:
        print("Seeding cosmetics data...")
        seed_cosmetics_data(db)
        print("Seeding medications data...")
        seed_medications_data(db)
        print("Master data seed completed successfully.")
    except Exception as e:
        print(f"Error during seeding: {e}", file=sys.stderr)
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    main()
