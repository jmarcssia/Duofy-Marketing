"""S0 — fluxo crítico: gate do Guardião de Qualidade antes da aprovação.

Invariante protegida: não se aprova um output sem uma revisão de qualidade
aprovada da versão atual. Este comportamento não pode regredir na consolidação.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.anyio


async def test_cannot_approve_without_passing_quality_review(client, auth_headers, patch_ai):
    gen = client.post(
        "/api/content/generate",
        json={
            "brand_slug": "duofy",
            "category": "geral",
            "channel": "instagram",
            "format": "post",
            "briefing": "Divulgar novo produto de tecnologia para gestão.",
            "status": "draft",
        },
        headers=auth_headers,
    )
    assert gen.status_code == 200, gen.text
    output_id = gen.json()["id"]

    # Sem nenhuma revisão de qualidade aprovada, o approve deve ser bloqueado.
    approve = client.post(f"/api/outputs/{output_id}/approve", json={}, headers=auth_headers)
    assert approve.status_code >= 400, approve.text
