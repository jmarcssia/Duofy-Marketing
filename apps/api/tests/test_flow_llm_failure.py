"""Regressão: quando o LLM falha, o erro real deve aparecer (não um MissingGreenlet).

Bug: no bloco de erro, `agent.slug` era acessado após `db.rollback()` — o rollback
expira o objeto ORM e o acesso dispara um lazy-load síncrono → greenlet_spawn error,
mascarando o erro real do provedor.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db import AsyncSessionLocal

pytestmark = pytest.mark.anyio


async def test_content_generate_surfaces_real_error_not_greenlet(client, auth_headers, patch_ai, monkeypatch):
    async def boom(*args, **kwargs):
        raise RuntimeError("provedor de LLM indisponível")

    # patch_ai já mocka embed_text (evita rede); aqui forçamos o call_llm a falhar.
    monkeypatch.setattr("app.content_generation.call_llm", boom)

    resp = client.post(
        "/api/content/generate",
        json={"brand_slug": "duofy", "channel": "Instagram",
              "format": "Carrossel", "briefing": "Teste de falha do provedor de LLM."},
        headers=auth_headers,
    )
    assert resp.status_code >= 400
    assert "greenlet" not in resp.text.lower()
    assert "provedor de LLM indisponível" in resp.text

    # o AgentRun falho foi registrado (o tratador de erro concluiu sem quebrar)
    async with AsyncSessionLocal() as db:
        n = (await db.execute(
            text("SELECT count(*) FROM agent_runs WHERE status='failed'")
        )).scalar_one()
    assert n == 1
