import base64
import json
import os
import re
import warnings
from io import BytesIO
from typing import Any

import requests
import torch
from PIL import Image
from transformers import AutoModelForImageTextToText, AutoProcessor


MODEL_NAME = os.getenv("MEDGEMMA_MODEL_NAME", "google/medgemma-4b-it")
HF_TOKEN = os.getenv("HF_TOKEN", "")
USE_FAST_PROCESSOR = os.getenv("MEDGEMMA_USE_FAST_PROCESSOR", "true").lower() in {"1", "true", "yes", "on"}
PROMPT_VERSION = "medgemma_face_observation_prompt_v2"
CALIBRATION_VERSION = "medgemma_face_probe_calibration_v1"

MODEL = None
PROCESSOR = None
DTYPE = None

warnings.warn(
    "This endpoint is deprecated. MedGemma is now executed asynchronously "
    "via the worker queue. Do not use this endpoint for new development.",
    DeprecationWarning,
    stacklevel=2,
)

DEFAULT_PROMPT = """You are analyzing a user-submitted front-facing facial photo for non-diagnostic skin observation.

Rules:
- This is NOT a medical diagnosis.
- Do not identify diseases.
- Do not recommend treatment.
- Report only visible, non-diagnostic image observations.
- Do not use placeholder evidence such as "short visual observation".
- Evidence must mention a concrete visible cue and region.
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
    "usable_summary": "one to two sentence summary for the report model",
    "do_not_overstate": ["diagnosis", "treatment", "causality"],
    "recommended_report_tone": "non-diagnostic, cautious, observational",
    "confidence": "low | medium | high"
  },
  "recommendation_for_pipeline": "use | review | reject"
}

Score rubric:
- 0: not visible
- 1-20: very mild; isolated or barely visible
- 21-40: mild; visible in a small local area
- 41-60: moderate; visible in one or two regions
- 61-80: prominent; clearly visible across multiple regions
- 81-100: very prominent; widespread or visually dominant

Feature-specific scoring guidance:
- Do not default to boundary values such as 21, 41, 61, or 81.
- Avoid repeated template scores across different images.
- Use raw_score for relative visual prominence, not medical severity.
- If unsure, lower confidence rather than increasing severity.
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


def init() -> None:
    global MODEL, PROCESSOR, DTYPE
    if not HF_TOKEN:
        raise RuntimeError("HF_TOKEN is not set.")
    DTYPE = torch.float16 if torch.cuda.is_available() else torch.float32
    PROCESSOR = AutoProcessor.from_pretrained(MODEL_NAME, token=HF_TOKEN, use_fast=USE_FAST_PROCESSOR)
    MODEL = AutoModelForImageTextToText.from_pretrained(
        MODEL_NAME,
        token=HF_TOKEN,
        torch_dtype=DTYPE,
        device_map="auto",
    )
    MODEL.eval()


def run(raw_data: str | bytes | dict[str, Any]) -> dict[str, Any]:
    try:
        payload = _parse_payload(raw_data)
        image = _load_image_from_payload(payload)
        prompt = _extract_prompt(payload) or DEFAULT_PROMPT
        max_tokens = int(payload.get("max_tokens") or 700)
        result_text = _generate(prompt, image, max_tokens=max_tokens)
        parsed = _extract_json(result_text)
        if parsed:
            content = json.dumps(_normalize_result(parsed), ensure_ascii=False)
        else:
            content = result_text
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": content,
                    }
                }
            ]
        }
    except Exception as exc:
        return {
            "error": {
                "type": exc.__class__.__name__,
                "message": str(exc),
            }
        }


def _parse_payload(raw_data: str | bytes | dict[str, Any]) -> dict[str, Any]:
    if isinstance(raw_data, dict):
        return raw_data
    if isinstance(raw_data, bytes):
        raw_data = raw_data.decode("utf-8")
    if isinstance(raw_data, str):
        return json.loads(raw_data)
    raise TypeError("request payload must be a JSON object")


def _extract_prompt(payload: dict[str, Any]) -> str | None:
    for message in payload.get("messages") or []:
        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text":
                    text = item.get("text")
                    if isinstance(text, str) and text.strip():
                        return text
    return None


def _load_image_from_payload(payload: dict[str, Any]) -> Image.Image:
    image_url = payload.get("image_url") or payload.get("url")
    if not image_url:
        for message in payload.get("messages") or []:
            content = message.get("content")
            if not isinstance(content, list):
                continue
            for item in content:
                if not isinstance(item, dict) or item.get("type") != "image_url":
                    continue
                image_url_payload = item.get("image_url") or {}
                image_url = image_url_payload.get("url") if isinstance(image_url_payload, dict) else image_url_payload
                break
            if image_url:
                break
    if not image_url:
        raise ValueError("image_url is required")
    return _load_image(str(image_url))


def _load_image(image_url: str) -> Image.Image:
    if image_url.startswith("data:image"):
        _, b64 = image_url.split(",", 1)
        return Image.open(BytesIO(base64.b64decode(b64))).convert("RGB")
    if image_url.startswith("http://") or image_url.startswith("https://"):
        response = requests.get(image_url, headers={"User-Agent": "medgemma-endpoint"}, timeout=60)
        response.raise_for_status()
        return Image.open(BytesIO(response.content)).convert("RGB")
    return Image.open(image_url).convert("RGB")


def _generate(prompt: str, image: Image.Image, *, max_tokens: int) -> str:
    if MODEL is None or PROCESSOR is None or DTYPE is None:
        raise RuntimeError("model is not initialized")
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
                {"type": "text", "text": prompt},
                {"type": "image", "image": image},
            ],
        },
    ]
    inputs = PROCESSOR.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    )
    inputs = inputs.to(MODEL.device, dtype=DTYPE)
    input_len = inputs["input_ids"].shape[-1]
    with torch.inference_mode():
        generation = MODEL.generate(**inputs, max_new_tokens=max_tokens, do_sample=False)
        generation = generation[0][input_len:]
    return PROCESSOR.decode(generation, skip_special_tokens=True)


def _extract_json(text: str) -> dict[str, Any]:
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


def _normalize_result(result: dict[str, Any]) -> dict[str, Any]:
    result.setdefault("prompt_version", PROMPT_VERSION)
    result.setdefault("calibration_version", CALIBRATION_VERSION)
    return result
