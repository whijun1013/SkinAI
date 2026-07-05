import hashlib
import re
from typing import List
from urllib.parse import parse_qs, urljoin, urlparse

from .base_cosmetic_adapter import BaseCrawlerAdapter, ParsedCosmeticProduct


OLIVEYOUNG_BASE_URL = "https://www.oliveyoung.co.kr"

NON_COSMETIC_KEYWORDS = (
    "브러쉬",
    "브러시",
    "퍼프",
    "스펀지",
    "화장솜",
    "면봉",
    "족집게",
    "핀셋",
    "가위",
    "괄사",
    "거울",
    "파우치",
    "공병",
    "용기",
    "도구",
    "디바이스",
    "케이스",
)


def clean_product_name(name: str) -> str:
    original = name or ""
    value = re.sub(r"^\[.*?\]\s*", "", original)
    value = re.sub(r"\(.*?\)", "", value)
    value = re.sub(r"\b\d+\+\d+\s*(?:기획|증정|세트)?\b", "", value)
    value = re.sub(
        r"\d+(?:\.\d+)?\s*(?:ml|mL|g|G|ea|EA|개|매|p|P)\s*[\*xX+×]?\s*\d*\s*(?:개입|세트|기획|증정|ea|EA|더블)?",
        "",
        value,
        flags=re.IGNORECASE,
    )
    value = re.sub(
        r"\b(?:기획세트|기획|증정|더블기획|더블|리필|세트|정품|한정|추천|벌크|대용량|파우치|샘플|미니)\b",
        "",
        value,
        flags=re.IGNORECASE,
    )
    value = re.sub(r"[\s\-+/*,]+$", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value or original.strip()


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9가-힣]", "", (value or "").lower())


def extract_goods_no(url: str) -> str | None:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    for key in ("goodsNo", "goods_no"):
        if query.get(key):
            return query[key][0]
    match = re.search(r"goodsNo=([A-Za-z0-9_-]+)", url)
    return match.group(1) if match else None


def is_cosmetic_product_name(name: str) -> bool:
    compact = (name or "").replace(" ", "")
    return bool(compact) and not any(keyword in compact for keyword in NON_COSMETIC_KEYWORDS)


class PrimaryRetailerCrawlerAdapter(BaseCrawlerAdapter):
    source = "oliveyoung"

    def fetch_product_list(self, category: str, page: int) -> List[dict]:
        raise NotImplementedError("Use data_tools/primary_retailer_crawler.py for network fetching.")

    def parse_product_links(self, raw_html: str) -> list[str]:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(raw_html, "html.parser")
        links: list[str] = []
        for anchor in soup.select("a[href*='goodsNo'], a[href*='getGoodsDetail'], a[href*='/store/G.do']"):
            href = anchor.get("href")
            if not href:
                continue
            absolute_url = urljoin(OLIVEYOUNG_BASE_URL, href)
            if absolute_url not in links:
                links.append(absolute_url)
        return links

    def parse_product_detail(self, raw_data: str) -> ParsedCosmeticProduct:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(raw_data, "html.parser")

        brand = self._text_first(
            soup,
            [
                "button[class*='btn-brand']",
                ".prd_brand",
                ".brand-name",
                "[class*='brand']",
                "meta[property='og:brand']",
            ],
        )
        product_name = self._text_first(
            soup,
            [
                "h3[class*='GoodsDetailInfo_title']",
                "h3[class*='title']",
                "p.prd_name",
                "span.prd_name",
                "h2.prd_name",
                "meta[property='og:title']",
            ],
        )
        product_name = clean_product_name(product_name)

        product_url = self._extract_canonical_url(soup)
        return ParsedCosmeticProduct(
            source=self.source,
            source_product_id=self._extract_source_product_id(soup, product_url, brand, product_name),
            brand=brand,
            product_name=product_name,
            normalized_name=normalize_name(product_name),
            ingredients=self._extract_ingredients(soup),
            category=None,
            product_url=product_url,
            status="active",
        )

    @staticmethod
    def _text_first(soup, selectors: list[str]) -> str:
        for selector in selectors:
            element = soup.select_one(selector)
            if not element:
                continue
            value = element.get("content", "") if element.name == "meta" else element.get_text(" ", strip=True)
            if value:
                return value.strip()
        title = soup.find("title")
        return title.get_text(" ", strip=True).split("|")[0].strip() if title else ""

    @staticmethod
    def _extract_ingredients(soup) -> str | None:
        labels = ("전성분", "성분", "화장품법", "제공고시")
        for row in soup.find_all(["tr", "dl", "div", "li"]):
            header = row.find(["th", "dt", "span", "strong"])
            value = row.find(["td", "dd", "p", "div"])
            if not header or not value:
                continue
            header_text = header.get_text(" ", strip=True)
            if any(label in header_text for label in labels):
                text = value.get_text(" ", strip=True)
                if text and len(text) > 10:
                    return re.sub(r"\s+", " ", text).strip()
        for element in soup.select("[class*='ingredient'], [id*='ingredient']"):
            text = element.get_text(" ", strip=True)
            if text and len(text) > 10:
                return re.sub(r"\s+", " ", text).strip()
        return None

    @staticmethod
    def _extract_canonical_url(soup) -> str | None:
        canonical = soup.select_one("link[rel='canonical']")
        if canonical and canonical.get("href"):
            return canonical["href"]
        og_url = soup.select_one("meta[property='og:url']")
        if og_url and og_url.get("content"):
            return og_url["content"]
        return None

    @staticmethod
    def _extract_source_product_id(soup, product_url: str | None, brand: str, product_name: str) -> str:
        for attrs in ({"id": "goodsNo"}, {"name": "goodsNo"}):
            element = soup.find("input", attrs)
            if element and element.get("value"):
                return element["value"]
        if product_url:
            goods_no = extract_goods_no(product_url)
            if goods_no:
                return goods_no
        fallback = f"{brand}_{product_name}".encode("utf-8")
        return f"fallback_{hashlib.md5(fallback).hexdigest()[:12]}"
