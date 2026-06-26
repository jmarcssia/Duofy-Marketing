"""create auth layout seed tables"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0002_auth_layout_seed_tables"
down_revision = "0001_enable_pgvector"
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
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="manager"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        timestamp_column("created_at"),
        timestamp_column("updated_at"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "brands",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("niche", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        timestamp_column("created_at"),
        timestamp_column("updated_at"),
    )
    op.create_index("ix_brands_slug", "brands", ["slug"], unique=True)

    op.create_table(
        "agents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("default_model", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        timestamp_column("created_at"),
        timestamp_column("updated_at"),
    )
    op.create_index("ix_agents_slug", "agents", ["slug"], unique=True)

    op.create_table(
        "settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        timestamp_column("created_at"),
        timestamp_column("updated_at"),
    )
    op.create_index("ix_settings_key", "settings", ["key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_settings_key", table_name="settings")
    op.drop_table("settings")
    op.drop_index("ix_agents_slug", table_name="agents")
    op.drop_table("agents")
    op.drop_index("ix_brands_slug", table_name="brands")
    op.drop_table("brands")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
