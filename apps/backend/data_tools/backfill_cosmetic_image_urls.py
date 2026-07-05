import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Callable, Iterable

import httpx
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal
from app.models.cosmetic import CosmeticProduct


AD_KEYWORDS = {
    "기획",
    "세트",
    "증정",
    "1+1",
    "2+1",
    "3+1",
    "할인",
    "행사",
    "묶음",
    "더블",
    "트리플",
    "한정",
    "종합",
    "리필",
    "파우치",
    "샘플",
    "미니",
    "체험",
    "정품+",
    "+정품",
    "대용량",
    "벌크",
    "증정",
    "프로모션",
    "event",
    "gift",
    "sale",
}

PLACEHOLDER_NAMES = {"상품명", "가져올 수 없음", "상품명을 확인할 수 없음"}


def clean_html(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", text).strip()


def _split_words(value: str) -> list[str]:
    return [word for word in re.split(r"[^a-zA-Z0-9가-힣]+", value.lower()) if word]


def is_valid_match(brand: str | None, product_name: str | None, naver_title: str | None) -> bool:
    clean_title = clean_html(naver_title).lower()
    brand = brand or ""
    product_name = product_name or ""

    brand_clean = re.sub(r"[^a-zA-Z0-9가-힣]+", "", brand.lower())
    brand_words = _split_words(brand)
    if brand_words:
        brand_match = any(word in clean_title for word in brand_words)
    else:
        brand_match = bool(brand_clean and brand_clean in clean_title)
    if not brand_match:
        return False

    product_words = [word for word in _split_words(product_name) if len(word) >= 2]
    if not product_words:
        return True

    matches = sum(1 for word in product_words if word in clean_title)
    required = max(1, len(product_words) // 2)
    return matches >= required


def is_likely_ad(title: str | None) -> bool:
    clean_title = clean_html(title).lower()
    return any(keyword.lower() in clean_title for keyword in AD_KEYWORDS)


def select_best_image(items: list[dict], brand: str | None, product_name: str | None):
    fallback_image = None
    fallback_title = None

    for item in items:
        image_url = item.get("image")
        title = item.get("title", "")
        if not image_url or not image_url.startswith("http"):
            continue
        if not is_valid_match(brand, product_name, title):
            continue

        clean_title = clean_html(title)
        if fallback_image is None:
            fallback_image = image_url
            fallback_title = clean_title

        if not is_likely_ad(title):
            return image_url, clean_title, "[AD-Filter: Passed]"

    if fallback_image:
        return fallback_image, fallback_title, "[AD-Filter: All were ads, used fallback]"
    return None, None, ""


def search_naver_shopping(brand: str | None, product_name: str | None, client_id: str, client_secret: str):
    url = "https://openapi.naver.com/v1/search/shop.json"
    headers = {
        "X-Naver-Client-Id": client_id,
        "X-Naver-Client-Secret": client_secret,
    }
    params = {"query": f"{brand or ''} {product_name or ''}".strip(), "display": 5}

    try:
        response = httpx.get(url, headers=headers, params=params, timeout=10.0)
        if response.status_code != 200:
            print(f"  [API Error] Status {response.status_code}: {response.text}")
            return None
        return response.json().get("items", [])
    except Exception as exc:
        print(f"  [API Error] Request failed: {exc}")
        return None


def _needs_image(item: dict) -> bool:
    return not str(item.get("image_url") or "").strip()


def _has_valid_name(item: dict) -> bool:
    product_name = str(item.get("product_name") or item.get("name") or "").strip()
    return bool(product_name and product_name not in PLACEHOLDER_NAMES)


def backfill_seed_items(
    items: Iterable[dict],
    *,
    search_fn: Callable[[str | None, str | None], list[dict] | None],
    limit: int | None = None,
    sleep_time: float = 0.0,
    dry_run: bool = True,
) -> tuple[list[dict], dict[str, int]]:
    updated_items = [dict(item) for item in items]
    stats = {"processed": 0, "updated": 0, "skipped": 0, "failed": 0}

    for item in updated_items:
        if limit is not None and stats["processed"] >= limit:
            break
        if not _needs_image(item):
            continue

        stats["processed"] += 1
        if not _has_valid_name(item):
            stats["skipped"] += 1
            continue

        brand = item.get("brand")
        product_name = item.get("product_name") or item.get("name")
        search_items = search_fn(brand, product_name)
        if search_items is None:
            stats["failed"] += 1
            time.sleep(sleep_time)
            continue

        image_url, matched_title, _ = select_best_image(search_items, brand, product_name)
        if not image_url:
            stats["skipped"] += 1
            time.sleep(sleep_time)
            continue

        if not dry_run:
            item["image_url"] = image_url
            item["image_match_title"] = matched_title
        stats["updated"] += 1
        time.sleep(sleep_time)

    return updated_items, stats


def backfill_seed_file(
    input_path: Path,
    output_path: Path,
    *,
    client_id: str,
    client_secret: str,
    limit: int | None = None,
    sleep_time: float = 1.0,
    dry_run: bool = True,
) -> dict[str, int]:
    items = json.loads(input_path.read_text(encoding="utf-8-sig"))
    updated, stats = backfill_seed_items(
        items,
        search_fn=lambda brand, product_name: search_naver_shopping(brand, product_name, client_id, client_secret),
        limit=limit,
        sleep_time=sleep_time,
        dry_run=dry_run,
    )
    if not dry_run:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return stats


def backfill(dry_run: bool = True, limit: int = 50, sleep_time: float = 1.0, exclude_ids=None):
    load_dotenv(BACKEND_DIR / ".env")

    client_id = os.getenv("NAVER_SEARCH_CLIENT_ID")
    client_secret = os.getenv("NAVER_SEARCH_CLIENT_SECRET")
    if not client_id or not client_secret:
        print("[Error] NAVER_SEARCH_CLIENT_ID or NAVER_SEARCH_CLIENT_SECRET is not set.", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    success_ids, skipped_ids, failed_ids = [], [], []
    try:
        query = db.query(CosmeticProduct).filter(
            (CosmeticProduct.image_url.is_(None)) | (CosmeticProduct.image_url == "")
        )
        if exclude_ids:
            query = query.filter(~CosmeticProduct.id.in_(exclude_ids))
        products = query.limit(limit).all()

        for product in products:
            clean_name = product.product_name.strip() if product.product_name else ""
            if not clean_name or clean_name in PLACEHOLDER_NAMES:
                skipped_ids.append(product.id)
                continue

            items = search_naver_shopping(product.brand, product.product_name, client_id, client_secret)
            if items is None:
                failed_ids.append(product.id)
                time.sleep(sleep_time)
                continue

            image_url, _, _ = select_best_image(items, product.brand, product.product_name)
            if not image_url:
                skipped_ids.append(product.id)
                time.sleep(sleep_time)
                continue

            if dry_run:
                success_ids.append(product.id)
            else:
                try:
                    product.image_url = image_url
                    db.commit()
                    success_ids.append(product.id)
                except Exception:
                    db.rollback()
                    failed_ids.append(product.id)
            time.sleep(sleep_time)

        return success_ids, skipped_ids, failed_ids
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill cosmetic product image URLs using Naver Shopping API")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--apply", action="store_true", help="Commit updates")
    group.add_argument("--dry-run", action="store_true", help="Only log proposed updates")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--sleep", type=float, default=1.0)
    parser.add_argument("--seed-json", type=Path, help="Backfill a cosmetic_master_seed.json file instead of DB rows")
    parser.add_argument("--output", type=Path, help="Output path for --seed-json mode")
    args = parser.parse_args()

    if args.limit < 1:
        parser.error("--limit must be 1 or greater.")
    if args.sleep < 0:
        parser.error("--sleep must be 0 or greater.")

    load_dotenv(BACKEND_DIR / ".env")
    if args.seed_json:
        client_id = os.getenv("NAVER_SEARCH_CLIENT_ID")
        client_secret = os.getenv("NAVER_SEARCH_CLIENT_SECRET")
        if not client_id or not client_secret:
            parser.error("NAVER_SEARCH_CLIENT_ID and NAVER_SEARCH_CLIENT_SECRET are required.")
        output = args.output or args.seed_json
        stats = backfill_seed_file(
            args.seed_json,
            output,
            client_id=client_id,
            client_secret=client_secret,
            limit=args.limit,
            sleep_time=args.sleep,
            dry_run=not args.apply,
        )
        print(json.dumps(stats, ensure_ascii=False))
        return 0

    success_ids, skipped_ids, failed_ids = backfill(dry_run=not args.apply, limit=args.limit, sleep_time=args.sleep)
    print(f"success={len(success_ids)} skipped={len(skipped_ids)} failed={len(failed_ids)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
