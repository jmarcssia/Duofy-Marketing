"""drop content_scripts (roteiros removidos — simplificação do calendário)

Revision ID: 0017_drop_content_scripts
Revises: 0016_content_themes_scripts
Create Date: 2026-07-02 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0017_drop_content_scripts"
down_revision: str | None = "0016_content_themes_scripts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("ix_content_scripts_status", table_name="content_scripts")
    op.drop_index("ix_content_scripts_brand_slug", table_name="content_scripts")
    op.drop_table("content_scripts")


def downgrade() -> None:
    op.create_table(
        "content_scripts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("brand_slug", sa.String(length=120), nullable=True),
        sa.Column("recording_status", sa.String(length=120), nullable=True),
        sa.Column("script", sa.Text(), nullable=False, server_default=""),
        sa.Column("scenes", sa.Text(), nullable=True),
        sa.Column("lettering", sa.Text(), nullable=True),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_content_scripts_brand_slug", "content_scripts", ["brand_slug"])
    op.create_index("ix_content_scripts_status", "content_scripts", ["status"])
