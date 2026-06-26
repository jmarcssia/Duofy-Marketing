"""create research sources table"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0006_research_sources"
down_revision = "0005_content_outputs"
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
        "research_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("output_id", sa.Integer(), sa.ForeignKey("outputs.id"), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("url", sa.String(length=1200), nullable=False),
        sa.Column("publisher", sa.String(length=255), nullable=True),
        sa.Column("published_at", sa.String(length=120), nullable=True),
        sa.Column(
            "accessed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("reliability", sa.String(length=1), nullable=False, server_default="D"),
        sa.Column("source_kind", sa.String(length=40), nullable=False, server_default="http"),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="collected"),
        sa.Column("evidence", sa.Text(), nullable=False, server_default=""),
        sa.Column("error", sa.Text(), nullable=True),
        timestamp_column("created_at"),
        timestamp_column("updated_at"),
    )
    op.create_index("ix_research_sources_output_id", "research_sources", ["output_id"])
    op.create_index("ix_research_sources_status", "research_sources", ["status"])


def downgrade() -> None:
    op.drop_index("ix_research_sources_status", table_name="research_sources")
    op.drop_index("ix_research_sources_output_id", table_name="research_sources")
    op.drop_table("research_sources")
