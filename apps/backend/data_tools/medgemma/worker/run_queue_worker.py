import argparse
import asyncio
import json
import os
import signal
import socket
import sys
import threading
import time
from io import BytesIO
from pathlib import Path
from typing import Any

import requests
from PIL import Image, ImageOps

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


BACKEND_DIR = Path(__file__).resolve().parents[3]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.mongo import update_skin_ai_result_medgemma
from app.services.medgemma_queue_service import (
    claim_next_medgemma_analysis_task,
    heartbeat_medgemma_task,
    mark_medgemma_analysis_task_done,
    mark_medgemma_analysis_task_failed,
    requeue_stale_running_tasks,
    sanitize_medgemma_error,
)
from app.services.medgemma_service import (
    MEDGEMMA_ASSISTANT_PREFILL,
    SKIN_SIGNAL_PROMPT_VERSION,
    build_medgemma_handoff_payload,
    get_medgemma_prompt,
    get_medgemma_prompt_sha256,
    parse_medgemma_output,
)


MODEL_NAME = os.getenv("MEDGEMMA_MODEL_NAME", "google/medgemma-4b-it")
MODEL_REVISION = os.getenv("MEDGEMMA_MODEL_REVISION") or None
HF_TOKEN = os.getenv("HF_TOKEN", "")
USE_FAST_PROCESSOR = os.getenv("MEDGEMMA_USE_FAST_PROCESSOR", "true").lower() in {"1", "true", "yes", "on"}
TORCH_DTYPE = os.getenv("MEDGEMMA_TORCH_DTYPE", "auto").lower()


class MedGemmaRunnerError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        timings: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        raw_output_preview: str = "",
    ) -> None:
        super().__init__(message)
        self.timings = timings or {}
        self.metadata = metadata or {}
        self.raw_output_preview = raw_output_preview


class MedGemmaLocalRunner:
    def __init__(self) -> None:
        if not HF_TOKEN:
            raise RuntimeError("HF_TOKEN is not set.")
        if not os.getenv("MONGO_URL"):
            raise RuntimeError("MONGO_URL is not set.")
        if not os.getenv("MONGO_DB_NAME"):
            raise RuntimeError("MONGO_DB_NAME is not set.")
        if not MODEL_NAME:
            raise RuntimeError("MEDGEMMA_MODEL_NAME is not set.")

        import torch
        from transformers import AutoModelForImageTextToText, AutoProcessor

        self.torch = torch
        self.dtype = self._resolve_dtype(torch)
        
        load_start = time.time()
        print(json.dumps({"event": "model_loading_started", "model": MODEL_NAME}), flush=True)

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
        self.pad_token_id = getattr(self.processor.tokenizer, "pad_token_id", None)
        self.eos_token_id = getattr(self.processor.tokenizer, "eos_token_id", None)
        if self.eos_token_id is None:
            self.eos_token_id = getattr(self.model.generation_config, "eos_token_id", None)
        if self.pad_token_id is None:
            self.pad_token_id = self.eos_token_id
        
        load_duration = time.time() - load_start
        self.model_load_ms = int(load_duration * 1000)
        self._model_load_reported = False
        print(json.dumps({
            "event": "model_loading_finished",
            "model": MODEL_NAME,
            "duration_seconds": round(load_duration, 2),
            "model_load_ms": self.model_load_ms,
            "dtype": str(self.dtype),
            "pad_token_id": self.pad_token_id,
            "eos_token_id": self.eos_token_id,
        }), flush=True)

    @staticmethod
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

    def analyze_image_url(self, image_url: str, *, max_tokens: int = None, max_image_side: int = None) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
        timings = {}
        metadata = {}

        if max_tokens is None:
            max_tokens = int(os.getenv("MEDGEMMA_MAX_TOKENS", "64"))
        if max_image_side is None:
            max_image_side_str = os.getenv("MEDGEMMA_MAX_IMAGE_SIDE", "768")
            max_image_side = int(max_image_side_str) if max_image_side_str else None
        prompt_text = get_medgemma_prompt()

        t0 = time.time()
        image, byte_size = self._load_image(image_url)
        timings["blob_download_ms"] = int((time.time() - t0) * 1000)
        metadata["original_image_byte_size"] = byte_size
        metadata["original_width"] = image.width
        metadata["original_height"] = image.height
        metadata["max_image_side"] = max_image_side
        metadata["model_name"] = MODEL_NAME
        metadata["model_revision"] = MODEL_REVISION or getattr(self.model.config, "_commit_hash", None)
        metadata["prompt_version"] = SKIN_SIGNAL_PROMPT_VERSION
        metadata["prompt_sha256"] = get_medgemma_prompt_sha256()

        t1 = time.time()
        resized = False
        if max_image_side and max(image.width, image.height) > max_image_side:
            image.thumbnail((max_image_side, max_image_side), Image.Resampling.LANCZOS)
            resized = True
            
        metadata["width"] = image.width
        metadata["height"] = image.height
        metadata["resized"] = resized
        processed_buffer = BytesIO()
        image.save(processed_buffer, format="JPEG", quality=85)
        metadata["processed_image_byte_size"] = processed_buffer.tell()

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
                    {
                        "type": "text",
                        "text": (
                            f"{prompt_text}\n\n"
                            "Return only one valid JSON object. "
                            "Do not include Markdown, explanation, or extra text."
                        ),
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
        metadata["input_token_count"] = int(input_len)
        metadata["max_tokens"] = max_tokens
        metadata["dtype"] = str(self.dtype)
        metadata["pad_token_id"] = self.pad_token_id
        metadata["eos_token_id"] = self.eos_token_id
        metadata["prompt_mode"] = os.getenv("MEDGEMMA_PROMPT_MODE", "compact").lower()
        timings["image_preprocess_ms"] = int((time.time() - t1) * 1000)
        
        if not self._model_load_reported:
            timings["model_load_ms"] = self.model_load_ms
            self._model_load_reported = True
        else:
            timings["model_load_ms"] = 0

        t2 = time.time()
        generate_kwargs = {
            "max_new_tokens": max_tokens,
            "do_sample": False,
            "return_dict_in_generate": True,
        }
        if self.eos_token_id is not None:
            generate_kwargs["eos_token_id"] = self.eos_token_id
        if self.pad_token_id is not None:
            generate_kwargs["pad_token_id"] = self.pad_token_id
        with self.torch.inference_mode():
            generation_output = self.model.generate(
                **inputs,
                **generate_kwargs,
            )
            sequence = generation_output.sequences[0]
            generation = sequence[input_len:]
        timings["inference_ms"] = int((time.time() - t2) * 1000)

        t3 = time.time()
        metadata["generated_token_count"] = int(generation.shape[-1])
        text = MEDGEMMA_ASSISTANT_PREFILL + self.processor.decode(
            generation, skip_special_tokens=True
        )
        raw_text = self.processor.decode(generation, skip_special_tokens=False)
        metadata["decoded_text_length"] = len(text)
        metadata["raw_decoded_text_length"] = len(raw_text)
        try:
            parsed, raw_json_only = parse_medgemma_output(text)
            handoff = build_medgemma_handoff_payload(parsed)
        except ValueError as exc:
            metadata["raw_json_only"] = False
            raise MedGemmaRunnerError(
                f"MedGemma output validation failed: {exc}",
                timings=timings,
                metadata=metadata,
                raw_output_preview=(text or raw_text)[:1000],
            ) from exc
        metadata["raw_json_only"] = raw_json_only
        timings["postprocess_ms"] = int((time.time() - t3) * 1000)

        if handoff is None:
            raise MedGemmaRunnerError(
                "MedGemma returned non-JSON or invalid result.",
                timings=timings,
                metadata=metadata,
                raw_output_preview=(text or raw_text)[:1000],
            )
        return handoff, timings, metadata

    def _load_image(self, image_url: str) -> tuple[Image.Image, int]:
        if image_url.startswith("http://") or image_url.startswith("https://"):
            response = requests.get(image_url, headers={"User-Agent": "medgemma-queue-worker"}, timeout=60)
            response.raise_for_status()
            content = response.content
            image = ImageOps.exif_transpose(Image.open(BytesIO(content))).convert("RGB")
            return image, len(content)
        path = Path(image_url)
        image = ImageOps.exif_transpose(Image.open(image_url)).convert("RGB")
        return image, path.stat().st_size if path.exists() else 0


HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("MEDGEMMA_HEARTBEAT_INTERVAL_SECONDS", "30"))


def _run_heartbeat_thread(
    task_id: Any,
    worker_id: str,
    stop_event: threading.Event,
    loop: asyncio.AbstractEventLoop,
) -> None:
    """별도 스레드에서 추론 중 MongoDB heartbeat를 주기적으로 전송.

    analyze_image_url()이 이벤트 루프를 블로킹하기 때문에 threading으로 분리.
    run_coroutine_threadsafe로 기존 루프에 coroutine을 안전하게 제출한다.
    """
    while not stop_event.wait(HEARTBEAT_INTERVAL_SECONDS):
        if stop_event.is_set():
            break
        try:
            future = asyncio.run_coroutine_threadsafe(
                heartbeat_medgemma_task(task_id=task_id, worker_id=worker_id),
                loop,
            )
            updated = future.result(timeout=10)
            if not updated:
                # worker_id 불일치 or 태스크 상태 변경 → 더 이상 heartbeat 불필요
                break
        except Exception as exc:
            print(f"[heartbeat] error task={task_id}: {exc}", file=sys.stderr)


async def process_one_task(
    *,
    runner: MedGemmaLocalRunner,
    worker_id: str,
    max_attempts: int,
) -> str:
    task = await claim_next_medgemma_analysis_task(worker_id=worker_id, max_attempts=max_attempts)
    if not task:
        return "none"

    task_id = task["_id"]
    attempts = int(task.get("attempts") or 1)
    skin_log_id = int(task.get("skin_log_id", 0))
    start_time = time.time()
    
    timings = {}
    metadata = {
        "worker_id": worker_id,
        "model_name": MODEL_NAME,
    }
    
    if "created_at" in task and hasattr(task["created_at"], "timestamp"):
        timings["queue_wait_ms"] = int((start_time - task["created_at"].timestamp()) * 1000)
    
    print(json.dumps({
        "event": "task_claimed",
        "task_id": str(task_id),
        "skin_log_id": skin_log_id,
        "user_id": int(task.get("user_id", 0)),
        "attempts": attempts,
        "max_attempts": max_attempts,
        "worker_id": worker_id
    }, ensure_ascii=False), flush=True)
    
    try:
        from app.database import SessionLocal
        from app.models.skin_log import SkinLog
        
        # Stale 寃곌낵 諛⑹?: 寃곌낵 ?????photo_url 蹂寃??щ? ?뺤씤
        with SessionLocal() as db:
            skin_log = db.query(SkinLog).filter(SkinLog.id == skin_log_id).first()
            task_image_base = str(task["image_url"]).split('?')[0]
            log_photo_base = skin_log.photo_url.split('?')[0] if skin_log and skin_log.photo_url else ""
            
            if skin_log and log_photo_base != task_image_base:
                timings["total_worker_ms"] = int((time.time() - start_time) * 1000)
                from app.services.medgemma_queue_service import get_mongo_db, TASK_COLLECTION
                from datetime import datetime, timezone
                await get_mongo_db()[TASK_COLLECTION].update_one(
                    {"_id": task_id},
                    {"$set": {
                        "status": "cancelled",
                        "error": "stale result: photo_url changed",
                        "error_code": "STALE_RESULT",
                        "message_for_user": "사진이 변경되어 이전 분석이 취소되었습니다.",
                        "finished_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc),
                    }}
                )
                print(json.dumps({
                    "event": "task_cancelled_stale",
                    "task_id": str(task_id),
                    "skin_log_id": skin_log_id,
                    "attempts": attempts,
                    "max_attempts": max_attempts,
                    "worker_id": worker_id
                }), flush=True)
                return "cancelled"

        # Heartbeat 스레드 시작: 추론 중 stale requeue 방지
        heartbeat_stop = threading.Event()
        heartbeat_thread = threading.Thread(
            target=_run_heartbeat_thread,
            args=(task_id, worker_id, heartbeat_stop, asyncio.get_event_loop()),
            daemon=True,
            name=f"heartbeat-{task_id}",
        )
        heartbeat_thread.start()

        try:
            handoff, analyze_timings, analyze_metadata = runner.analyze_image_url(str(task["image_url"]))
        finally:
            heartbeat_stop.set()
            heartbeat_thread.join(timeout=15)
        timings.update(analyze_timings)
        metadata.update(analyze_metadata)

        from app.services.medgemma_queue_service import get_mongo_db, TASK_COLLECTION

        current_task = await get_mongo_db()[TASK_COLLECTION].find_one({"_id": task_id})
        if (
            not current_task
            or current_task.get("status") != "running"
            or current_task.get("worker_id") != worker_id
        ):
            print(json.dumps({
                "event": "task_write_skipped_not_active",
                "task_id": str(task_id),
                "skin_log_id": skin_log_id,
                "worker_id": worker_id,
                "attempts": attempts,
                "max_attempts": max_attempts,
                "current_status": current_task.get("status") if current_task else None,
            }, ensure_ascii=False), flush=True)
            return "skipped"

        t_mongo = time.time()
        saved_result_id = await update_skin_ai_result_medgemma(
            skin_log_id=skin_log_id,
            user_id=int(task["user_id"]),
            medgemma=handoff,
            model_version=SKIN_SIGNAL_PROMPT_VERSION,
            prompt_version=SKIN_SIGNAL_PROMPT_VERSION,
            prompt_sha256=get_medgemma_prompt_sha256(),
            model_revision=MODEL_REVISION or getattr(runner.model.config, "_commit_hash", None),
        )
        if saved_result_id is None:
            raise RuntimeError("MedGemma result was not saved to MongoDB")
        timings["mongo_update_ms"] = int((time.time() - t_mongo) * 1000)
        timings["total_worker_ms"] = int((time.time() - start_time) * 1000)

        await mark_medgemma_analysis_task_done(
            task_id=task_id, 
            result=handoff, 
            timings=timings, 
            metadata=metadata
        )
        
        duration = time.time() - start_time
        print(json.dumps({
            "event": "task_done",
            "task_id": str(task_id),
            "skin_log_id": skin_log_id,
            "worker_id": worker_id,
            "attempts": attempts,
            "max_attempts": max_attempts,
            "duration_seconds": round(duration, 2)
        }, ensure_ascii=False), flush=True)
        return "done"
    except MedGemmaRunnerError as exc:
        duration = time.time() - start_time
        retry = attempts < max_attempts
        error = sanitize_medgemma_error(f"{exc.__class__.__name__}: {exc}")

        timings.update(exc.timings)
        metadata.update(exc.metadata)
        if exc.raw_output_preview:
            metadata["raw_output_preview"] = exc.raw_output_preview
        timings["total_worker_ms"] = int(duration * 1000)

        import traceback
        print(sanitize_medgemma_error(traceback.format_exc()), file=sys.stderr)

        await mark_medgemma_analysis_task_failed(
            task_id=task_id,
            error=error,
            retry=retry,
            timings=timings,
            metadata=metadata,
        )
        print(json.dumps({
            "event": "task_failed",
            "task_id": str(task_id),
            "skin_log_id": skin_log_id,
            "worker_id": worker_id,
            "attempts": attempts,
            "max_attempts": max_attempts,
            "retry": retry,
            "error": error,
            "duration_seconds": round(duration, 2),
        }, ensure_ascii=False), flush=True)
        return "failed_retry" if retry else "failed_final"

    except Exception as exc:
        duration = time.time() - start_time
        retry = attempts < max_attempts
        error = sanitize_medgemma_error(f"{exc.__class__.__name__}: {exc}")
        
        timings["total_worker_ms"] = int(duration * 1000)
        
        import traceback
        print(sanitize_medgemma_error(traceback.format_exc()), file=sys.stderr)
        
        await mark_medgemma_analysis_task_failed(
            task_id=task_id, 
            error=error, 
            retry=retry,
            timings=timings,
            metadata=metadata
        )
        print(json.dumps({
            "event": "task_failed",
            "task_id": str(task_id),
            "skin_log_id": skin_log_id,
            "worker_id": worker_id,
            "attempts": attempts,
            "max_attempts": max_attempts,
            "retry": retry,
            "error": error,
            "duration_seconds": round(duration, 2)
        }, ensure_ascii=False), flush=True)
        return "failed_retry" if retry else "failed_final"


async def run_worker(args: argparse.Namespace) -> None:
    shutdown_event = asyncio.Event()

    def _signal_handler():
        print(json.dumps({"event": "shutdown_signal_received"}), flush=True)
        shutdown_event.set()

    loop = asyncio.get_running_loop()
    if os.name != "nt":
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, _signal_handler)
    
    runner = MedGemmaLocalRunner()
    worker_id = args.worker_id or f"{socket.gethostname()}-{os.getpid()}"
    print(
        json.dumps(
            {
                "event": "medgemma_worker_started",
                "worker_id": worker_id,
                "model": MODEL_NAME,
                "once": args.once,
                "poll_seconds": args.poll_seconds,
            },
            ensure_ascii=False,
        ),
        flush=True,
    )

    stale_requeue_interval = float(os.getenv("MEDGEMMA_STALE_REQUEUE_INTERVAL_MINUTES", "60"))
    last_stale_requeue = 0.0

    stats = {
        "claimed": 0,
        "succeeded": 0,
        "failed_retry": 0,
        "failed_final": 0,
        "cancelled": 0,
        "skipped": 0,
        "empty_polls": 0,
    }

    while not shutdown_event.is_set():
        now = time.time()
        if now - last_stale_requeue > (stale_requeue_interval * 60):
            try:
                requeued = await requeue_stale_running_tasks()
                if requeued > 0:
                    print(json.dumps({"event": "stale_tasks_requeued", "count": requeued}), flush=True)
            except Exception as e:
                print(f"[!] Stale requeue error: {e}", file=sys.stderr)
            last_stale_requeue = time.time()

        processed_status = await process_one_task(
            runner=runner,
            worker_id=worker_id,
            max_attempts=args.max_attempts,
        )
        if processed_status == "none":
            stats["empty_polls"] += 1
        else:
            stats["claimed"] += 1
            if processed_status == "done":
                stats["succeeded"] += 1
            elif processed_status == "failed_retry":
                stats["failed_retry"] += 1
            elif processed_status == "failed_final":
                stats["failed_final"] += 1
            elif processed_status == "cancelled":
                stats["cancelled"] += 1
            elif processed_status == "skipped":
                stats["skipped"] += 1
            
        if args.once:
            break
            
        if processed_status == "none":
            try:
                await asyncio.wait_for(shutdown_event.wait(), timeout=args.poll_seconds)
            except asyncio.TimeoutError:
                pass

    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run MedGemma Mongo queue worker on Azure ML compute.")
    parser.add_argument("--once", action="store_true", help="Process at most one pending task and exit.")
    parser.add_argument("--poll-seconds", type=float, default=float(os.getenv("MEDGEMMA_WORKER_POLL_SECONDS", "10")))
    parser.add_argument("--max-attempts", type=int, default=int(os.getenv("MEDGEMMA_WORKER_MAX_ATTEMPTS", "3")))
    parser.add_argument("--worker-id", default=os.getenv("MEDGEMMA_WORKER_ID", ""))
    return parser.parse_args()


if __name__ == "__main__":
    started = time.time()
    stats = {}
    try:
        stats = asyncio.run(run_worker(parse_args()))
    except KeyboardInterrupt:
        pass
    finally:
        duration = time.time() - started
        print(json.dumps({
            "event": "medgemma_worker_exited",
            "duration_seconds": round(duration, 2),
            "stats": stats
        }, ensure_ascii=False), flush=True)
