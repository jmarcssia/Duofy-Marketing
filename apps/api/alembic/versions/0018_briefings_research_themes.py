"""briefings + research_themes (briefing do orquestrador e banco de temas de pesquisa)

Revision ID: 0018_briefings_research_themes
Revises: 0017_drop_content_scripts
Create Date: 2026-07-02 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0018_briefings_research_themes"
down_revision: str | None = "0017_drop_content_scripts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "research_themes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("brand_slug", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_research_themes_brand_slug", "research_themes", ["brand_slug"])

    op.create_table(
        "briefings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("brand_slug", sa.String(length=120), nullable=True),
        sa.Column("request_text", sa.Text(), nullable=False),
        sa.Column("tipo", sa.String(length=40), nullable=False),
        sa.Column("objetivo", sa.Text(), nullable=False, server_default=""),
        sa.Column("resumo_plano", sa.Text(), nullable=False, server_default=""),
        sa.Column("agente_alvo", sa.String(length=80), nullable=True),
        sa.Column("tema_sugerido", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="pending"),
        sa.Column("model_override", sa.String(length=120), nullable=True),
        sa.Column("research_theme_id", sa.Integer(), sa.ForeignKey("research_themes.id"), nullable=True),
        sa.Column("result_kind", sa.String(length=80), nullable=True),
        sa.Column("result_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_briefings_brand_slug", "briefings", ["brand_slug"])
    op.create_index("ix_briefings_status", "briefings", ["status"])
    op.create_index("ix_briefings_tipo", "briefings", ["tipo"])
    op.create_index("ix_briefings_user_id", "briefings", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_briefings_user_id", table_name="briefings")
    op.drop_index("ix_briefings_tipo", table_name="briefings")
    op.drop_index("ix_briefings_status", table_name="briefings")
    op.drop_index("ix_briefings_brand_slug", table_name="briefings")
    op.drop_table("briefings")
    op.drop_index("ix_research_themes_brand_slug", table_name="research_themes")
    op.drop_table("research_themes")
