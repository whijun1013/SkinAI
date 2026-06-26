import os
import sys
import unittest
from datetime import datetime
from unittest.mock import patch, MagicMock, AsyncMock

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, BigInteger
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from app.deps.auth import get_current_user
from app.models.user import User
from app.models.diet import DietLog, DietLogItem, FoodItem
from app.services.food_lookup_service import save_gpt_estimate
from app.models.environment import EnvironmentLog
from app.database import Base, get_db
from app.services.environment_service import create_environment_log_from_capture
import app.services.diet_service as diet_service

from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.mysql import TINYINT

# For SQLite compatibility in tests
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

mock_user = User(id=1, email="test@example.com", name="Test User")

def override_get_current_user():
    return mock_user

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

ORIGINAL_DIET_SESSION_LOCAL = getattr(diet_service, "SessionLocal", None)

class TestDietLogs(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls._previous_get_current_user_override = app.dependency_overrides.get(get_current_user)
        cls._previous_get_db_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_current_user] = override_get_current_user
        app.dependency_overrides[get_db] = override_get_db
        diet_service.SessionLocal = TestingSessionLocal
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)
        if cls._previous_get_current_user_override is None:
            app.dependency_overrides.pop(get_current_user, None)
        else:
            app.dependency_overrides[get_current_user] = cls._previous_get_current_user_override

        if cls._previous_get_db_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = cls._previous_get_db_override

        if ORIGINAL_DIET_SESSION_LOCAL is None:
            delattr(diet_service, "SessionLocal")
        else:
            diet_service.SessionLocal = ORIGINAL_DIET_SESSION_LOCAL

    def setUp(self):
        self._previous_dependency_overrides = dict(app.dependency_overrides)
        app.dependency_overrides[get_current_user] = override_get_current_user
        app.dependency_overrides[get_db] = override_get_db

        self.db = TestingSessionLocal()
        self.db.merge(User(
            id=mock_user.id,
            email=mock_user.email,
            name=mock_user.name,
            hashed_password="test-password",
            terms_agreed_at=datetime.now(),
        ))
        self.db.commit()
        self.client = TestClient(app)

    def tearDown(self):
        try:
            self.db.query(EnvironmentLog).delete()
            self.db.query(DietLogItem).delete()
            self.db.query(DietLog).delete()
            self.db.query(FoodItem).delete()
            self.db.query(User).delete()
            self.db.commit()
            self.db.close()
        finally:
            app.dependency_overrides.clear()
            app.dependency_overrides.update(self._previous_dependency_overrides)

    @patch("app.services.environment_service.fetch_kma_weather_data")
    @patch("app.services.environment_service.fetch_kma_living_uv_index")
    @patch("app.services.environment_service.fetch_airkorea_pm")
    @patch("app.services.environment_service.reverse_geocode_kakao")
    def test_create_diet_log_with_coordinates_creates_environment_log(
        self, mock_geo, mock_pm, mock_uv, mock_weather
    ):
        mock_geo.return_value = "서울특별시 강남구"
        mock_weather.return_value = (25.0, 50, "비")
        mock_uv.return_value = 5
        mock_pm.return_value = (30, 15)

        payload = {
            "meal_type": "점심",
            "input_method": "photo",
            "photo_url": "http://example.com/diet.jpg",
            "captured_lat": 37.514322,
            "captured_lng": 127.062831,
            "captured_location_name": "서울특별시 강남구",
            "note": "맛있는 점심 식사",
            "items": [
                {"custom_food_name": "김치찌개", "amount": 1.0, "unit": "인분"}
            ]
        }

        resp = self.client.post("/users/me/diet-logs", json=payload)
        self.assertEqual(resp.status_code, 200)
        
        # Verify DietLog is created
        diet_log_id = resp.json()["id"]
        diet_log = self.db.query(DietLog).filter(DietLog.id == diet_log_id).first()
        self.assertIsNotNone(diet_log)
        self.assertEqual(diet_log.meal_type, "점심")

        # Verify associated EnvironmentLog is created
        env_log = self.db.query(EnvironmentLog).filter(EnvironmentLog.diet_log_id == diet_log_id).first()
        self.assertIsNotNone(env_log)
        self.assertEqual(float(env_log.lat), 37.514322)
        self.assertEqual(float(env_log.lng), 127.062831)
        self.assertEqual(env_log.diet_log_id, diet_log_id)
        self.assertEqual(float(env_log.temperature), 25.0)

    def test_create_diet_log_without_coordinates_does_not_create_environment_log(self):
        payload = {
            "meal_type": "저녁",
            "input_method": "manual",
            "note": "집밥",
            "items": []
        }

        resp = self.client.post("/users/me/diet-logs", json=payload)
        self.assertEqual(resp.status_code, 200)

        diet_log_id = resp.json()["id"]
        diet_log = self.db.query(DietLog).filter(DietLog.id == diet_log_id).first()
        self.assertIsNotNone(diet_log)

        # EnvironmentLog should not be created
        env_log = self.db.query(EnvironmentLog).filter(EnvironmentLog.diet_log_id == diet_log_id).first()
        self.assertIsNone(env_log)

    def test_create_manual_diet_log_requires_note(self):
        payload = {
            "meal_type": "저녁",
            "input_method": "manual",
            "note": "   ",
        }

        resp = self.client.post("/users/me/diet-logs", json=payload)
        self.assertEqual(resp.status_code, 422)

    def test_legacy_text_diet_log_route_is_removed(self):
        payload = {
            "meal_type": "저녁",
            "logged_at": datetime.now().isoformat(),
            "note": "집밥",
        }

        resp = self.client.post("/diet/log/text", json=payload)
        self.assertEqual(resp.status_code, 404)

    @patch("app.services.food_vision_service.image_to_food_name")
    def test_analyze_photo_uses_my_diet_route(self, mock_image_to_food_name):
        mock_image_to_food_name.return_value = ("Test Food", {})
        self.db.add(FoodItem(name="Test Food", calories=123, protein=4, fat=5))
        self.db.commit()

        resp = self.client.post(
            "/users/me/diet-logs/analyze-photo",
            files={"file": ("diet.jpg", b"fake image", "image/jpeg")},
        )

        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["food_name"], "Test Food")
        self.assertIsNotNone(body["food_item_id"])

    @patch("app.services.food_vision_service.estimate_nutrition")
    @patch("app.services.food_vision_service.image_to_food_name")
    def test_analyze_photo_returns_none_when_gpt_nutrition_fails(
        self, mock_image_to_food_name, mock_estimate_nutrition
    ):
        mock_image_to_food_name.return_value = ("Unknown Test Food", {})
        mock_estimate_nutrition.return_value = {}

        resp = self.client.post(
            "/users/me/diet-logs/analyze-photo",
            files={"file": ("diet.jpg", b"fake image", "image/jpeg")},
        )

        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["food_name"], "Unknown Test Food")
        self.assertEqual(body["match_type"], "없음")
        self.assertIsNone(body["nutrition"])
        self.assertIsNone(body["food_item_id"])
        self.assertIsNone(body["food_item_source"])

    def test_legacy_diet_router_is_removed(self):
        resp = self.client.post(
            "/diet/logs/analyze-photo",
            files={"file": ("diet.jpg", b"fake image", "image/jpeg")},
        )
        self.assertEqual(resp.status_code, 404)

    @patch("app.services.environment_service.fetch_kma_weather_data")
    @patch("app.services.environment_service.fetch_kma_living_uv_index")
    @patch("app.services.environment_service.fetch_airkorea_pm")
    @patch("app.services.environment_service.reverse_geocode_kakao")
    def test_create_environment_log_duplicate_prevention(
        self, mock_geo, mock_pm, mock_uv, mock_weather
    ):
        mock_geo.return_value = "서울특별시 강남구"
        mock_pm.return_value = (None, None)
        mock_uv.return_value = None
        mock_weather.return_value = (None, None, None)
        
        # Create a dummy DietLog
        dummy_diet = DietLog(
            user_id=1,
            logged_at=datetime.now(),
            meal_type="간식",
            input_method="manual"
        )
        self.db.add(dummy_diet)
        self.db.commit()

        # Call environment service twice for the same diet_log_id
        log1 = create_environment_log_from_capture(
            db=self.db,
            user_id=1,
            source="manual",
            captured_at=datetime.now(),
            lat=37.5,
            lng=127.0,
            diet_log_id=dummy_diet.id
        )
        self.db.commit()

        log2 = create_environment_log_from_capture(
            db=self.db,
            user_id=1,
            source="manual",
            captured_at=datetime.now(),
            lat=37.5,
            lng=127.0,
            diet_log_id=dummy_diet.id
        )
        self.db.commit()

        # They should be the exact same record
        self.assertEqual(log1.id, log2.id)

        # Count in DB should be 1
        count = self.db.query(EnvironmentLog).filter(EnvironmentLog.diet_log_id == dummy_diet.id).count()
        self.assertEqual(count, 1)

    @patch("app.services.environment_service.reverse_geocode_kakao")
    def test_graceful_degradation_on_external_api_failure(self, mock_geo):
        # Kakao API raise exception
        mock_geo.side_effect = Exception("Kakao Service Unavailable")

        payload = {
            "meal_type": "아침",
            "input_method": "photo",
            "photo_url": "http://example.com/diet.jpg",
            "captured_lat": 37.514322,
            "captured_lng": 127.062831,
        }

        resp = self.client.post("/users/me/diet-logs", json=payload)
        # Request should succeed even if external KMA/Kakao API fails
        self.assertEqual(resp.status_code, 200)

        diet_log_id = resp.json()["id"]
        env_log = self.db.query(EnvironmentLog).filter(EnvironmentLog.diet_log_id == diet_log_id).first()
        self.assertIsNotNone(env_log)
        self.assertIsNone(env_log.temperature)

    @patch("app.services.environment_service.fetch_kma_weather_data")
    @patch("app.services.environment_service.fetch_kma_living_uv_index")
    @patch("app.services.environment_service.fetch_airkorea_pm")
    @patch("app.services.environment_service.reverse_geocode_kakao")
    def test_timezone_normalization_kst_and_utc(self, mock_geo, mock_pm, mock_uv, mock_weather):
        mock_geo.return_value = "서울특별시 강남구"
        mock_weather.return_value = (None, None, None)
        mock_uv.return_value = None
        mock_pm.return_value = (None, None)

        # Case 1: captured_at in +09:00 offset (KST)
        payload1 = {
            "meal_type": "아침",
            "input_method": "photo",
            "photo_url": "http://example.com/diet-kst.jpg",
            "captured_at": "2026-06-01T12:00:00+09:00",
            "captured_lat": 37.5,
            "captured_lng": 127.0,
            "captured_location_name": "서울특별시 강남구"
        }
        resp1 = self.client.post("/users/me/diet-logs", json=payload1)
        self.assertEqual(resp1.status_code, 200)
        diet_log_1 = self.db.query(DietLog).filter(DietLog.id == resp1.json()["id"]).first()
        env_log_1 = self.db.query(EnvironmentLog).filter(EnvironmentLog.diet_log_id == diet_log_1.id).first()
        
        # Expected naive KST time: 2026-06-01 12:00:00
        expected_dt = datetime(2026, 6, 1, 12, 0, 0)
        self.assertEqual(diet_log_1.logged_at, expected_dt)
        self.assertEqual(env_log_1.captured_at, expected_dt)

        # Case 2: captured_at in UTC offset (+00:00) which equals 12:00:00 KST
        payload2 = {
            "meal_type": "점심",
            "input_method": "photo",
            "photo_url": "http://example.com/diet-utc.jpg",
            "captured_at": "2026-06-01T03:00:00+00:00",
            "captured_lat": 37.5,
            "captured_lng": 127.0,
            "captured_location_name": "서울특별시 강남구"
        }
        resp2 = self.client.post("/users/me/diet-logs", json=payload2)
        self.assertEqual(resp2.status_code, 200)
        diet_log_2 = self.db.query(DietLog).filter(DietLog.id == resp2.json()["id"]).first()
        env_log_2 = self.db.query(EnvironmentLog).filter(EnvironmentLog.diet_log_id == diet_log_2.id).first()
        
        self.assertEqual(diet_log_2.logged_at, expected_dt)
        self.assertEqual(env_log_2.captured_at, expected_dt)

    @patch("app.services.environment_service.fetch_kma_weather_data")
    @patch("app.services.environment_service.fetch_kma_living_uv_index")
    @patch("app.services.environment_service.fetch_airkorea_pm")
    @patch("app.services.environment_service.reverse_geocode_kakao")
    def test_environment_log_source_resolution(self, mock_geo, mock_pm, mock_uv, mock_weather):
        mock_geo.return_value = "서울특별시 강남구"
        mock_weather.return_value = (None, None, None)
        mock_uv.return_value = None
        mock_pm.return_value = (None, None)

        # Case 1: Has GPS coordinates -> source must be "exif"
        payload1 = {
            "meal_type": "아침",
            "input_method": "photo",
            "photo_url": "http://example.com/diet-exif.jpg",
            "captured_lat": 37.5,
            "captured_lng": 127.0,
        }
        resp1 = self.client.post("/users/me/diet-logs", json=payload1)
        self.assertEqual(resp1.status_code, 200)
        diet_log_1 = self.db.query(DietLog).filter(DietLog.id == resp1.json()["id"]).first()
        env_log_1 = self.db.query(EnvironmentLog).filter(EnvironmentLog.diet_log_id == diet_log_1.id).first()
        self.assertIsNotNone(env_log_1)
        self.assertEqual(env_log_1.source, "exif")

        # Case 2: No GPS coordinates, has only captured_location_name -> source must be "manual"
        payload2 = {
            "meal_type": "점심",
            "input_method": "photo",
            "photo_url": "http://example.com/diet-manual-location.jpg",
            "captured_location_name": "서울특별시 강남구"
        }
        resp2 = self.client.post("/users/me/diet-logs", json=payload2)
        self.assertEqual(resp2.status_code, 200)
        diet_log_2 = self.db.query(DietLog).filter(DietLog.id == resp2.json()["id"]).first()
        env_log_2 = self.db.query(EnvironmentLog).filter(EnvironmentLog.diet_log_id == diet_log_2.id).first()
        self.assertIsNotNone(env_log_2)
        self.assertEqual(env_log_2.source, "manual")

    def test_diet_log_item_validation(self):
        # Case 1: food_item_id and custom_food_name are both empty
        payload1 = {
            "meal_type": "아침",
            "input_method": "photo",
            "items": [
                {"amount": 1.0, "unit": "개"}  # missing both
            ]
        }
        resp1 = self.client.post("/users/me/diet-logs", json=payload1)
        self.assertEqual(resp1.status_code, 422)

        # Case 2: custom_food_name is present
        payload3 = {
            "meal_type": "아침",
            "input_method": "photo",
            "items": [
                {"custom_food_name": "사과", "amount": 1.0, "unit": "개"}
            ]
        }
        resp3 = self.client.post("/users/me/diet-logs", json=payload3)
        self.assertEqual(resp3.status_code, 200)

    def test_diet_log_length_validation(self):
        # Case 1: captured_location_name too long (> 100 chars)
        payload1 = {
            "meal_type": "아침",
            "input_method": "photo",
            "captured_location_name": "A" * 101,
        }
        resp1 = self.client.post("/users/me/diet-logs", json=payload1)
        self.assertEqual(resp1.status_code, 422)

        # Case 2: note too long (> 1000 chars)
        payload2 = {
            "meal_type": "아침",
            "input_method": "photo",
            "note": "B" * 1001,
        }
        resp2 = self.client.post("/users/me/diet-logs", json=payload2)
        self.assertEqual(resp2.status_code, 422)

    def test_time_priority_resolution(self):
        # Case 1: Photo + logged_at → 기록 날짜(logged_at) 우선
        captured_time = "2026-06-01T10:00:00+09:00"
        logged_time = "2026-06-01T15:00:00+09:00"
        payload1 = {
            "meal_type": "아침",
            "input_method": "photo",
            "photo_url": "http://example.com/diet-time.jpg",
            "captured_at": captured_time,
            "logged_at": logged_time,
        }
        resp1 = self.client.post("/users/me/diet-logs", json=payload1)
        self.assertEqual(resp1.status_code, 200)
        diet_log_1 = self.db.query(DietLog).filter(DietLog.id == resp1.json()["id"]).first()
        self.assertEqual(diet_log_1.logged_at, datetime(2026, 6, 1, 15, 0, 0))

        # Case 2: Manual input: ignores captured_at, prioritizes logged_at
        payload2 = {
            "meal_type": "점심",
            "input_method": "manual",
            "captured_at": captured_time,
            "logged_at": logged_time,
            "note": "수동 입력 필수 메모",
        }
        resp2 = self.client.post("/users/me/diet-logs", json=payload2)
        self.assertEqual(resp2.status_code, 200)
        diet_log_2 = self.db.query(DietLog).filter(DietLog.id == resp2.json()["id"]).first()
        # Should resolve to logged_time (15:00:00 naive KST)
        self.assertEqual(diet_log_2.logged_at, datetime(2026, 6, 1, 15, 0, 0))

    def test_food_item_id_is_saved_when_ai_result_is_stored(self):
        food = FoodItem(name="된장찌개", calories=80, source="public_api")
        self.db.add(food)
        self.db.commit()
        self.db.refresh(food)

        payload = {
            "meal_type": "점심",
            "input_method": "photo",
            "items": [{"food_item_id": food.id}],
        }
        resp = self.client.post("/users/me/diet-logs", json=payload)
        self.assertEqual(resp.status_code, 200)

        self.db.expire_all()
        diet_log_id = resp.json()["id"]
        item = self.db.query(DietLogItem).filter(DietLogItem.diet_log_id == diet_log_id).first()
        self.assertIsNotNone(item)
        self.assertEqual(item.food_item_id, food.id)
        self.assertIsNone(item.custom_food_name)

    @patch("app.services.food_vision_service.estimate_nutrition", new_callable=AsyncMock)
    def test_custom_food_name_resolves_to_food_item_when_user_edits_food_name(
        self, mock_estimate_nutrition
    ):
        mock_estimate_nutrition.return_value = {
            "에너지(kcal)": 300.0,
            "단백질(g)": 12.0,
            "지방(g)": 8.0,
            "탄수화물(g)": 40.0,
            "당류(g)": 2.0,
            "나트륨(mg)": 800.0,
        }
        payload = {
            "meal_type": "저녁",
            "input_method": "photo",
            "items": [{"custom_food_name": "엄마표 국밥"}],
        }
        resp = self.client.post("/users/me/diet-logs", json=payload)
        self.assertEqual(resp.status_code, 200)

        self.db.expire_all()
        diet_log_id = resp.json()["id"]
        item = self.db.query(DietLogItem).filter(DietLogItem.diet_log_id == diet_log_id).first()
        self.assertIsNotNone(item)
        self.assertIsNotNone(item.food_item_id)
        self.assertIsNone(item.custom_food_name)

        food = self.db.query(FoodItem).filter(FoodItem.id == item.food_item_id).first()
        self.assertIsNotNone(food)
        self.assertEqual(food.name, "엄마표 국밥")
        self.assertEqual(food.source, "gpt_estimate")

    def test_save_gpt_estimate_returns_same_id_on_duplicate(self):
        dummy_nutrition = {
            "에너지(kcal)": 250.0, "단백질(g)": 10.0, "지방(g)": 8.0,
            "탄수화물(g)": 35.0, "당류(g)": 5.0, "나트륨(mg)": 600.0,
        }
        id1 = save_gpt_estimate(self.db, "타코", dummy_nutrition)
        id2 = save_gpt_estimate(self.db, "타코", dummy_nutrition)

        self.assertEqual(id1, id2)
        count = self.db.query(FoodItem).filter(FoodItem.name == "타코").count()
        self.assertEqual(count, 1)


if __name__ == "__main__":
    unittest.main()
