import argparse
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageStat


DEFAULT_SAMPLE_DIR = Path("data_tools/medgemma/samples/probe_samples")
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def _elapsed_ms(start: float) -> int:
    return int((time.time() - start) * 1000)


def _read_cv_image(image_path: Path) -> np.ndarray | None:
    data = np.fromfile(str(image_path), dtype=np.uint8)
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


def get_pillow_stats(image_path: Path) -> tuple[dict[str, Any], int]:
    start = time.time()
    try:
        with Image.open(image_path) as img:
            img = img.convert("RGB")
            width, height = img.size
            stat = ImageStat.Stat(img)
            brightness_mean = sum(stat.mean) / len(stat.mean)
        return {
            "width": width,
            "height": height,
            "brightness_mean": round(brightness_mean, 2),
        }, _elapsed_ms(start)
    except Exception as exc:
        return {"error": str(exc)}, _elapsed_ms(start)


def get_opencv_stats(image_path: Path) -> tuple[dict[str, Any], int]:
    start = time.time()
    try:
        img = _read_cv_image(image_path)
        if img is None:
            raise ValueError("failed_to_load_image_with_opencv")

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
        pixels = gray.size
        underexposed_ratio = float(np.sum(gray < 20) / pixels)
        overexposed_ratio = float(np.sum(gray > 240) / pixels)

        return {
            "blur_score": round(float(blur_score), 2),
            "is_blurry": bool(blur_score < 100),
            "underexposed_ratio": round(underexposed_ratio, 4),
            "overexposed_ratio": round(overexposed_ratio, 4),
        }, _elapsed_ms(start)
    except Exception as exc:
        return {"error": str(exc)}, _elapsed_ms(start)


def _mediapipe_not_configured(message: str, start: float) -> tuple[dict[str, Any], int]:
    return {
        "status": "not_configured",
        "api_used": "mediapipe_tasks",
        "face_detected": None,
        "face_count": None,
        "face_box_ratio": None,
        "detection_score": None,
        "reason": message,
    }, _elapsed_ms(start)


def get_mediapipe_stats(image_path: Path, model_path: str | None = None) -> tuple[dict[str, Any], int]:
    start = time.time()
    if not model_path:
        return _mediapipe_not_configured(
            "MEDIAPIPE_FACE_DETECTOR_MODEL or --mediapipe-model is required for actual face detection.",
            start,
        )
    if not Path(model_path).is_file():
        return _mediapipe_not_configured(f"model file not found: {model_path}", start)

    try:
        import mediapipe as mp
        from mediapipe.tasks import python
        from mediapipe.tasks.python import vision
    except Exception as exc:
        return {"status": "unavailable", "error": f"mediapipe import failed: {exc}"}, _elapsed_ms(start)

    try:
        img = _read_cv_image(image_path)
        if img is None:
            raise ValueError("failed_to_load_image_for_mediapipe")

        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        options = vision.FaceDetectorOptions(
            base_options=python.BaseOptions(model_asset_path=model_path),
            min_detection_confidence=0.5,
        )

        with vision.FaceDetector.create_from_options(options) as detector:
            result = detector.detect(mp_image)

        detections = result.detections or []
        height, width = rgb.shape[:2]
        face_box_ratio = 0.0
        detection_score = None
        for detection in detections:
            bbox = detection.bounding_box
            ratio = (bbox.width * bbox.height) / float(width * height)
            face_box_ratio = max(face_box_ratio, ratio)
            if detection.categories:
                score = float(detection.categories[0].score)
                detection_score = score if detection_score is None else max(detection_score, score)

        return {
            "status": "ok",
            "api_used": "mediapipe_tasks",
            "face_detected": bool(detections),
            "face_count": len(detections),
            "face_box_ratio": round(face_box_ratio, 4),
            "detection_score": round(detection_score, 4) if detection_score is not None else None,
        }, _elapsed_ms(start)
    except Exception as exc:
        return {"status": "failed", "api_used": "mediapipe_tasks", "error": str(exc)}, _elapsed_ms(start)


def _generate_demo_samples() -> Path:
    sample_dir = Path(tempfile.mkdtemp(prefix="image_quality_samples_"))
    samples = {
        "demo_normal.jpg": np.full((320, 320, 3), 128, dtype=np.uint8),
        "demo_dark.jpg": np.full((320, 320, 3), 10, dtype=np.uint8),
        "demo_bright.jpg": np.full((320, 320, 3), 245, dtype=np.uint8),
    }
    for name, img in samples.items():
        cv2.putText(img, "TEST", (70, 170), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2)
        if name == "demo_normal.jpg":
            cv2.rectangle(img, (80, 80), (240, 240), (180, 180, 180), 2)
        cv2.imwrite(str(sample_dir / name), img)
    blurred = samples["demo_normal.jpg"].copy()
    blurred = cv2.GaussianBlur(blurred, (31, 31), 0)
    cv2.imwrite(str(sample_dir / "demo_blurry.jpg"), blurred)
    return sample_dir


def _image_files(sample_dir: Path) -> list[Path]:
    return sorted(
        path
        for path in sample_dir.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )


def evaluate_images(sample_dir: Path, mediapipe_model: str | None = None) -> list[dict[str, Any]]:
    results = []
    for image_path in _image_files(sample_dir):
        pillow_stats, pillow_time = get_pillow_stats(image_path)
        opencv_stats, opencv_time = get_opencv_stats(image_path)
        mediapipe_stats, mediapipe_time = get_mediapipe_stats(image_path, mediapipe_model)
        results.append(
            {
                "image": image_path.name,
                "path": str(image_path),
                "valid_sample": "error" not in pillow_stats and "error" not in opencv_stats,
                "pillow": pillow_stats,
                "opencv": opencv_stats,
                "mediapipe": mediapipe_stats,
                "elapsed_ms": {
                    "pillow": pillow_time,
                    "opencv": opencv_time,
                    "mediapipe": mediapipe_time,
                },
            }
        )
    return results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare lightweight image quality checks.")
    parser.add_argument("--sample-dir", default=str(DEFAULT_SAMPLE_DIR))
    parser.add_argument(
        "--mediapipe-model",
        default=os.getenv("MEDIAPIPE_FACE_DETECTOR_MODEL"),
        help="Path to a MediaPipe Face Detector model asset (.task or .tflite). Required for actual face detection.",
    )
    parser.add_argument(
        "--demo-samples",
        action="store_true",
        help="Generate temporary synthetic samples when the repository samples are missing or invalid.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    sample_dir = Path(args.sample_dir)
    if args.demo_samples:
        sample_dir = _generate_demo_samples()

    if not sample_dir.exists():
        print(json.dumps({"error": f"sample_dir_not_found: {sample_dir}"}, indent=2))
        return

    results = evaluate_images(sample_dir, args.mediapipe_model)
    if not results:
        print(json.dumps({"error": f"no images found in {sample_dir}"}, indent=2))
        return

    summary = {
        "sample_dir": str(sample_dir),
        "total_images": len(results),
        "valid_samples": sum(1 for item in results if item["valid_sample"]),
        "mediapipe_actual_detection_attempted": any(
            item["mediapipe"].get("status") == "ok" for item in results
        ),
        "mediapipe_model_configured": bool(args.mediapipe_model),
        "results": results,
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
