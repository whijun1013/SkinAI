import argparse
import hashlib
import json
import os
import platform
import random
import statistics
import sys
import time
from collections import Counter
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


MODEL_NAME = os.getenv("MEDGEMMA_MODEL_NAME", "google/medgemma-4b-it")
HF_TOKEN = os.getenv("HF_TOKEN", "")
TORCH_DTYPE = os.getenv("MEDGEMMA_TORCH_DTYPE", "auto").lower()
USE_FAST_PROCESSOR = os.getenv("MEDGEMMA_USE_FAST_PROCESSOR", "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
SIGNAL_KEYS = ("active_lesion", "redness", "barrier")
FACE_OVAL = (10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109)
LEFT_EYE = (33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246)
RIGHT_EYE = (263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466)
LEFT_EYEBROW = (46, 53, 52, 65, 55, 107, 66, 105, 63, 70)
RIGHT_EYEBROW = (276, 283, 282, 295, 285, 336, 296, 334, 293, 300)
LIPS = (61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415)

BACKEND_DIR = Path(__file__).resolve().parents[3]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.medgemma_service import (  # noqa: E402
    MEDGEMMA_ASSISTANT_PREFILL,
    ORDINAL_SCORE_MAP,
    SKIN_SIGNAL_PROMPT_VERSION,
    get_medgemma_prompt,
    get_medgemma_prompt_sha256,
    validate_medgemma_output,
)

SYSTEM_PROMPT = get_medgemma_prompt()
MODEL_REVISION = os.getenv("MEDGEMMA_MODEL_REVISION") or None


def _resolve_dtype(torch_module):
    if TORCH_DTYPE in {"bf16", "bfloat16"}:
        return torch_module.bfloat16
    if TORCH_DTYPE in {"fp16", "float16"}:
        return torch_module.float16
    if TORCH_DTYPE in {"fp32", "float32"}:
        return torch_module.float32
    if torch_module.cuda.is_available():
        if torch_module.cuda.is_bf16_supported():
            return torch_module.bfloat16
        return torch_module.float16
    return torch_module.float32


def _set_deterministic_mode(torch_module, seed: int) -> None:
    random.seed(seed)
    torch_module.manual_seed(seed)
    if torch_module.cuda.is_available():
        torch_module.cuda.manual_seed_all(seed)
    torch_module.use_deterministic_algorithms(True, warn_only=True)
    if hasattr(torch_module.backends, "cudnn"):
        torch_module.backends.cudnn.benchmark = False
        torch_module.backends.cudnn.deterministic = True


def _load_image(image_path_or_url: str) -> tuple[Image.Image, int, str]:
    if image_path_or_url.startswith(("http://", "https://")):
        import requests

        response = requests.get(
            image_path_or_url,
            headers={"User-Agent": "medgemma-consistency-test"},
            timeout=60,
        )
        response.raise_for_status()
        content = response.content
        return (
            ImageOps.exif_transpose(Image.open(BytesIO(content))).convert("RGB"),
            len(content),
            hashlib.sha256(content).hexdigest(),
        )

    path = Path(image_path_or_url)
    content = path.read_bytes()
    image = ImageOps.exif_transpose(Image.open(BytesIO(content))).convert("RGB")
    return image, len(content), hashlib.sha256(content).hexdigest()


class PixelSignalAnalyzer:
    """Build a skin-only model input and independent pixel reference metrics."""

    def __init__(self, model_path: str) -> None:
        try:
            import colour
            import cv2
            import mediapipe as mp
            import numpy as np
            from colormath.color_conversions import convert_color
            from colormath.color_objects import LabColor, sRGBColor
            from mediapipe.tasks import python
            from mediapipe.tasks.python import vision
            from skimage.feature import local_binary_pattern
            from skimage.metrics import structural_similarity
        except ImportError as exc:
            raise RuntimeError(
                "Pixel validation dependencies are missing; install data_tools/medgemma/requirements.txt"
            ) from exc

        resolved = Path(model_path).expanduser().resolve()
        if not resolved.is_file():
            raise FileNotFoundError(f"FaceLandmarker model not found: {resolved}")

        self.colour = colour
        self.cv2 = cv2
        self.mp = mp
        self.np = np
        self.convert_color = convert_color
        self.LabColor = LabColor
        self.sRGBColor = sRGBColor
        self.local_binary_pattern = local_binary_pattern
        self.structural_similarity = structural_similarity
        options = vision.FaceLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=str(resolved)),
            running_mode=vision.RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.landmarker = vision.FaceLandmarker.create_from_options(options)
        self.model_path = str(resolved)

    def close(self) -> None:
        self.landmarker.close()

    def _polygon(self, landmarks, indices, width: int, height: int):
        return self.np.array(
            [
                [
                    max(0, min(width - 1, round(landmarks[index].x * width))),
                    max(0, min(height - 1, round(landmarks[index].y * height))),
                ]
                for index in indices
            ],
            dtype=self.np.int32,
        )

    def process(self, image: Image.Image) -> tuple[Image.Image, dict[str, Any], Any]:
        rgb = self.np.asarray(image.convert("RGB"), dtype=self.np.uint8)
        height, width = rgb.shape[:2]
        result = self.landmarker.detect(
            self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=rgb)
        )
        if not result.face_landmarks:
            raise RuntimeError("FaceLandmarker found no face")
        landmarks = result.face_landmarks[0]
        mask = self.np.zeros((height, width), dtype=self.np.uint8)
        self.cv2.fillPoly(mask, [self._polygon(landmarks, FACE_OVAL, width, height)], 255)
        for excluded in (LEFT_EYE, RIGHT_EYE, LEFT_EYEBROW, RIGHT_EYEBROW, LIPS):
            self.cv2.fillPoly(mask, [self._polygon(landmarks, excluded, width, height)], 0)
        erosion = max(1, round(min(width, height) * 0.004))
        kernel = self.np.ones((erosion * 2 + 1, erosion * 2 + 1), self.np.uint8)
        mask = self.cv2.erode(mask, kernel, iterations=1)
        skin = mask > 0
        if int(skin.sum()) < 1000:
            raise RuntimeError("FaceLandmarker skin mask is too small")

        # Estimate scene illuminant from channel highlights instead of skin
        # means so that white balancing does not erase real diffuse redness.
        flattened = rgb.reshape(-1, 3).astype(self.np.float64) / 255.0
        illuminant_rgb = self.np.percentile(flattened, 95, axis=0)
        illuminant_xyz = self.colour.sRGB_to_XYZ(illuminant_rgb)
        illuminant_xy = self.colour.XYZ_to_xy(illuminant_xyz)
        try:
            cct = float(self.colour.xy_to_CCT(illuminant_xy, method="McCamy 1992"))
        except (TypeError, ValueError):
            cct = None
        target = float(illuminant_rgb.mean())
        gains = self.np.clip(target / self.np.maximum(illuminant_rgb, 1e-6), 0.5, 2.0)
        balanced = self.np.clip(rgb.astype(self.np.float32) * gains, 0, 255).astype(self.np.uint8)

        lab8 = self.cv2.cvtColor(balanced, self.cv2.COLOR_RGB2LAB)
        clahe = self.cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        lab8[:, :, 0] = clahe.apply(lab8[:, :, 0])
        enhanced = self.cv2.cvtColor(lab8, self.cv2.COLOR_LAB2RGB)
        model_rgb = self.np.empty_like(enhanced)
        model_rgb[:] = 127
        model_rgb[skin] = enhanced[skin]
        ys, xs = self.np.where(skin)
        margin = max(2, round(min(width, height) * 0.02))
        left, right = max(0, int(xs.min()) - margin), min(width, int(xs.max()) + margin + 1)
        top, bottom = max(0, int(ys.min()) - margin), min(height, int(ys.max()) + margin + 1)
        model_rgb = model_rgb[top:bottom, left:right]

        pixels = balanced[skin].astype(self.np.float64) / 255.0
        lab = self.colour.XYZ_to_Lab(self.colour.sRGB_to_XYZ(pixels))
        mean_balanced = balanced[skin].mean(axis=0) / 255.0
        independent_lab = self.convert_color(
            self.sRGBColor(*mean_balanced, is_upscaled=False), self.LabColor
        )
        gray = self.cv2.cvtColor(enhanced, self.cv2.COLOR_RGB2GRAY)
        lbp = self.local_binary_pattern(gray, P=8, R=1, method="uniform")
        lbp_values = lbp[skin].astype(self.np.int32)
        histogram = self.np.bincount(lbp_values, minlength=10).astype(self.np.float64)
        histogram /= max(float(histogram.sum()), 1.0)
        entropy = float(-(histogram[histogram > 0] * self.np.log2(histogram[histogram > 0])).sum())
        local_contrast = self.cv2.absdiff(gray, self.cv2.GaussianBlur(gray, (0, 0), 2.0))
        metrics = {
            "skin_pixel_count": int(skin.sum()),
            "skin_coverage": round(float(skin.mean()), 4),
            "estimated_illuminant_cct_kelvin": round(cct, 1) if cct is not None else None,
            "white_balance_gains_rgb": [round(float(value), 4) for value in gains],
            "redness_colour_science_lab_a_mean": round(float(lab[:, 1].mean()), 4),
            "redness_colormath_lab_a": round(float(independent_lab.lab_a), 4),
            "barrier_lbp_entropy": round(entropy, 4),
            "barrier_lbp_nonuniform_rate": round(float(histogram[9]), 4),
            "active_lesion_clahe_local_contrast_mean": round(float(local_contrast[skin].mean()), 4),
        }
        return Image.fromarray(model_rgb), metrics, mask

    def ssim(self, previous: Image.Image, current: Image.Image) -> float:
        previous_gray = self.cv2.cvtColor(self.np.asarray(previous), self.cv2.COLOR_RGB2GRAY)
        current_gray = self.cv2.cvtColor(self.np.asarray(current), self.cv2.COLOR_RGB2GRAY)
        current_gray = self.cv2.resize(
            current_gray, (previous_gray.shape[1], previous_gray.shape[0]), interpolation=self.cv2.INTER_AREA
        )
        return float(self.structural_similarity(previous_gray, current_gray, data_range=255))


def _parse_json(text: str) -> tuple[dict[str, Any], bool]:
    stripped = text.strip()
    try:
        parsed = json.loads(stripped)
        return (parsed, True) if isinstance(parsed, dict) else ({}, False)
    except json.JSONDecodeError:
        pass

    # MedGemma may wrap an otherwise valid single JSON object in a Markdown
    # fence even when explicitly instructed not to. Accept only a full-output
    # fence; surrounding explanatory text remains a format failure.
    if stripped.startswith("```") and stripped.endswith("```"):
        fenced = stripped[3:-3].strip()
        if fenced.lower().startswith("json"):
            fenced = fenced[4:].strip()
        try:
            parsed = json.loads(fenced)
            return (parsed, False) if isinstance(parsed, dict) else ({}, False)
        except json.JSONDecodeError:
            pass

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(stripped[start : end + 1])
            return (parsed, False) if isinstance(parsed, dict) else ({}, False)
        except json.JSONDecodeError:
            pass
    return {}, False


def _validate_result(parsed: dict[str, Any]) -> list[str]:
    try:
        validate_medgemma_output(parsed)
        return []
    except ValueError as exc:
        return [str(exc)]


def _iter_images(input_path: str) -> list[str]:
    path = Path(input_path)
    if input_path.startswith(("http://", "https://")) or path.is_file():
        return [input_path]
    if not path.is_dir():
        raise FileNotFoundError(f"Input path not found: {input_path}")
    return [
        str(item)
        for item in sorted(path.rglob("*"))
        if item.is_file() and item.suffix.lower() in IMAGE_EXTENSIONS
    ]


def _load_labels(path: str | None) -> dict[str, dict[str, Any]]:
    if not path:
        return {}
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("labels must be a JSON object keyed by image path or filename")
    return payload


def _evaluate_labels(
    image_results: list[dict[str, Any]],
    labels: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    matched = []
    for item in image_results:
        source = item["image"]
        expected = labels.get(source) or labels.get(Path(source).name)
        if not isinstance(expected, dict):
            continue
        predicted = item["metrics"].get("modal_score_tuple") or {}
        if any(expected.get(key) not in ORDINAL_SCORE_MAP for key in SIGNAL_KEYS):
            raise ValueError(f"invalid signal labels for {source}")
        matched.append((item, expected, predicted))

    if not matched:
        return {
            "ground_truth_accuracy_evaluated": False,
            "labeled_image_count": 0,
            "note": "No labels matched the evaluated image paths or filenames.",
        }

    signals = {}
    for key in SIGNAL_KEYS:
        errors = [
            abs(ORDINAL_SCORE_MAP[predicted[key]] - ORDINAL_SCORE_MAP[expected[key]])
            for _, expected, predicted in matched
        ]
        false_positive = sum(
            predicted[key] != "none" and expected[key] == "none"
            for _, expected, predicted in matched
        )
        false_negative = sum(
            predicted[key] == "none" and expected[key] != "none"
            for _, expected, predicted in matched
        )
        signals[key] = {
            "mae": round(statistics.fmean(errors), 4),
            "within_one_rate": round(sum(error <= 1 for error in errors) / len(errors), 4),
            "exact_rate": round(sum(error == 0 for error in errors) / len(errors), 4),
            "presence_false_positive_count": false_positive,
            "presence_false_negative_count": false_negative,
        }

    correctness = []
    for item, expected, predicted in matched:
        correctness.append(float(all(predicted[key] == expected[key] for key in SIGNAL_KEYS)))
    return {
        "ground_truth_accuracy_evaluated": True,
        "labeled_image_count": len(matched),
        "signals": signals,
        "all_signals_exact_rate": round(statistics.fmean(correctness), 4),
    }


def _compare_baseline_report(
    image_results: list[dict[str, Any]],
    baseline_path: str,
    *,
    max_score_delta: int,
) -> dict[str, Any]:
    baseline = json.loads(Path(baseline_path).read_text(encoding="utf-8"))
    baseline_by_hash = {
        item.get("image_sha256"): item
        for item in baseline.get("images", [])
        if item.get("image_sha256")
    }
    comparisons = []
    for current in image_results:
        previous = baseline_by_hash.get(current.get("image_sha256"))
        if not previous:
            continue
        current_scores = current["metrics"].get("modal_score_tuple") or {}
        previous_scores = previous.get("metrics", {}).get("modal_score_tuple") or {}
        deltas = {
            key: abs(
                ORDINAL_SCORE_MAP[current_scores[key]]
                - ORDINAL_SCORE_MAP[previous_scores[key]]
            )
            for key in SIGNAL_KEYS
            if key in current_scores and key in previous_scores
        }
        comparisons.append(
            {
                "image_sha256": current["image_sha256"],
                "score_deltas": deltas,
            }
        )

    protocol = baseline.get("protocol") or {}
    failures = []
    if protocol.get("prompt_sha256") != get_medgemma_prompt_sha256():
        failures.append("baseline prompt hash differs")
    if not comparisons:
        failures.append("no baseline images matched by SHA-256")
    if any(
        delta > max_score_delta
        for comparison in comparisons
        for delta in comparison["score_deltas"].values()
    ):
        failures.append(f"cross-run score delta exceeds {max_score_delta}")
    return {
        "baseline_report": str(Path(baseline_path).resolve()),
        "baseline_model_revision": protocol.get("model_revision"),
        "matched_image_count": len(comparisons),
        "max_score_delta": max_score_delta,
        "comparisons": comparisons,
        "passed": not failures,
        "failure_reasons": failures,
    }


def _score_tuple(result: dict[str, Any]) -> tuple[str, str, str]:
    return tuple(str(result[key]) for key in SIGNAL_KEYS)


def _build_quality_challenges(image: Image.Image) -> dict[str, Image.Image]:
    width, height = image.size
    occluded = image.copy()
    draw = ImageDraw.Draw(occluded)
    draw.rectangle(
        (width * 0.15, height * 0.2, width * 0.85, height * 0.8),
        fill=(0, 0, 0),
    )
    return {
        "underexposed": ImageEnhance.Brightness(image).enhance(0.03),
        "overexposed": ImageEnhance.Brightness(image).enhance(4.0),
        "blurred": image.filter(ImageFilter.GaussianBlur(radius=max(8, min(image.size) // 25))),
        "occluded": occluded,
    }


def _evaluate_preflight_quality(image: Image.Image) -> dict[str, Any]:
    try:
        from app.services.image_quality_service import validate_skin_photo

        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=85)
        result = validate_skin_photo(buffer.getvalue()).model_dump()
        if result.get("status") not in {"pass", "fail", "unknown"}:
            if result.get("is_valid") is False:
                result["status"] = "fail"
            elif result.get("warning"):
                result["status"] = "unknown"
            else:
                result["status"] = "pass"
        result.setdefault("reason_code", None)
        return result
    except Exception as exc:
        return {
            "is_valid": True,
            "status": "unknown",
            "reason_code": "preflight_unavailable",
            "warning": str(exc),
        }


def _build_cross_image_diagnostics(
    image_results: list[dict[str, Any]],
    *,
    max_tokens: int,
) -> dict[str, Any]:
    modal_results = [item["metrics"].get("modal_score_tuple") or {} for item in image_results]
    coverage = {
        key: {
            "levels": sorted({item.get(key, "none") for item in modal_results}),
            "non_none_images": sum(item.get(key) != "none" for item in modal_results),
        }
        for key in SIGNAL_KEYS
    }
    runs = [run for item in image_results for run in item["runs"]]
    return {
        "ground_truth_accuracy_evaluated": False,
        "note": "Consistency and pixel references are not clinical ground truth.",
        "raw_json_only_rate": round(
            sum(bool(run.get("raw_json_only")) for run in runs) / len(runs), 4
        ) if runs else 0.0,
        "signal_coverage": coverage,
        "token_limit_hit_count": sum(
            run.get("generated_token_count", 0) >= max_tokens for run in runs
        ),
    }


def _build_pixel_model_validation(
    image_results: list[dict[str, Any]],
    gpt_results: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    references = {
        "active_lesion": "active_lesion_clahe_local_contrast_mean",
        "redness": "redness_colour_science_lab_a_mean",
        "barrier": "barrier_lbp_entropy",
    }

    def correlation(pairs: list[tuple[float, float]]) -> float | None:
        if len(pairs) < 3:
            return None
        left, right = zip(*pairs)
        left_mean, right_mean = statistics.fmean(left), statistics.fmean(right)
        numerator = sum((x - left_mean) * (y - right_mean) for x, y in pairs)
        denominator = (
            sum((x - left_mean) ** 2 for x in left)
            * sum((y - right_mean) ** 2 for y in right)
        ) ** 0.5
        return round(numerator / denominator, 4) if denominator else None

    models = {}
    for model_name in ("medgemma", "gpt"):
        if model_name == "gpt" and not gpt_results:
            continue
        model_metrics = {}
        for signal, reference_key in references.items():
            pairs = []
            for item in image_results:
                if model_name == "medgemma":
                    level = (item["metrics"].get("modal_score_tuple") or {}).get(signal)
                else:
                    source = item["image"]
                    level = (gpt_results.get(source) or gpt_results.get(Path(source).name) or {}).get(signal)
                reference = item["pixel_reference"].get(reference_key)
                if level in ORDINAL_SCORE_MAP and isinstance(reference, (int, float)):
                    pairs.append((float(ORDINAL_SCORE_MAP[level]), float(reference)))
            model_metrics[signal] = {
                "pixel_reference": reference_key,
                "sample_count": len(pairs),
                "pearson_correlation": correlation(pairs),
            }
        models[model_name] = model_metrics
    return {"gpt_results_loaded": bool(gpt_results), "model_pixel_correlations": models}


def _build_consistency_metrics(
    runs: list[dict[str, Any]],
    *,
    min_exact_match_rate: float,
    min_raw_json_only_rate: float,
    **_: Any,
) -> dict[str, Any]:
    successful = [run for run in runs if run.get("success")]
    run_count = len(runs)
    tuples = Counter(_score_tuple(run["result"]) for run in successful)
    modal, modal_count = tuples.most_common(1)[0] if tuples else (("none",) * 3, 0)
    exact_rate = modal_count / len(successful) if successful else 0.0
    raw_rate = sum(bool(run.get("raw_json_only")) for run in runs) / run_count if run_count else 0.0
    failures = []
    if len(successful) != run_count:
        failures.append("JSON/schema success rate is below 100%")
    if exact_rate < min_exact_match_rate:
        failures.append(f"exact ordinal tuple match rate is below {min_exact_match_rate:.2f}")
    format_failures = [] if raw_rate >= min_raw_json_only_rate else ["raw JSON-only rate is too low"]
    return {
        "run_count": run_count,
        "successful_run_count": len(successful),
        "json_and_schema_success_rate": len(successful) / run_count if run_count else 0.0,
        "raw_json_only_rate": round(raw_rate, 4),
        "modal_score_tuple": dict(zip(SIGNAL_KEYS, modal)),
        "exact_score_match_rate": round(exact_rate, 4),
        "measurement_consistency_passed": not failures,
        "format_compliance_passed": not format_failures,
        "measurement_failure_reasons": failures,
        "format_failure_reasons": format_failures,
        "passed": not failures,
        "failure_reasons": failures,
    }


class PromptConsistencyTester:
    def __init__(self, *, seed: int) -> None:
        if not HF_TOKEN:
            raise RuntimeError("HF_TOKEN is not set")

        import torch
        import transformers
        from transformers import AutoModelForImageTextToText, AutoProcessor

        self.torch = torch
        self.seed = seed
        self.dtype = _resolve_dtype(torch)
        _set_deterministic_mode(torch, seed)

        started_at = time.time()
        self.processor = AutoProcessor.from_pretrained(
            MODEL_NAME,
            token=HF_TOKEN,
            revision=MODEL_REVISION,
            use_fast=USE_FAST_PROCESSOR,
        )
        self.model = AutoModelForImageTextToText.from_pretrained(
            MODEL_NAME,
            token=HF_TOKEN,
            revision=MODEL_REVISION,
            torch_dtype=self.dtype,
            device_map="auto",
        )
        self.model.eval()
        self.model_load_ms = int((time.time() - started_at) * 1000)
        self.runtime = {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "torch": torch.__version__,
            "transformers": transformers.__version__,
            "pillow": getattr(sys.modules.get("PIL"), "__version__", None),
            "cuda": torch.version.cuda,
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        }
        self.model_revision = MODEL_REVISION or getattr(self.model.config, "_commit_hash", None)

        self.pad_token_id = getattr(self.processor.tokenizer, "pad_token_id", None)
        self.eos_token_id = self._resolve_eos_token_ids()
        if self.pad_token_id is None:
            self.pad_token_id = (
                self.eos_token_id[0] if isinstance(self.eos_token_id, list) else self.eos_token_id
            )

    def _resolve_eos_token_ids(self):
        token_ids = []
        for value in (
            getattr(self.processor.tokenizer, "eos_token_id", None),
            getattr(self.model.generation_config, "eos_token_id", None),
        ):
            values = value if isinstance(value, (list, tuple)) else [value]
            token_ids.extend(item for item in values if isinstance(item, int) and item >= 0)
        end_of_turn_id = self.processor.tokenizer.convert_tokens_to_ids("<end_of_turn>")
        unknown_id = getattr(self.processor.tokenizer, "unk_token_id", None)
        if (
            isinstance(end_of_turn_id, int)
            and end_of_turn_id >= 0
            and end_of_turn_id != unknown_id
        ):
            token_ids.append(end_of_turn_id)
        unique = list(dict.fromkeys(token_ids))
        return unique or None

    def analyze(self, image: Image.Image, *, max_tokens: int) -> dict[str, Any]:
        _set_deterministic_mode(self.torch, self.seed)
        messages = [
            {
                "role": "system",
                "content": [{"type": "text", "text": "Return compact visual measurements only."}],
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": SYSTEM_PROMPT},
                    {"type": "image", "image": image.copy()},
                ],
            },
            {
                "role": "assistant",
                "content": [{"type": "text", "text": MEDGEMMA_ASSISTANT_PREFILL}],
            },
        ]
        inputs = self.processor.apply_chat_template(
            messages,
            add_generation_prompt=False,
            continue_final_message=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        )
        inputs = inputs.to(self.model.device, dtype=self.dtype)
        input_len = inputs["input_ids"].shape[-1]
        generate_kwargs = {
            "max_new_tokens": max_tokens,
            "do_sample": False,
            "return_dict_in_generate": True,
        }
        if self.eos_token_id is not None:
            generate_kwargs["eos_token_id"] = self.eos_token_id
        if self.pad_token_id is not None:
            generate_kwargs["pad_token_id"] = self.pad_token_id

        started_at = time.time()
        with self.torch.inference_mode():
            output = self.model.generate(**inputs, **generate_kwargs)
        inference_ms = int((time.time() - started_at) * 1000)
        generation = output.sequences[0][input_len:]
        decoded = MEDGEMMA_ASSISTANT_PREFILL + self.processor.decode(
            generation,
            skip_special_tokens=True,
        )
        parsed, raw_json_only = _parse_json(decoded)
        validation_errors = (
            _validate_result(parsed)
            if parsed
            else ["no valid JSON object parsed"]
        )
        return {
            "success": not validation_errors,
            "result": parsed,
            "validation_errors": validation_errors,
            "raw_json_only": raw_json_only,
            "raw_output": decoded,
            "inference_ms": inference_ms,
            "generated_token_count": int(generation.shape[-1]),
        }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Test MedGemma ordinal skin-signal output and pixel-reference consistency"
    )
    parser.add_argument("--input", required=True, help="Image file, URL, or directory")
    parser.add_argument("--output", default="medgemma_consistency_results.json")
    parser.add_argument("--runs", type=int, default=20, help="Measured runs per image")
    parser.add_argument("--warmup-runs", type=int, default=1)
    parser.add_argument("--max-image-side", type=int, default=768)
    parser.add_argument("--max-tokens", type=int, default=160)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument(
        "--face-landmarker-model",
        default=os.getenv("MEDIAPIPE_FACE_LANDMARKER_MODEL", ""),
        help="MediaPipe FaceLandmarker .task model (or MEDIAPIPE_FACE_LANDMARKER_MODEL)",
    )
    parser.add_argument(
        "--labels",
        help="Optional JSON object keyed by image path or filename with expert signal labels",
    )
    parser.add_argument(
        "--gpt-results",
        help="Optional GPT signal-score JSON keyed by image path or filename",
    )
    parser.add_argument(
        "--baseline-report",
        help="Optional prior result JSON for cross-process or cross-hardware consistency comparison",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-ordinal-delta", type=int, default=1)
    parser.add_argument("--min-exact-match-rate", type=float, default=0.95)
    parser.add_argument("--min-raw-json-only-rate", type=float, default=1.0)
    parser.add_argument(
        "--skip-quality-challenges",
        action="store_true",
        help="Skip synthetic underexposure, overexposure, blur, and occlusion checks",
    )
    parser.add_argument("--quality-challenge-runs", type=int, default=3)
    parser.add_argument(
        "--quality-challenge-images",
        type=int,
        default=3,
        help="Number of source images used for each synthetic quality challenge",
    )
    args = parser.parse_args()

    if args.runs < 2:
        parser.error("--runs must be at least 2")
    if args.warmup_runs < 0:
        parser.error("--warmup-runs must be 0 or greater")
    if not 0.0 <= args.min_exact_match_rate <= 1.0:
        parser.error("--min-exact-match-rate must be between 0 and 1")
    if not 0.0 <= args.min_raw_json_only_rate <= 1.0:
        parser.error("--min-raw-json-only-rate must be between 0 and 1")
    if not 0 <= args.max_ordinal_delta <= 3:
        parser.error("--max-ordinal-delta must be between 0 and 3")
    if args.quality_challenge_runs < 1:
        parser.error("--quality-challenge-runs must be at least 1")
    if args.quality_challenge_images < 1:
        parser.error("--quality-challenge-images must be at least 1")
    if not args.face_landmarker_model:
        parser.error(
            "--face-landmarker-model or MEDIAPIPE_FACE_LANDMARKER_MODEL is required"
        )

    images = _iter_images(args.input)
    labels = _load_labels(args.labels)
    gpt_results = _load_labels(args.gpt_results)
    if args.limit > 0:
        images = images[: args.limit]
    if not images:
        raise RuntimeError("No images found")

    pixel_analyzer = PixelSignalAnalyzer(args.face_landmarker_model)
    tester = PromptConsistencyTester(seed=args.seed)
    image_results = []
    previous_processed_image = None
    previous_image_source = None
    for image_index, image_source in enumerate(images, start=1):
        print(f"[{image_index}/{len(images)}] {image_source}", flush=True)
        image, byte_size, image_sha256 = _load_image(image_source)
        original_size = [image.width, image.height]
        if args.max_image_side and max(image.size) > args.max_image_side:
            image.thumbnail(
                (args.max_image_side, args.max_image_side),
                Image.Resampling.LANCZOS,
            )

        processed_image, pixel_reference, _ = pixel_analyzer.process(image)
        pixel_reference["previous_image"] = previous_image_source
        pixel_reference["ssim_to_previous"] = (
            round(pixel_analyzer.ssim(previous_processed_image, processed_image), 4)
            if previous_processed_image is not None
            else None
        )

        for _ in range(args.warmup_runs):
            tester.analyze(processed_image, max_tokens=args.max_tokens)

        runs = []
        for run_index in range(1, args.runs + 1):
            row = tester.analyze(processed_image, max_tokens=args.max_tokens)
            row["run"] = run_index
            runs.append(row)
            print(
                f"  run {run_index}/{args.runs}: "
                f"{'ok' if row['success'] else 'failed'} ({row['inference_ms']} ms)",
                flush=True,
            )

        metrics = _build_consistency_metrics(
            runs,
            min_exact_match_rate=args.min_exact_match_rate,
            min_raw_json_only_rate=args.min_raw_json_only_rate,
        )
        image_results.append(
            {
                "image": image_source,
                "image_sha256": image_sha256,
                "input_byte_size": byte_size,
                "original_size": original_size,
                "processed_size": [processed_image.width, processed_image.height],
                "pixel_reference": pixel_reference,
                "metrics": metrics,
                "runs": runs,
            }
        )
        previous_processed_image = processed_image
        previous_image_source = image_source

    quality_challenges = []
    if not args.skip_quality_challenges:
        challenge_specs = {
            "underexposed": {"brightness_factor": 0.03},
            "overexposed": {"brightness_factor": 4.0},
            "blurred": {"gaussian_radius": "max(8, min_side // 25)"},
            "occluded": {"rectangle": [0.15, 0.2, 0.85, 0.8], "fill": [0, 0, 0]},
        }
        challenge_sources = images[: min(args.quality_challenge_images, len(images))]
        for source in challenge_sources:
            challenge_source, _, source_sha256 = _load_image(source)
            if args.max_image_side and max(challenge_source.size) > args.max_image_side:
                challenge_source.thumbnail(
                    (args.max_image_side, args.max_image_side),
                    Image.Resampling.LANCZOS,
                )
            for name, challenge_image in _build_quality_challenges(challenge_source).items():
                preflight = _evaluate_preflight_quality(challenge_image)
                preflight_status = preflight.get("status", "unknown")
                quality_detection_passed = (
                    preflight_status == "fail" or preflight.get("is_valid") is False
                )
                quality_challenges.append(
                    {
                        "challenge": name,
                        "source_image": source,
                        "source_image_sha256": source_sha256,
                        "transformation": challenge_specs[name],
                        "preflight": preflight,
                        "quality_detection_passed": quality_detection_passed,
                        "passed": quality_detection_passed,
                    }
                )

    passed_count = sum(1 for item in image_results if item["metrics"]["passed"])
    consistency_passed = passed_count == len(image_results)
    format_compliant_count = sum(
        1 for item in image_results if item["metrics"]["format_compliance_passed"]
    )
    format_compliance_passed = format_compliant_count == len(image_results)
    quality_challenges_passed = (
        all(item["quality_detection_passed"] for item in quality_challenges)
        if quality_challenges
        else None
    )
    diagnostics = _build_cross_image_diagnostics(image_results, max_tokens=args.max_tokens)
    diagnostics["pixel_model_validation"] = _build_pixel_model_validation(
        image_results, gpt_results
    )
    if labels:
        diagnostics["labeled_evaluation"] = _evaluate_labels(image_results, labels)
        diagnostics["ground_truth_accuracy_evaluated"] = diagnostics["labeled_evaluation"][
            "ground_truth_accuracy_evaluated"
        ]
    baseline_comparison = (
        _compare_baseline_report(
            image_results,
            args.baseline_report,
            max_score_delta=args.max_ordinal_delta,
        )
        if args.baseline_report
        else None
    )
    overall_passed = (
        consistency_passed
        and quality_challenges_passed is not False
        and (baseline_comparison is None or baseline_comparison["passed"])
    )
    latencies = sorted(
        int(run["inference_ms"])
        for item in image_results
        for run in item["runs"]
        if isinstance(run.get("inference_ms"), (int, float))
    )

    def percentile(values: list[int], fraction: float) -> int | None:
        if not values:
            return None
        index = max(0, min(len(values) - 1, int((len(values) - 1) * fraction)))
        return values[index]

    report = {
        "protocol": {
            "model": MODEL_NAME,
            "model_revision": tester.model_revision,
            "prompt_version": SKIN_SIGNAL_PROMPT_VERSION,
            "prompt_sha256": get_medgemma_prompt_sha256(),
            "prompt": SYSTEM_PROMPT,
            "assistant_prefill": MEDGEMMA_ASSISTANT_PREFILL,
            "dtype": str(tester.dtype),
            "seed": args.seed,
            "do_sample": False,
            "runs_per_image": args.runs,
            "warmup_runs": args.warmup_runs,
            "max_image_side": args.max_image_side,
            "max_tokens": args.max_tokens,
            "repeat_scope": "single_process_single_model_load",
            "image_preprocessing": {
                "face_landmarker_model": pixel_analyzer.model_path,
                "skin_mask": "face oval excluding eyes, eyebrows, and lips",
                "colour_temperature_normalization": "colour-science CCT estimate plus skin gray-world balance",
                "contrast_enhancement": "OpenCV CLAHE on LAB lightness",
                "ssim_order": "lexicographically sorted input paths",
            },
            "runtime": tester.runtime,
            "acceptance": {
                "json_and_schema_success_rate": 1.0,
                "min_raw_json_only_rate": args.min_raw_json_only_rate,
                "min_exact_score_match_rate": args.min_exact_match_rate,
                "max_ordinal_delta": args.max_ordinal_delta,
                "quality_gate_owner": "gateway_preflight",
                "quality_challenge_images": len(challenge_sources) if quality_challenges else 0,
            },
            "model_load_ms": tester.model_load_ms,
        },
        "summary": {
            "total_images": len(image_results),
            "passed_images": passed_count,
            "failed_images": len(image_results) - passed_count,
            "consistency_passed": consistency_passed,
            "format_compliant_images": format_compliant_count,
            "format_noncompliant_images": len(image_results) - format_compliant_count,
            "format_compliance_passed": format_compliance_passed,
            "quality_challenges_passed": quality_challenges_passed,
            "passed": overall_passed,
        },
        "performance": {
            "measured_run_count": len(latencies),
            "mean_inference_ms": round(statistics.fmean(latencies), 1) if latencies else None,
            "p50_inference_ms": percentile(latencies, 0.50),
            "p95_inference_ms": percentile(latencies, 0.95),
            "max_inference_ms": max(latencies) if latencies else None,
        },
        "measurement_validity_diagnostics": diagnostics,
        "cross_run_comparison": baseline_comparison,
        "quality_challenges": quality_challenges,
        "images": image_results,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    pixel_analyzer.close()
    print(json.dumps(report["summary"], ensure_ascii=False), flush=True)
    print(f"Saved: {output_path}", flush=True)
    return 0 if report["summary"]["passed"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"ERROR: {exc.__class__.__name__}: {exc}", file=sys.stderr)
        sys.exit(2)
