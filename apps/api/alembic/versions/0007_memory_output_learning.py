"""link memory entries to outputs and temporary learning"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0007_memory_output_learning"
down_revision = "0006_research_sources"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "memory_entries",
        sa.Column("output_id", sa.Integer(), sa.ForeignKey("outputs.id"), nullable=True),
    )
    op.add_column(
        "memory_entries",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_memory_entries_output_id", "memory_entries", ["output_id"])
    op.create_index("ix_memory_entries_expires_at", "memory_entries", ["expires_at"])

    op.create_table(
        "output_decisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("output_id", sa.Integer(), sa.ForeignKey("outputs.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column(
            "memory_entry_id",
            sa.Integer(),
            sa.ForeignKey("memory_entries.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_output_decisions_output_id", "output_decisions", ["output_id"])
    op.create_index("ix_output_decisions_action", "output_decisions", ["action"])


def downgrade() -> None:
    op.drop_index("ix_output_decisions_action", table_name="output_decisions")
    op.drop_index("ix_output_decisions_output_id", table_name="output_decisions")
    op.drop_table("output_decisions")
    op.drop_index("ix_memory_entries_expires_at", table_name="memory_entries")
    op.drop_index("ix_memory_entries_output_id", table_name="memory_entries")
    op.drop_column("memory_entries", "expires_at")
    op.drop_column("memory_entries", "output_id")
