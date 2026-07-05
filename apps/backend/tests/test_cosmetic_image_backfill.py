from data_tools.backfill_cosmetic_image_urls import (
    backfill_seed_items,
    is_likely_ad,
    is_valid_match,
    select_best_image,
)


def test_is_likely_ad_detects_korean_promotion_keywords():
    assert is_likely_ad("브랜드 토너 1+1 기획 세트")
    assert is_likely_ad("Brand serum SALE gift")
    assert not is_likely_ad("브랜드 진정 토너 200ml")


def test_is_valid_match_supports_korean_brand_and_product_words():
    assert is_valid_match("라운드랩", "독도 토너", "라운드랩 1025 독도 토너 200ml")
    assert not is_valid_match("라운드랩", "독도 토너", "다른브랜드 진정 토너")


def test_select_best_image_prefers_non_ad_candidate():
    items = [
        {"title": "라운드랩 독도 토너 1+1 기획 세트", "image": "https://example.com/ad.jpg"},
        {"title": "라운드랩 1025 독도 토너 200ml", "image": "https://example.com/product.jpg"},
    ]

    image_url, title, reason = select_best_image(items, "라운드랩", "독도 토너")

    assert image_url == "https://example.com/product.jpg"
    assert title == "라운드랩 1025 독도 토너 200ml"
    assert reason == "[AD-Filter: Passed]"


def test_select_best_image_falls_back_when_all_matches_are_ads():
    items = [
        {"title": "라운드랩 독도 토너 기획 세트", "image": "https://example.com/first.jpg"},
        {"title": "라운드랩 독도 토너 리필 증정", "image": "https://example.com/second.jpg"},
    ]

    image_url, title, reason = select_best_image(items, "라운드랩", "독도 토너")

    assert image_url == "https://example.com/first.jpg"
    assert title == "라운드랩 독도 토너 기획 세트"
    assert reason == "[AD-Filter: All were ads, used fallback]"


def test_backfill_seed_items_updates_missing_image_url_only_when_applied():
    items = [
        {"brand": "라운드랩", "product_name": "독도 토너", "image_url": ""},
        {"brand": "브랜드", "product_name": "이미지 있음", "image_url": "https://example.com/existing.jpg"},
    ]

    def fake_search(brand, product_name):
        return [{"title": f"{brand} {product_name}", "image": "https://example.com/new.jpg"}]

    dry_items, dry_stats = backfill_seed_items(items, search_fn=fake_search, dry_run=True)
    applied_items, applied_stats = backfill_seed_items(items, search_fn=fake_search, dry_run=False)

    assert dry_stats == {"processed": 1, "updated": 1, "skipped": 0, "failed": 0}
    assert dry_items[0]["image_url"] == ""
    assert applied_stats == {"processed": 1, "updated": 1, "skipped": 0, "failed": 0}
    assert applied_items[0]["image_url"] == "https://example.com/new.jpg"
    assert applied_items[1]["image_url"] == "https://example.com/existing.jpg"
