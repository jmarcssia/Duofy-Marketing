"""F2b: peças/subpeças aprovaveis por peça (content_pieces)

Revision ID: 0024_content_pieces
Revises: 0023_user_brand_scope
Create Date: 2026-07-03 00:00:00.000000

Peças derivadas do ContentPackage (carrossel, legendas, direção visual) + peças manuais
(WhatsApp, e-mail, blog, release...), cada uma com status proprio. NAO cria 2o sistema de
aprovacao: quando as peças OBRIGATORIAS ficam aprovadas, o Output de conteudo e aprovado pelo
fluxo existente.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0024_content_pieces"
down_revision: str | None = "0023_user_brand_scope"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "content_pieces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("output_id", sa.Integer(), sa.ForeignKey("outputs.id"), nullable=False),
        sa.Column("brand_slug", sa.String(length=120), nullable=False),
        sa.Column("kind", sa.String(length=60), nullable=False),
        sa.Column("label", sa.String(length=160), nullable=False),
        sa.Column("channel", sa.String(length=80), nullable=True),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("origin", sa.String(length=20), nullable=False, server_default="derived"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("decided_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
    )
    op.create_index("ix_content_pieces_output_id", "content_pieces", ["output_id"])
    op.create_index("ix_content_pieces_brand_slug", "content_pieces", ["brand_slug"])
    op.create_index("ix_content_pieces_status", "content_pieces", ["status"])


def downgrade() -> None:
    op.drop_index("ix_content_pieces_status", table_name="content_pieces")
    op.drop_index("ix_content_pieces_brand_slug", table_name="content_pieces")
    op.drop_index("ix_content_pieces_output_id", table_name="content_pieces")
    op.drop_table("content_pieces")
