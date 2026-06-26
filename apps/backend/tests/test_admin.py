import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import app
from app.database import get_db
from app.deps.auth import get_current_admin_user

def override_get_db():
    try:
        db = MagicMock()
        yield db
    finally:
        pass

class AdminRouterTestCase(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        app.dependency_overrides[get_db] = override_get_db

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_admin_get_users_unauthorized(self):
        # No admin user dependency override => should be 403 (FastAPI HTTPBearer default)
        response = self.client.get("/admin/users")
        self.assertEqual(response.status_code, 403)

    @patch("app.routers.admin.os.getenv")
    def test_generate_dummy_scenarios_disabled(self, mock_getenv):
        mock_getenv.return_value = "false"
        app.dependency_overrides[get_current_admin_user] = lambda: {"id": 1, "is_admin": True}

        response = self.client.post("/admin/dummy-scenarios/generate", json={
            "scenarios": ["Worse_Diet_Dairy"],
            "repetitions": 1,
            "apply": False
        })

        self.assertEqual(response.status_code, 403)
        self.assertIn("비활성화", response.json()["detail"])

    @patch("app.routers.admin.os.getenv")
    def test_generate_dummy_scenarios_invalid_name(self, mock_getenv):
        mock_getenv.return_value = "true"
        app.dependency_overrides[get_current_admin_user] = lambda: {"id": 1, "is_admin": True}

        response = self.client.post("/admin/dummy-scenarios/generate", json={
            "scenarios": ["Invalid_Scenario_Name"],
            "repetitions": 1,
            "apply": False
        })

        self.assertEqual(response.status_code, 400)
        self.assertIn("유효하지 않은", response.json()["detail"])

if __name__ == "__main__":
    unittest.main()
