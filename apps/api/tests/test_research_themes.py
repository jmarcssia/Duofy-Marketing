"""S0 — CRUD + import do banco de temas de pesquisa, isolado por marca."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.anyio


async def test_create_list_delete_research_theme(client, auth_headers):
    created = client.post(
        "/api/research-themes",
        json={"title": "Tendencias de IA no varejo", "notes": "foco Q3", "brand_slug": "duofy"},
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    theme_id = created.json()["id"]

    listed = client.get("/api/research-themes?brand_slug=duofy", headers=auth_headers)
    assert listed.status_code == 200, listed.text
    assert any(t["id"] == theme_id for t in listed.json())

    # marca diferente não vê
    other = client.get("/api/research-themes?brand_slug=postos", headers=auth_headers)
    assert all(t["id"] != theme_id for t in other.json())

    deleted = client.delete(f"/api/research-themes/{theme_id}", headers=auth_headers)
    assert deleted.status_code == 204, deleted.text


async def test_search_filter_q(client, auth_headers):
    client.post("/api/research-themes", json={"title": "Precos de combustivel", "brand_slug": "postos"}, headers=auth_headers)
    client.post("/api/research-themes", json={"title": "Logistica reversa", "brand_slug": "postos"}, headers=auth_headers)
    found = client.get("/api/research-themes?brand_slug=postos&q=combustivel", headers=auth_headers)
    assert found.status_code == 200
    titles = [t["title"] for t in found.json()]
    assert "Precos de combustivel" in titles
    assert "Logistica reversa" not in titles


async def test_import_csv(client, auth_headers):
    csv_body = "TITULO;NOTAS\nMercado de energia solar;crescimento 2026\nHidrogenio verde;\n"
    res = client.post(
        "/api/research-themes/import?brand_slug=postos",
        content=csv_body,
        headers={**auth_headers, "Content-Type": "text/csv"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["inserted"] >= 2
