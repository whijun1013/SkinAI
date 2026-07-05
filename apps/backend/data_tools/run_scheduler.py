import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import schedule


SCRIPT_DIR = Path(__file__).resolve().parent
LOG_DIR = SCRIPT_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)


def _run_script(name: str, args: list[str]) -> None:
    log_path = LOG_DIR / f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    print(f"\n[Scheduler] Starting {name}. log={log_path}")
    with log_path.open("w", encoding="utf-8") as log_file:
        completed = subprocess.run(
            [sys.executable, *args],
            cwd=SCRIPT_DIR.parent,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
    if completed.returncode != 0:
        print(f"[Scheduler] {name} failed with exit code {completed.returncode}.")
        return
    print(f"[Scheduler] {name} finished successfully.")


def run_crawler():
    apply_enabled = os.getenv("CRAWLER_APPLY", "false").lower() == "true"
    mode = "--apply" if apply_enabled else "--dry-run"
    max_pages = os.getenv("CRAWLER_MAX_PAGES", "1")
    limit = os.getenv("CRAWLER_LIMIT", "0")
    _run_script(
        "primary_retailer_crawler",
        [
            "data_tools/primary_retailer_crawler.py",
            "--retailer",
            "oliveyoung",
            "--all-categories",
            "--max-pages",
            max_pages,
            "--limit",
            limit,
            "--selenium-fallback",
            mode,
        ],
    )


def run_weekly_reports():
    _run_script("weekly_reports", ["data_tools/generate_weekly_reports.py"])


schedule.every(30).days.at("00:00").do(run_crawler)
schedule.every().sunday.at("01:00").do(run_weekly_reports)


if __name__ == "__main__":
    print("Started local scheduler for crawler and weekly reports.")
    print("Crawler runs every 30 days and defaults to dry-run. Set CRAWLER_APPLY=true to write JSON output.")
    try:
        while True:
            schedule.run_pending()
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n[Scheduler] Terminated by user.")
