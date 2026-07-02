"""S1 — o modelo escolhido para o agente deve ser o efetivamente executado.

Antes da correção, `credential.default_model or model` fazia o default do provider
sobrepor o modelo pedido. Aqui garantimos que o modelo do request/agente vence e é
o que chega ao provedor e o que fica persistido em AgentRun.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db import AsyncSessionLocal

pytestmark = pytest.mark.anyio

# Diferente do default do provider openrouter no conftest (~anthropic/claude-sonnet-latest).
CHOSEN = "~anthropic/claude-3.5-sonnet"


async def test_content_uses_chosen_model_not_provider_default(client, auth_headers, patch_ai):
    resp = client.post(
        "/api/content/generate",
        json={
            "brand_slug": "duofy",
            "channel": "instagram",
            "format": "post",
            "briefing": "Divulgar novo produto de tecnologia para gestão.",
            "model": CHOSEN,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text

    # O modelo enviado ao provedor é o escolhido — não o default do provider.
    assert patch_ai.calls[0]["model"] == CHOSEN
    # E o provider de um modelo "~anthropic/..." é OpenRouter (roteamento consistente).
    assert patch_ai.calls[0]["provider"] == "openrouter"

    # Persistência: AgentRun guarda o modelo efetivo.
    async with AsyncSessionLocal() as db:
        model = (await db.execute(text("SELECT model FROM agent_runs LIMIT 1"))).scalar_one()
    assert model == CHOSEN
