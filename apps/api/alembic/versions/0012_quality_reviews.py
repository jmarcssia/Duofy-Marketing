"""quality reviews

Revision ID: 0012_quality_reviews
Revises: 0011_output_comments
Create Date: 2026-06-22 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012_quality_reviews"
down_revision: str | None = "0011_output_comments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "quality_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("output_id", sa.Integer(), sa.ForeignKey("outputs.id"), nullable=False),
        sa.Column(
            "version_id",
            sa.Integer(),
            sa.ForeignKey("output_versions.id"),
            nullable=False,
        ),
        sa.Column("agent_run_id", sa.Integer(), sa.ForeignKey("agent_runs.id"), nullable=True),
        sa.Column(
            "reviewer_slug",
            sa.String(length=120),
            nullable=False,
            server_default="quality_guardian",
        ),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("critical_failures", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("required_fixes", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("optional_improvements", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("verified_sources", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("raw_report", sa.Text(), nullable=False, server_default=""),
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
    op.create_index("ix_quality_reviews_output_id", "quality_reviews", ["output_id"])
    op.create_index("ix_quality_reviews_version_id", "quality_reviews", ["version_id"])
    op.create_index("ix_quality_reviews_reviewer_slug", "quality_reviews", ["reviewer_slug"])
    op.create_index("ix_quality_reviews_status", "quality_reviews", ["status"])
    op.create_index("ix_quality_reviews_passed", "quality_reviews", ["passed"])


def downgrade() -> None:
    op.drop_index("ix_quality_reviews_passed", table_name="quality_reviews")
    op.drop_index("ix_quality_reviews_status", table_name="quality_reviews")
    op.drop_index("ix_quality_reviews_reviewer_slug", table_name="quality_reviews")
    op.drop_index("ix_quality_reviews_version_id", table_name="quality_reviews")
    op.drop_index("ix_quality_reviews_output_id", table_name="quality_reviews")
    op.drop_table("quality_reviews")
