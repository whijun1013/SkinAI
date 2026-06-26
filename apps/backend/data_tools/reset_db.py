import os
import json

current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
db_path = os.path.join(backend_dir, "data", "oliveyoung_db.json")
checkpoint_path = os.path.join(current_dir, "oy_crawl_checkpoint.json")

# Reset database to empty array
os.makedirs(os.path.dirname(db_path), exist_ok=True)
with open(db_path, "w", encoding="utf-8") as f:
    json.dump([], f)
print(f"Reset database at {db_path}")

# Remove checkpoint if exists
if os.path.exists(checkpoint_path):
    os.remove(checkpoint_path)
    print("Removed checkpoint file.")
else:
    print("No checkpoint file found.")
