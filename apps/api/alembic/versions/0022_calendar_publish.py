"""calendar F4: campos de publicacao (arquitetura Meta preparada, sem integracao)

Revision ID: 0022_calendar_publish
Revises: 0021_calendar_pause
Create Date: 2026-07-03 00:00:00.000000

Aditiva: estado de publicacao no evento. A integracao real (Meta) NAO e implementada aqui —
apenas o contrato/arquitetura + caminho manual (o gestor publica fora e registra).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0022_calendar_publish"
down_revision: str | None = "0021_calendar_pause"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "calendar_events",
        sa.Column(
            "publish_status",
            sa.String(length=30),
            nullable=False,
            server_default="not_published",
        ),
    )
    op.add_column(
        "calendar_events",
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "calendar_events",
        sa.Column("publish_target", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "calendar_events",
        sa.Column("publish_ref", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("calendar_events", "publish_ref")
    op.drop_column("calendar_events", "publish_target")
    op.drop_column("calendar_events", "published_at")
    op.drop_column("calendar_events", "publish_status")
