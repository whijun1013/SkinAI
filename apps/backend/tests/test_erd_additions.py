import os
import sys
import io
import unittest
from datetime import datetime, date
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, BigInteger
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from app.deps.auth import get_current_user
from app.models.user import User
from app.models.behavior import DailyBehaviorLog
from app.models.diet import DietLog, DietLogItem, FoodItem
from app.models.period import PeriodLog
from app.models.location import UserLocation
from app.models.skin_log import SkinLog
from app.database import Base, get_db

from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.mysql import TINYINT

@compiles(TINYINT, 'sqlite')
def compile_tinyint_sqlite(type_, compiler, **kw):
    return "INTEGER"

@compiles(BigInteger, 'sqlite')
def compile_bigint_sqlite(type_, compiler, **kw):
    return "INTEGER"

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_current_user():
    return User(
        id=1,
        email="test@example.com",
        name="Test User",
        hashed_password="dummy_hash_value",
        terms_agreed_at=datetime.now(),
        avg_cycle_length=28
    )

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

def make_test_image_bytes():
    image = Image.new("RGB", (1, 1), color=(255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()

class TestErdAdditions(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.old_current_user = app.dependency_overrides.get(get_current_user)
        cls.old_db = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_current_user] = override_get_current_user
        app.dependency_overrides[get_db] = override_get_db

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)
        if cls.old_current_user:
            app.dependency_overrides[get_current_user] = cls.old_current_user
        else:
            app.dependency_overrides.pop(get_current_user, None)
        if cls.old_db:
            app.dependency_overrides[get_db] = cls.old_db
        else:
            app.dependency_overrides.pop(get_db, None)

    def setUp(self):
        self.db = TestingSessionLocal()
        self.user = User(
            id=1,
            email="test@example.com",
            name="Test User",
            hashed_password="dummy_hash_value",
            terms_agreed_at=datetime.now(),
            avg_cycle_length=28
        )
        self.db.add(self.user)
        self.db.commit()
        self.client = TestClient(app)

    def tearDown(self):
        self.db.query(SkinLog).delete()
        self.db.query(DailyBehaviorLog).delete()
        self.db.query(DietLogItem).delete()
        self.db.query(DietLog).delete()
        self.db.query(FoodItem).delete()
        self.db.query(PeriodLog).delete()
        self.db.query(UserLocation).delete()
        self.db.query(User).delete()
        self.db.commit()
        self.db.close()

    @patch("app.routers.upload.upload_to_blob_storage")
    def test_confirmed_skin_photo_upload_replaces_photo_without_resetting_score(self, mock_upload):
        mock_upload.return_value = "http://example.com/skin1.jpg"
        
        # Test file
        file_data = {"file": ("test.jpg", make_test_image_bytes(), "image/jpeg")}
        
        # First upload
        resp1 = self.client.post("/upload/skin-log/image?user_id=1&create_log=true", files=file_data)
        self.assertEqual(resp1.status_code, 200)
        self.assertIn("imageUrl", resp1.json())
        skin_log_id = resp1.json()["skinLogId"]

        # Add overall_score to mark the log as confirmed.
        log_in_db = self.db.query(SkinLog).filter(SkinLog.id == skin_log_id).first()
        log_in_db.overall_score = 4
        self.db.commit()

        # Second upload on the same day replaces photo but keeps confirmed scores.
        mock_upload.return_value = "http://example.com/skin2.jpg"
        file_data2 = {"file": ("test.jpg", make_test_image_bytes(), "image/jpeg")}
        resp2 = self.client.post("/upload/skin-log/image?user_id=1&create_log=true", files=file_data2)
        self.assertEqual(resp2.status_code, 200)

        # Verify db log
        self.db.expire_all()
        updated_log = self.db.query(SkinLog).filter(SkinLog.id == skin_log_id).first()
        self.assertEqual(updated_log.photo_url, "http://example.com/skin2.jpg")
        self.assertEqual(updated_log.overall_score, 4)

    @patch("app.routers.upload.upload_to_blob_storage")
    def test_draft_skin_photo_upload_overwrites_photo_url(self, mock_upload):
        mock_upload.return_value = "http://example.com/skin1.jpg"
        file_data = {"file": ("test.jpg", make_test_image_bytes(), "image/jpeg")}
        resp1 = self.client.post("/upload/skin-log/image?user_id=1&create_log=true", files=file_data)
        self.assertEqual(resp1.status_code, 200)
        skin_log_id = resp1.json()["skinLogId"]

        mock_upload.return_value = "http://example.com/skin2.jpg"
        file_data2 = {"file": ("test.jpg", make_test_image_bytes(), "image/jpeg")}
        resp2 = self.client.post("/upload/skin-log/image?user_id=1&create_log=true", files=file_data2)
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.json()["skinLogId"], skin_log_id)

        self.db.expire_all()
        updated_log = self.db.query(SkinLog).filter(SkinLog.id == skin_log_id).first()
        self.assertEqual(updated_log.photo_url, "http://example.com/skin2.jpg")
        self.assertIsNone(updated_log.overall_score)

    def test_confirmed_skin_log_rejects_reanalysis(self):
        skin_log = SkinLog(
            user_id=1,
            logged_at=date.today(),
            photo_url="http://example.com/skin.jpg",
            overall_score=4,
        )
        self.db.add(skin_log)
        self.db.commit()

        resp = self.client.post("/skin/logs/analyze-photo")

        self.assertEqual(resp.status_code, 409)

    @patch("app.routers.skin_log.get_medgemma_task_status", new_callable=AsyncMock)
    def test_get_medgemma_task_status_endpoint(self, mock_get_status):
        skin_log = SkinLog(
            user_id=1,
            logged_at=date.today(),
            photo_url="http://example.com/skin.jpg",
        )
        self.db.add(skin_log)
        self.db.commit()

        mock_get_status.return_value = {
            "status": "done",
            "skin_log_id": skin_log.id,
            "recommendation": "review",
            "confidence": "medium",
        }

        resp = self.client.get(f"/skin/logs/{skin_log.id}/medgemma-status")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "done")
        self.assertEqual(data["recommendation"], "review")
        self.assertEqual(data["skin_log_id"], skin_log.id)
        mock_get_status.assert_awaited_once_with(skin_log_id=skin_log.id, user_id=1)
        
        # Test 404
        resp404 = self.client.get("/skin/logs/9999/medgemma-status")
        self.assertEqual(resp404.status_code, 404)


    def test_month_status_ignores_draft_skin_logs(self):
        self.db.add_all(
            [
                SkinLog(user_id=1, logged_at=date(2026, 6, 1), overall_score=None),
                SkinLog(user_id=1, logged_at=date(2026, 6, 2), overall_score=4),
            ]
        )
        self.db.commit()

        resp = self.client.get("/users/me/records/month-status?year=2026&month=6")

        self.assertEqual(resp.status_code, 200)
        dates = resp.json()["dates"]
        self.assertEqual(dates["2026-06-01"], "none")
        self.assertEqual(dates["2026-06-02"], "partial")

    def test_food_item_search(self):
        # Seed food items
        food1 = FoodItem(name="사과", category="과일")
        food2 = FoodItem(
            name="사과파이",
            category="디저트",
            skin_factors=[{"key": "dairy_confirmed"}, {"key": "high_gl_candidate"}],
            raw_material_text="사과, 탈지분유",
            allergen_text="우유",
        )
        self.db.add_all([food1, food2])
        self.db.commit()

        # Search for 사과
        resp = self.client.get("/food-items/search?q=사과")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["name"], "사과")
        self.assertNotIn("raw_material_text", data[1])
        self.assertNotIn("allergen_text", data[1])

    def test_food_item_lookup_returns_match(self):
        food = FoodItem(
            name="바나나",
            category="과일",
            calories=90,
            protein=1,
            fat=0,
            carbohydrate=23,
        )
        self.db.add(food)
        self.db.commit()

        resp = self.client.get("/food-items/lookup?name=바나나")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsNotNone(data["food_item_id"])
        self.assertIsNotNone(data["nutrition"])
        self.assertNotEqual(data["match_type"], "없음")

    def test_food_item_lookup_unknown_returns_no_nutrition(self):
        resp = self.client.get("/food-items/lookup?name=존재하지않는음식XYZ123")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsNone(data["food_item_id"])
        self.assertIsNone(data["nutrition"])

    def test_diet_log_update(self):
        # Create a diet log
        food = FoodItem(name="바나나", category="과일")
        self.db.add(food)
        self.db.commit()

        diet_log = DietLog(
            user_id=1,
            logged_at=datetime.now(),
            meal_type="아침",
            input_method="manual"
        )
        self.db.add(diet_log)
        self.db.commit()

        item = DietLogItem(diet_log_id=diet_log.id, food_item_id=food.id, amount=1.0, unit="개")
        self.db.add(item)
        self.db.commit()

        # Update log
        update_payload = {
            "meal_type": "점심",
            "note": "업데이트된 노트",
            "items": [
                {"custom_food_name": "사과", "amount": 2.0, "unit": "개"}
            ]
        }
        resp = self.client.put(f"/users/me/diet-logs/{diet_log.id}", json=update_payload)
        self.assertEqual(resp.status_code, 200)
        
        self.db.expire_all()
        updated = self.db.query(DietLog).filter(DietLog.id == diet_log.id).first()
        self.assertEqual(updated.meal_type, "점심")
        self.assertEqual(updated.note, "업데이트된 노트")
        self.assertEqual(len(updated.items), 1)
        self.assertEqual(updated.items[0].custom_food_name, "사과")

    def test_period_log_crud(self):
        # Create
        payload = {"started_at": str(date.today())}
        resp = self.client.post("/users/me/period-logs", json=payload)
        self.assertEqual(resp.status_code, 200)
        log_id = resp.json()["id"]

        # List
        resp_list = self.client.get("/users/me/period-logs")
        self.assertEqual(resp_list.status_code, 200)
        self.assertEqual(len(resp_list.json()), 1)

        # Delete
        resp_del = self.client.delete(f"/users/me/period-logs/{log_id}")
        self.assertEqual(resp_del.status_code, 204)

    def test_user_location_crud(self):
        # Upsert Home
        payload = {
            "location_type": "home",
            "location_name": "우리집",
            "lat": 37.5,
            "lng": 127.0
        }
        resp = self.client.post("/users/me/locations", json=payload)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["location_name"], "우리집")

        # Get
        resp_get = self.client.get("/users/me/locations/home")
        self.assertEqual(resp_get.status_code, 200)
        self.assertEqual(resp_get.json()["location_name"], "우리집")

        # Delete
        resp_del = self.client.delete("/users/me/locations/home")
        self.assertEqual(resp_del.status_code, 204)

    def test_push_token_update(self):
        payload = {"push_token": "my_new_push_token"}
        resp = self.client.patch("/auth/me/push-token", json=payload)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["push_token"], "my_new_push_token")
