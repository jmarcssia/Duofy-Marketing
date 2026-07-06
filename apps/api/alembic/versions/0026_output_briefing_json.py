"""Briefing estruturado (filtros clicáveis) persistido no Output.

Revision ID: 0026_output_briefing_json
Revises: 0025_publications
Create Date: 2026-07-05
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0026_output_briefing_json"
down_revision: str | None = "0025_publications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("outputs", sa.Column("briefing_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("outputs", "briefing_json")
