import argparse
import json
import os
import random
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.adapters.primary_retailer_crawler_adapter import (
    OLIVEYOUNG_BASE_URL,
    PrimaryRetailerCrawlerAdapter,
    is_cosmetic_product_name,
)


BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = BACKEND_DIR / "data" / "cosmetic_master_seed.json"

OLIVEYOUNG_CATEGORIES = {
    "skin_toner": "100000100010014",
    "essence_serum_ampoule": "100000100010015",
    "cream": "100000100010010",
    "lotion": "100000100010011",
    "mist_oil": "100000100010012",
    "cleansing_foam": "100000100020009",
    "cleansing_water_oil": "100000100020008",
    "sunscreen": "100000100060001",
    "mask_pack": "100000100030001",
    "mens_skincare": "100000100110001",
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": OLIVEYOUNG_BASE_URL,
}


def polite_sleep(min_delay: float, max_delay: float) -> None:
    if max_delay <= 0:
        return
    time.sleep(random.uniform(min_delay, max_delay))


def build_category_url(category_code: str, page: int) -> str:
    query = urlencode(
        {
            "dispCatNo": category_code,
            "prdSort": "01",
            "pageIdx": page,
            "rowsPerPage": "48",
        }
    )
    return f"{OLIVEYOUNG_BASE_URL}/store/display/getMCategoryList.do?{query}"


def fetch_text(client: httpx.Client, url: str) -> str:
    response = client.get(url)
    response.raise_for_status()
    return response.text


def fetch_text_with_selenium(url: str) -> str:
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
    except ImportError as exc:
        raise RuntimeError("Selenium fallback requires selenium.") from exc

    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1440,1200")
    chrome_options.add_argument(f"--user-agent={USER_AGENT}")
    driver = webdriver.Chrome(options=chrome_options)
    try:
        driver.get(url)
        time.sleep(3)
        return driver.page_source
    finally:
        driver.quit()


class SeleniumFetcher:
    def __init__(self):
        self.driver = None

    def __enter__(self):
        return self

    def _ensure_driver(self):
        if self.driver:
            return
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options

        chrome_options = Options()
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1440,1200")
        chrome_options.add_argument(f"--user-agent={USER_AGENT}")
        self.driver = webdriver.Chrome(options=chrome_options)

    def __exit__(self, exc_type, exc, tb):
        if self.driver:
            self.driver.quit()

    def fetch(self, url: str) -> str:
        self._ensure_driver()
        self.driver.get(url)
        time.sleep(2)
        return self.driver.page_source


def load_existing(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig") as file:
        data = json.load(file)
    return data if isinstance(data, list) else []


def product_to_json(product, category_name: str) -> dict:
    return {
        "brand": product.brand,
        "product_name": product.product_name,
        "ingredients": product.ingredients or "",
        "category": category_name,
        "source": product.source,
        "source_product_id": product.source_product_id,
        "status": product.status,
        "normalized_name": product.normalized_name,
    }


def is_valid_crawl_item(item: dict) -> tuple[bool, str]:
    if not item.get("brand") or not item.get("product_name"):
        return False, "missing_required"
    if not item.get("ingredients"):
        return False, "missing_ingredients"
    if not is_cosmetic_product_name(item["product_name"]):
        return False, "non_cosmetic_keyword"
    return True, ""


def crawl_oliveyoung(
    *,
    category_name: str,
    category_code: str,
    max_pages: int,
    limit: int | None,
    min_delay: float,
    max_delay: float,
    use_selenium: bool,
) -> list[dict]:
    adapter = PrimaryRetailerCrawlerAdapter()
    products: list[dict] = []
    seen_urls: set[str] = set()
    headers = DEFAULT_HEADERS
    selenium_fetcher = SeleniumFetcher() if use_selenium else None

    with httpx.Client(headers=headers, timeout=20.0, follow_redirects=True) as client:
        selenium_context = selenium_fetcher if selenium_fetcher else _NullContext()
        with selenium_context as browser:
            return _crawl_oliveyoung_with_client(
                client=client,
                browser=browser,
                adapter=adapter,
                products=products,
                seen_urls=seen_urls,
                category_name=category_name,
                category_code=category_code,
                max_pages=max_pages,
                limit=limit,
                min_delay=min_delay,
                max_delay=max_delay,
                use_selenium=use_selenium,
            )


class _NullContext:
    def __enter__(self):
        return None

    def __exit__(self, exc_type, exc, tb):
        return None


def _crawl_oliveyoung_with_client(
    *,
    client: httpx.Client,
    browser,
    adapter: PrimaryRetailerCrawlerAdapter,
    products: list[dict],
    seen_urls: set[str],
    category_name: str,
    category_code: str,
    max_pages: int,
    limit: int | None,
    min_delay: float,
    max_delay: float,
    use_selenium: bool,
) -> list[dict]:
    page = 1
    while max_pages == 0 or page <= max_pages:
        if limit is not None and len(products) >= limit:
            break
        category_url = build_category_url(category_code, page)
        print(f"[crawl] category={category_name} page={page} url={category_url}", flush=True)
        try:
            html = fetch_text(client, category_url)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 403 and use_selenium:
                print("[crawl] direct HTTP returned 403. Retrying category page with Selenium fallback.", flush=True)
                html = browser.fetch(category_url)
            else:
                print(f"[crawl] category_fetch_failed status={exc.response.status_code} url={category_url}", flush=True)
                break
        links = adapter.parse_product_links(html)
        print(f"[crawl] found_links={len(links)}", flush=True)
        if not links:
            break

        for link in links:
            if limit is not None and len(products) >= limit:
                break
            if link in seen_urls:
                continue
            seen_urls.add(link)

            polite_sleep(min_delay, max_delay)
            try:
                try:
                    detail_html = fetch_text(client, link)
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code == 403 and use_selenium:
                        print("[crawl] direct HTTP returned 403. Retrying detail page with Selenium fallback.", flush=True)
                        detail_html = browser.fetch(link)
                    else:
                        raise
                parsed = adapter.parse_product_detail(detail_html)
            except Exception as exc:
                print(f"[crawl] detail_failed url={link} error={exc}", flush=True)
                continue

            item = product_to_json(parsed, category_name)
            valid, reason = is_valid_crawl_item(item)
            if not valid:
                print(f"[crawl] skip_{reason} source_product_id={item.get('source_product_id')}", flush=True)
                continue
            products.append(item)
            limit_label = limit if limit is not None else "all"
            print(
                "[crawl] parsed "
                f"{len(products)}/{limit_label} brand={item['brand']} product={item['product_name']}",
                flush=True,
            )

        polite_sleep(min_delay, max_delay)
        page += 1

    return products


def merge_products(existing: list[dict], incoming: list[dict]) -> list[dict]:
    merged = []
    for item in existing:
        cleaned = dict(item)
        cleaned.pop("product_url", None)
        valid, _ = is_valid_crawl_item(cleaned)
        if valid:
            merged.append(cleaned)
    existing_keys = {
        item.get("source_product_id") or f"{item.get('brand')}::{item.get('product_name')}"
        for item in merged
    }
    for item in incoming:
        item = dict(item)
        item.pop("product_url", None)
        valid, _ = is_valid_crawl_item(item)
        if not valid:
            continue
        key = item.get("source_product_id") or f"{item.get('brand')}::{item.get('product_name')}"
        if key in existing_keys:
            continue
        merged.append(item)
        existing_keys.add(key)
    return merged


def main() -> int:
    parser = argparse.ArgumentParser(description="Crawl supported primary retailer cosmetic product data.")
    parser.add_argument("--retailer", choices=["oliveyoung"], default="oliveyoung")
    parser.add_argument("--category", choices=sorted(OLIVEYOUNG_CATEGORIES), default="skin_toner")
    parser.add_argument("--all-categories", action="store_true", help="Crawl all configured cosmetic categories")
    parser.add_argument("--max-pages", type=int, default=1)
    parser.add_argument("--limit", type=int, default=20, help="Maximum saved products. Use 0 for no product limit.")
    parser.add_argument("--min-delay", type=float, default=1.0)
    parser.add_argument("--max-delay", type=float, default=2.0)
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--selenium-fallback", action="store_true", help="Use browser fallback when direct HTTP is blocked")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Do not write output JSON")
    mode.add_argument("--apply", action="store_true", help="Merge crawled data into output JSON")
    args = parser.parse_args()

    if args.max_pages < 0:
        parser.error("--max-pages must be 0 or greater (0 for unlimited).")
    if args.limit < 0:
        parser.error("--limit must be 0 or greater.")
    if args.min_delay < 0 or args.max_delay < args.min_delay:
        parser.error("Delay values must satisfy 0 <= min-delay <= max-delay.")

    output_path = Path(args.output)
    categories = OLIVEYOUNG_CATEGORIES.items() if args.all_categories else [(args.category, OLIVEYOUNG_CATEGORIES[args.category])]
    product_limit = None if args.limit == 0 else args.limit
    products: list[dict] = []
    for category_name, category_code in categories:
        remaining_limit = None if product_limit is None else max(product_limit - len(products), 0)
        if remaining_limit == 0:
            break
        products.extend(
            crawl_oliveyoung(
                category_name=category_name,
                category_code=category_code,
                max_pages=args.max_pages,
                limit=remaining_limit,
                min_delay=args.min_delay,
                max_delay=args.max_delay,
                use_selenium=args.selenium_fallback,
            )
        )

    with_ingredients = sum(1 for item in products if item.get("ingredients"))
    print(
        "[crawl] summary "
        f"products={len(products)} with_ingredients={with_ingredients} "
        f"output={output_path} mode={'apply' if args.apply else 'dry-run'}"
    )
    for item in products[:5]:
        print(json.dumps(item, ensure_ascii=False))

    if args.apply:
        existing = load_existing(output_path)
        merged = merge_products(existing, products)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8") as file:
            json.dump(merged, file, ensure_ascii=False, indent=2)
        print(f"[crawl] wrote total={len(merged)} new={len(merged) - len(existing)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
