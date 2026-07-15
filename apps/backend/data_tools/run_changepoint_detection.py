"""Run daily changepoint detection as a one-off cron process."""

from __future__ import annotations

import logging

from app.services.changepoint_service import run_daily_changepoint_detection


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
    try:
        run_daily_changepoint_detection()
    except Exception:
        logging.getLogger(__name__).exception("changepoint cron run failed")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
