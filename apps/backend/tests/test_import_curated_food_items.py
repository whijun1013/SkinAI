import pytest
import json
from pathlib import Path
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models.diet import FoodItem, DietLogItem
from app.models.user import User
from app.models.cosmetic import UserCosmetic
from app.models.skin_log import SkinLog
from app.models.behavior import DailyBehaviorLog
from app.models.analysis import AnalysisRequest
from app.models.environment import EnvironmentLog
from app.models.medication import UserMedication
from data_tools.import_curated_food_items import import_curated_items

@compiles(TINYINT, "sqlite")
def compile_tinyint_sqlite(type_, compiler, **kw):
    return "INTEGER"

@compiles(BigInteger, "sqlite")
def compile_bigint_sqlite(type_, compiler, **kw):
    return "INTEGER"

@pytest.fixture
def db_session(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    
    # Mock SessionLocal used inside import_curated_items
    monkeypatch.setattr("data_tools.import_curated_food_items.SessionLocal", SessionLocal)
    
    session = SessionLocal()
    yield session
    session.close()

def test_import_curated_food_items_includes_saturated_and_trans_fat(db_session, tmp_path: Path):
    payload = [
        {
            "api_food_code": "code-new-nutr",
            "name": "테스트 영양소 빵",
            "category_major": "빵류",
            "nutrition": {
                "calories": 100,
                "protein": 3,
                "fat": 5,
                "saturated_fat": 2.5,
                "trans_fat": 0.2,
                "carbohydrate": 20,
                "sugar": 12,
                "sodium": 200
            },
            "skin_factors": []
        }
    ]
    json_path = tmp_path / "food_items_curated.json"
    json_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    import_curated_items(str(json_path), dry_run=False, deactivate_missing=False)

    item = db_session.query(FoodItem).filter(FoodItem.api_food_code == "code-new-nutr").one()
    assert float(item.saturated_fat) == 2.5
    assert float(item.trans_fat) == 0.2

    # Update scenario
    payload[0]["nutrition"]["saturated_fat"] = 3.5
    payload[0]["nutrition"]["trans_fat"] = 0.5
    json_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    import_curated_items(str(json_path), dry_run=False, deactivate_missing=False)

    db_session.refresh(item)
    assert float(item.saturated_fat) == 3.5
    assert float(item.trans_fat) == 0.5
