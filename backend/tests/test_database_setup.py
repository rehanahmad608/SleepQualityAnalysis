import pytest
from sqlalchemy import create_engine, func, select

from app.config import Settings
from app.db.session import Base, build_engine
from app.models.participant import Participant
from migrate_sqlite import copy_data


def test_supabase_url_uses_installed_driver():
    settings = Settings(_env_file=None, DATABASE_URL="postgresql://postgres:password@db.example.supabase.co/postgres")
    engine = build_engine(settings.DATABASE_URL)
    assert engine.url.drivername == "postgresql+psycopg"
    assert engine.url.query["sslmode"] == "require"
    engine.dispose()


def test_copy_preserves_ids_and_refuses_existing_data(db_session, seeded_demo):
    target = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(target)
    source = db_session.connection()
    # copy_data accepts an engine; use the existing transaction's connection.
    class Source:
        def connect(self):
            from contextlib import nullcontext
            return nullcontext(source)
    counts = copy_data(Source(), target)
    with target.connect() as conn:
        assert conn.scalar(select(func.count()).select_from(Participant)) == 0
    assert counts["participants"] == 1
    copy_data(Source(), target, apply=True)
    with target.connect() as conn:
        assert conn.scalar(select(Participant.id)) == source.scalar(select(Participant.id))
    with pytest.raises(ValueError, match="not empty"):
        copy_data(Source(), target, apply=True)
    target.dispose()
