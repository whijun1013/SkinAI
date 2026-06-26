import argparse
import asyncio
import os
import sys
import pymongo
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[3]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import get_mongo_db
from app.services.medgemma_queue_service import TASK_COLLECTION


async def setup_indexes(dry_run: bool) -> None:
    try:
        db = get_mongo_db()
        collection = db[TASK_COLLECTION]
    except Exception as exc:
        print(f"[!] Failed to connect to MongoDB: {exc}", file=sys.stderr)
        print("[!] Ensure MONGO_URL and MONGO_DB_NAME are set in your environment.", file=sys.stderr)
        sys.exit(1)

    print(f"Creating indexes for collection: {TASK_COLLECTION} (dry_run={dry_run})...")

    indexes = [
        # Find task by skin_log_id and user_id (enqueue / status API)
        pymongo.IndexModel(
            [("skin_log_id", pymongo.ASCENDING), ("user_id", pymongo.ASCENDING)],
            name="idx_skin_user",
            background=True,
        ),
        # Find pending task for claim_next_medgemma_analysis_task
        pymongo.IndexModel(
            [("status", pymongo.ASCENDING), ("created_at", pymongo.ASCENDING)],
            name="idx_status_created",
            background=True,
        ),
        # Find stale running tasks
        pymongo.IndexModel(
            [("status", pymongo.ASCENDING), ("updated_at", pymongo.ASCENDING)],
            name="idx_status_updated",
            background=True,
        ),
    ]

    if dry_run:
        print("[Dry Run] Would create the following indexes:")
        for idx in indexes:
            print(f" - Name: {idx.document.get('name')}, Keys: {idx.document.get('key')}")
    else:
        try:
            created = await collection.create_indexes(indexes)
            print(f"Created indexes: {created}")
        except Exception as exc:
            print(f"[!] Failed to create indexes: {exc}", file=sys.stderr)
            sys.exit(1)

    print("All MedGemma queue indexes have been successfully processed.")


def main():
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except Exception:
        pass
        
    parser = argparse.ArgumentParser(description="Create MongoDB indexes for MedGemma task queue.")
    parser.add_argument("--dry-run", action="store_true", help="Print the indexes that would be created without creating them.")
    args = parser.parse_args()
    
    asyncio.run(setup_indexes(args.dry_run))


if __name__ == "__main__":
    main()
