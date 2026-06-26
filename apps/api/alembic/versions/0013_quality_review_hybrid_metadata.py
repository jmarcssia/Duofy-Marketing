"""quality review hybrid metadata

Revision ID: 0013_quality_review_hybrid
Revises: 0012_quality_reviews
Create Date: 2026-06-22 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013_quality_review_hybrid"
down_revision: str | None = "0012_quality_reviews"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "quality_reviews",
        sa.Column(
            "review_mode",
            sa.String(length=40),
            nullable=False,
            server_default="local_only",
        ),
    )
    op.add_column(
        "quality_reviews",
        sa.Column("llm_provider", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "quality_reviews",
        sa.Column("llm_model", sa.String(length=255), nullable=True),
    )
    op.add_column("quality_reviews", sa.Column("llm_error", sa.Text(), nullable=True))
    op.add_column("quality_reviews", sa.Column("confidence", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("quality_reviews", "confidence")
    op.drop_column("quality_reviews", "llm_error")
    op.drop_column("quality_reviews", "llm_model")
    op.drop_column("quality_reviews", "llm_provider")
    op.drop_column("quality_reviews", "review_mode")
