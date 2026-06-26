import sys
import os
import time
import re
import argparse
import httpx
from dotenv import load_dotenv

# Add parent directory to sys.path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.cosmetic import CosmeticProduct

def clean_html(text):
    if not text:
        return ""
    # Remove HTML tags (e.g. <b> and </b>)
    return re.sub(r'<[^>]+>', '', text).strip()

def is_valid_match(brand, product_name, naver_title):
    clean_title = clean_html(naver_title).lower()

    brand_clean = re.sub(r'[^a-zA-Z0-9가-힣]', '', brand.lower())
    product_clean = re.sub(r'[^a-zA-Z0-9가-힣]', '', product_name.lower())

    # 1. Verify brand matching
    brand_words = [w for w in re.split(r'[^a-zA-Z0-9가-힣]', brand.lower()) if w]
    brand_match = False
    if not brand_words:
        brand_match = brand_clean in clean_title
    else:
        # Check if any word from the brand is in the Naver title
        brand_match = any(w in clean_title for w in brand_words)

    if not brand_match:
        return False

    # 2. Verify product name matching
    product_words = [w for w in re.split(r'[^a-zA-Z0-9가-힣]', product_name.lower()) if len(w) >= 2]
    if not product_words:
        product_words = [w for w in re.split(r'[^a-zA-Z0-9가-힣]', product_name.lower()) if w]
        if not product_words:
            return True  # If no words exist, default to True since brand matched

    # Count matching product words in the Naver title
    matches = sum(1 for w in product_words if w in clean_title)

    # Require at least 50% of the words to match, or at least 1 word if there are 2 or fewer words
    required = max(1, len(product_words) // 2)
    return matches >= required

def search_naver_shopping(brand, product_name, client_id, client_secret):
    query = f"{brand} {product_name}"
    url = "https://openapi.naver.com/v1/search/shop.json"
    headers = {
        "X-Naver-Client-Id": client_id,
        "X-Naver-Client-Secret": client_secret
    }
    params = {
        "query": query,
        "display": 5
    }

    try:
        resp = httpx.get(url, headers=headers, params=params, timeout=10.0)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get("items", [])
            return items
        else:
            print(f"  [API Error] Status {resp.status_code}: {resp.text}")
            return None
    except Exception as e:
        print(f"  [API Error] Request failed: {e}")
        return None

def backfill(dry_run=True, limit=50, sleep_time=1.0, exclude_ids=None):
    # Explicitly load .env file from apps/backend directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(script_dir)
    dotenv_path = os.path.join(backend_dir, ".env")
    
    print(f"[Info] Loading environment from: {dotenv_path}")
    load_dotenv(dotenv_path)

    client_id = os.getenv("NAVER_SHOPPING_CLIENT_ID")
    client_secret = os.getenv("NAVER_SHOPPING_CLIENT_SECRET")

    if not client_id or not client_secret:
        print("[Error] NAVER_SHOPPING_CLIENT_ID or NAVER_SHOPPING_CLIENT_SECRET is not set in environment variables.", file=sys.stderr)
        print("Please check your apps/backend/.env file.", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    
    success_ids = []
    skipped_ids = []
    failed_ids = []

    try:
        # Fetch products that have no image_url or empty image_url
        query = db.query(CosmeticProduct).filter(
            (CosmeticProduct.image_url == None) | (CosmeticProduct.image_url == "")
        )
        if exclude_ids:
            query = query.filter(~CosmeticProduct.id.in_(exclude_ids))
        products = query.limit(limit).all()

        if not products:
            print("[Info] No products found that need image_url backfill.")
            return success_ids, skipped_ids, failed_ids

        print("=" * 60)
        if dry_run:
            print("[MODE: DRY RUN] Database changes will NOT be saved.")
            print("To actually save changes to the database, run with: --apply")
        else:
            print("[MODE: APPLY] Database changes WILL be saved directly to the database.")
        print("=" * 60)
        print(f"[Info] Found {len(products)} products to process. Starting...")

        success_count = 0
        skip_count = 0
        fail_count = 0

        placeholders = {"상품명", "가품 피해 방지 안내"}

        for idx, product in enumerate(products):
            print(f"\n[{idx+1}/{len(products)}] Processing: ID {product.id} | {product.brand} | {product.product_name}")

            clean_name = product.product_name.strip() if product.product_name else ""
            if clean_name in placeholders or not clean_name:
                print(f"  [Skip] Product name is a placeholder ('{clean_name}'). Skipping API call.")
                skip_count += 1
                skipped_ids.append(product.id)
                continue

            items = search_naver_shopping(product.brand, product.product_name, client_id, client_secret)

            if items is None:
                fail_count += 1
                failed_ids.append(product.id)
                time.sleep(sleep_time)
                continue

            if not items:
                print("  [Skip] No search results found on Naver Shopping.")
                skip_count += 1
                skipped_ids.append(product.id)
                time.sleep(sleep_time)
                continue

            # Find the first item with a valid image URL and a strong match
            image_url = None
            matched_title = None
            for item in items:
                img = item.get("image")
                title = item.get("title", "")
                if img and img.startswith("http"):
                    if is_valid_match(product.brand, product.product_name, title):
                        image_url = img
                        matched_title = clean_html(title)
                        break

            if not image_url:
                print("  [Skip] Found items but none passed the matching verification criteria.")
                skip_count += 1
                skipped_ids.append(product.id)
                time.sleep(sleep_time)
                continue

            print(f"  [Match] Found image: {image_url} (Title: {matched_title})")

            if dry_run:
                print("  [Dry Run] Image URL would be saved (no DB commit).")
                success_count += 1
                success_ids.append(product.id)
            else:
                try:
                    product.image_url = image_url
                    db.commit()
                    print("  [Success] Saved to DB.")
                    success_count += 1
                    success_ids.append(product.id)
                except Exception as e:
                    db.rollback()
                    print(f"  [Error] DB commit failed: {e}")
                    fail_count += 1
                    failed_ids.append(product.id)

            time.sleep(sleep_time)

        total_processed = success_count + skip_count + fail_count
        print("\n" + "=" * 50)
        print("Backfill Process Finished.")
        print(f"Mode:               {'DRY RUN' if dry_run else 'APPLY'}")
        print(f"Total Processed:    {total_processed}")
        if dry_run:
            print(f"Proposed Updates:   {success_count}")
        else:
            print(f"Actual Updates:     {success_count}")
        print(f"Skipped (No Match): {skip_count}")
        print(f"Failed (Error):     {fail_count}")
        print("=" * 50)

        return success_ids, skipped_ids, failed_ids

    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill cosmetic product image URLs using Naver Shopping API")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--apply", action="store_true", help="Commit updates to the database (actual write)")
    group.add_argument("--dry-run", action="store_true", help="Only log proposed updates (dry-run, default)")
    
    parser.add_argument("--limit", type=int, default=50, help="Max number of products to process")
    parser.add_argument("--sleep", type=float, default=1.0, help="Delay in seconds between requests")
    args = parser.parse_args()

    # Validations
    if args.limit < 1:
        parser.error("--limit must be 1 or greater.")

    if args.sleep < 0.0:
        parser.error("--sleep must be 0.0 or greater.")

    # Default to dry-run (True) unless --apply is specified
    is_dry_run = True
    if args.apply:
        is_dry_run = False
    elif args.dry_run:
        is_dry_run = True

    backfill(dry_run=is_dry_run, limit=args.limit, sleep_time=args.sleep)
