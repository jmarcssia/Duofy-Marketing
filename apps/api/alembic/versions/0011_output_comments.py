"""output comments

Revision ID: 0011_output_comments
Revises: 0010_chat_tasks
Create Date: 2026-06-22 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0011_output_comments"
down_revision: str | None = "0010_chat_tasks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "output_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("output_id", sa.Integer(), sa.ForeignKey("outputs.id"), nullable=False),
        sa.Column(
            "version_id",
            sa.Integer(),
            sa.ForeignKey("output_versions.id"),
            nullable=True,
        ),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("anchor_text", sa.String(length=500), nullable=True),
        sa.Column("selected_text", sa.Text(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="open"),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_output_comments_output_id", "output_comments", ["output_id"])
    op.create_index("ix_output_comments_version_id", "output_comments", ["version_id"])
    op.create_index("ix_output_comments_status", "output_comments", ["status"])


def downgrade() -> None:
    op.drop_index("ix_output_comments_status", table_name="output_comments")
    op.drop_index("ix_output_comments_version_id", table_name="output_comments")
    op.drop_index("ix_output_comments_output_id", table_name="output_comments")
    op.drop_table("output_comments")
