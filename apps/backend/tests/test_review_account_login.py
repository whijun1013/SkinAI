import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import os

# mock environment variable before importing main
os.environ["JWT_SECRET_KEY"] = "test_secret"
os.environ["STORAGE_PROVIDER"] = "local"
os.environ["MEDGEMMA_QUEUE_ENABLED"] = "false"
os.environ["SKIN_ANALYSIS_PROVIDER"] = "disabled"

from main import app
from app.database import Base, get_db
from app.models.user import User
from app.auth.security import get_password_hash

from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.mysql import TINYINT
@compiles(TINYINT, 'sqlite')
def compile_tinyint_sqlite(type_, compiler, **kw):
    return "SMALLINT"

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "test_secret")
    monkeypatch.setenv("ENABLE_REVIEW_ACCOUNT_LOGIN", "false")
    monkeypatch.setenv("REVIEW_ACCOUNT_EMAIL", "reviewer@example.com")
    monkeypatch.setenv("REVIEW_ACCOUNT_PASSWORD", "Review123!")
    monkeypatch.setenv("REVIEW_ACCOUNT_NAME", "Luvel Reviewer")

def test_review_login_disabled(client, monkeypatch):
    monkeypatch.setenv("ENABLE_REVIEW_ACCOUNT_LOGIN", "false")
    response = client.post("/auth/login", json={"email": "reviewer@example.com", "password": "Review123!"})
    assert response.status_code == 401

def test_review_login_enabled_success(client, monkeypatch, db_session):
    monkeypatch.setenv("ENABLE_REVIEW_ACCOUNT_LOGIN", "true")
    response = client.post("/auth/login", json={"email": "reviewer@example.com", "password": "Review123!"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "reviewer@example.com"
    assert data["user"]["is_admin"] is False
    assert data["user"]["is_onboarded"] is True

def test_review_login_enabled_wrong_password(client, monkeypatch):
    monkeypatch.setenv("ENABLE_REVIEW_ACCOUNT_LOGIN", "true")
    response = client.post("/auth/login", json={"email": "reviewer@example.com", "password": "WrongPassword"})
    assert response.status_code == 401

def test_normal_user_login(client, db_session):
    user = User(
        email="normal@example.com",
        name="Normal User",
        hashed_password=get_password_hash("Normal123!"),
    )
    db_session.add(user)
    db_session.commit()

    response = client.post("/auth/login", json={"email": "normal@example.com", "password": "Normal123!"})
    assert response.status_code == 200

def test_review_login_idempotency(client, monkeypatch, db_session):
    monkeypatch.setenv("ENABLE_REVIEW_ACCOUNT_LOGIN", "true")
    response1 = client.post("/auth/login", json={"email": "reviewer@example.com", "password": "Review123!"})
    assert response1.status_code == 200

    response2 = client.post("/auth/login", json={"email": "reviewer@example.com", "password": "Review123!"})
    assert response2.status_code == 200

    users = db_session.query(User).filter(User.email == "reviewer@example.com").all()
    assert len(users) == 1
