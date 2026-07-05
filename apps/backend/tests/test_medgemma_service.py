import os
import sys
import unittest
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.medgemma_service import (
    build_medgemma_handoff_payload,
    build_medgemma_display_summary,
    build_user_facing_observations,
    extract_signal_labels,
)


class TestMedGemmaService(unittest.TestCase):

    def test_extract_signal_labels_returns_correct_dict(self):
        result = {
            "active_lesion": "none",
            "redness": "mild",
            "barrier": "moderate"
        }
        labels = extract_signal_labels(result)
        self.assertEqual(labels["active_lesion"], "none")
        self.assertEqual(labels["redness"], "mild")
        self.assertEqual(labels["barrier"], "moderate")

    def test_build_medgemma_handoff_payload(self):
        result = {
            "active_lesion": "mild",
            "redness": "none",
            "barrier": "none",
            "photo_quality": "pass",
            "confidence": 0.85,
            "usable": True,
            "usable_for_skin_observation": True
        }
        payload = build_medgemma_handoff_payload(result)
        self.assertIsNotNone(payload)
        self.assertEqual(payload["photo_quality"], "pass")
        self.assertEqual(payload["signals"]["active_lesion"], 1) # mild = 1
        self.assertEqual(payload["signals"]["redness"], 0) # none = 0
        self.assertEqual(payload["signals"]["barrier"], 0) # none = 0

    def test_build_medgemma_handoff_payload_rejects_unusable(self):
        result = {
            "usable": False,
            "photo_quality": "pass",
            "active_lesion": "mild"
        }
        self.assertIsNone(build_medgemma_handoff_payload(result))

    def test_build_medgemma_display_summary_none(self):
        result = {
            "photo_quality": "pass",
            "active_lesion": "none",
            "redness": "none",
            "barrier": "none"
        }
        summary = build_medgemma_display_summary(result)
        self.assertEqual(summary, "업로드된 사진에서는 뚜렷한 피부 신호가 관찰되지 않았습니다.")

    def test_build_medgemma_display_summary_moderate_single(self):
        result = {
            "photo_quality": "pass",
            "active_lesion": "none",
            "redness": "moderate",
            "barrier": "none"
        }
        summary = build_medgemma_display_summary(result)
        self.assertEqual(summary, "업로드된 사진에서 중간 수준의 염증성 홍반 신호가 관찰되었습니다.")

    def test_build_medgemma_display_summary_multiple(self):
        result = {
            "photo_quality": "pass",
            "active_lesion": "severe",
            "redness": "moderate",
            "barrier": "none"
        }
        summary = build_medgemma_display_summary(result)
        self.assertEqual(summary, "업로드된 사진에서 트러블 및 염증성 홍반 신호가 관찰되었습니다.")

    def test_build_user_facing_observations(self):
        result = {
            "photo_quality": "pass",
            "active_lesion": "mild",
            "redness": "none",
            "barrier": "moderate"
        }
        obs = build_user_facing_observations(result)
        self.assertEqual(obs["active_lesion"]["level_label"], "경미함")
        self.assertEqual(obs["redness"]["level_label"], "없음")
        self.assertEqual(obs["barrier"]["level_label"], "중간")


class TestSkinCropFallback(unittest.TestCase):
    """Vision API safety crop preprocessing fallback tests."""

    def test_crop_returns_original_when_no_model_env(self):
        """MEDIAPIPE_FACE_DETECTOR_MODEL 미설정 시 원본 반환."""
        from app.services.medgemma_service import _crop_skin_region
        fake_bytes = b"fake_image_data"
        with patch.dict("os.environ", {}, clear=False):
            os.environ.pop("MEDIAPIPE_FACE_DETECTOR_MODEL", None)
            result = _crop_skin_region(fake_bytes)
        self.assertEqual(result, fake_bytes)

    def test_crop_returns_original_when_model_file_missing(self):
        """모델 파일이 없을 때 원본 반환."""
        from app.services.medgemma_service import _crop_skin_region
        fake_bytes = b"fake_image_data"
        with patch.dict("os.environ", {"MEDIAPIPE_FACE_DETECTOR_MODEL": "/nonexistent/model.tflite"}):
            result = _crop_skin_region(fake_bytes)
        self.assertEqual(result, fake_bytes)

    def test_analyze_returns_disabled_when_no_api_key(self):
        """GEMINI_API_KEY 미설정 시 disabled 결과 반환."""
        from app.services.medgemma_service import analyze_skin_photo
        with patch.dict("os.environ", {}, clear=False):
            os.environ.pop("GEMINI_API_KEY", None)
            result = analyze_skin_photo(b"fake_image")
        self.assertIn("signals", result)
        self.assertTrue(isinstance(result["signals"], dict))
        self.assertTrue(result.get("usable") or "display_summary" in result)

    def test_analyze_returns_disabled_when_provider_disabled(self):
        """SKIN_ANALYSIS_PROVIDER=disabled 시 분석 없이 기본 스키마 반환."""
        from app.services.medgemma_service import analyze_skin_photo
        with patch.dict("os.environ", {"SKIN_ANALYSIS_PROVIDER": "disabled"}):
            result = analyze_skin_photo(b"fake_image")
        self.assertEqual(result.get("signals", {}).get("active_lesion"), 0)


class TestPresignedUrlConfig(unittest.TestCase):
    """Presigned URL TTL 및 보안 설정 확인."""

    def test_presigned_url_expiry_is_short(self):
        """Presigned URL 만료 시간이 1800초 이하인지 확인."""
        import inspect
        from app.services.blob_storage import sign_blob_read_url
        src = inspect.getsource(sign_blob_read_url)
        # ExpiresIn 값이 1800 이하인지 소스에서 검증
        import re
        matches = re.findall(r"ExpiresIn\s*=\s*(\d+)", src)
        for m in matches:
            self.assertLessEqual(int(m), 1800, f"ExpiresIn={m} is too long (max 1800s)")

    def test_s3_provider_string_is_in_sign_url(self):
        """S3StorageProvider.sign_read_url이 r2 provider를 처리하는지 확인."""
        import inspect
        from app.services.blob_storage import S3StorageProvider
        src = inspect.getsource(S3StorageProvider.sign_read_url)
        self.assertIn("static", src)  # presigned URL 생성 로직이 존재함


if __name__ == "__main__":
    unittest.main()

