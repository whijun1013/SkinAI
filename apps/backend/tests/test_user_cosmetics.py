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
from app.models.cosmetic import CosmeticProduct, UserCosmetic
from app.database import Base, get_db

from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.mysql import TINYINT

@compiles(TINYINT, 'sqlite')
def compile_tinyint_sqlite(type_, compiler, **kw):
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

class TestUserCosmetics(unittest.TestCase):

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
        
        # Add a dummy product
        self.product = CosmeticProduct(
            id=1,
            brand="TestBrand",
            product_name="TestProduct"
        )
        self.db.add(self.product)
        self.db.commit()

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.query(UserCosmetic).delete()
        self.db.query(CosmeticProduct).delete()
        self.db.commit()
        self.db.close()

    def test_add_user_cosmetic_success(self):
        resp = self.client.post("/users/me/cosmetics", json={"product_id": 1, "is_current": True})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["product_id"], 1)

    def test_add_user_cosmetic_not_found(self):
        resp = self.client.post("/users/me/cosmetics", json={"product_id": 999, "is_current": True})
        self.assertEqual(resp.status_code, 404)

    def test_add_user_cosmetic_duplicate(self):
        self.client.post("/users/me/cosmetics", json={"product_id": 1, "is_current": True})
        resp = self.client.post("/users/me/cosmetics", json={"product_id": 1, "is_current": True})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("이미 사용 중인", resp.json()["detail"])

    def test_get_user_cosmetics(self):
        self.client.post("/users/me/cosmetics", json={"product_id": 1, "is_current": True})
        resp = self.client.get("/users/me/cosmetics")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)
        self.assertEqual(resp.json()[0]["product_id"], 1)

    def test_update_user_cosmetic(self):
        post_resp = self.client.post("/users/me/cosmetics", json={"product_id": 1, "is_current": True})
        uc_id = post_resp.json()["id"]

        resp = self.client.put(f"/users/me/cosmetics/{uc_id}", json={"is_current": False})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["is_current"], False)

    def test_delete_user_cosmetic(self):
        post_resp = self.client.post("/users/me/cosmetics", json={"product_id": 1, "is_current": True})
        uc_id = post_resp.json()["id"]

        resp = self.client.delete(f"/users/me/cosmetics/{uc_id}")
        self.assertEqual(resp.status_code, 204)

        get_resp = self.client.get("/users/me/cosmetics")
        self.assertEqual(len(get_resp.json()), 0)

    def test_cosmetics_search_relevance_and_filters(self):
        # Add some cosmetics for testing
        p1 = CosmeticProduct(id=10, brand="ABC", product_name="Super Cream", category="Cream", image_url="http://img.com/1")
        p2 = CosmeticProduct(id=11, brand="XYZ", product_name="ABC Foam", category="Cleanser", image_url=None)
        p3 = CosmeticProduct(id=12, brand="Foobar", product_name="ABC Cream", category="Cream", image_url="")
        self.db.add_all([p1, p2, p3])
        self.db.commit()

        # Search for "ABC"
        # p1 has brand exact match "ABC" (highest relevance)
        # p2 has product_name starting with "ABC Foam" (medium relevance)
        # p3 has product_name starting with "ABC Cream" (medium relevance)
        resp = self.client.get("/cosmetics/search?q=ABC")
        self.assertEqual(resp.status_code, 200)
        results = resp.json()
        self.assertEqual(len(results), 3)
        self.assertEqual(results[0]["id"], 10) # Brand exact match first

        # Search with category filter
        resp_cat = self.client.get("/cosmetics/search?q=ABC&category=Cream")
        self.assertEqual(len(resp_cat.json()), 2)

        # Category-only browse (no keyword)
        resp_cat_only = self.client.get("/cosmetics/search?category=Cream")
        self.assertEqual(resp_cat_only.status_code, 200)
        self.assertEqual(len(resp_cat_only.json()), 2)

        # Search with has_image filter
        resp_img = self.client.get("/cosmetics/search?q=ABC&has_image=true")
        self.assertEqual(len(resp_img.json()), 1)
        self.assertEqual(resp_img.json()[0]["id"], 10)

        # Search with paging
        resp_page = self.client.get("/cosmetics/search?q=ABC&limit=1&skip=1")
        self.assertEqual(len(resp_page.json()), 1)

    def test_cosmetic_analyze_grade_and_risk(self):
        from app.models.cosmetic import CosmeticIngredient
        # Add ingredients and product
        p = CosmeticProduct(id=20, brand="SkinBrand", product_name="Safe Serum")
        self.db.add(p)
        self.db.commit()

        ing1 = CosmeticIngredient(id=20, name="Banned Ingredient", is_banned=True)
        ing2 = CosmeticIngredient(id=21, name="Irritant Ingredient", is_irritant=True)
        ing3 = CosmeticIngredient(id=22, name="Comedo Ingredient", comedogenic=4)
        self.db.add_all([ing1, ing2, ing3])
        self.db.commit()

        # Link to product
        p.ingredients_list.extend([ing1, ing2, ing3])
        self.db.commit()

        # Analyze
        resp = self.client.get("/cosmetics/20/analyze")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["banned_count"], 1)
        self.assertEqual(data["restricted_count"], 0)
        self.assertEqual(len(data["risk_ingredients"]), 3) # banned, irritant, and comedo (>=3)
        self.assertEqual(data["safety_grade"], "경고 (Red)") # has banned ingredient

    def test_get_past_cosmetics_paginated(self):
        for product_id in (2, 3):
            self.db.add(
                CosmeticProduct(
                    id=product_id,
                    brand="TestBrand",
                    product_name=f"TestProduct{product_id}",
                )
            )
        self.db.commit()

        for day, product_id in enumerate((1, 2, 3), start=1):
            post_resp = self.client.post(
                "/users/me/cosmetics",
                json={
                    "product_id": product_id,
                    "is_current": True,
                    "started_at": f"2026-06-0{day}",
                },
            )
            uc_id = post_resp.json()["id"]
            self.client.put(
                f"/users/me/cosmetics/{uc_id}",
                json={"is_current": False, "ended_at": f"2026-06-0{day}"},
            )

        first_page = self.client.get("/users/me/cosmetics?is_current=false&skip=0&limit=2")
        self.assertEqual(first_page.status_code, 200)
        first_data = first_page.json()
        self.assertEqual(first_data["total"], 3)
        self.assertEqual(len(first_data["items"]), 2)
        self.assertEqual(first_data["skip"], 0)
        self.assertEqual(first_data["limit"], 2)
        self.assertTrue(first_data["has_more"])

        second_page = self.client.get("/users/me/cosmetics?is_current=false&skip=2&limit=2")
        self.assertEqual(second_page.status_code, 200)
        second_data = second_page.json()
        self.assertEqual(len(second_data["items"]), 1)
        self.assertFalse(second_data["has_more"])

    def test_user_cosmetics_date_validation_and_new_period(self):
        post_resp = self.client.post("/users/me/cosmetics", json={
            "product_id": 1,
            "is_current": True,
            "started_at": "2026-06-02",
        })
        uc_id = post_resp.json()["id"]

        resp_fail = self.client.put(f"/users/me/cosmetics/{uc_id}", json={
            "ended_at": "2026-06-01",
        })
        self.assertEqual(resp_fail.status_code, 400)
        self.assertIn("시작일은 종료일보다 빨라야 합니다", resp_fail.json()["detail"])

        started_at_resp = self.client.put(f"/users/me/cosmetics/{uc_id}", json={
            "started_at": "2026-06-01",
        })
        self.assertEqual(started_at_resp.status_code, 200)
        self.assertEqual(started_at_resp.json()["started_at"], "2026-06-01")

        self.client.put(f"/users/me/cosmetics/{uc_id}", json={"is_current": False})
        resp_check = self.client.get("/users/me/cosmetics")
        self.assertIsNotNone(resp_check.json()[0]["ended_at"])

        reactivate_resp = self.client.put(f"/users/me/cosmetics/{uc_id}", json={"is_current": True})
        self.assertEqual(reactivate_resp.status_code, 400)
        self.assertIn("새 사용 기간", reactivate_resp.json()["detail"])

        new_period_resp = self.client.post("/users/me/cosmetics", json={
            "product_id": 1,
            "is_current": True,
            "started_at": "2026-06-10",
        })
        self.assertEqual(new_period_resp.status_code, 200)
        self.assertEqual(new_period_resp.json()["started_at"], "2026-06-10")
        self.assertNotEqual(new_period_resp.json()["id"], uc_id)

if __name__ == "__main__":
    unittest.main()
