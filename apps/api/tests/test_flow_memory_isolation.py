"""S4 — memória/RAG: isolamento por marca e resiliência de embeddings."""

from __future__ import annotations

import pytest

from app.embeddings import _local_embedding, embed_text, vector_to_sql
from app.models import MemoryEntry

pytestmark = pytest.mark.anyio


async def _add_memory(db, brand_slug: str, title: str, content: str):
    db.add(MemoryEntry(
        brand_slug=brand_slug,
        category="geral",
        source_type="manual",
        title=title,
        content=content,
        embedding=vector_to_sql(_local_embedding(content)),
    ))
    await db.commit()


async def test_rag_search_is_brand_isolated(client, auth_headers, patch_ai, db):
    await _add_memory(db, "duofy", "nota-duofy", "estratégia de tecnologia para gestão")
    await _add_memory(db, "postos", "nota-postos-secreta", "promoção de combustível confidencial")

    resp = client.post(
        "/api/memory/search",
        json={"query": "estratégia", "brand_slug": "duofy", "limit": 10},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    hits = resp.json()
    assert hits, "esperava ao menos um resultado da marca duofy"
    assert all(h["brand_slug"] == "duofy" for h in hits)
    assert all("postos" not in (h.get("title") or "") for h in hits)


async def test_embed_text_falls_back_on_provider_error(db, monkeypatch):
    class _BoomClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            raise RuntimeError("provedor indisponível")

    monkeypatch.setattr("app.embeddings.httpx.AsyncClient", _BoomClient)

    # provider openai_embeddings está habilitado no seed (chave fictícia) → tenta HTTP,
    # que falha; deve cair para o embedding local em vez de propagar erro.
    vector = await embed_text(db, "texto qualquer para embutir")
    assert isinstance(vector, list)
    assert len(vector) == 1536
