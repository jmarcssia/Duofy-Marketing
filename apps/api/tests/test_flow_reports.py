"""S5 — métricas rebaixadas a módulo: relatórios funcionam sem o agente metrics_agent.

Relatório interno é puramente determinístico (agrega ModelCall etc.), sem LLM nem
linha de Agent. Este teste protege esse comportamento após a remoção do roster.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.anyio


async def test_generate_internal_metrics_report(client, auth_headers):
    resp = client.post(
        "/api/reports/generate",
        json={"report_type": "internal_metrics", "title": "Relatório de teste"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"]
    assert body["report_type"] == "internal_metrics"
    # aparece na listagem
    listing = client.get("/api/reports", headers=auth_headers)
    assert listing.status_code == 200
    assert any(r["id"] == body["id"] for r in listing.json())
