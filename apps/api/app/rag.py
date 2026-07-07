from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.embeddings import embed_text, vector_to_sql
from app.settings import get_settings

logger = logging.getLogger(__name__)

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
    allowed_brands: list[str] | None = None,
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
    if allowed_brands is not None:
        # C1 — usuário restrito: limita a busca semântica às marcas permitidas (a lista já
        # inclui a sentinela institucional). Evita vazamento de memória/RAG entre marcas.
        chunk_filters.append("dc.brand_slug = ANY(:allowed_brands)")
        memory_filters.append("me.brand_slug = ANY(:allowed_brands)")
        params["allowed_brands"] = allowed_brands
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
    limit: int | None = None,
) -> str:
    """Monta o contexto RAG (F8): top_k configurável, piso de score, dedup por conteúdo,
    teto de tamanho e log dos trechos usados (origem/marca/score). O objetivo é injetar
    POUCOS trechos relevantes com origem — não um bloco enorme de contexto inútil."""
    settings = get_settings()
    top_k = limit if limit is not None else settings.rag_top_k
    hits = await search_memory(
        db=db,
        query=query,
        brand_slug=brand_slug,
        category=category,
        limit=top_k,
    )
    if not hits:
        return ""

    blocks: list[str] = []
    used: list[tuple] = []
    seen_content: set[str] = set()
    total = 0
    for hit in hits:
        if hit.score < settings.rag_min_score:  # piso de similaridade
            continue
        key = (hit.content or "").strip()[:400]
        if not key or key in seen_content:  # dedup por conteúdo
            continue
        block = "\n".join([
            f"[Memoria {len(blocks) + 1}] {hit.title}",
            f"Marca: {hit.brand_slug} | Categoria: {hit.category} | Fonte: {hit.source_type} "
            f"| Score: {hit.score:.2f}",
            hit.content,
        ])
        if total + len(block) > settings.rag_max_context_chars and blocks:
            break  # respeita o teto de contexto
        seen_content.add(key)
        blocks.append(block)
        used.append((hit.title, hit.brand_slug, round(hit.score, 3)))
        total += len(block)

    if used:
        logger.info("RAG: %d trecho(s) usado(s) para marca=%s → %s", len(used), brand_slug, used)
    else:
        logger.info("RAG: nenhum trecho acima do piso (min_score=%.2f) para marca=%s",
                    settings.rag_min_score, brand_slug)
    return "\n\n".join(blocks)
