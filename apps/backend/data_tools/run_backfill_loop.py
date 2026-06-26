import sys
import os
import time

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.cosmetic import CosmeticProduct
from data_tools.backfill_cosmetic_image_urls import backfill

def main():
    db = SessionLocal()
    try:
        # Check current status
        total = db.query(CosmeticProduct).count()
        empty = db.query(CosmeticProduct).filter((CosmeticProduct.image_url == None) | (CosmeticProduct.image_url == "")).count()
        print(f"[Loop Start] Total products: {total}, Empty: {empty}, Filled: {total - empty}")
        
        all_skipped_ids = set()
        batch_count = 0
        max_batches = 30 # Safe limit to prevent infinite loops (about 1500 items max)
        
        while True:
            # Query remaining empty count excluding already skipped in this session
            query = db.query(CosmeticProduct).filter(
                (CosmeticProduct.image_url == None) | (CosmeticProduct.image_url == "")
            )
            if all_skipped_ids:
                query = query.filter(~CosmeticProduct.id.in_(all_skipped_ids))
            
            remaining = query.count()
            if remaining == 0:
                print(f"\n[Loop End] No more products to process (remaining empty excluding skipped: {remaining})")
                break
                
            batch_count += 1
            if batch_count > max_batches:
                print(f"\n[Loop End] Reached maximum safe batches limit ({max_batches})")
                break
                
            print(f"\n==================================================")
            print(f"=== Starting Batch #{batch_count} | Remaining Empty to Try: {remaining} ===")
            print(f"==================================================")
            
            # Execute backfill batch
            success_ids, skipped_ids, failed_ids = backfill(
                dry_run=False, 
                limit=50, 
                sleep_time=1.0, 
                exclude_ids=all_skipped_ids
            )
            
            print(f"Batch #{batch_count} Result: Success={len(success_ids)}, Skipped={len(skipped_ids)}, Failed={len(failed_ids)}")
            
            # Accumulate skipped/failed ids so we don't query them again in this loop
            all_skipped_ids.update(skipped_ids)
            all_skipped_ids.update(failed_ids)
            
            # Check for consecutive failures/errors
            if len(failed_ids) > 10:
                print("\n[Abort] Aborting loop due to high failure count in batch.")
                break
                
            # If a batch returned 0 updates and 100% skips, we have exhausted all matchable items
            if len(success_ids) == 0 and len(skipped_ids) > 0:
                print("\n[Loop End] All remaining products in this batch were skipped. Exhausted matchable products.")
                break
                
            # Rest a bit between batches to respect API limits
            print("Resting for 3 seconds before next batch...")
            time.sleep(3.0)
            
        # Final status check
        empty_after = db.query(CosmeticProduct).filter((CosmeticProduct.image_url == None) | (CosmeticProduct.image_url == "")).count()
        print(f"\n[Final Status] Empty: {empty_after}, Filled: {total - empty_after}")
        print(f"Total batches processed: {batch_count}")
        print(f"Total skipped/failed ids kept in memory: {len(all_skipped_ids)}")
        
    finally:
        db.close()

if __name__ == "__main__":
    main()
