from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.embeddings import embed_text, vector_to_sql

# brand_slug sentinela para documentos institucionais (aparecem no RAG de todas as marcas).
INSTITUTIONAL_BRAND = "institucional"


@dataclass(frozen=True)
class MemoryHit:
    id: int
    kind: str
    document_id: int | None
    brand_slug: str
    category: str
    source_type: str
    title: str
    content: str
    score: float


async def search_memory(
    db: AsyncSession,
    query: str,
    brand_slug: str | None = None,
    category: str | None = None,
    source_type: str | None = None,
    limit: int = 8,
) -> list[MemoryHit]:
    embedding = vector_to_sql(await embed_text(db, query))
    chunk_filters = ["dc.embedding IS NOT NULL"]
    memory_filters = [
        "me.embedding IS NOT NULL",
        "(me.expires_at IS NULL OR me.expires_at > now())",
    ]
    params: dict[str, object] = {
        "embedding": embedding,
        "limit": limit,
    }
    if brand_slug:
        # Alem da marca ativa, inclui SEMPRE os documentos institucionais (valem p/ todas).
        chunk_filters.append("(dc.brand_slug = :brand_slug OR dc.brand_slug = :institutional)")
        memory_filters.append("(me.brand_slug = :brand_slug OR me.brand_slug = :institutional)")
        params["brand_slug"] = brand_slug
        params["institutional"] = INSTITUTIONAL_BRAND
    if category:
        chunk_filters.append("dc.category = :category")
        memory_filters.append("me.category = :category")
        params["category"] = category
    if source_type:
        chunk_filters.append("dc.source_type = :source_type")
        memory_filters.append("me.source_type = :source_type")
        params["source_type"] = source_type

    statement = text(
        f"""
        SELECT *
        FROM (
            SELECT
                dc.id AS id,
                'document_chunk' AS kind,
                dc.document_id AS document_id,
                dc.brand_slug AS brand_slug,
                dc.category AS category,
                dc.source_type AS source_type,
                d.filename AS title,
                dc.content AS content,
                1 - (dc.embedding <=> CAST(:embedding AS vector)) AS score
            FROM document_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE {" AND ".join(chunk_filters)}

            UNION ALL

            SELECT
                me.id AS id,
                'memory_entry' AS kind,
                NULL AS document_id,
                me.brand_slug AS brand_slug,
                me.category AS category,
                me.source_type AS source_type,
                me.title AS title,
                me.content AS content,
                1 - (me.embedding <=> CAST(:embedding AS vector)) AS score
            FROM memory_entries me
            WHERE {" AND ".join(memory_filters)}
        ) ranked
        ORDER BY score DESC
        LIMIT :limit
        """
    )
    result = await db.execute(statement, params)
    return [
        MemoryHit(
            id=row.id,
            kind=row.kind,
            document_id=row.document_id,
            brand_slug=row.brand_slug,
            category=row.category,
            source_type=row.source_type,
            title=row.title,
            content=row.content,
            score=float(row.score or 0),
        )
        for row in result
    ]


async def build_rag_context(
    db: AsyncSession,
    query: str,
    brand_slug: str | None = None,
    category: str | None = None,
    limit: int = 5,
) -> str:
    hits = await search_memory(
        db=db,
        query=query,
        brand_slug=brand_slug,
        category=category,
        limit=limit,
    )
    if not hits:
        return ""

    blocks = []
    for index, hit in enumerate(hits, start=1):
        blocks.append(
            "\n".join(
                [
                    f"[Memoria {index}] {hit.title}",
                    (
                        f"Marca: {hit.brand_slug} | Categoria: {hit.category} | "
                        f"Fonte: {hit.source_type}"
                    ),
                    hit.content,
                ]
            )
        )
    return "\n\n".join(blocks)
