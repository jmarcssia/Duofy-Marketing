"""metrics reports

Revision ID: 0009_metrics_reports
Revises: 0008_calendar_events
Create Date: 2026-06-20 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_metrics_reports"
down_revision: str | None = "0008_calendar_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "model_calls",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_type", sa.String(length=80), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=True),
        sa.Column("agent_slug", sa.String(length=120), nullable=True),
        sa.Column("brand_slug", sa.String(length=120), nullable=True),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("model", sa.String(length=255), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("raw_usage", sa.JSON(), nullable=True),
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
    op.create_index("ix_model_calls_task_type", "model_calls", ["task_type"])
    op.create_index("ix_model_calls_agent_slug", "model_calls", ["agent_slug"])
    op.create_index("ix_model_calls_brand_slug", "model_calls", ["brand_slug"])
    op.create_index("ix_model_calls_provider", "model_calls", ["provider"])
    op.create_index("ix_model_calls_model", "model_calls", ["model"])
    op.create_index("ix_model_calls_status", "model_calls", ["status"])

    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("report_type", sa.String(length=80), nullable=False),
        sa.Column("brand_slug", sa.String(length=120), nullable=True),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("summary", sa.JSON(), nullable=True),
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
    op.create_index("ix_reports_report_type", "reports", ["report_type"])
    op.create_index("ix_reports_brand_slug", "reports", ["brand_slug"])


def downgrade() -> None:
    op.drop_index("ix_reports_brand_slug", table_name="reports")
    op.drop_index("ix_reports_report_type", table_name="reports")
    op.drop_table("reports")
    op.drop_index("ix_model_calls_status", table_name="model_calls")
    op.drop_index("ix_model_calls_model", table_name="model_calls")
    op.drop_index("ix_model_calls_provider", table_name="model_calls")
    op.drop_index("ix_model_calls_brand_slug", table_name="model_calls")
    op.drop_index("ix_model_calls_agent_slug", table_name="model_calls")
    op.drop_index("ix_model_calls_task_type", table_name="model_calls")
    op.drop_table("model_calls")
