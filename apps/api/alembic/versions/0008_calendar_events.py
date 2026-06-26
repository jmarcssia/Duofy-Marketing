"""calendar events

Revision ID: 0008_calendar_events
Revises: 0007_memory_output_learning
Create Date: 2026-06-20 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_calendar_events"
down_revision: str | None = "0007_memory_output_learning"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "calendar_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("brand_slug", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False, server_default="general"),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="planned"),
        sa.Column("channel", sa.String(length=80), nullable=True),
        sa.Column("format", sa.String(length=80), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_agent_slug", sa.String(length=120), nullable=True),
        sa.Column("execution_payload", sa.JSON(), nullable=True),
        sa.Column("output_id", sa.Integer(), sa.ForeignKey("outputs.id"), nullable=True),
        sa.Column("agent_run_id", sa.Integer(), sa.ForeignKey("agent_runs.id"), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_calendar_events_brand_slug", "calendar_events", ["brand_slug"])
    op.create_index("ix_calendar_events_event_type", "calendar_events", ["event_type"])
    op.create_index("ix_calendar_events_status", "calendar_events", ["status"])
    op.create_index("ix_calendar_events_channel", "calendar_events", ["channel"])
    op.create_index("ix_calendar_events_format", "calendar_events", ["format"])
    op.create_index("ix_calendar_events_start_at", "calendar_events", ["start_at"])
    op.create_index(
        "ix_calendar_events_assigned_agent_slug",
        "calendar_events",
        ["assigned_agent_slug"],
    )


def downgrade() -> None:
    op.drop_index("ix_calendar_events_assigned_agent_slug", table_name="calendar_events")
    op.drop_index("ix_calendar_events_start_at", table_name="calendar_events")
    op.drop_index("ix_calendar_events_format", table_name="calendar_events")
    op.drop_index("ix_calendar_events_channel", table_name="calendar_events")
    op.drop_index("ix_calendar_events_status", table_name="calendar_events")
    op.drop_index("ix_calendar_events_event_type", table_name="calendar_events")
    op.drop_index("ix_calendar_events_brand_slug", table_name="calendar_events")
    op.drop_table("calendar_events")
