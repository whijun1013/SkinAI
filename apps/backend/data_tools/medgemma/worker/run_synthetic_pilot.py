import argparse
import hashlib
import json
import logging
import os
import sys
import time
from pathlib import Path

# To allow importing from app.
BACKEND_DIR = Path(__file__).resolve().parents[3]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.medgemma_service import (
    MEDGEMMA_ASSISTANT_PREFILL,
    SKIN_SIGNAL_PROMPT_VERSION,
    build_medgemma_handoff_payload,
    get_medgemma_prompt,
    get_medgemma_prompt_sha256,
    parse_medgemma_output,
)

logger = logging.getLogger("run_pilot")
logger.setLevel(logging.INFO)
ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
logger.addHandler(ch)

class MedGemmaPilotRunner:
    def __init__(self, model_name: str, use_fast: bool = True, revision: str | None = None):
        import torch
        from transformers import AutoModelForImageTextToText, AutoProcessor

        self.torch = torch
        self.model_name = model_name
        self.requested_revision = revision
        self.hf_token = os.getenv("HF_TOKEN", "")
        if not self.hf_token:
            logger.warning("HF_TOKEN is not set. Assuming model is public or cached locally.")

        # Simple dtype selection
        if torch.cuda.is_available():
            if torch.cuda.is_bf16_supported():
                self.dtype = torch.bfloat16
            else:
                self.dtype = torch.float16
        else:
            self.dtype = torch.float32

        logger.info(f"Loading processor for {self.model_name}...")
        self.processor = AutoProcessor.from_pretrained(
            self.model_name,
            token=self.hf_token,
            revision=revision,
            use_fast=use_fast,
        )
        logger.info(f"Loading model {self.model_name} (dtype: {self.dtype})...")
        self.model = AutoModelForImageTextToText.from_pretrained(
            self.model_name,
            token=self.hf_token,
            revision=revision,
            torch_dtype=self.dtype,
            device_map="auto",
        )
        self.model.eval()

        self.pad_token_id = getattr(self.processor.tokenizer, "pad_token_id", None)
        self.eos_token_id = getattr(self.processor.tokenizer, "eos_token_id", None)
        if self.eos_token_id is None:
            self.eos_token_id = getattr(self.model.generation_config, "eos_token_id", None)
        if self.pad_token_id is None:
            self.pad_token_id = self.eos_token_id

        self.model_revision = getattr(self.model.config, "_commit_hash", "unknown")

    def analyze_image(self, image, max_tokens: int = 64, decoding_protocol_version: str = "strict"):
        prompt_text = get_medgemma_prompt()

        messages = [
            {
                "role": "system",
                "content": [{"type": "text", "text": "You return structured, non-diagnostic image observations only."}],
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"{prompt_text}\n\nReturn only one valid JSON object. Do not include Markdown, explanation, or extra text.",
                    },
                    {"type": "image", "image": image},
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

        if decoding_protocol_version == "json_object_stop_v1":
            from transformers import StoppingCriteria, StoppingCriteriaList

            class JsonObjectStoppingCriteria(StoppingCriteria):
                def __init__(self, processor, input_len, prefill_depth=1):
                    self.processor = processor
                    self.input_len = input_len
                    self.prefill_depth = prefill_depth

                def __call__(self, input_ids, scores, **kwargs):
                    generated_ids = input_ids[0][self.input_len:]
                    if len(generated_ids) == 0:
                        return False
                    text = self.processor.decode(generated_ids, skip_special_tokens=True)
                    depth = self.prefill_depth
                    in_string = False
                    escape = False
                    for char in text:
                        if escape:
                            escape = False
                            continue
                        if char == '\\':
                            escape = True
                            continue
                        if char == '"':
                            in_string = not in_string
                            continue
                        if not in_string:
                            if char == '{':
                                depth += 1
                            elif char == '}':
                                depth -= 1
                                if depth <= 0:
                                    return True
                    return False

            generate_kwargs["stopping_criteria"] = StoppingCriteriaList([
                JsonObjectStoppingCriteria(self.processor, input_len, prefill_depth=MEDGEMMA_ASSISTANT_PREFILL.count('{') - MEDGEMMA_ASSISTANT_PREFILL.count('}'))
            ])

        t0 = time.time()
        with self.torch.inference_mode():
            generation_output = self.model.generate(**inputs, **generate_kwargs)
            sequence = generation_output.sequences[0]
            generation = sequence[input_len:]
        inference_ms = int((time.time() - t0) * 1000)

        text = MEDGEMMA_ASSISTANT_PREFILL + self.processor.decode(
            generation, skip_special_tokens=True
        )
        raw_text = self.processor.decode(generation, skip_special_tokens=False)

        generated_token_count = len(generation)
        finished_with_eos = False
        if self.eos_token_id is not None and len(generation) > 0 and generation[-1].item() == self.eos_token_id:
            finished_with_eos = True

        def truncate_4kb(s):
            return s[:4096] if s else s

        debug_info = {
            "generated_text": truncate_4kb(text),
            "raw_generated_text": truncate_4kb(raw_text),
            "generated_token_count": generated_token_count,
            "finish_reason": "eos" if finished_with_eos else ("stop_criteria" if decoding_protocol_version == "json_object_stop_v1" else "length"),
            "max_new_tokens": max_tokens,
            "decoding_protocol_version": decoding_protocol_version,
            "raw_json_only": False,
            "validation_error": None,
            "json_candidate": None
        }

        try:
            import re
            candidate = re.search(r"\{.*?\}", text, re.DOTALL)
            if candidate:
                debug_info["json_candidate"] = truncate_4kb(candidate.group(0))

            parsed, raw_json_only = parse_medgemma_output(text)
            debug_info["raw_json_only"] = raw_json_only
            handoff = build_medgemma_handoff_payload(parsed)
            if handoff is None:
                raise ValueError("build_medgemma_handoff_payload returned None")
            return handoff, inference_ms, raw_json_only, None, debug_info
        except Exception as e:
            debug_info["validation_error"] = str(e)
            return None, inference_ms, False, str(e), debug_info


def _resize_long_side(image, target: int):
    from PIL import Image

    width, height = image.size
    scale = target / max(width, height)
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    return image.resize(size, Image.Resampling.LANCZOS)


def _shift_color_temperature(image, *, red_gain: float, blue_gain: float):
    from PIL import Image

    red, green, blue = image.convert("RGB").split()
    red = red.point(lambda value: min(255, round(value * red_gain)))
    blue = blue.point(lambda value: min(255, round(value * blue_gain)))
    return Image.merge("RGB", (red, green, blue))


def _blur_background(image):
    from PIL import Image, ImageDraw, ImageFilter

    blurred = image.filter(ImageFilter.GaussianBlur(radius=max(4, min(image.size) // 40)))
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    width, height = image.size
    draw.ellipse(
        (width * 0.16, height * 0.04, width * 0.84, height * 0.96),
        fill=255,
    )
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(2, min(image.size) // 100)))
    return Image.composite(image, blurred, mask)


def process_robustness(runner: MedGemmaPilotRunner, original_image, args, sample, pilot_root, output_f=None, completed_variations=None):
    from io import BytesIO
    from PIL import ImageEnhance

    variations = [
        ("resize_512", lambda img: _resize_long_side(img, 512)),
        ("resize_768", lambda img: _resize_long_side(img, 768)),
        ("resize_1024", lambda img: _resize_long_side(img, 1024)),
        ("jpeg_90", lambda img: _compress_jpeg(img, 90)),
        ("bright_0.9", lambda img: ImageEnhance.Brightness(img).enhance(0.9)),
        ("bright_1.1", lambda img: ImageEnhance.Brightness(img).enhance(1.1)),
        ("color_warm", lambda img: _shift_color_temperature(img, red_gain=1.05, blue_gain=0.95)),
        ("color_cool", lambda img: _shift_color_temperature(img, red_gain=0.95, blue_gain=1.05)),
        ("blur_bg", _blur_background),
    ]

    for var_name, var_func in variations:
        var_key = f"{sample['sample_id']}::{var_name}"
        if completed_variations is not None and var_key in completed_variations:
            continue

        try:
            var_img = var_func(original_image.copy())

            if getattr(args, "robustness_mode", "model_only") == "pipeline":
                from app.services.image_quality_service import validate_skin_photo
                buffer = BytesIO()
                var_img.save(buffer, "PNG")
                val_result = validate_skin_photo(buffer.getvalue())

                if not val_result.is_valid or getattr(val_result, "status", "unknown") != "pass":
                    res = {
                        "sample_id": sample["sample_id"],
                        "diagnosis": sample.get("diagnosis"),
                        "variation": var_name,
                        "success": False,
                        "error": f"Gateway failed: {val_result.warning}",
                        "robustness_mode": args.robustness_mode
                    }
                    if output_f:
                        output_f.write(json.dumps(res, ensure_ascii=False) + "\n")
                        output_f.flush()
                    continue

            # Gateway check removed for robustness in pilot isolation (model_only mode)
            # Assume robustness variations retain sufficient quality if original passed

            handoff, inference_ms, raw_json_only, error, debug_info = runner.analyze_image(var_img)

            res = {
                "sample_id": sample["sample_id"],
                "diagnosis": sample.get("diagnosis"),
                "variation": var_name,
                "base_prediction": sample.get("prediction"),
                "success": error is None,
                "validation_errors": [error] if error else [],
                "prediction": handoff["signals"] if handoff else None,
                "inference_ms": inference_ms,
                "raw_json_only": raw_json_only,
                "model_revision": runner.model_revision,
                "prompt_version": SKIN_SIGNAL_PROMPT_VERSION,
                "prompt_sha256": get_medgemma_prompt_sha256(),
                "robustness_mode": getattr(args, "robustness_mode", "model_only"),
                **debug_info
            }
            if output_f:
                output_f.write(json.dumps(res, ensure_ascii=False) + "\n")
                output_f.flush()
        except Exception as e:
            res = {
                "sample_id": sample["sample_id"],
                "diagnosis": sample.get("diagnosis"),
                "variation": var_name,
                "success": False,
                "error": str(e),
                "robustness_mode": getattr(args, "robustness_mode", "model_only")
            }
            if output_f:
                output_f.write(json.dumps(res, ensure_ascii=False) + "\n")
                output_f.flush()

def _compress_jpeg(img, quality):
    from io import BytesIO
    from PIL import Image
    buffer = BytesIO()
    img.save(buffer, "JPEG", quality=quality)
    buffer.seek(0)
    return Image.open(buffer).convert("RGB")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pilot-root", required=True, type=str)
    parser.add_argument("--output", type=str, help="Output for base inferences")
    parser.add_argument("--model", default="google/medgemma-4b-it", type=str)
    parser.add_argument("--model-revision", default=os.getenv("MEDGEMMA_MODEL_REVISION") or None)
    parser.add_argument("--seed", default=42, type=int)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--robustness", action="store_true")
    parser.add_argument("--robustness-only", action="store_true")
    parser.add_argument("--robustness-output", type=str, help="Output for robustness results")
    parser.add_argument("--robustness-mode", default="model_only", choices=["model_only", "pipeline"])
    parser.add_argument("--robustness-samples-per-diagnosis", default=10, type=int)
    parser.add_argument("--base-results", type=str, help="Path to base results for robustness_only")
    parser.add_argument("--retry-failed-json", type=str, help="Path to inputs/json_failure_ids.txt")
    parser.add_argument("--decoding-protocol", default="strict", type=str)
    args = parser.parse_args()

    pilot_root = Path(args.pilot_root).resolve()
    manifest_path = pilot_root / "manifests" / "samples.jsonl"

    # ---------------------------------------------------------
    # Forced Protocol Pre-flight checks
    # ---------------------------------------------------------
    if SKIN_SIGNAL_PROMPT_VERSION != "skin_signal_v3_ordinal":
        logger.error(f"Invalid prompt version: {SKIN_SIGNAL_PROMPT_VERSION}. Expected skin_signal_v3_ordinal")
        sys.exit(1)

    if get_medgemma_prompt_sha256() != "4933f38a3d28c5aa28d67dff5dd4cd4086277538ff11f5615bdefa09a9ff7f62":
        logger.error("Prompt SHA-256 does not match v3 ordinal exactly.")
        sys.exit(1)

    prompt_text = get_medgemma_prompt()
    for forbidden in ["Scores must be integers", "0 to 10"]:
        if forbidden in prompt_text:
            logger.error(f"Prompt contains forbidden v2 word: {forbidden}")
            sys.exit(1)

    if '"photo_quality"' in prompt_text or '"confidence"' in prompt_text:
        logger.error("Prompt requires v2 photo_quality/confidence fields")
        sys.exit(1)
    # ---------------------------------------------------------
    if not manifest_path.exists():
        logger.error(f"Manifest not found: {manifest_path}")
        sys.exit(1)
    verification_path = pilot_root / "manifests" / "verification.json"
    if not verification_path.is_file():
        logger.error(f"Verification report not found: {verification_path}")
        sys.exit(1)
    verification = json.loads(verification_path.read_text(encoding="utf-8"))
    if verification.get("passed") is not True:
        logger.error("Pilot verification report is not passed.")
        sys.exit(1)

    retry_ids = set()
    if args.retry_failed_json:
        retry_path = Path(args.retry_failed_json)
        if retry_path.exists():
            with retry_path.open("r") as f:
                for line in f:
                    if line.strip(): retry_ids.add(line.strip())

    completed_ids = set()
    completed_robustness = set()

    if args.output:
        output_path = Path(args.output).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if args.resume and output_path.exists():
            with output_path.open("r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip(): continue
                    try:
                        data = json.loads(line)
                        if data.get("success"):
                            completed_ids.add(data.get("sample_id"))
                    except:
                        pass
            logger.info(f"Resuming: found {len(completed_ids)} completed successful samples.")
        elif not args.resume and output_path.exists():
            logger.info("Overwriting existing output file (no --resume).")
            output_path.unlink()

    if args.robustness_output:
        robust_out = Path(args.robustness_output).resolve()
        robust_out.parent.mkdir(parents=True, exist_ok=True)
        if args.resume and robust_out.exists():
            with robust_out.open("r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip(): continue
                    try:
                        data = json.loads(line)
                        if data.get("success"):
                            # Key format for robustness deduplication
                            k = f"{data['sample_id']}::{data['variation']}"
                            if k in completed_robustness:
                                logger.error(f"Duplicate key found in robustness results: {k}")
                                sys.exit(1)
                            completed_robustness.add(k)
                    except:
                        pass
            logger.info(f"Resuming: found {len(completed_robustness)} completed robustness variations.")
        elif not args.resume and robust_out.exists():
            robust_out.unlink()

    samples = []
    with manifest_path.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip(): continue
            samples.append(json.loads(line))

    # Pre-flight checks
    invalid_views = [s for s in samples if s.get("view") != "front"]
    if invalid_views:
        logger.error(f"Found {len(invalid_views)} samples with view != front. Aborting.")
        sys.exit(1)

    runner = None
    from PIL import Image

    # Robustness target selection
    robustness_targets = set()
    base_predictions = {}
    if args.robustness or args.robustness_only:
        import random
        random.seed(args.seed)
        diagnoses = set(s["diagnosis"] for s in samples)
        for d in diagnoses:
            d_samples = [s for s in samples if s["diagnosis"] == d and s["gateway_status"] == "pass"]
            d_samples.sort(key=lambda x: x["sample_id"])
            random.shuffle(d_samples)
            for s in d_samples[:args.robustness_samples_per_diagnosis]:
                robustness_targets.add(s["sample_id"])

        if args.base_results and Path(args.base_results).exists():
            with open(args.base_results, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip(): continue
                    try:
                        data = json.loads(line)
                        if data.get("success"):
                            base_predictions[data["sample_id"]] = data.get("prediction")
                    except:
                        pass

    processed = 0
    out_f = None
    if args.output:
        out_f = output_path.open("a", encoding="utf-8")

    rob_f = None
    if args.robustness_output:
        rob_f = Path(args.robustness_output).open("a", encoding="utf-8")

    try:
        for s in samples:
            if s["gateway_status"] != "pass":
                continue

            if args.retry_failed_json and s["sample_id"] not in retry_ids:
                continue

            is_robustness_target = (args.robustness or args.robustness_only) and s["sample_id"] in robustness_targets
            needs_base = not args.robustness_only and out_f is not None and s["sample_id"] not in completed_ids
            needs_rob = is_robustness_target and rob_f is not None

            if not needs_base and not needs_rob:
                continue

            if runner is None:
                runner = MedGemmaPilotRunner(args.model, revision=args.model_revision)

            logger.info(f"Processing {s['sample_id']}...")
            img_path = pilot_root / s["copied_image_path"]
            if not img_path.exists():
                logger.error(f"Image not found: {img_path}")
                out_f.write(json.dumps({
                    "sample_id": s["sample_id"],
                    "success": False,
                    "validation_errors": [f"Image not found: {img_path}"],
                }, ensure_ascii=False) + "\n")
                out_f.flush()
                continue

            try:
                image = Image.open(str(img_path)).convert("RGB")
                if needs_base:
                    actual_sha256 = hashlib.sha256(img_path.read_bytes()).hexdigest()
                    if actual_sha256 != s["image_sha256"]:
                        raise ValueError("image SHA-256 differs from verified manifest")
                    handoff, inference_ms, raw_json_only, error, debug_info = runner.analyze_image(image, decoding_protocol_version=args.decoding_protocol)

                    result = {
                        "sample_id": s["sample_id"],
                        "diagnosis": s["diagnosis"],
                        "view": s["view"],
                        "width": s["width"],
                        "height": s["height"],
                        "success": error is None,
                        "validation_errors": [error] if error else [],
                        "prediction": handoff["signals"] if handoff else None,
                        "inference_ms": inference_ms,
                        "raw_json_only": raw_json_only,
                        "model_name": runner.model_name,
                        "model_revision": runner.model_revision,
                        "prompt_version": SKIN_SIGNAL_PROMPT_VERSION,
                        "prompt_sha256": get_medgemma_prompt_sha256(),
                        "image_sha256": s["image_sha256"],
                        **debug_info
                    }

                    out_f.write(json.dumps(result, ensure_ascii=False) + "\n")
                    out_f.flush()

                if needs_rob:
                    logger.info(f"Running robustness variations for {s['sample_id']}...")
                    if s["sample_id"] in base_predictions:
                        s["prediction"] = base_predictions[s["sample_id"]]
                    process_robustness(runner, image, args, s, pilot_root, output_f=rob_f, completed_variations=completed_robustness)

                processed += 1
            except Exception as e:
                logger.error(f"Unhandled error processing {s['sample_id']}: {e}")
                import traceback
                traceback.print_exc()
                if out_f is not None:
                    out_f.write(json.dumps({
                        "sample_id": s["sample_id"],
                        "diagnosis": s.get("diagnosis"),
                        "view": s.get("view"),
                        "success": False,
                        "validation_errors": [str(e)],
                    }, ensure_ascii=False) + "\n")
                    out_f.flush()
    finally:
        if out_f: out_f.close()
        if rob_f: rob_f.close()

    logger.info(f"Run complete. Processed {processed} samples.")


if __name__ == "__main__":
    main()
