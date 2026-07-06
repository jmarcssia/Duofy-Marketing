"""Correções dos agentes de Pesquisa/Cocriação (2026-07-06).

- Coerção de depth: rótulos pt-BR da UI ("Rápida"/"Padrão"/"Profunda") nunca quebram o enum.
- Cocriação a partir de pesquisa: só pesquisa da MESMA marca e APROVADA vira contexto.
- Termos placeholder de concorrente proibidos no prompt de pesquisa.
"""

from __future__ import annotations

import json

import pytest

from app.agent_rules import forbidden_terms_for
from app.models import Output, OutputVersion
from app.schemas import CreationRequest, ResearchRunRequest

pytestmark = pytest.mark.anyio


def _patch_llm(monkeypatch, pkg: dict):
    from app.llm import LLMResult

    async def fake(**kwargs):
        return LLMResult(output=json.dumps(pkg), provider="openrouter", model="m")

    monkeypatch.setattr("app.cocreation_service.call_llm", fake)


def _base_package() -> dict:
    return {
        "brand_slug": "duofy", "channel": "Instagram", "format": "Carrossel",
        "persona": "Gestor", "objetivo": "Autoridade", "cta": "Fale conosco.",
        "captions": {"instagram": "Legenda IG leve.", "linkedin": "Análise executiva B2B."},
        "slides": [
            {"numero": 1, "funcao": "abertura", "texto": "A", "texto_arte": "A",
             "image_prompt": "Foto 4:5 editorial.", "alt_text": "A"},
            {"numero": 2, "funcao": "fechamento", "texto": "B", "texto_arte": "B",
             "image_prompt": "Foto 4:5 minimal.", "alt_text": "B"},
        ],
        "visual_direction": {"conceito": "editorial"}, "extra_pieces": [],
        "factualidade": ["Sem números inventados."], "checklist": ["ok"],
    }


# ---------------------------------------------------------- coerção de depth

def test_research_depth_labels_coerce():
    assert ResearchRunRequest(brand_slug="x", theme="tema teste", depth="Rápida").depth == "quick"
    assert ResearchRunRequest(brand_slug="x", theme="tema teste", depth="rapida").depth == "quick"
    assert ResearchRunRequest(brand_slug="x", theme="tema teste", depth="Padrão").depth == "standard"
    assert ResearchRunRequest(brand_slug="x", theme="tema teste", depth="Profunda").depth == "deep"
    assert ResearchRunRequest(brand_slug="x", theme="tema teste", depth="consultiva").depth == "deep"


def test_cocreation_depth_labels_coerce():
    # Cocriação só tem quick|deep: "Padrão" (standard) colapsa para deep.
    assert CreationRequest(brand_slug="x", theme="tt", depth="Rápida").depth == "quick"
    assert CreationRequest(brand_slug="x", theme="tt", depth="profunda").depth == "deep"
    assert CreationRequest(brand_slug="x", theme="tt", depth="padrao").depth == "deep"
    # Valor desconhecido cai no default seguro (nunca levanta erro bruto).
    assert CreationRequest(brand_slug="x", theme="tt", depth="xyz").depth == "quick"


async def test_cocreation_api_accepts_pt_depth_label(client, auth_headers, patch_ai, monkeypatch):
    """POST com depth="Profunda" (rótulo pt) não deve dar 422 de enum — coage e roda."""
    _patch_llm(monkeypatch, _base_package())
    resp = client.post(
        "/api/cocreation/generate",
        json={"brand_slug": "duofy", "theme": "Tema", "channel": "Instagram",
              "format": "Carrossel", "depth": "Profunda"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text


# ------------------------------------------- cocriação a partir de pesquisa

async def _research_output(db, brand: str, status: str) -> Output:
    output = Output(brand_slug=brand, category="research", channel="Pesquisa",
                    format="research_report", title="Pesquisa X", briefing="b",
                    status=status, provider="openrouter", model="m")
    db.add(output)
    await db.flush()
    version = OutputVersion(output_id=output.id, version_number=1, content="Relatório real.")
    db.add(version)
    await db.flush()
    output.current_version_id = version.id
    await db.commit()
    await db.refresh(output)
    return output


async def test_cocreation_from_cross_brand_research_404(client, auth_headers, db):
    other = await _research_output(db, "postos", "approved")
    resp = client.post(
        "/api/cocreation/generate",
        json={"brand_slug": "duofy", "theme": "Tema teste", "research_output_id": other.id},
        headers=auth_headers,
    )
    assert resp.status_code == 404
    assert "marca" in resp.json()["detail"].lower()


async def test_cocreation_from_unapproved_research_400(client, auth_headers, db):
    draft = await _research_output(db, "duofy", "draft")
    resp = client.post(
        "/api/cocreation/generate",
        json={"brand_slug": "duofy", "theme": "Tema teste", "research_output_id": draft.id},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "aprovada" in resp.json()["detail"].lower()


async def test_cocreation_from_approved_research_ok(client, auth_headers, patch_ai, monkeypatch, db):
    approved = await _research_output(db, "duofy", "approved")
    _patch_llm(monkeypatch, _base_package())
    resp = client.post(
        "/api/cocreation/generate",
        json={"brand_slug": "duofy", "theme": "Tema teste", "channel": "Instagram",
              "format": "Carrossel", "research_output_id": approved.id},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text


# --------------------------------------------------- anti-placeholder config

def test_research_forbidden_includes_competitor_placeholders():
    forb = [t.lower() for t in forbidden_terms_for("research_agent")]
    assert "empresa a" in forb
    assert "concorrente x" in forb
    assert "player 1" in forb
