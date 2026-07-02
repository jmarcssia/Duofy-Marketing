"""Banco de temas: parser de CSV e import via endpoint (contexto da cocriação)."""

from __future__ import annotations

import pytest

from app.theme_import import parse_themes_csv

pytestmark = pytest.mark.anyio

CSV = (
    "PROGRAMA / WEBINAR / PODCAST;TEMA;TITULO;PRODUTO;PUBLICO;TIPO;RESP;STATUS\n"
    ";;Como reduzir custo no posto;Posto;Gestores;Webinar;TOTVS;selecionado\n"
    "PULSAR;Governanca;Governanca no setor funerario;Deathcare;Mercado;webserie;DUOFY;\n"
    ";;;;;;;\n"  # linha vazia -> ignorada
    "SO CABECALHO DE GRUPO;;;;;;;\n"  # sem titulo/tema -> ignorada
)


def test_parse_themes_csv_maps_brands_and_skips_empty():
    themes = parse_themes_csv(CSV)
    assert len(themes) == 2
    assert themes[0]["title"] == "Como reduzir custo no posto"
    assert themes[0]["brand_slug"] == "postos_combustiveis"
    assert themes[1]["brand_slug"] == "deathcare"
    assert themes[1]["theme"] == "Governanca"


async def test_import_endpoint_and_listing(client, auth_headers):
    resp = client.post("/api/calendar/themes/import", content=CSV.encode("utf-8"),
                       headers={**auth_headers, "Content-Type": "text/csv"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["inserted"] == 2

    # reimportar não duplica
    resp2 = client.post("/api/calendar/themes/import", content=CSV.encode("utf-8"),
                        headers={**auth_headers, "Content-Type": "text/csv"})
    assert resp2.json()["inserted"] == 0

    listing = client.get("/api/calendar/themes", headers=auth_headers)
    assert listing.status_code == 200
    titles = [t["title"] for t in listing.json()]
    assert "Como reduzir custo no posto" in titles

    # filtro por marca
    postos = client.get("/api/calendar/themes", params={"brand_slug": "postos_combustiveis"},
                        headers=auth_headers)
    assert all(t["brand_slug"] == "postos_combustiveis" for t in postos.json())
