import argparse
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote_plus, urljoin

import httpx
from bs4 import BeautifulSoup

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.adapters.primary_retailer_crawler_adapter import is_cosmetic_product_name, normalize_name


BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = BACKEND_DIR / "data" / "cosmetic_master_seed.json"
INCIDECODER_BASE_URL = "https://incidecoder.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
}
DEFAULT_INCIDE_URLS = [
    "https://incidecoder.com/products/cosrx-advanced-snail-96-mucin-power-essence",
    "https://incidecoder.com/products/cosrx-low-ph-good-morning-gel-cleanser",
    "https://incidecoder.com/products/beauty-of-joseon-ginseng-essence-water",
]
KNOWN_BRANDS = (
    "Beauty of Joseon",
    "Dr. Jart+",
    "La Roche-Posay",
    "Paula's Choice",
)


def clean_text(value: str) -> str:
    return re.sub(r"[\u200b\u200c\u200d\ufeff]", "", value or "").strip()


def fetch_html(client: httpx.Client, url: str) -> str:
    response = client.get(url)
    response.raise_for_status()
    return response.text


def split_brand_product(title: str) -> tuple[str, str]:
    cleaned = re.sub(r"\s+ingredients\s+\(.*?\)\s*$", "", title, flags=re.IGNORECASE).strip()
    for brand in KNOWN_BRANDS:
        if cleaned.lower().startswith(brand.lower() + " "):
            return brand, cleaned[len(brand) :].strip()
    parts = cleaned.split(" ", 1)
    if len(parts) == 1:
        return "unknown", cleaned
    return parts[0].strip(), parts[1].strip()


def parse_incidecoder_product(html: str, source_url: str, category: str) -> dict | None:
    soup = BeautifulSoup(html, "html.parser")
    h1 = soup.select_one("h1")
    if not h1:
        return None

    brand, product_name = split_brand_product(h1.get_text(" ", strip=True))
    ingredient_links = soup.select(".ingredlist-short-like-section a.ingred-link")
    ingredients = [clean_text(link.get_text(" ", strip=True)) for link in ingredient_links]
    ingredients = [item for item in ingredients if item and item.lower() != "more"]

    if not brand or not product_name or not ingredients:
        return None
    if not is_cosmetic_product_name(product_name):
        return None

    source_product_id = re.sub(r"[^a-zA-Z0-9_-]", "-", source_url.rstrip("/").split("/")[-1]).strip("-")
    return {
        "source": "incidecoder",
        "source_product_id": source_product_id,
        "brand": clean_text(brand),
        "product_name": clean_text(product_name),
        "normalized_name": normalize_name(f"{brand} {product_name}"),
        "category": category,
        "ingredients": clean_text(", ".join(dict.fromkeys(ingredients))),
        "image_url": None,
        "status": "active",
    }


def search_incidecoder(client: httpx.Client, query: str, limit: int) -> list[str]:
    html = fetch_html(client, f"{INCIDECODER_BASE_URL}/search?query={quote_plus(query)}")
    soup = BeautifulSoup(html, "html.parser")
    urls: list[str] = []
    for anchor in soup.select("a[href*='/products/']"):
        href = anchor.get("href")
        if not href:
            continue
        url = urljoin(INCIDECODER_BASE_URL, href)
        if url not in urls:
            urls.append(url)
        if len(urls) >= limit:
            break
    return urls


def load_existing(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig") as file:
        data = json.load(file)
    return data if isinstance(data, list) else []


def merge_products(existing: list[dict], incoming: list[dict]) -> list[dict]:
    merged = []
    seen = set()
    for item in [*existing, *incoming]:
        item = dict(item)
        item.pop("product_url", None)
        if not item.get("ingredients"):
            continue
        key = item.get("source"), item.get("source_product_id")
        if key in seen:
            continue
        seen.add(key)
        merged.append(item)
    return merged


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Alternative cosmetic ingredient crawler.")
    parser.add_argument("--source", choices=["incidecoder"], default="incidecoder")
    parser.add_argument("--url", action="append", default=[], help="Product URL. Can be repeated.")
    parser.add_argument("--query", action="append", default=[], help="Search query. Can be repeated.")
    parser.add_argument("--category", default="skincare")
    parser.add_argument("--limit", type=int, default=3)
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    if args.limit < 1:
        parser.error("--limit must be 1 or greater.")
    if not args.dry_run and not args.apply:
        args.dry_run = True

    urls = list(args.url)
    with httpx.Client(headers=HEADERS, timeout=20.0, follow_redirects=True) as client:
        for query in args.query:
            urls.extend(search_incidecoder(client, query, args.limit))
        if not urls:
            urls = DEFAULT_INCIDE_URLS[: args.limit]

        products = []
        for url in urls[: args.limit]:
            try:
                item = parse_incidecoder_product(fetch_html(client, url), url, args.category)
            except Exception as exc:
                print(f"[alternative-crawl] failed url={url} error={exc}", flush=True)
                continue
            if not item:
                print(f"[alternative-crawl] skipped url={url}", flush=True)
                continue
            products.append(item)
            print(
                "[alternative-crawl] parsed "
                f"source={item['source']} brand={item['brand']} product={item['product_name']} "
                f"ingredients={len(item['ingredients'].split(','))}",
                flush=True,
            )
            time.sleep(0.5)

    print(
        "[alternative-crawl] summary "
        f"products={len(products)} with_ingredients={sum(1 for item in products if item.get('ingredients'))} "
        f"mode={'apply' if args.apply else 'dry-run'}"
    )
    for item in products[:5]:
        print(json.dumps(item, ensure_ascii=False))

    if args.apply:
        output_path = Path(args.output)
        if not output_path.is_absolute():
            output_path = BACKEND_DIR / output_path
        existing = load_existing(output_path)
        merged = merge_products(existing, products)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8") as file:
            json.dump(merged, file, ensure_ascii=False, indent=2)
        print(f"[alternative-crawl] wrote path={output_path} total={len(merged)} new={len(merged) - len(existing)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
