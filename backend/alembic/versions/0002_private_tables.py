"""Prevent Supabase Data API clients from accessing backend-owned health tables."""
from alembic import op
import sqlalchemy as sa

revision = "0002_private_tables"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

TABLES = (
    "participants", "studies", "connections", "ingestion_runs", "raw_records",
    "sleep_sessions", "sleep_segments", "heart_rate_samples", "step_intervals",
    "daily_summaries",
)


def upgrade():
    if op.get_context().dialect.name == "postgresql":
        for table in TABLES:
            op.execute(sa.text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))


def downgrade():
    if op.get_context().dialect.name == "postgresql":
        for table in TABLES:
            op.execute(sa.text(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY'))
