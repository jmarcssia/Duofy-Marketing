"""Banco de temas (na Memória): parser de CSV, import, criação manual e exclusão."""

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


async def test_import_list_create_delete(client, auth_headers):
    # importa via CSV
    resp = client.post("/api/themes/import", content=CSV.encode("utf-8"),
                       headers={**auth_headers, "Content-Type": "text/csv"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["inserted"] == 2

    # cria manualmente
    created = client.post("/api/themes", json={
        "title": "Tema manual do usuário", "theme": "sobre gestão de frotas",
        "brand_slug": "postos_combustiveis", "kind": "Post",
    }, headers=auth_headers)
    assert created.status_code == 201, created.text
    theme_id = created.json()["id"]

    # lista contém os três
    listing = client.get("/api/themes", headers=auth_headers)
    assert listing.status_code == 200
    titles = [t["title"] for t in listing.json()]
    assert "Tema manual do usuário" in titles
    assert "Como reduzir custo no posto" in titles

    # exclui o criado
    deleted = client.delete(f"/api/themes/{theme_id}", headers=auth_headers)
    assert deleted.status_code == 204
    after = client.get("/api/themes", headers=auth_headers)
    assert all(t["id"] != theme_id for t in after.json())

    # excluir inexistente -> 404
    assert client.delete("/api/themes/999999", headers=auth_headers).status_code == 404


async def test_filter_by_brand(client, auth_headers):
    client.post("/api/themes", json={"title": "T Posto", "brand_slug": "postos_combustiveis"}, headers=auth_headers)
    client.post("/api/themes", json={"title": "T Death", "brand_slug": "deathcare"}, headers=auth_headers)
    postos = client.get("/api/themes", params={"brand_slug": "postos_combustiveis"}, headers=auth_headers)
    assert postos.status_code == 200
    assert all(t["brand_slug"] == "postos_combustiveis" for t in postos.json())
