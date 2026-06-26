"""indices ANN (HNSW) para busca vetorial RAG

Revision ID: 0015_vector_indexes
Revises: 0014_audit_events
Create Date: 2026-06-26 00:00:00.000000

Sem estes indices a busca semantica (rag.py, operador cosseno `<=>`) faz
sequential scan em document_chunks e memory_entries, computando distancia em
1536 dimensoes por linha — degrada de ms para segundos conforme o corpus cresce.
HNSW exige pgvector >= 0.5 (container roda 0.8.x) e casa com vector_cosine_ops.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0015_vector_indexes"
down_revision: str | None = "0014_audit_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_document_chunks_embedding_hnsw "
        "ON document_chunks USING hnsw (embedding vector_cosine_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_memory_entries_embedding_hnsw "
        "ON memory_entries USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_memory_entries_embedding_hnsw")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_hnsw")
