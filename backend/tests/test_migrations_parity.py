"""The ORM models (incl. UTCDateTime / new_uuid) must not drift from Alembic."""
from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine

from app.config import settings

BACKEND = Path(__file__).resolve().parents[1]


def test_alembic_head_matches_models_on_sqlite(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migrations.db'}"
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    monkeypatch.setattr(settings, "MIGRATION_DATABASE_URL", "")
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    command.upgrade(cfg, "head")

    import app.models  # noqa: F401
    from app.db.session import Base

    engine = create_engine(url)
    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": True})
        diff = compare_metadata(ctx, Base.metadata)
    engine.dispose()

    def _is_sqlite_uuid_reflection_noise(item) -> bool:
        # SQLite reflects the UUID-typed columns as NUMERIC (type-affinity quirk). That
        # difference exists in the original migrations too and is not a model drift.
        flat = item if not isinstance(item, list) else item[0]
        return (
            isinstance(flat, tuple)
            and flat[0] == "modify_type"
            and type(flat[-1]).__name__.upper() in ("UUID", "UUID_")
        )

    real = [d for d in diff if not _is_sqlite_uuid_reflection_noise(d)]
    assert real == [], f"models differ from migrations: {real}"
