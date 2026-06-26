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


@patch("app.services.image_quality_service._detect_face_with_mediapipe", return_value=(True, None))
@patch("app.services.image_quality_service._get_mediapipe_model_path", return_value="face.tflite")
def test_validate_skin_photo_normal(mock_get_path, mock_detect):
    result = validate_skin_photo(create_image_bytes(300, 300))
    assert result.is_valid is True
    assert result.warning is None
    assert result.status == "pass"


def test_validate_skin_photo_too_small():
    result = validate_skin_photo(create_image_bytes(100, 100))
    assert result.is_valid is False
    assert result.warning is not None
    assert "256x256" in result.warning
    assert result.status == "fail"


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
    assert result.is_valid is False
    assert result.warning is not None
    assert result.status == "unknown"


@patch("app.services.image_quality_service._get_mediapipe_model_path")
def test_schema_stability(mock_get_path):
    mock_get_path.return_value = None
    result = validate_skin_photo(create_image_bytes(300, 300))
    data = result.model_dump()
    assert set(data) == {"is_valid", "warning", "status", "reason_code"}
    assert isinstance(data["is_valid"], bool)


@patch("app.routers.upload.upload_to_blob_storage")
def test_upload_includes_quality_warning_when_bad(mock_upload, client):
    mock_upload.return_value = "http://fake-blob.example/test.jpg"
    files = {"file": ("test.jpg", create_image_bytes(100, 100), "image/jpeg")}

    response = client.post("/upload/skin-log/image?user_id=1&create_log=false", files=files)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["qualityWarning"] is not None
    assert data["qualityStatus"] == "fail"


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


@patch("app.routers.skin_log.is_medgemma_queue_enabled")
@patch("fastapi.BackgroundTasks.add_task")
def test_analyze_photo_skips_medgemma_queue_for_bad_quality(
    mock_add_task,
    mock_queue_enabled,
    client,
):
    from app.database import get_db
    from app.deps.auth import get_current_user
    original_overrides = dict(app.dependency_overrides)
    mock_db = _override_db(_skin_log_for_today())
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[get_db] = lambda: mock_db
    try:
        mock_queue_enabled.return_value = True

        response = client.post("/skin/logs/analyze-photo")

        assert response.status_code == 200, response.text
        assert all(call.args[0].__name__ != "enqueue_medgemma_analysis_task" for call in mock_add_task.call_args_list)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)


@patch("app.services.image_quality_service._get_mediapipe_model_path")
def test_validate_skin_photo_mediapipe_not_configured(mock_get_path):
    mock_get_path.return_value = None
    result = validate_skin_photo(create_image_bytes(300, 300))
    assert result.is_valid is False
    assert result.status == "unknown"
    assert result.reason_code == "face_detector_not_configured"
    assert result.warning is not None


@patch.dict("os.environ", {"IMAGE_QUALITY_FAIL_CLOSED": "false"})
@patch("app.services.image_quality_service._get_mediapipe_model_path", return_value=None)
def test_validate_skin_photo_can_fail_open_when_explicitly_configured(mock_get_path):
    result = validate_skin_photo(create_image_bytes(300, 300))
    assert result.is_valid is True
    assert result.status == "unknown"

@patch("app.services.image_quality_service._get_mediapipe_model_path")
@patch("app.services.image_quality_service.os.path.isfile")
def test_validate_skin_photo_mediapipe_file_not_found(mock_isfile, mock_get_path):
    mock_get_path.return_value = "fake_model.tflite"
    mock_isfile.return_value = False
    result = validate_skin_photo(create_image_bytes(300, 300))
    assert result.is_valid is False
    assert result.status == "unknown"
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
        assert result.is_valid is False
        assert result.status == "unknown"
        assert result.warning == "얼굴 탐지 라이브러리(MediaPipe) 로드에 실패하여 탐지를 건너뛰었습니다."

@patch("app.services.image_quality_service._get_mediapipe_model_path")
def test_validate_skin_photo_mediapipe_runtime_error(mock_get_path):
    mock_get_path.return_value = "fake_model.tflite"

    img = np.full((300, 300, 3), 128, dtype=np.uint8)
    gray = np.full((300, 300), 128, dtype=np.uint8)

    with patch("app.services.image_quality_service.cv2.cvtColor", side_effect=[
        img,
        gray,
        RuntimeError("libGLESv2.so.2: cannot open shared object file: /internal/path")
    ]):
        with patch("app.services.image_quality_service.os.path.isfile", return_value=True):
            with patch("app.services.image_quality_service.cv2.Laplacian") as mock_lap:
                mock_lap.return_value.var.return_value = 100.0 # pass blur check
                result = validate_skin_photo(create_image_bytes(300, 300))

                assert result.status == "unknown"
                assert result.is_valid is False
                assert result.reason_code == "face_detection_unavailable"

                forbidden_strings = ["libGLESv2", "/internal/path", "RuntimeError", "shared object"]
                for forbidden in forbidden_strings:
                    assert forbidden not in result.warning

@patch("app.services.image_quality_service.PilImage.open")
def test_validate_skin_photo_top_level_exception(mock_open):
    mock_open.side_effect = Exception("System critical failure in image processing")
    result = validate_skin_photo(create_image_bytes(300, 300))
    assert result.reason_code == "quality_check_error"
    assert result.status == "unknown"
    assert result.is_valid is False
    assert "System critical failure" not in result.warning
    assert result.warning == "사진 품질 검사를 완료하지 못했습니다. 잠시 후 다시 시도해주세요."
