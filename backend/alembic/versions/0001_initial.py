"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-07 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "participants",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("participant_code", sa.String(length=50), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("participant_code"),
    )
    op.create_index(op.f("ix_participants_participant_code"), "participants", ["participant_code"], unique=True)

    op.create_table(
        "studies",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("participant_id", sa.UUID(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date_exclusive", sa.Date(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("calculation_version", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_studies_participant_id"), "studies", ["participant_id"], unique=False)

    op.create_table(
        "connections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("participant_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_user_id", sa.String(length=255), nullable=True),
        sa.Column("granted_scopes", sa.Text(), nullable=True),
        sa.Column("encrypted_refresh_token", sa.Text(), nullable=True),
        sa.Column("token_expiry", sa.DateTime(timezone=True), nullable=True),
        sa.Column("connection_status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["participant_id"], ["participants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_connections_participant_id"), "connections", ["participant_id"], unique=False)

    op.create_table(
        "ingestion_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("study_id", sa.UUID(), nullable=False),
        sa.Column("mode", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_range", sa.JSON(), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("error_code", sa.String(length=128), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["study_id"], ["studies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ingestion_runs_study_id"), "ingestion_runs", ["study_id"], unique=False)

    op.create_table(
        "raw_records",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("run_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("resource_key", sa.String(length=255), nullable=False),
        sa.Column("payload_hash", sa.String(length=128), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("schema_version", sa.String(length=16), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["ingestion_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_raw_records_resource_key"), "raw_records", ["resource_key"], unique=False)
    op.create_index(op.f("ix_raw_records_run_id"), "raw_records", ["run_id"], unique=False)

    op.create_table(
        "sleep_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("study_id", sa.UUID(), nullable=False),
        sa.Column("provider_session_key", sa.String(length=255), nullable=False),
        sa.Column("source_id", sa.String(length=255), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("wake_date", sa.Date(), nullable=False),
        sa.Column("asleep_seconds", sa.Integer(), nullable=True),
        sa.Column("in_bed_seconds", sa.Integer(), nullable=True),
        sa.Column("is_main", sa.Boolean(), nullable=False),
        sa.Column("classification_origin", sa.String(length=32), nullable=False),
        sa.Column("raw_record_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["raw_record_id"], ["raw_records.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["study_id"], ["studies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("study_id", "provider_session_key", name="uq_sleep_session_study_provider"),
    )
    op.create_index(op.f("ix_sleep_sessions_start_at"), "sleep_sessions", ["start_at"], unique=False)
    op.create_index(op.f("ix_sleep_sessions_study_id"), "sleep_sessions", ["study_id"], unique=False)
    op.create_index(op.f("ix_sleep_sessions_wake_date"), "sleep_sessions", ["wake_date"], unique=False)

    op.create_table(
        "sleep_segments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("sleep_session_id", sa.UUID(), nullable=False),
        sa.Column("segment_key", sa.String(length=255), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stage_label", sa.String(length=32), nullable=False),
        sa.Column("segment_kind", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["sleep_session_id"], ["sleep_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sleep_session_id", "segment_key", name="uq_sleep_segment_session_key"),
    )
    op.create_index(op.f("ix_sleep_segments_sleep_session_id"), "sleep_segments", ["sleep_session_id"], unique=False)

    op.create_table(
        "heart_rate_samples",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("study_id", sa.UUID(), nullable=False),
        sa.Column("provider_sample_key", sa.String(length=255), nullable=False),
        sa.Column("source_id", sa.String(length=255), nullable=True),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("bpm", sa.Float(), nullable=False),
        sa.Column("raw_record_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["raw_record_id"], ["raw_records.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["study_id"], ["studies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("study_id", "provider_sample_key", name="uq_hr_study_provider"),
    )
    op.create_index(op.f("ix_heart_rate_samples_observed_at"), "heart_rate_samples", ["observed_at"], unique=False)
    op.create_index(op.f("ix_heart_rate_samples_study_id"), "heart_rate_samples", ["study_id"], unique=False)

    op.create_table(
        "step_intervals",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("study_id", sa.UUID(), nullable=False),
        sa.Column("provider_interval_key", sa.String(length=255), nullable=False),
        sa.Column("source_id", sa.String(length=255), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("step_count", sa.Integer(), nullable=False),
        sa.Column("raw_record_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["raw_record_id"], ["raw_records.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["study_id"], ["studies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("study_id", "provider_interval_key", name="uq_steps_study_provider"),
    )
    op.create_index(op.f("ix_step_intervals_start_at"), "step_intervals", ["start_at"], unique=False)
    op.create_index(op.f("ix_step_intervals_study_id"), "step_intervals", ["study_id"], unique=False)

    op.create_table(
        "daily_summaries",
        sa.Column("study_id", sa.UUID(), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("steps", sa.Integer(), nullable=True),
        sa.Column("main_sleep_seconds", sa.Integer(), nullable=True),
        sa.Column("total_sleep_seconds", sa.Integer(), nullable=True),
        sa.Column("resting_bpm", sa.Float(), nullable=True),
        sa.Column("observed_mean_bpm", sa.Float(), nullable=True),
        sa.Column("heart_rate_samples", sa.Integer(), nullable=False),
        sa.Column("sleep_efficiency_pct", sa.Float(), nullable=True),
        sa.Column("coverage_flags", sa.JSON(), nullable=False),
        sa.Column("is_provisional", sa.Boolean(), nullable=False),
        sa.Column("data_quality", sa.String(length=32), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("calculated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["study_id"], ["studies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("study_id", "local_date"),
        sa.UniqueConstraint("study_id", "local_date", name="uq_daily_summary_study_date"),
    )


def downgrade() -> None:
    op.drop_table("daily_summaries")
    op.drop_index(op.f("ix_step_intervals_study_id"), table_name="step_intervals")
    op.drop_index(op.f("ix_step_intervals_start_at"), table_name="step_intervals")
    op.drop_table("step_intervals")
    op.drop_index(op.f("ix_heart_rate_samples_study_id"), table_name="heart_rate_samples")
    op.drop_index(op.f("ix_heart_rate_samples_observed_at"), table_name="heart_rate_samples")
    op.drop_table("heart_rate_samples")
    op.drop_index(op.f("ix_sleep_segments_sleep_session_id"), table_name="sleep_segments")
    op.drop_table("sleep_segments")
    op.drop_index(op.f("ix_sleep_sessions_wake_date"), table_name="sleep_sessions")
    op.drop_index(op.f("ix_sleep_sessions_study_id"), table_name="sleep_sessions")
    op.drop_index(op.f("ix_sleep_sessions_start_at"), table_name="sleep_sessions")
    op.drop_table("sleep_sessions")
    op.drop_index(op.f("ix_raw_records_run_id"), table_name="raw_records")
    op.drop_index(op.f("ix_raw_records_resource_key"), table_name="raw_records")
    op.drop_table("raw_records")
    op.drop_index(op.f("ix_ingestion_runs_study_id"), table_name="ingestion_runs")
    op.drop_table("ingestion_runs")
    op.drop_index(op.f("ix_connections_participant_id"), table_name="connections")
    op.drop_table("connections")
    op.drop_index(op.f("ix_studies_participant_id"), table_name="studies")
    op.drop_table("studies")
    op.drop_index(op.f("ix_participants_participant_code"), table_name="participants")
    op.drop_table("participants")
