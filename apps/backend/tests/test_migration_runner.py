from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_migrate_cli_does_not_import_fastapi_app():
    source = (BACKEND_ROOT / "app" / "migrate.py").read_text(encoding="utf-8")

    assert "from main import" not in source
    assert "from app.migration_runner import run_migrations_and_seeds" in source


def test_main_does_not_own_migration_runner():
    source = (BACKEND_ROOT / "main.py").read_text(encoding="utf-8")

    assert "def _run_migrations_and_seeds" not in source
    assert "alembic.config" not in source
