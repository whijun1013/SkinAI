import pytest
import json
from pathlib import Path
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models.user import User
from app.models.diet import FoodItem, DietLogItem
from app.models.cosmetic import UserCosmetic
from app.models.skin_log import SkinLog
from app.models.behavior import DailyBehaviorLog
from app.models.analysis import AnalysisRequest
from app.models.environment import EnvironmentLog
from app.models.medication import UserMedication
from app.services.food_lookup_service import (
    search_food_items,
    lookup,
    _generate_food_query_candidates,
    _is_noisy_search_result,
)
from data_tools.import_food_skin_factor_json import import_json


@compiles(TINYINT, "sqlite")
def compile_tinyint_sqlite(type_, compiler, **kw):
    return "INTEGER"


@compiles(BigInteger, "sqlite")
def compile_bigint_sqlite(type_, compiler, **kw):
    return "INTEGER"


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_generate_food_query_candidates():
    assert "부대찌개" in _generate_food_query_candidates("의정부 부대찌개")
    assert "비빔밥" in _generate_food_query_candidates("전주 비빔밥")
    assert "닭갈비" in _generate_food_query_candidates("춘천 닭갈비")
    assert "찜닭" in _generate_food_query_candidates("안동 찜닭")
    assert "돌솥 비빔밥" in _generate_food_query_candidates("전주 돌솥 비빔밥")

    assert "부대찌개" in _generate_food_query_candidates("의정부시 부대찌개")

    assert "닭갈비" in _generate_food_query_candidates("춘천 원조 할머니 매운 닭갈비")
    assert "김치찌개" in _generate_food_query_candidates("옛날 김치찌개 맛집")


def test_search_food_items(db_session):
    db_session.add_all([
        FoodItem(id=1, name="부대찌개", source="dummy", calories=100),
        FoodItem(id=2, name="비빔밥", source="dummy", calories=100),
        FoodItem(id=3, name="의정부 볶음", source="dummy", calories=100),
        FoodItem(id=4, name="전주 비빔밥", source="dummy", calories=100)
    ])
    db_session.commit()

    results = search_food_items(db_session, "의정부 부대찌개")
    names = [r.name for r in results]
    assert "부대찌개" in names

    results = search_food_items(db_session, "전주 비빔밥")
    names = [r.name for r in results]
    assert names[0] == "전주 비빔밥"


def test_lookup(db_session):
    db_session.add(FoodItem(id=5, name="부대찌개", source="dummy", calories=500))
    db_session.commit()

    found_name, nutr, match_type, f_id, f_source = lookup(db_session, "의정부 부대찌개")
    assert found_name == "부대찌개"
    assert match_type == "candidate(DB)"


def test_strict_lookup_skips_loose_candidate(db_session):
    db_session.add_all([
        FoodItem(id=100, name="농심라면", source="dummy", calories=500),
        FoodItem(id=101, name="신라면", source="dummy", calories=500),
    ])
    db_session.commit()

    loose_name, _, loose_match, loose_id, _ = lookup(db_session, "농심 신라면 로제")
    strict_name, _, strict_match, strict_id, _ = lookup(
        db_session, "농심 신라면 로제", strict=True
    )

    assert loose_match == "candidate(DB)"
    assert loose_name == "농심라면"
    assert strict_match == "없음"
    assert strict_id is None


def test_search_filters_noisy_food_parts_when_clean_result_exists(db_session):
    db_session.add_all([
        FoodItem(id=10, name="핫도그", category="빵 및 과자류", source="dummy", calories=100),
        FoodItem(id=11, name="핫도그믹스JF", category="가공식품", source="dummy", calories=100),
        FoodItem(id=12, name="핫도그용탱글소시지", category="가공식품", calories=100, source="dummy"),
    ])
    db_session.commit()

    results = search_food_items(db_session, "핫도그", limit=5)
    names = [item.name for item in results]

    assert names[0] == "핫도그"
    assert "핫도그믹스JF" not in names
    assert "핫도그용탱글소시지" not in names


def test_search_noise_exceptions_are_kept():
    coffee_mix = FoodItem(name="맥심커피믹스")
    hotdog_mix = FoodItem(name="핫도그믹스JF")
    cheese_mix = FoodItem(name="치즈믹스")
    cheese_powder = FoodItem(name="치즈 파우더")

    assert not _is_noisy_search_result(coffee_mix, "커피믹스")
    assert _is_noisy_search_result(hotdog_mix, "핫도그")
    assert _is_noisy_search_result(cheese_mix, "치즈")
    assert _is_noisy_search_result(cheese_powder, "치즈")


def test_import_food_skin_factor_json_preserves_raw_text_fields(db_session, tmp_path: Path):
    payload = [
        {
            "api_food_code": "code-raw",
            "name": "테스트 우유빵",
            "category_major": "빵류",
            "nutrition": {"calories": 100, "protein": 3, "fat": 5, "carbohydrate": 20, "sugar": 12, "sodium": 200},
            "skin_factors": [{"key": "dairy_confirmed", "source": "haccp_allergen_text"}],
            "raw_material_text": "밀가루, 탈지분유",
            "allergen_text": "우유",
        }
    ]
    json_path = tmp_path / "food_skin_factor_items.json"
    json_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    stats = import_json(db_session, str(json_path))

    item = db_session.query(FoodItem).filter(FoodItem.api_food_code == "code-raw").one()
    assert stats["saved"] == 1
    assert item.raw_material_text == "밀가루, 탈지분유"
    assert item.allergen_text == "우유"

    payload[0]["raw_material_text"] = "밀가루, 유청분말"
    json_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    stats = import_json(db_session, str(json_path))

    db_session.refresh(item)
    assert stats["updated"] == 1
    assert item.raw_material_text == "밀가루, 유청분말"
