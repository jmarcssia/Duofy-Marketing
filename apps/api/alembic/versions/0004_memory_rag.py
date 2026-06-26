"""create memory documents rag tables"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0004_memory_rag"
down_revision = "0003_provider_creds_runs"
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
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("source_type", sa.String(length=80), nullable=False),
        sa.Column("url", sa.String(length=1000), nullable=True),
        timestamp_column("created_at"),
        timestamp_column("updated_at"),
    )
    op.create_index("ix_sources_source_type", "sources", ["source_type"])

    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("sources.id"), nullable=True),
        sa.Column("brand_slug", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False),
        sa.Column("filename", sa.String(length=500), nullable=False),
        sa.Column("stored_path", sa.String(length=1000), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="uploaded"),
        sa.Column("error", sa.Text(), nullable=True),
        timestamp_column("created_at"),
        timestamp_column("updated_at"),
    )
    op.create_index("ix_documents_brand_slug", "documents", ["brand_slug"])
    op.create_index("ix_documents_category", "documents", ["category"])
    op.create_index("ix_documents_status", "documents", ["status"])

    op.create_table(
        "document_chunks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("document_id", sa.Integer(), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("brand_slug", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False),
        sa.Column("source_type", sa.String(length=80), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("embedding", sa.Text(), nullable=True),
        timestamp_column("created_at"),
        timestamp_column("updated_at"),
    )
    op.execute(
        "ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(1536) "
        "USING embedding::vector(1536)"
    )
    op.create_index("ix_document_chunks_document_id", "document_chunks", ["document_id"])
    op.create_index("ix_document_chunks_brand_slug", "document_chunks", ["brand_slug"])
    op.create_index("ix_document_chunks_category", "document_chunks", ["category"])
    op.create_index("ix_document_chunks_source_type", "document_chunks", ["source_type"])

    op.create_table(
        "memory_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("brand_slug", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False),
        sa.Column("source_type", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("sources.id"), nullable=True),
        sa.Column("embedding", sa.Text(), nullable=True),
        timestamp_column("created_at"),
        timestamp_column("updated_at"),
    )
    op.execute(
        "ALTER TABLE memory_entries ALTER COLUMN embedding TYPE vector(1536) "
        "USING embedding::vector(1536)"
    )
    op.create_index("ix_memory_entries_brand_slug", "memory_entries", ["brand_slug"])
    op.create_index("ix_memory_entries_category", "memory_entries", ["category"])
    op.create_index("ix_memory_entries_source_type", "memory_entries", ["source_type"])


def downgrade() -> None:
    op.drop_index("ix_memory_entries_source_type", table_name="memory_entries")
    op.drop_index("ix_memory_entries_category", table_name="memory_entries")
    op.drop_index("ix_memory_entries_brand_slug", table_name="memory_entries")
    op.drop_table("memory_entries")
    op.drop_index("ix_document_chunks_source_type", table_name="document_chunks")
    op.drop_index("ix_document_chunks_category", table_name="document_chunks")
    op.drop_index("ix_document_chunks_brand_slug", table_name="document_chunks")
    op.drop_index("ix_document_chunks_document_id", table_name="document_chunks")
    op.drop_table("document_chunks")
    op.drop_index("ix_documents_status", table_name="documents")
    op.drop_index("ix_documents_category", table_name="documents")
    op.drop_index("ix_documents_brand_slug", table_name="documents")
    op.drop_table("documents")
    op.drop_index("ix_sources_source_type", table_name="sources")
    op.drop_table("sources")
