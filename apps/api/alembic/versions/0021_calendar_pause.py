"""calendar F3: pausar/retomar automacao (is_paused)

Revision ID: 0021_calendar_pause
Revises: 0020_calendar_workflow
Create Date: 2026-07-03 00:00:00.000000

Aditiva: flag de pausa da execucao automatica. Idempotencia/historico continuam reusando
AgentTask + lock Redis; nenhuma tabela nova.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0021_calendar_pause"
down_revision: str | None = "0020_calendar_workflow"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "calendar_events",
        sa.Column(
            "is_paused",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("calendar_events", "is_paused")
