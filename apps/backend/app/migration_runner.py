import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

from app.database import SessionLocal
from app.database_seed import seed_cosmetics_data, seed_medications_data


logger = logging.getLogger("migration_runner")


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[1]


def run_migrations_and_seeds() -> None:
    """Run DB migrations and static seed imports from deploy/CLI context."""
    alembic_cfg = Config(str(_backend_root() / "alembic.ini"))
    command.upgrade(alembic_cfg, "head")
    logger.info("[migrate] Alembic migration complete")

    db = SessionLocal()
    try:
        seed_cosmetics_data(db)
        seed_medications_data(db)
        logger.info("[migrate] static seed complete")
    finally:
        db.close()
