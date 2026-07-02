"""output_versions.structured_json (pacote estruturado da cocriacao)

Revision ID: 0019_output_version_structured_json
Revises: 0018_briefings_research_themes
Create Date: 2026-07-02 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0019_output_structured_json"
down_revision: str | None = "0018_briefings_research_themes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("output_versions", sa.Column("structured_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("output_versions", "structured_json")
