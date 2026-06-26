"""create provider credentials and agent runs"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0003_provider_creds_runs"
down_revision = "0002_auth_layout_seed_tables"
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
        "provider_credentials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("display_name", sa.String(length=160), nullable=False),
        sa.Column("api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("base_url", sa.String(length=500), nullable=True),
        sa.Column("default_model", sa.String(length=255), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        timestamp_column("created_at"),
        timestamp_column("updated_at"),
    )
    op.create_index(
        "ix_provider_credentials_provider",
        "provider_credentials",
        ["provider"],
        unique=True,
    )

    op.create_table(
        "agent_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("agent_slug", sa.String(length=120), nullable=False),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("model", sa.String(length=255), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("output", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="completed"),
        sa.Column("error", sa.Text(), nullable=True),
        timestamp_column("created_at"),
        timestamp_column("updated_at"),
    )
    op.create_index("ix_agent_runs_agent_slug", "agent_runs", ["agent_slug"])


def downgrade() -> None:
    op.drop_index("ix_agent_runs_agent_slug", table_name="agent_runs")
    op.drop_table("agent_runs")
    op.drop_index("ix_provider_credentials_provider", table_name="provider_credentials")
    op.drop_table("provider_credentials")
