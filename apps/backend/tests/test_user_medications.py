import os
import sys
import unittest
from datetime import date

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from app.deps.auth import get_current_user
from app.models.user import User
from app.models.medication import Medication, MedicationIngredient, UserMedication, medication_ingredient_map
from app.database import Base, get_db

from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.mysql import TINYINT, BIGINT
from sqlalchemy import BigInteger

@compiles(TINYINT, 'sqlite')
def compile_tinyint_sqlite(type_, compiler, **kw):
    return "INTEGER"

@compiles(BIGINT, 'sqlite')
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

class TestUserMedications(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=engine)

    def setUp(self):
        app.dependency_overrides[get_current_user] = override_get_current_user
        app.dependency_overrides[get_db] = override_get_db
        self.db = TestingSessionLocal()
        self.client = TestClient(app)

        # Add test medications & ingredients
        self.med1 = Medication(id=1, name="아스피린정", form="정제")
        self.med2 = Medication(id=2, name="타이레놀정", form="정제")

        self.ing1 = MedicationIngredient(id=1, name="아세틸살리실산", drug_class="소염진통제", is_skin_relevant=True)
        self.ing2 = MedicationIngredient(id=2, name="아세트아미노펜", drug_class="해열진통제", is_skin_relevant=False)

        self.db.add_all([self.med1, self.med2, self.ing1, self.ing2])
        self.db.commit()

        # Link relationships
        self.med1.ingredients_list.append(self.ing1)
        self.med2.ingredients_list.append(self.ing2)
        self.db.commit()

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.query(UserMedication).delete()
        self.db.execute(medication_ingredient_map.delete())
        self.db.query(MedicationIngredient).delete()
        self.db.query(Medication).delete()
        self.db.commit()
        self.db.close()

    def test_search_by_medication_name(self):
        resp = self.client.get("/medications/search?q=아스피린")
        self.assertEqual(resp.status_code, 200)
        results = resp.json()
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "아스피린정")

    def test_search_by_ingredient_name(self):
        resp = self.client.get("/medications/search?q=아세트아미노펜")
        self.assertEqual(resp.status_code, 200)
        results = resp.json()
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "타이레놀정")

    def test_search_by_drug_class(self):
        resp = self.client.get("/medications/search?q=소염진통제")
        self.assertEqual(resp.status_code, 200)
        results = resp.json()
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "아스피린정")

    def test_get_user_medications_filtering(self):
        # Add two medications (one current, one not current)
        self.client.post("/users/me/medications", json={
            "medication_id": 1,
            "is_current": True,
            "started_at": "2026-06-01"
        })
        self.client.post("/users/me/medications", json={
            "medication_id": 2,
            "is_current": False,
            "started_at": "2026-05-01",
            "expected_end_at": "2026-05-10"
        })

        # Test is_current=true filter
        resp_current = self.client.get("/users/me/medications?is_current=true")
        self.assertEqual(resp_current.status_code, 200)
        current_list = resp_current.json()
        self.assertEqual(len(current_list), 1)
        self.assertEqual(current_list[0]["medication_id"], 1)

        # Test is_current=false filter
        resp_past = self.client.get("/users/me/medications?is_current=false")
        self.assertEqual(resp_past.status_code, 200)
        past_list = resp_past.json()
        self.assertEqual(len(past_list), 1)
        self.assertEqual(past_list[0]["medication_id"], 2)

    def test_update_medication_auto_ended_at(self):
        post_resp = self.client.post("/users/me/medications", json={
            "medication_id": 1,
            "is_current": True,
            "started_at": "2026-06-01"
        })
        um_id = post_resp.json()["id"]

        # Update is_current to False without ended_at
        resp = self.client.put(f"/users/me/medications/{um_id}", json={"is_current": False})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["is_current"], False)
        self.assertEqual(data["ended_at"], date.today().isoformat())

    def test_add_medication_duplicate_prevention(self):
        # Add medication 1
        resp1 = self.client.post("/users/me/medications", json={
            "medication_id": 1,
            "is_current": True
        })
        self.assertEqual(resp1.status_code, 200)

        # Re-add medication 1 (should fail)
        resp2 = self.client.post("/users/me/medications", json={
            "medication_id": 1,
            "is_current": True
        })
        self.assertEqual(resp2.status_code, 400)
        self.assertIn("이미 복용 중인", resp2.json()["detail"])

    def test_medications_search_sorting_and_skin_relevant_only(self):
        # Search for "아" (should match both)
        resp = self.client.get("/medications/search?q=아")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 2)

        # Filter by skin_relevant_only
        resp_filter = self.client.get("/medications/search?q=아&skin_relevant_only=true")
        self.assertEqual(len(resp_filter.json()), 1)
        self.assertEqual(resp_filter.json()[0]["id"], 1)

    def test_user_medications_started_at_default(self):
        resp = self.client.post("/users/me/medications", json={
            "medication_id": 2,
            "is_current": True
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["started_at"], date.today().isoformat())

    def test_user_medications_date_validations(self):
        # 1. POST validation: started_at > expected_end_at
        resp = self.client.post("/users/me/medications", json={
            "medication_id": 2,
            "is_current": True,
            "started_at": "2026-06-05",
            "expected_end_at": "2026-06-04"
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("시작일은 예상 종료일보다 빨라야 합니다", resp.json()["detail"])

        # 2. PUT validation
        post_resp = self.client.post("/users/me/medications", json={
            "medication_id": 2,
            "is_current": True,
            "started_at": "2026-06-05"
        })
        um_id = post_resp.json()["id"]

        resp_fail1 = self.client.put(f"/users/me/medications/{um_id}", json={
            "expected_end_at": "2026-06-04"
        })
        self.assertEqual(resp_fail1.status_code, 400)

        resp_fail2 = self.client.put(f"/users/me/medications/{um_id}", json={
            "ended_at": "2026-06-04"
        })
        self.assertEqual(resp_fail2.status_code, 400)

    def test_get_past_medications_paginated(self):
        for day in (1, 2, 3):
            post_resp = self.client.post("/users/me/medications", json={
                "medication_id": 1 if day % 2 else 2,
                "is_current": True,
                "started_at": f"2026-05-0{day}",
            })
            um_id = post_resp.json()["id"]
            self.client.put(
                f"/users/me/medications/{um_id}",
                json={"is_current": False, "ended_at": f"2026-06-0{day}"},
            )

        first_page = self.client.get("/users/me/medications?is_current=false&skip=0&limit=2")
        self.assertEqual(first_page.status_code, 200)
        first_data = first_page.json()
        self.assertEqual(first_data["total"], 3)
        self.assertEqual(len(first_data["items"]), 2)
        self.assertTrue(first_data["has_more"])

        second_page = self.client.get("/users/me/medications?is_current=false&skip=2&limit=2")
        self.assertEqual(second_page.status_code, 200)
        self.assertEqual(len(second_page.json()["items"]), 1)
        self.assertFalse(second_page.json()["has_more"])

    def test_user_medications_update_started_at(self):
        post_resp = self.client.post("/users/me/medications", json={
            "medication_id": 1,
            "is_current": True,
            "started_at": "2026-06-05",
        })
        um_id = post_resp.json()["id"]

        resp = self.client.put(f"/users/me/medications/{um_id}", json={
            "started_at": "2026-06-01",
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["started_at"], "2026-06-01")

    def test_user_medications_reactivate(self):
        post_resp = self.client.post("/users/me/medications", json={
            "medication_id": 2,
            "is_current": True,
            "started_at": "2026-06-05"
        })
        um_id = post_resp.json()["id"]

        # Deactivate -> sets ended_at
        self.client.put(f"/users/me/medications/{um_id}", json={"is_current": False})
        
        # Reactivate -> nullifies ended_at
        resp = self.client.put(f"/users/me/medications/{um_id}", json={"is_current": True})
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()["ended_at"])

if __name__ == "__main__":
    unittest.main()
