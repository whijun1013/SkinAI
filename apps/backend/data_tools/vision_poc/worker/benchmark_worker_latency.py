import argparse
import json
import os
import sys
import time
from pathlib import Path

# Add backend to sys.path
BACKEND_DIR = Path(__file__).resolve().parents[3]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

def main():
    parser = argparse.ArgumentParser(description="Benchmark MedGemma worker latency")
    parser.add_argument("--image", type=str, required=True, help="Path or URL to the test image")
    parser.add_argument("--runs", type=int, default=5, help="Number of warm runs to perform")
    parser.add_argument("--output", type=str, default="benchmark_result.json", help="Output file path (JSON)")
    parser.add_argument("--max-image-side", type=int, default=None, help="Resize longest image side before inference")
    parser.add_argument("--max-tokens", type=int, default=None, help="Max new tokens for generation")
    args = parser.parse_args()

    # Load environment variables just in case
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except Exception:
        pass

    # Verify model requirements
    if not os.getenv("HF_TOKEN"):
        print("SKIP: HF_TOKEN is not set. Please set HF_TOKEN to run benchmark.")
        return
        
    if not os.getenv("MONGO_URL"):
        os.environ["MONGO_URL"] = "mongodb://dummy"
    if not os.getenv("MONGO_DB_NAME"):
        os.environ["MONGO_DB_NAME"] = "dummy_db"

    try:
        from data_tools.medgemma.worker.run_queue_worker import MedGemmaLocalRunner, MedGemmaRunnerError
        print("Initializing MedGemmaLocalRunner...")
        init_start = time.time()
        runner = MedGemmaLocalRunner()
        runner_init_ms = int((time.time() - init_start) * 1000)
    except Exception as e:
        print(f"ERROR: Failed to initialize runner. Is the model downloaded? Error: {e}")
        return

    print(f"Starting cold run with image: {args.image}")
    try:
        # Cold start
        handoff, cold_timings, cold_metadata = runner.analyze_image_url(
            args.image,
            max_tokens=args.max_tokens,
            max_image_side=args.max_image_side,
        )
        print("Cold run completed.")
        
        warm_runs = []
        for i in range(args.runs):
            print(f"Starting warm run {i + 1}/{args.runs}...")
            _, warm_timings, _ = runner.analyze_image_url(
                args.image,
                max_tokens=args.max_tokens,
                max_image_side=args.max_image_side,
            )
            warm_runs.append(warm_timings)
        
        # Calculate averages
        avg_timings = {}
        if warm_runs:
            keys = warm_runs[0].keys()
            for k in keys:
                avg_timings[k] = sum(run.get(k, 0) for run in warm_runs) / len(warm_runs)
        
        result = {
            "image": args.image,
            "metadata": cold_metadata,
            "runner_init_ms": runner_init_ms,
            "model_load_ms": getattr(runner, "model_load_ms", None),
            "max_image_side": args.max_image_side,
            "max_tokens": args.max_tokens,
            "cold_run": cold_timings,
            "warm_runs_count": args.runs,
            "warm_runs_average": avg_timings,
            "all_warm_runs": warm_runs,
        }
        
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
            
        print(f"Benchmark results saved to {args.output}")
        print("Averages:", json.dumps(avg_timings, indent=2))
        
    except MedGemmaRunnerError as e:
        result = {
            "image": args.image,
            "status": "failed",
            "error": str(e),
            "raw_output_preview": e.raw_output_preview,
            "metadata": e.metadata,
            "runner_init_ms": runner_init_ms,
            "model_load_ms": getattr(runner, "model_load_ms", None),
            "max_image_side": args.max_image_side,
            "max_tokens": args.max_tokens,
            "partial_timings": e.timings,
        }
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"ERROR: Benchmark failed during execution: {e}")
        print(f"Failure details saved to {args.output}")

    except Exception as e:
        result = {
            "image": args.image,
            "status": "failed",
            "error": f"{e.__class__.__name__}: {e}",
            "runner_init_ms": locals().get("runner_init_ms"),
            "max_image_side": args.max_image_side,
            "max_tokens": args.max_tokens,
        }
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"ERROR: Benchmark failed during execution: {e}")
        print(f"Failure details saved to {args.output}")

if __name__ == "__main__":
    main()
