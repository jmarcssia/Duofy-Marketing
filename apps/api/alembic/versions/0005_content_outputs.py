"""create content outputs tables"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0005_content_outputs"
down_revision = "0004_memory_rag"
branch_labels = None
depends_on = None


def timestamp_column(name: str) -> sa.Column:
    return sa.Column(
        name,
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
    )


def upgrade() -> None:
    op.create_table(
        "outputs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("brand_slug", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False, server_default="general"),
        sa.Column("channel", sa.String(length=80), nullable=False),
        sa.Column("format", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("briefing", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="draft"),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("model", sa.String(length=255), nullable=False),
        sa.Column("agent_run_id", sa.Integer(), sa.ForeignKey("agent_runs.id"), nullable=True),
        sa.Column("current_version_id", sa.Integer(), nullable=True),
        timestamp_column("created_at"),
        timestamp_column("updated_at"),
    )
    op.create_index("ix_outputs_brand_slug", "outputs", ["brand_slug"])
    op.create_index("ix_outputs_category", "outputs", ["category"])
    op.create_index("ix_outputs_channel", "outputs", ["channel"])
    op.create_index("ix_outputs_format", "outputs", ["format"])
    op.create_index("ix_outputs_status", "outputs", ["status"])

    op.create_table(
        "output_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("output_id", sa.Integer(), sa.ForeignKey("outputs.id"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("editor_note", sa.Text(), nullable=True),
        timestamp_column("created_at"),
        timestamp_column("updated_at"),
    )
    op.create_index("ix_output_versions_output_id", "output_versions", ["output_id"])
    op.create_unique_constraint(
        "uq_output_versions_output_version",
        "output_versions",
        ["output_id", "version_number"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_output_versions_output_version",
        "output_versions",
        type_="unique",
    )
    op.drop_index("ix_output_versions_output_id", table_name="output_versions")
    op.drop_table("output_versions")
    op.drop_index("ix_outputs_status", table_name="outputs")
    op.drop_index("ix_outputs_format", table_name="outputs")
    op.drop_index("ix_outputs_channel", table_name="outputs")
    op.drop_index("ix_outputs_category", table_name="outputs")
    op.drop_index("ix_outputs_brand_slug", table_name="outputs")
    op.drop_table("outputs")
