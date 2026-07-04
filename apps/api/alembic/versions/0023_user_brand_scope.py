"""C1: escopo de marcas por usuario (isolamento/anti-IDOR)

Revision ID: 0023_user_brand_scope
Revises: 0022_calendar_publish
Create Date: 2026-07-03 00:00:00.000000

Aditiva: users.brand_scope (JSON, nullable). NULL/vazio = acesso a todas as marcas
(comportamento atual, retrocompativel). Uma lista restringe o usuario aquelas marcas.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0023_user_brand_scope"
down_revision: str | None = "0022_calendar_publish"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("brand_scope", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "brand_scope")
