"""content themes and scripts (banco de temas + roteiros)

Revision ID: 0016_content_themes_scripts
Revises: 0015_vector_indexes
Create Date: 2026-07-02 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0016_content_themes_scripts"
down_revision: str | None = "0015_vector_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "content_themes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("theme", sa.Text(), nullable=False, server_default=""),
        sa.Column("brand_slug", sa.String(length=120), nullable=True),
        sa.Column("audience", sa.String(length=255), nullable=True),
        sa.Column("kind", sa.String(length=120), nullable=True),
        sa.Column("owner", sa.String(length=120), nullable=True),
        sa.Column("status", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_content_themes_brand_slug", "content_themes", ["brand_slug"])
    op.create_index("ix_content_themes_kind", "content_themes", ["kind"])
    op.create_index("ix_content_themes_status", "content_themes", ["status"])

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


def downgrade() -> None:
    op.drop_index("ix_content_scripts_status", table_name="content_scripts")
    op.drop_index("ix_content_scripts_brand_slug", table_name="content_scripts")
    op.drop_table("content_scripts")
    op.drop_index("ix_content_themes_status", table_name="content_themes")
    op.drop_index("ix_content_themes_kind", table_name="content_themes")
    op.drop_index("ix_content_themes_brand_slug", table_name="content_themes")
    op.drop_table("content_themes")
