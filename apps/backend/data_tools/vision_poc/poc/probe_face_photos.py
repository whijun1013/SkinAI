import argparse
import base64
import glob
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


ENDPOINT_URL = os.getenv("MEDGEMMA_ENDPOINT_URL", "")
ENDPOINT_API_KEY = os.getenv("MEDGEMMA_ENDPOINT_API_KEY", "")
MODEL_NAME = os.getenv("MEDGEMMA_MODEL_NAME", "google/medgemma-4b-it")
DEFAULT_BLOB_CONTAINER = os.getenv("MEDGEMMA_OUTPUT_CONTAINER", "medgemma-probe-outputs")
PROMPT_VERSION = "medgemma_face_observation_prompt_v2"

SCORE_RUBRIC = """
Score rubric:
- 0: not visible
- 1-20: very mild; isolated or barely visible
- 21-40: mild; visible in a small local area
- 41-60: moderate; visible in one or two regions
- 61-80: prominent; clearly visible across multiple regions
- 81-100: very prominent; widespread or visually dominant

Feature-specific scoring guidance:
- Do not default to boundary values such as 21, 41, 61, or 81. Use the full 0-100 range when visual severity differs.
- Avoid repeated template scores across different images. Scores must reflect the visible image content.
- Use raw_score for relative visual prominence, not medical severity.
- If unsure, lower confidence rather than increasing severity.
- Do not use placeholder evidence such as "short visual observation", "Short visual observation", "visible finding", or "mild changes".
- Evidence must mention a concrete visible cue and region, for example "small red papules on the chin" or "diffuse pink tone on both cheeks".
- If no concrete visual cue is visible, set raw_score to 0, level to "none", regions to [], and evidence to "not visible".
- redness: estimate visible redness only. Do not count normal skin tone, lighting warmth, or blush-like color as severe redness.
- acne_like_spots: estimate visible acne-like spots or bumps only. Do not inflate this score for mild texture, pores, or color variation.
- texture_irregularity: estimate visible uneven surface/texture only. Do not inflate this score only because acne-like spots are present.

Quality and recommendation guidance:
- If lighting_quality is poor, shadowed, or overexposed, recommendation_for_pipeline must be "review" or "reject".
- If lighting is acceptable but color is unreliable because of overexposure, strong warmth, shadows, or uneven illumination, recommendation_for_pipeline should be "review".
- If the image is blurry, angled, strongly occluded, or not front-facing, recommendation_for_pipeline must be "review" or "reject".
- Use "use" only when the image is suitable for a non-diagnostic observation pipeline.
- Use "review" when visual observations are possible but severity or color estimates may be unreliable.
- Use "reject" when the face or skin regions cannot be reliably observed.
"""

PROMPT = """You are analyzing a user-submitted front-facing facial photo for non-diagnostic skin observation.

Rules:
- This is NOT a medical diagnosis.
- Do not identify diseases.
- Do not recommend treatment.
- Report only visible, non-diagnostic image observations.
- If lighting, angle, makeup, blur, or occlusion makes observation unreliable, say so clearly.
- Return JSON only. Do not wrap it in markdown.

JSON schema:
{
  "prompt_version": "medgemma_face_observation_prompt_v2",
  "is_face_photo": true,
  "usable_for_skin_observation": true,
  "capture_quality": {
    "lighting_quality": "good | acceptable | poor | shadowed | overexposed",
    "sharpness_quality": "good | acceptable | blurry | unknown",
    "face_angle_quality": "front_facing | slightly_angled | angled | unknown",
    "occlusion_flags": [],
    "quality_limitation_notes": "string"
  },
  "visible_skin_regions": ["forehead", "left_cheek", "right_cheek", "chin"],
  "observed_skin_signals": {
    "redness": {
      "raw_score": 0,
      "level": "none | very_mild | mild | moderate | high | very_high",
      "regions": ["left_cheek", "right_cheek"],
      "evidence": "concrete visible cue and region, or 'not visible'",
      "uncertainty": "low | medium | high"
    },
    "acne_like_spots": {
      "raw_score": 0,
      "level": "none | very_mild | mild | moderate | high | very_high",
      "regions": ["chin"],
      "evidence": "concrete visible cue and region, or 'not visible'",
      "uncertainty": "low | medium | high"
    },
    "texture_irregularity": {
      "raw_score": 0,
      "level": "none | very_mild | mild | moderate | high | very_high",
      "regions": ["forehead"],
      "evidence": "concrete visible cue and region, or 'not visible'",
      "uncertainty": "low | medium | high"
    }
  },
  "gpt4o_handoff": {
    "usable_summary": "one to two sentence summary for GPT-4o",
    "do_not_overstate": ["diagnosis", "treatment", "causality"],
    "recommended_report_tone": "non-diagnostic, cautious, observational",
    "confidence": "low | medium | high"
  },
  "recommendation_for_pipeline": "use | review | reject"
}

Allowed values:
- scores: integer 0 to 100
- lighting_quality: good, acceptable, poor, shadowed, overexposed
- sharpness_quality: good, acceptable, blurry, unknown
- face_angle_quality: front_facing, slightly_angled, angled, unknown
- recommendation_for_pipeline: use, review, reject
""" + SCORE_RUBRIC

REQUIRED_KEYS = {
    "is_face_photo",
    "usable_for_skin_observation",
    "visible_skin_regions",
    "recommendation_for_pipeline",
}

CALIBRATION_VERSION = "medgemma_face_probe_calibration_v1"
CALIBRATION_FACTORS = {
    "redness_score": 0.85,
    "acne_like_spot_score": 0.70,
    "texture_irregularity_score": 0.80,
}
FEATURE_LABELS = {
    "redness_score": "redness",
    "acne_like_spot_score": "acne_like_spots",
    "texture_irregularity_score": "texture_irregularity",
}
LOW_QUALITY_LIGHTING = {"poor", "shadowed", "overexposed", "unknown"}
ALLOWED_LIGHTING = {"good", "acceptable", "poor", "shadowed", "overexposed", "unknown"}
ALLOWED_SHARPNESS = {"good", "acceptable", "blurry", "unknown"}
ALLOWED_FACE_ANGLE = {"front_facing", "slightly_angled", "angled", "unknown"}
ALLOWED_RECOMMENDATIONS = {"use", "review", "reject"}
EXPECTED_SIGNALS = ("redness", "acne_like_spots", "texture_irregularity")


def extract_json(text: str) -> dict[str, Any]:
    match = re.search(r"```(?:json)?(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if match:
        text = match.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    return {}


def _clamp_int(value: Any, minimum: int = 0, maximum: int = 100) -> int:
    try:
        parsed = int(round(float(value)))
    except (TypeError, ValueError):
        return minimum
    return max(minimum, min(maximum, parsed))


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "y"}
    return bool(value)


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def normalize_capture_quality(raw_quality: Any, raw: dict[str, Any] | None = None) -> dict[str, Any]:
    raw = raw or {}
    quality = raw_quality if isinstance(raw_quality, dict) else {}

    lighting = str(quality.get("lighting_quality") or raw.get("lighting_quality") or "unknown")
    sharpness = str(quality.get("sharpness_quality") or "unknown")
    angle = str(quality.get("face_angle_quality") or "unknown")

    if lighting not in ALLOWED_LIGHTING:
        lighting = "unknown"
    if sharpness not in ALLOWED_SHARPNESS:
        sharpness = "unknown"
    if angle not in ALLOWED_FACE_ANGLE:
        angle = "unknown"

    return {
        "lighting_quality": lighting,
        "sharpness_quality": sharpness,
        "face_angle_quality": angle,
        "occlusion_flags": _as_list(quality.get("occlusion_flags", raw.get("occlusion_flags"))),
        "quality_limitation_notes": str(
            quality.get("quality_limitation_notes") or raw.get("uncertainty_notes") or ""
        ),
    }


def score_to_level(score: int) -> str:
    if score <= 0:
        return "none"
    if score <= 20:
        return "very_mild"
    if score <= 40:
        return "mild"
    if score <= 60:
        return "moderate"
    if score <= 80:
        return "high"
    return "very_high"


def calibrate_score(raw_score: int, factor: float) -> int:
    if raw_score <= 0:
        return 0
    return _clamp_int(raw_score * factor)


def infer_confidence(result: dict[str, Any]) -> str:
    if not result.get("is_face_photo") or not result.get("usable_for_skin_observation"):
        return "low"

    quality = result.get("capture_quality", {})
    lighting = quality.get("lighting_quality") or result.get("lighting_quality")
    sharpness = quality.get("sharpness_quality")
    angle = quality.get("face_angle_quality")
    occlusions = quality.get("occlusion_flags") or result.get("occlusion_flags") or []
    uncertainty = str(quality.get("quality_limitation_notes") or result.get("uncertainty_notes") or "").lower()

    recommendation = result.get("recommendation_for_pipeline")

    if recommendation == "reject":
        return "low"
        
    if lighting in LOW_QUALITY_LIGHTING or sharpness == "blurry" or angle == "angled" or len(occlusions) > 1:
        return "low"
        
    if (
        recommendation == "review"
        or occlusions
        or sharpness == "unknown"
        or angle in {"unknown", "slightly_angled"}
        or lighting == "acceptable"
    ):
        return "medium"
        
    if "blurry" in uncertainty or "angle" in uncertainty or "hard to see" in uncertainty:
        return "medium"
        
    return "high"


def apply_score_calibration(result: dict[str, Any]) -> dict[str, Any]:
    if not result:
        return result

    calibrated_observations: dict[str, Any] = {}
    calibrated_scores: list[int] = []

    # Map nested observed_skin_signals to the flat mapping if available
    signals = result.get("observed_skin_signals", {})
    
    # Handle backward compatibility: map flat keys to signals format if signals are absent
    if not signals and any(k in result for k in ["redness_score", "acne_like_spot_score", "texture_irregularity_score"]):
        signals = {
            "redness": {"raw_score": result.get("redness_score", 0)},
            "acne_like_spots": {"raw_score": result.get("acne_like_spot_score", 0)},
            "texture_irregularity": {"raw_score": result.get("texture_irregularity_score", 0)}
        }

    for score_key, factor in CALIBRATION_FACTORS.items():
        signal_key = FEATURE_LABELS[score_key]
        signal_data = signals.get(signal_key, {})
        
        raw_score = _clamp_int(signal_data.get("raw_score", 0))
        calibrated_score = calibrate_score(raw_score, factor)
        calibrated_scores.append(calibrated_score)
        
        calibrated_observations[signal_key] = {
            "raw_score": raw_score,
            "calibrated_score": calibrated_score,
            "raw_level": score_to_level(raw_score),
            "calibrated_level": score_to_level(calibrated_score),
            "regions": _as_list(signal_data.get("regions")),
            "evidence": str(signal_data.get("evidence", "")),
            "uncertainty": str(signal_data.get("uncertainty", "medium")),
        }

    overall_score = (
        _clamp_int(sum(calibrated_scores) / len(calibrated_scores))
        if calibrated_scores
        else 0
    )

    quality = result.get("capture_quality", {})
    lighting = quality.get("lighting_quality") or result.get("lighting_quality")

    if lighting in LOW_QUALITY_LIGHTING and result.get("recommendation_for_pipeline") == "use":
        result["recommendation_for_pipeline"] = "review"

    result["calibrated_observations"] = calibrated_observations
    result["overall_calibrated_severity_score"] = overall_score
    result["overall_calibrated_severity_level"] = score_to_level(overall_score)
    result["confidence"] = infer_confidence(result)
    result["calibration_version"] = CALIBRATION_VERSION
    return result


def normalize_probe_result(raw: dict[str, Any]) -> dict[str, Any]:
    if not raw:
        return {}

    # Support nested structure and backward compatibility
    normalized = {
        "prompt_version": str(raw.get("prompt_version") or PROMPT_VERSION),
        "is_face_photo": _as_bool(raw.get("is_face_photo")),
        "usable_for_skin_observation": _as_bool(raw.get("usable_for_skin_observation")),
        "visible_skin_regions": _as_list(raw.get("visible_skin_regions")),
        "recommendation_for_pipeline": str(raw.get("recommendation_for_pipeline") or "review"),
    }
    
    normalized["capture_quality"] = normalize_capture_quality(raw.get("capture_quality"), raw)

    if "observed_skin_signals" in raw:
        normalized["observed_skin_signals"] = raw["observed_skin_signals"]
    else:
        normalized["redness_score"] = _clamp_int(raw.get("redness_score"))
        normalized["acne_like_spot_score"] = _clamp_int(raw.get("acne_like_spot_score"))
        normalized["texture_irregularity_score"] = _clamp_int(raw.get("texture_irregularity_score"))

    if "gpt4o_handoff" in raw:
        normalized["gpt4o_handoff"] = raw["gpt4o_handoff"]

    if normalized["recommendation_for_pipeline"] not in ALLOWED_RECOMMENDATIONS:
        normalized["recommendation_for_pipeline"] = "review"

    return apply_score_calibration(normalized)


def build_gpt4o_handoff_payload(result: dict[str, Any]) -> dict[str, Any]:
    handoff = result.get("gpt4o_handoff", {})
    observations = {}
    for feature, data in result.get("calibrated_observations", {}).items():
        observations[feature] = {
            "level": data.get("calibrated_level", "none"),
            "regions": data.get("regions", []),
            "evidence": data.get("evidence", ""),
            "uncertainty": data.get("uncertainty", "medium"),
        }

    return {
        "source": "medgemma",
        "model": MODEL_NAME,
        "prompt_version": result.get("prompt_version", PROMPT_VERSION),
        "calibration_version": CALIBRATION_VERSION,
        "usable": result.get("usable_for_skin_observation", False),
        "recommendation": result.get("recommendation_for_pipeline", "reject"),
        "confidence": result.get("confidence", "low"),
        "capture_quality": result.get("capture_quality", {}),
        "observations": observations,
        "summary_for_report_model": handoff.get("usable_summary", "No summary provided. Treat visual findings with caution."),
        "guardrails": [
            "Do not treat this as diagnosis.",
            "Do not infer causality from image alone.",
            "Use lifestyle logs before making causal hypotheses."
        ]
    }


def validate_probe_result(result: dict[str, Any]) -> list[str]:
    missing = sorted(REQUIRED_KEYS - set(result.keys()))
    issues = [f"missing:{key}" for key in missing]
    if not result:
        return issues

    quality = result.get("capture_quality")
    if not isinstance(quality, dict):
        issues.append("missing:capture_quality")
        quality = {}

    for key in ("lighting_quality", "sharpness_quality", "face_angle_quality"):
        if quality.get(key) == "unknown":
            issues.append(f"unknown:{key}")

    if "occlusion_flags" not in quality:
        issues.append("missing:capture_quality.occlusion_flags")
    if "quality_limitation_notes" not in quality:
        issues.append("missing:capture_quality.quality_limitation_notes")

    signals = result.get("observed_skin_signals")
    if not isinstance(signals, dict):
        issues.append("missing:observed_skin_signals")
        signals = {}

    for signal in EXPECTED_SIGNALS:
        signal_data = signals.get(signal)
        if not isinstance(signal_data, dict):
            issues.append(f"missing:observed_skin_signals.{signal}")
            continue
        for field in ("raw_score", "level", "regions", "evidence", "uncertainty"):
            if field not in signal_data:
                issues.append(f"missing:observed_skin_signals.{signal}.{field}")

    handoff = result.get("gpt4o_handoff")
    if not isinstance(handoff, dict):
        issues.append("missing:gpt4o_handoff")
    elif not handoff.get("usable_summary"):
        issues.append("missing:gpt4o_handoff.usable_summary")

    return issues


def run_mock_inference(_: str) -> dict[str, Any]:
    return {
        "prompt_version": PROMPT_VERSION,
        "is_face_photo": True,
        "usable_for_skin_observation": True,
        "visible_skin_regions": ["forehead", "left_cheek", "right_cheek", "chin"],
        "capture_quality": {
            "lighting_quality": "acceptable",
            "sharpness_quality": "good",
            "face_angle_quality": "front_facing",
            "occlusion_flags": [],
            "quality_limitation_notes": "Mock mode only: this result does not measure model quality."
        },
        "observed_skin_signals": {
            "redness": {
                "raw_score": 45,
                "level": "moderate",
                "regions": ["left_cheek", "right_cheek"],
                "evidence": "visible pink/red hue on both cheeks",
                "uncertainty": "low"
            },
            "acne_like_spots": {
                "raw_score": 10,
                "level": "very_mild",
                "regions": ["chin"],
                "evidence": "1-2 small isolated spots",
                "uncertainty": "low"
            },
            "texture_irregularity": {
                "raw_score": 20,
                "level": "very_mild",
                "regions": ["forehead"],
                "evidence": "mild unevenness",
                "uncertainty": "low"
            }
        },
        "gpt4o_handoff": {
            "usable_summary": "Image shows moderate redness on cheeks and isolated acne-like spots on chin.",
            "do_not_overstate": ["diagnosis", "treatment", "causality"],
            "recommended_report_tone": "non-diagnostic, cautious, observational",
            "confidence": "high"
        },
        "recommendation_for_pipeline": "use",
    }


def run_endpoint_inference(image_path: str, is_url: bool = False) -> dict[str, Any]:
    if not ENDPOINT_URL:
        raise RuntimeError("MEDGEMMA_ENDPOINT_URL is not set.")
    if not ENDPOINT_API_KEY:
        raise RuntimeError("MEDGEMMA_ENDPOINT_API_KEY is not set.")

    import httpx

    if is_url:
        image_content = {"url": image_path}
    else:
        with open(image_path, "rb") as image_file:
            img_b64 = base64.b64encode(image_file.read()).decode("utf-8")
        image_content = {"url": f"data:image/jpeg;base64,{img_b64}"}

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {"type": "image_url", "image_url": image_content},
                ],
            }
        ],
        "temperature": 0.0,
        "max_tokens": 700,
    }
    headers = {"Authorization": f"Bearer {ENDPOINT_API_KEY}"}

    with httpx.Client(timeout=180.0) as client:
        response = client.post(ENDPOINT_URL, json=payload, headers=headers)
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]

    return normalize_probe_result(extract_json(content))


def _load_image_for_transformers(image_path: str, is_url: bool = False):
    from PIL import Image

    if is_url:
        import requests

        response = requests.get(image_path, headers={"User-Agent": "medgemma-probe"}, timeout=60)
        response.raise_for_status()
        from io import BytesIO

        return Image.open(BytesIO(response.content)).convert("RGB")

    return Image.open(image_path).convert("RGB")


def load_transformers_runtime() -> dict[str, Any]:
    hf_token = os.getenv("HF_TOKEN")
    if not hf_token:
        raise RuntimeError("HF_TOKEN is not set. Set it in the Azure ML compute environment.")

    import torch
    from transformers import AutoModelForImageTextToText, AutoProcessor

    dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32

    print(f"[*] Loading {MODEL_NAME} once for transformers inference")
    processor = AutoProcessor.from_pretrained(MODEL_NAME, token=hf_token)
    model = AutoModelForImageTextToText.from_pretrained(
        MODEL_NAME,
        token=hf_token,
        torch_dtype=dtype,
        device_map="auto",
    )
    model.eval()
    return {
        "processor": processor,
        "model": model,
        "dtype": dtype,
    }


def run_transformers_inference(
    image_path: str,
    is_url: bool = False,
    runtime: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if runtime is None:
        runtime = load_transformers_runtime()

    import torch

    image = _load_image_for_transformers(image_path, is_url=is_url)
    processor = runtime["processor"]
    model = runtime["model"]
    dtype = runtime["dtype"]

    messages = [
        {
            "role": "system",
            "content": [
                {
                    "type": "text",
                    "text": "You return structured, non-diagnostic image observations only.",
                }
            ],
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": PROMPT},
                {"type": "image", "image": image},
            ],
        },
    ]

    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    )
    inputs = inputs.to(model.device, dtype=dtype)
    input_len = inputs["input_ids"].shape[-1]

    with torch.inference_mode():
        generation = model.generate(**inputs, max_new_tokens=700, do_sample=False)
        generation = generation[0][input_len:]

    decoded = processor.decode(generation, skip_special_tokens=True)
    return normalize_probe_result(extract_json(decoded))


def collect_images(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.blob_url:
        return [{"path": args.blob_url, "is_url": True}]
    if args.local_file:
        local_path = Path(args.local_file)
        if not local_path.exists():
            raise FileNotFoundError(f"Local image does not exist: {local_path}")
        return [{"path": str(local_path), "is_url": False}]

    input_dir = Path(args.input_dir)
    input_dir.mkdir(parents=True, exist_ok=True)
    image_patterns = ["*.[jJ][pP][gG]", "*.[jJ][pP][eE][gG]", "*.[pP][nN][gG]", "*.[wW][eE][bB][pP]"]
    local_images: list[str] = []
    for pattern in image_patterns:
        local_images.extend(glob.glob(str(input_dir / pattern)))

    local_images = sorted(set(local_images))[: args.limit]
    return [{"path": image_path, "is_url": False} for image_path in local_images]


def upload_outputs_to_blob(output_dir: str, container_name: str) -> None:
    connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    if not connection_string:
        raise RuntimeError("AZURE_STORAGE_CONNECTION_STRING is not set.")

    from azure.storage.blob import BlobServiceClient

    service_client = BlobServiceClient.from_connection_string(connection_string)
    container_client = service_client.get_container_client(container_name)
    if not container_client.exists():
        raise RuntimeError(
            f"Blob container '{container_name}' does not exist. Create it in Azure Portal first."
        )

    run_prefix = f"runs/{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    for file_path in Path(output_dir).glob("*"):
        if not file_path.is_file():
            continue
        blob_name = f"{run_prefix}/{file_path.name}"
        with open(file_path, "rb") as file_data:
            container_client.upload_blob(name=blob_name, data=file_data, overwrite=True)
        print(f"[blob] uploaded {file_path.name} -> {container_name}/{blob_name}")


def generate_summary(results: list[dict[str, Any]], output_dir: str, mode: str) -> Path:
    success_count = sum(1 for result in results if result.get("parsed_json"))
    face_count = sum(1 for result in results if result.get("parsed_json", {}).get("is_face_photo"))
    usable_count = sum(
        1 for result in results if result.get("parsed_json", {}).get("usable_for_skin_observation")
    )
    summary_path = Path(output_dir) / "medgemma_probe_summary.md"

    with open(summary_path, "w", encoding="utf-8") as summary_file:
        summary_file.write("# MedGemma Face Photo Probe Summary\n\n")
        summary_file.write(f"- Mode: {mode}\n")
        summary_file.write(f"- Model: {MODEL_NAME}\n")
        summary_file.write(f"- Total test images: {len(results)}\n")
        summary_file.write(f"- JSON parsing success: {success_count}/{len(results)}\n")
        summary_file.write(f"- Face photo count: {face_count}/{len(results)}\n")
        summary_file.write(f"- Usable for skin observation: {usable_count}/{len(results)}\n\n")
        summary_file.write("## Interpretation\n")
        if mode == "mock":
            summary_file.write(
                "Mock mode only verifies file I/O and parser behavior. It does not prove MedGemma quality.\n"
            )
        else:
            summary_file.write(
                "Review each JSON output manually. Treat the result as non-diagnostic image observations only.\n"
            )
        summary_file.write("\n## Results\n")
        for result in results:
            parsed = result.get("parsed_json") or {}
            calibrated = parsed.get("calibrated_observations") or {}
            redness = calibrated.get("redness", {})
            acne = calibrated.get("acne_like_spots", {})
            texture = calibrated.get("texture_irregularity", {})
            summary_file.write(
                f"- {result['file']}: recommendation={parsed.get('recommendation_for_pipeline')}, "
                f"lighting={parsed.get('capture_quality', {}).get('lighting_quality')}, "
                f"confidence={parsed.get('confidence')}, "
                f"overall_calibrated={parsed.get('overall_calibrated_severity_level')}"
                f"({parsed.get('overall_calibrated_severity_score')}), "
                f"redness={redness.get('calibrated_level')}({redness.get('calibrated_score')}), "
                f"acne_like={acne.get('calibrated_level')}({acne.get('calibrated_score')}), "
                f"texture={texture.get('calibrated_level')}({texture.get('calibrated_score')}), "
                f"issues={result.get('issues', [])}\n"
            )

    return summary_path


def main() -> int:
    parser = argparse.ArgumentParser(description="MedGemma face photo probe POC")
    parser.add_argument("--input-dir", type=str, default="data_tools/medgemma/samples/probe_samples")
    parser.add_argument("--local-file", type=str)
    parser.add_argument("--blob-url", type=str)
    parser.add_argument("--output-dir", type=str, default="data_tools/medgemma/outputs/probe_outputs")
    parser.add_argument("--mode", choices=["mock", "endpoint", "transformers"], default="mock")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--upload-blob", action="store_true")
    parser.add_argument("--blob-container", type=str, default=DEFAULT_BLOB_CONTAINER)
    args = parser.parse_args()

    if args.limit < 1:
        parser.error("--limit must be greater than 0.")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    images = collect_images(args)
    if not images:
        print(f"No images found. Put sample images in '{args.input_dir}' or pass --local-file.")
        return 1

    print(f"[*] Starting probe with {len(images)} image(s), mode={args.mode}")
    results: list[dict[str, Any]] = []
    jsonl_path = output_dir / "probe_results.jsonl"
    transformers_runtime = load_transformers_runtime() if args.mode == "transformers" else None

    with open(jsonl_path, "w", encoding="utf-8") as jsonl_file:
        for image in images:
            image_path = image["path"]
            is_url = image["is_url"]
            display_name = image_path if is_url else Path(image_path).name
            print(f"[*] Processing {display_name}")

            try:
                if args.mode == "mock":
                    parsed = normalize_probe_result(run_mock_inference(image_path))
                elif args.mode == "endpoint":
                    parsed = run_endpoint_inference(image_path, is_url=is_url)
                else:
                    parsed = run_transformers_inference(
                        image_path,
                        is_url=is_url,
                        runtime=transformers_runtime,
                    )
                error = None
            except Exception as exc:
                parsed = {}
                error = str(exc)
                print(f"[error] {display_name}: {error}")

            result = {
                "file": display_name,
                "timestamp": datetime.now().isoformat(),
                "mode": args.mode,
                "parsed_json": parsed,
                "gpt4o_payload": build_gpt4o_handoff_payload(parsed) if parsed else {},
                "issues": validate_probe_result(parsed),
                "error": error,
            }
            results.append(result)
            jsonl_file.write(json.dumps(result, ensure_ascii=False) + "\n")

    summary_path = generate_summary(results, str(output_dir), args.mode)
    print(f"[+] JSONL saved to {jsonl_path}")
    print(f"[+] Summary saved to {summary_path}")

    if args.upload_blob:
        upload_outputs_to_blob(str(output_dir), args.blob_container)

    failures = sum(1 for result in results if result.get("error") or not result.get("parsed_json"))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
