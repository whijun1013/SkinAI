import pytest
from app.services.cosmetic_routine_rules import analyze_routine

def test_analyze_routine_clash():
    products = [
        {"id": 1, "name": "이니스프리 레티놀 시카 흔적 앰플", "ingredients": "레티놀, 정제수"},
        {"id": 2, "name": "구달 청귤 비타C 잡티 케어 세럼", "ingredients": "비타민C, 아스코빅애씨드"}
    ]
    results = analyze_routine(products)
    assert len(results) == 1
    assert results[0]["severity"] == "high"
    assert "비타민C와 레티놀" in results[0]["title"]
    assert len(results[0]["related_products"]) == 2

def test_analyze_routine_synergy():
    products = [
        {"id": 1, "name": "레티놀 크림", "ingredients": "레티놀"},
        {"id": 2, "name": "나이아신아마이드 세럼", "ingredients": "나이아신아마이드"}
    ]
    results = analyze_routine(products)
    assert len(results) == 1
    assert results[0]["severity"] == "info"
    assert "시너지" in results[0]["title"]

def test_analyze_routine_multiple():
    products = [
        {"id": 1, "name": "레티놀 크림", "ingredients": "레티놀"},
        {"id": 2, "name": "BHA 토너", "ingredients": "살리실릭애씨드"},
        {"id": 3, "name": "비타민C", "ingredients": "비타민C"}
    ]
    results = analyze_routine(products)
    assert len(results) >= 2
    # Should be sorted with "high" first
    assert results[0]["severity"] == "high"
