"""FASE 9: Publicações e Canais (publication_channels, publications)

Revision ID: 0025_publications
Revises: 0024_content_pieces
Create Date: 2026-07-04 00:00:00.000000

Canais de publicação (Meta/Instagram/Facebook — conexão real é fase futura) e a fila de
publicações preparadas. A publicação na Meta é stub honesto; 'manual' registra publicação
externa. Nenhuma dependência do workflow existente.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0025_publications"
down_revision: str | None = "0024_content_pieces"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "publication_channels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("brand_slug", sa.String(length=120), nullable=False),
        sa.Column("platform", sa.String(length=40), nullable=False),
        sa.Column("display_name", sa.String(length=160), nullable=False),
        sa.Column("external_id", sa.String(length=160), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
    )
    op.create_index("ix_publication_channels_brand_slug", "publication_channels", ["brand_slug"])
    op.create_index("ix_publication_channels_status", "publication_channels", ["status"])

    op.create_table(
        "publications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("brand_slug", sa.String(length=120), nullable=False),
        sa.Column("channel_id", sa.Integer(),
                  sa.ForeignKey("publication_channels.id"), nullable=True),
        sa.Column("output_id", sa.Integer(), sa.ForeignKey("outputs.id"), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("caption", sa.Text(), nullable=False, server_default=""),
        sa.Column("first_comment", sa.Text(), nullable=True),
        sa.Column("hashtags", sa.Text(), nullable=True),
        sa.Column("media_paths", sa.JSON(), nullable=True),
        sa.Column("post_type", sa.String(length=20), nullable=False, server_default="feed"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("mode", sa.String(length=20), nullable=False, server_default="manual"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("publish_ref", sa.String(length=160), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
    )
    op.create_index("ix_publications_brand_slug", "publications", ["brand_slug"])
    op.create_index("ix_publications_status", "publications", ["status"])


def downgrade() -> None:
    op.drop_index("ix_publications_status", table_name="publications")
    op.drop_index("ix_publications_brand_slug", table_name="publications")
    op.drop_table("publications")
    op.drop_index("ix_publication_channels_status", table_name="publication_channels")
    op.drop_index("ix_publication_channels_brand_slug", table_name="publication_channels")
    op.drop_table("publication_channels")
