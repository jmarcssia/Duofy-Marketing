"""calendar workflow: evento como unidade de trabalho (pesquisa -> aprovacao -> cocriacao)

Revision ID: 0020_calendar_workflow
Revises: 0019_output_structured_json
Create Date: 2026-07-03 00:00:00.000000

Aditiva: amplia calendar_events com campos de workflow. Nenhuma tabela nova; reusa
outputs/agent_tasks/briefings/users por referencia (sem duplicar conteudo).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0020_calendar_workflow"
down_revision: str | None = "0019_output_structured_json"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "calendar_events",
        sa.Column(
            "execution_mode",
            sa.String(length=20),
            nullable=False,
            server_default="manual",
        ),
    )
    op.add_column(
        "calendar_events",
        sa.Column("auto_execute_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "calendar_events",
        sa.Column(
            "requires_research_approval",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "calendar_events",
        sa.Column(
            "current_step",
            sa.String(length=40),
            nullable=False,
            server_default="briefing",
        ),
    )
    op.add_column(
        "calendar_events",
        sa.Column("objective", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "calendar_events",
        sa.Column("research_output_id", sa.Integer(), sa.ForeignKey("outputs.id"), nullable=True),
    )
    op.add_column(
        "calendar_events",
        sa.Column("content_output_id", sa.Integer(), sa.ForeignKey("outputs.id"), nullable=True),
    )
    op.add_column(
        "calendar_events",
        sa.Column("briefing_id", sa.Integer(), sa.ForeignKey("briefings.id"), nullable=True),
    )
    op.add_column(
        "calendar_events",
        sa.Column("agent_task_id", sa.Integer(), sa.ForeignKey("agent_tasks.id"), nullable=True),
    )
    op.add_column(
        "calendar_events",
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index(
        "ix_calendar_events_current_step", "calendar_events", ["current_step"]
    )


def downgrade() -> None:
    op.drop_index("ix_calendar_events_current_step", table_name="calendar_events")
    op.drop_column("calendar_events", "created_by")
    op.drop_column("calendar_events", "agent_task_id")
    op.drop_column("calendar_events", "briefing_id")
    op.drop_column("calendar_events", "content_output_id")
    op.drop_column("calendar_events", "research_output_id")
    op.drop_column("calendar_events", "objective")
    op.drop_column("calendar_events", "current_step")
    op.drop_column("calendar_events", "requires_research_approval")
    op.drop_column("calendar_events", "auto_execute_at")
    op.drop_column("calendar_events", "execution_mode")
