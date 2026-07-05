import os
import sys
import unittest
from datetime import datetime
from unittest.mock import patch, MagicMock

# Add apps/backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app
from app.deps.auth import get_current_user
from app.models.user import User
from app.models.environment import EnvironmentLog
from app.services.environment_service import (
    parse_optional_float,
    parse_optional_int,
    get_station_for_location,
    get_living_area_no,
    get_airkorea_station_name,
    fetch_kma_weather_data,
    fetch_kma_living_uv_index,
    fetch_airkorea_pm,
    create_environment_log_from_capture
)

# Mock user for authentication override
mock_user = User(id=1, email="test@example.com", name="Test User")


class TestEnvironmentLogs(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.old_current_user = app.dependency_overrides.get(get_current_user)
        app.dependency_overrides[get_current_user] = lambda: mock_user

    @classmethod
    def tearDownClass(cls):
        if cls.old_current_user:
            app.dependency_overrides[get_current_user] = cls.old_current_user
        else:
            app.dependency_overrides.pop(get_current_user, None)

    def test_parse_optional_float(self):
        self.assertEqual(parse_optional_float("25.4"), 25.4)
        self.assertEqual(parse_optional_float("-9.0"), None)
        self.assertEqual(parse_optional_float("-999.0"), None)
        self.assertEqual(parse_optional_float("abc"), None)
        self.assertEqual(parse_optional_float(None), None)

    def test_parse_optional_int(self):
        self.assertEqual(parse_optional_int("35"), 35)
        self.assertEqual(parse_optional_int(" 18 "), 18)
        self.assertEqual(parse_optional_int("-"), None)
        self.assertEqual(parse_optional_int("null"), None)
        self.assertEqual(parse_optional_int("None"), None)
        self.assertEqual(parse_optional_int("-999"), None)
        self.assertEqual(parse_optional_int(None), None)
        # float format string coercion
        self.assertEqual(parse_optional_int("35.7"), 36)

    def test_get_station_for_location(self):
        # Normalization and lookup
        self.assertEqual(get_station_for_location("서울특별시 강남구"), "108")
        self.assertEqual(get_station_for_location("부산광역시 해운대구"), "159")
        self.assertEqual(get_station_for_location("충청북도 청주시"), "131")
        self.assertEqual(get_station_for_location("없는지역"), None)

    def test_get_living_area_no(self):
        self.assertEqual(get_living_area_no("세종특별자치시 조치원읍"), "3600000000")
        self.assertEqual(get_living_area_no("서울특별시 강남구"), "1100000000")
        self.assertEqual(get_living_area_no("없는도시"), None)

    def test_get_airkorea_station_name(self):
        self.assertEqual(get_airkorea_station_name("서울특별시 강남구 역삼동"), "강남구")
        self.assertEqual(get_airkorea_station_name("경기도 성남시 분당구 삼평동"), "분당구")
        self.assertEqual(get_airkorea_station_name("인천광역시 강화군 강화읍"), "강화군")
        self.assertEqual(get_airkorea_station_name("제주특별자치도 제주시 연동"), "제주시")
        self.assertEqual(get_airkorea_station_name("단일단어"), "단일단어")
        self.assertEqual(get_airkorea_station_name(None), None)

    @patch("httpx.Client.get")
    def test_fetch_kma_weather_data_success(self, mock_get):
        # Mock successful KMA response (with weather code WP = 6 -> 비)
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = (
            "#START7777\n"
            "# YYMMDDHHMI STN WD WS GST_WD GST_WS GST_TM PA PS PT PR TA TD HM PV RN RN_DAY RN_JUN RN_INT SD_HR3 SD_DAY SD_TOT WC WP WW CA_TOT\n"
            "202605271600 108 32 1.2 -9 -9.0 -9 998.6 1002.8 -9 -9.0 25.1 20.6 66.0 24.3 -9.0 9.7 9.7 -9.0 -9.0 -9.0 -9.0 -9 6 -9 10\n"
            "#7777END"
        ).encode("euc-kr")
        mock_get.return_value = mock_response

        # Execute
        with patch.dict(os.environ, {"KMA_AUTH_KEY": "dummy_key"}):
            temp, hum, weather = fetch_kma_weather_data("108", datetime(2026, 5, 27, 16, 0))

        self.assertEqual(temp, 25.1)
        self.assertEqual(hum, 66)
        self.assertEqual(weather, "비")

    @patch("httpx.Client.get")
    def test_fetch_kma_living_uv_index_success(self, mock_get):
        # Mock successful KMA Living UV response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": {
                "header": {"resultCode": "00"},
                "body": {
                    "items": {
                        "item": [
                            {
                                "code": "A07",
                                "areaNo": "1100000000",
                                "date": "2026052716",
                                "today": "6",
                                "tomorrow": "7"
                            }
                        ]
                    }
                }
            }
        }
        mock_get.return_value = mock_response

        # Execute
        with patch.dict(os.environ, {"KMA_LIVING_INDEX_SERVICE_KEY": "dummy_key"}):
            uv = fetch_kma_living_uv_index("1100000000", datetime(2026, 5, 27, 16, 0))

        self.assertEqual(uv, 6)

    @patch("httpx.Client.get")
    def test_fetch_kma_living_uv_index_list_and_out_of_bounds(self, mock_get):
        # Mock successful KMA Living UV response with list items and out of bounds today value
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": {
                "header": {"resultCode": "00"},
                "body": {
                    "items": [
                        {
                            "code": "A07",
                            "areaNo": "1100000000",
                            "date": "2026052716",
                            "today": "16", # Out of bounds (>15)
                            "tomorrow": "7"
                        }
                    ]
                }
            }
        }
        mock_get.return_value = mock_response

        with patch.dict(os.environ, {"KMA_LIVING_INDEX_SERVICE_KEY": "dummy"}):
            uv = fetch_kma_living_uv_index("1100000000", datetime(2026, 5, 27, 16, 0))
        
        self.assertIsNone(uv)

    @patch("httpx.Client.get")
    def test_fetch_kma_living_uv_index_dict_response(self, mock_get):
        # Mock successful response where item is a single dict instead of a list
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": {
                "header": {"resultCode": "00"},
                "body": {
                    "items": {
                        "item": {
                            "code": "A07",
                            "areaNo": "1100000000",
                            "date": "2026052716",
                            "today": "8"
                        }
                    }
                }
            }
        }
        mock_get.return_value = mock_response

        with patch.dict(os.environ, {"KMA_LIVING_INDEX_SERVICE_KEY": "dummy"}):
            uv = fetch_kma_living_uv_index("1100000000", datetime(2026, 5, 27, 16, 0))
        
        self.assertEqual(uv, 8)

    @patch("httpx.Client.get")
    def test_fetch_airkorea_pm_success(self, mock_get):
        # Mock successful AirKorea response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "response": {
                "body": {
                    "items": [
                        {
                            "dataTime": "2026-05-27 16:00",
                            "pm10Value": "35",
                            "pm25Value": "18"
                        }
                    ]
                }
            }
        }
        mock_get.return_value = mock_response

        # Execute
        with patch.dict(os.environ, {"AIRKOREA_SERVICE_KEY": "dummy_key"}):
            pm10, pm25 = fetch_airkorea_pm("강남구")

        self.assertEqual(pm10, 35)
        self.assertEqual(pm25, 18)

    @patch("app.services.environment_service.reverse_geocode_kakao")
    @patch("app.services.environment_service.fetch_kma_weather_data")
    @patch("app.services.environment_service.fetch_kma_living_uv_index")
    @patch("app.services.environment_service.fetch_airkorea_pm")
    def test_create_environment_log_graceful_degradation_on_failure(
        self, mock_pm, mock_uv, mock_weather, mock_geo
    ):
        # Mock failures/exceptions
        mock_geo.side_effect = Exception("Kakao API Down")
        mock_weather.side_effect = Exception("KMA Weather API Down")
        mock_uv.side_effect = Exception("KMA UV API Down")
        mock_pm.side_effect = Exception("AirKorea API Down")

        # Mock db session
        mock_db = MagicMock()

        # Execute
        log = create_environment_log_from_capture(
            db=mock_db,
            user_id=1,
            source="app_camera",
            captured_at=datetime.now(),
            lat=37.514322,
            lng=127.062831
        )

        # Log must be created with all weather fields as None
        self.assertIsInstance(log, EnvironmentLog)
        self.assertEqual(log.user_id, 1)
        self.assertEqual(log.temperature, None)
        self.assertEqual(log.humidity, None)
        self.assertEqual(log.pm10, None)
        self.assertEqual(log.pm25, None)
        self.assertEqual(log.uv_index, None)
        self.assertEqual(log.weather, None)
        
        # Verify db.add was called
        mock_db.add.assert_called_once_with(log)

    def test_router_source_validation_failure(self):
        client = TestClient(app)
        # POST request with invalid source value
        response = client.post(
            "/users/me/environment-logs",
            json={
                "lat": 37.514322,
                "lng": 127.062831,
                "source": "invalid_source",
                "captured_at": "2026-05-27T16:00:00"
            }
        )
        self.assertEqual(response.status_code, 422) # Unprocessable Entity due to Pydantic Literal validation
        self.assertIn("Input should be", response.json()["detail"][0]["msg"])


if __name__ == "__main__":
    unittest.main()
