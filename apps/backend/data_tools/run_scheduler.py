# -*- coding: utf-8 -*-
import schedule
import time
import subprocess
import os

def run_crawler():
    print("\n[Scheduler] Starting OliveYoung crawler...")
    script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "oliveyoung_crawler.py")
    try:
        subprocess.run(["python", script_path], check=True)
        print("[Scheduler] Crawler finished successfully.")
    except Exception as e:
        print(f"[Scheduler] Error running crawler: {e}")

# Run every Sunday at midnight
schedule.every().sunday.at("00:00").do(run_crawler)

if __name__ == "__main__":
    print("Started Local Background Scheduler for OliveYoung DB Crawler.")
    print("The crawler will run every Sunday at 00:00.")
    print("Waiting for scheduled tasks... (Press Ctrl+C to exit)")

    try:
        while True:
            schedule.run_pending()
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n[Scheduler] Terminated by user.")
