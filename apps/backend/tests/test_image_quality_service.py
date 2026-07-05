import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.deps.auth import get_current_user
from app.models.skin_log import SkinLog
from app.services.image_quality_service import ValidationResult, validate_skin_photo
from main import app


def create_image_bytes(width: int, height: int, color=(128, 128, 128), blur=False) -> bytes:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = color
    cv2.putText(img, "TEST", (width // 4, height // 2), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    if blur:
        img = cv2.GaussianBlur(img, (25, 25), 0)
    success, encoded_img = cv2.imencode(".jpg", img)
    assert success
    return encoded_img.tobytes()


@pytest.fixture
def client():
    previous_overrides = dict(app.dependency_overrides)
    mock_user = SimpleNamespace(id=1)
    app.dependency_overrides[get_current_user] = lambda: mock_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous_overrides)


def _override_db(skin_log: SkinLog):
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = skin_log
    app.dependency_overrides[get_db] = lambda: mock_db
    return mock_db


@patch("app.services.image_quality_service._get_mediapipe_model_path")
def test_validate_skin_photo_normal(mock_get_path):
    mock_get_path.return_value = None
    result = validate_skin_photo(create_image_bytes(300, 300))
    assert result.is_valid is True
    assert result.warning is None


def test_validate_skin_photo_too_small():
    result = validate_skin_photo(create_image_bytes(100, 100))
    assert result.is_valid is False
    assert result.warning is not None
    assert "256x256" in result.warning


def test_validate_skin_photo_too_dark():
    result = validate_skin_photo(create_image_bytes(300, 300, color=(10, 10, 10)))
    assert result.is_valid is False
    assert result.warning is not None


def test_validate_skin_photo_blurry():
    result = validate_skin_photo(create_image_bytes(300, 300, blur=True))
    assert result.is_valid is False
    assert result.warning is not None


def test_validate_skin_photo_invalid_bytes_gracefully_warns():
    result = validate_skin_photo(b"not_an_image")
    assert result.is_valid is True
    assert result.warning is not None


@patch("app.services.image_quality_service._get_mediapipe_model_path")
def test_schema_stability(mock_get_path):
    mock_get_path.return_value = None
    result = validate_skin_photo(create_image_bytes(300, 300))
    data = result.model_dump()
    assert set(data) == {"is_valid", "warning"}
    assert isinstance(data["is_valid"], bool)


@patch("app.routers.upload.upload_to_blob_storage")
def test_upload_includes_quality_warning_when_bad(mock_upload, client):
    mock_upload.return_value = "http://fake-blob.example/test.jpg"
    files = {"file": ("test.jpg", create_image_bytes(100, 100), "image/jpeg")}

    response = client.post("/upload/skin-log/image?user_id=1&create_log=false", files=files)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["qualityWarning"] is not None


@patch("app.routers.upload.upload_to_blob_storage")
@patch("app.routers.upload.validate_skin_photo")
def test_upload_includes_warning_even_when_quality_check_degrades(mock_validate, mock_upload, client):
    from app.deps.auth import get_current_user
    original_overrides = dict(app.dependency_overrides)
    override_get_current_user = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        mock_upload.return_value = "http://fake-blob.com/test.jpg"
        
        mock_validate.return_value = ValidationResult(is_valid=True, warning="품질 검사 오류: Test Exception")
        
        img_bytes = create_image_bytes(300, 300)
        files = {"file": ("test.jpg", img_bytes, "image/jpeg")}
        
        resp = client.post("/upload/skin-log/image?user_id=1&create_log=false", files=files)
        
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "qualityWarning" in data
        assert "품질 검사 오류" in data["qualityWarning"]
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)


def _skin_log_for_today() -> SkinLog:
    return SkinLog(
        id=1,
        user_id=1,
        logged_at=datetime.date.today(),
        photo_url="http://fake-blob.example/skin.jpg",
        quality_check_passed=False,
        quality_warning="Bad Quality",
    )


@patch("app.routers.skin_log.read_blob_bytes")
def test_analyze_photo_skips_medgemma_for_bad_quality(
    mock_read_blob,
    client,
):
    from app.database import get_db
    from app.deps.auth import get_current_user
    original_overrides = dict(app.dependency_overrides)
    mock_db = _override_db(_skin_log_for_today())
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        response = client.post("/skin/logs/analyze-photo")

        assert response.status_code == 200, response.text
        # If skipped, it shouldn't try to read the image bytes
        mock_read_blob.assert_not_called()
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)


@patch("app.services.image_quality_service._get_mediapipe_model_path")
def test_validate_skin_photo_mediapipe_not_configured(mock_get_path):
    mock_get_path.return_value = None
    result = validate_skin_photo(create_image_bytes(300, 300))
    assert result.is_valid is True
    assert result.warning is None

@patch("app.services.image_quality_service._get_mediapipe_model_path")
@patch("app.services.image_quality_service.os.path.isfile")
def test_validate_skin_photo_mediapipe_file_not_found(mock_isfile, mock_get_path):
    mock_get_path.return_value = "fake_model.tflite"
    mock_isfile.return_value = False
    result = validate_skin_photo(create_image_bytes(300, 300))
    assert result.is_valid is True
    assert result.warning == "얼굴 탐지 모델 파일이 없어 탐지를 건너뛰었습니다."

@patch("app.services.image_quality_service._get_mediapipe_model_path")
@patch("app.services.image_quality_service._detect_face_with_mediapipe")
def test_validate_skin_photo_mediapipe_no_face_detected(mock_detect, mock_get_path):
    mock_get_path.return_value = "fake_model.tflite"
    mock_detect.return_value = (False, "정면 얼굴이 충분히 인식되지 않았습니다. 얼굴 전체가 나오도록 다시 촬영해주세요.")
    result = validate_skin_photo(create_image_bytes(300, 300))
    assert result.is_valid is False
    assert result.warning == "정면 얼굴이 충분히 인식되지 않았습니다. 얼굴 전체가 나오도록 다시 촬영해주세요."

@patch("app.services.image_quality_service._get_mediapipe_model_path")
@patch("app.services.image_quality_service.os.path.isfile")
def test_validate_skin_photo_mediapipe_import_error(mock_isfile, mock_get_path):
    mock_get_path.return_value = "fake_model.tflite"
    mock_isfile.return_value = True
    import sys
    with patch.dict(sys.modules, {"mediapipe": None}):
        result = validate_skin_photo(create_image_bytes(300, 300))
        assert result.is_valid is True
        assert result.warning == "얼굴 탐지 라이브러리(MediaPipe) 로드에 실패하여 탐지를 건너뛰었습니다."
