from __future__ import annotations

import argparse
import json
import sys
import time
import traceback
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable

from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
load_dotenv(BACKEND_ROOT / ".env")

from app.database import SessionLocal
from app.routers.analysis import _to_detail_response
from app.services import analysis_orchestrator as orchestrator


class StepTimer:
    def __init__(self) -> None:
        self.timings_ms: dict[str, float] = {}
        self.calls: dict[str, int] = {}

    def wrap(self, name: str, fn: Callable[..., Any]) -> Callable[..., Any]:
        def timed(*args: Any, **kwargs: Any) -> Any:
            started = time.perf_counter()
            try:
                return fn(*args, **kwargs)
            finally:
                elapsed_ms = (time.perf_counter() - started) * 1000
                self.timings_ms[name] = self.timings_ms.get(name, 0.0) + elapsed_ms
                self.calls[name] = self.calls.get(name, 0) + 1

        return timed


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _install_timers(timer: StepTimer) -> dict[str, Callable[..., Any]]:
    originals = {
        "build_analysis_context": orchestrator.build_analysis_context,
        "analyze_with_llm": orchestrator.analyze_with_llm,
        "update_user_profile_from_agent_results": orchestrator.update_user_profile_from_agent_results,
        "update_skin_tendency_if_needed": orchestrator.update_skin_tendency_if_needed,
    }
    orchestrator.build_analysis_context = timer.wrap(
        "build_analysis_context_ms",
        originals["build_analysis_context"],
    )
    orchestrator.analyze_with_llm = timer.wrap(
        "analyze_with_llm_ms",
        originals["analyze_with_llm"],
    )
    orchestrator.update_user_profile_from_agent_results = timer.wrap(
        "update_user_profile_from_agent_results_ms",
        originals["update_user_profile_from_agent_results"],
    )
    orchestrator.update_skin_tendency_if_needed = timer.wrap(
        "update_skin_tendency_if_needed_ms",
        originals["update_skin_tendency_if_needed"],
    )
    return originals


def _restore_timers(originals: dict[str, Callable[..., Any]]) -> None:
    orchestrator.build_analysis_context = originals["build_analysis_context"]
    orchestrator.analyze_with_llm = originals["analyze_with_llm"]
    orchestrator.update_user_profile_from_agent_results = originals[
        "update_user_profile_from_agent_results"
    ]
    orchestrator.update_skin_tendency_if_needed = originals["update_skin_tendency_if_needed"]


def _write_or_print(payload: dict[str, Any], output: Path | None, pretty: bool) -> None:
    indent = 2 if pretty else None
    text = json.dumps(payload, ensure_ascii=False, indent=indent, default=_json_default)
    if output is None:
        print(text)
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text + "\n", encoding="utf-8")
    print(f"wrote {output}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run the current analysis_orchestrator flow once, measure step latency, "
            "and capture the user-facing report payload."
        )
    )
    parser.add_argument("--user-id", type=int, required=True)
    parser.add_argument("--skin-log-id", type=int, required=True)
    parser.add_argument("--lookback-days", type=int, default=14)
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional JSON output path for AML/Foundry runs.",
    )
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON.")
    parser.add_argument(
        "--show-trace",
        action="store_true",
        help="Include traceback text when the analysis run fails.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    timer = StepTimer()
    originals = _install_timers(timer)
    started_at = datetime.now(timezone.utc)
    total_started = time.perf_counter()
    db = SessionLocal()
    try:
        request = orchestrator.run_analysis(
            db=db,
            user_id=args.user_id,
            skin_log_id=args.skin_log_id,
            lookback_days=args.lookback_days,
        )
        detail = _to_detail_response(request, db).model_dump(mode="json")
        total_ms = (time.perf_counter() - total_started) * 1000
        payload = {
            "measurement": {
                "success": True,
                "started_at": started_at.isoformat(),
                "total_ms": round(total_ms, 2),
                "timings_ms": {
                    key: round(value, 2)
                    for key, value in sorted(timer.timings_ms.items())
                },
                "calls": dict(sorted(timer.calls.items())),
                "side_effects": [
                    "creates analysis_request",
                    "creates analysis_result on success",
                    "creates agent_result rows on success",
                    "may update user_baseline and user_factor_sensitivity",
                ],
            },
            "input": {
                "user_id": args.user_id,
                "skin_log_id": args.skin_log_id,
                "lookback_days": args.lookback_days,
            },
            "analysis": detail,
        }
        _write_or_print(payload, args.output, args.pretty)
        return 0
    except Exception as exc:
        total_ms = (time.perf_counter() - total_started) * 1000
        payload = {
            "measurement": {
                "success": False,
                "started_at": started_at.isoformat(),
                "total_ms": round(total_ms, 2),
                "timings_ms": {
                    key: round(value, 2)
                    for key, value in sorted(timer.timings_ms.items())
                },
                "calls": dict(sorted(timer.calls.items())),
                "side_effects": [
                    "may create analysis_request",
                    "marks created analysis_request as failed when run_analysis starts",
                ],
            },
            "input": {
                "user_id": args.user_id,
                "skin_log_id": args.skin_log_id,
                "lookback_days": args.lookback_days,
            },
            "error": {
                "type": type(exc).__name__,
                "message": str(exc),
            },
        }
        if args.show_trace:
            payload["error"]["traceback"] = traceback.format_exc()
        _write_or_print(payload, args.output, args.pretty)
        return 1
    finally:
        db.close()
        _restore_timers(originals)


if __name__ == "__main__":
    raise SystemExit(main())
