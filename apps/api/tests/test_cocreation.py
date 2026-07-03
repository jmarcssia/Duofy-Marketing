"""S0 — Agente de Cocriacao: pacote estruturado, canais diferentes, prompts independentes."""

from __future__ import annotations

import json

import pytest

from app.cocreation_service import _extract_json, has_forbidden_prompt, validate_package
from app.schemas import ContentPackage

pytestmark = pytest.mark.anyio


def _good_package(brand: str = "duofy") -> dict:
    return {
        "brand_slug": brand,
        "channel": "Instagram",
        "format": "Carrossel",
        "persona": "Gestor de operacoes",
        "objetivo": "Autoridade e consideracao",
        "etapa_funil": "topo",
        "analise_estrategica": "Angulo de eficiencia operacional [1].",
        "conceito": "O dado que muda a decisao do dia",
        "arco_narrativo": "promessa -> contexto -> solucao -> fechamento",
        "cta": "Comente 'quero' para receber o guia.",
        "captions": {
            "instagram": "Legenda leve e proxima, leitura rapida. Salve este post!",
            "linkedin": "Analise executiva com implicacao de negocio e CTA profissional.",
        },
        "slides": [
            {"numero": 1, "funcao": "promessa", "texto": "O dado que voce ignora",
             "texto_arte": "O DADO QUE VOCE IGNORA", "image_prompt": "Foto editorial realista, "
             "proporcao 4:5, escritorio brasileiro, luz suave, espaco de seguranca no topo.",
             "alt_text": "Mesa de escritorio"},
            {"numero": 2, "funcao": "contexto", "texto": "Por que isso importa",
             "texto_arte": "POR QUE IMPORTA", "image_prompt": "Foto realista 4:5 de um gestor "
             "analisando um painel, composicao limpa, paleta sobria.", "alt_text": "Gestor"},
            {"numero": 3, "funcao": "fechamento", "texto": "Comece hoje",
             "texto_arte": "COMECE HOJE", "image_prompt": "Foto 4:5 minimalista, ambiente de "
             "trabalho, hierarquia clara, espaco de respiro a direita.", "alt_text": "Ambiente"},
        ],
        "visual_direction": {"conceito": "editorial", "estilo": "fotografia realista",
                             "paleta": "sobria", "restricoes": "sem logo, sem neon"},
        "factualidade": ["Interpretacao de eficiencia; numeros dependem de fonte."],
        "checklist": ["Marca correta", "Canais diferentes", "Prompts independentes"],
    }


def _patch_llm(monkeypatch, pkg: dict):
    from app.llm import LLMResult

    async def fake(**kwargs):
        return LLMResult(output=json.dumps(pkg), provider="openrouter", model="m")

    monkeypatch.setattr("app.cocreation_service.call_llm", fake)


def test_validate_package_flags_same_caption():
    pkg = ContentPackage.model_validate(_good_package())
    pkg.captions["linkedin"] = pkg.captions["instagram"]
    warns = validate_package(pkg)
    assert any("mesma legenda" in w.lower() for w in warns)


def test_validate_package_flags_forbidden_prompt():
    data = _good_package()
    data["slides"][0]["image_prompt"] = "Foto com o logo da TOTVS e hashtag #gestao"
    pkg = ContentPackage.model_validate(data)
    warns = validate_package(pkg)
    assert any("proibido" in w.lower() for w in warns)


def test_extract_json_tolerates_llm_noise():
    # fences de code block
    assert _extract_json('```json\n{"a": 1}\n```')["a"] == 1
    # virgula final antes de fechar
    assert _extract_json('{"a": 1, "b": 2,}')["b"] == 2
    # quebra de linha literal dentro de string (invalido em JSON estrito)
    assert "\n" in _extract_json('{"texto": "linha1\nlinha2"}')["texto"]
    # texto ao redor do objeto
    assert _extract_json('Segue o JSON: {"x": "ok"} pronto.')["x"] == "ok"


def test_has_forbidden_prompt_detects_tokens():
    assert has_forbidden_prompt("insira o logo aqui")
    assert has_forbidden_prompt("adicione @duofy e #marketing")
    assert not has_forbidden_prompt("foto editorial realista de um escritorio")


async def test_generate_returns_structured_package(client, auth_headers, patch_ai, monkeypatch, db):
    _patch_llm(monkeypatch, _good_package("duofy"))
    resp = client.post(
        "/api/cocreation/generate",
        json={"brand_slug": "duofy", "theme": "O dado que todo gestor deveria olhar",
              "channel": "Instagram", "format": "Carrossel"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    pkg = body["package"]
    # canais diferentes
    assert pkg["captions"]["instagram"] != pkg["captions"]["linkedin"]
    # carrossel com prompt independente por slide, sem termos proibidos
    assert len(pkg["slides"]) == 3
    for s in pkg["slides"]:
        assert s["image_prompt"].strip()
        assert "logo" not in s["image_prompt"].lower()
        assert "#" not in s["image_prompt"] and "@" not in s["image_prompt"]
    assert body["warnings"] == []
    assert "output_id" in body and body["version_number"] == 1


async def test_generate_persists_and_get_package(client, auth_headers, patch_ai, monkeypatch):
    _patch_llm(monkeypatch, _good_package("duofy"))
    gen = client.post(
        "/api/cocreation/generate",
        json={"brand_slug": "duofy", "theme": "Tema de teste de persistencia"},
        headers=auth_headers,
    )
    assert gen.status_code == 200, gen.text
    oid = gen.json()["output_id"]
    got = client.get(f"/api/cocreation/{oid}", headers=auth_headers)
    assert got.status_code == 200, got.text
    assert got.json()["package"]["captions"]["instagram"]


async def test_refine_creates_new_version(client, auth_headers, patch_ai, monkeypatch):
    _patch_llm(monkeypatch, _good_package("duofy"))
    gen = client.post(
        "/api/cocreation/generate",
        json={"brand_slug": "duofy", "theme": "Refino de cocriacao"},
        headers=auth_headers,
    )
    oid = gen.json()["output_id"]
    refined = _good_package("duofy")
    refined["cta"] = "Novo CTA aprovado."
    _patch_llm(monkeypatch, refined)
    resp = client.post(
        f"/api/cocreation/{oid}/refine",
        json={"target": "cta", "instruction": "deixe o CTA mais direto"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["version_number"] == 2
    assert resp.json()["package"]["cta"] == "Novo CTA aprovado."
