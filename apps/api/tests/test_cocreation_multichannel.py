"""Cocriação multicanal (FASE 6) — canais multiselect, peças extras e validação.

Cobre: Instagram + LinkedIn com o MESMO carrossel e legendas diferentes; WhatsApp com
mensagem + prompt de imagem opcional; E-mail + WhatsApp juntos (nutrição); explosão das
extra_pieces em content_pieces; warnings quando peça pedida não vem; e a validação que
só exige legendas dos canais sociais selecionados.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from app.cocreation_service import (
    requested_caption_channels,
    requested_extra_kinds,
    validate_package,
)
from app.models import ContentPiece
from app.schemas import ContentPackage, CreationRequest

pytestmark = pytest.mark.anyio


def _base_package(extra_pieces: list[dict] | None = None) -> dict:
    return {
        "brand_slug": "duofy",
        "channel": "Instagram",
        "format": "Carrossel",
        "persona": "Gestor de operacoes",
        "objetivo": "Nutrição e autoridade",
        "etapa_funil": "meio",
        "analise_estrategica": "Angulo de eficiencia operacional.",
        "conceito": "O dado que muda a decisao",
        "arco_narrativo": "promessa -> contexto -> fechamento",
        "cta": "Fale com um especialista.",
        "captions": {
            "instagram": "Legenda proxima e leve para o feed. Salve este post!",
            "linkedin": "Analise executiva com implicacao de negocio.",
        },
        "slides": [
            {"numero": 1, "funcao": "promessa", "texto": "Abertura",
             "texto_arte": "ABERTURA", "image_prompt": "Foto editorial 4:5, luz suave.",
             "alt_text": "Abertura"},
            {"numero": 2, "funcao": "fechamento", "texto": "Fechamento",
             "texto_arte": "FECHA", "image_prompt": "Foto 4:5 minimalista, respiro.",
             "alt_text": "Fechamento"},
        ],
        "visual_direction": {"conceito": "editorial", "estilo": "foto realista"},
        "extra_pieces": extra_pieces or [],
        "factualidade": ["Interpretacao, sem numeros inventados."],
        "checklist": ["Canais ok"],
    }


def _patch_llm(monkeypatch, pkg: dict):
    from app.llm import LLMResult

    async def fake(**kwargs):
        return LLMResult(output=json.dumps(pkg), provider="openrouter", model="m")

    monkeypatch.setattr("app.cocreation_service.call_llm", fake)


def test_requested_caption_channels_defaults_and_multichannel() -> None:
    classic = CreationRequest(brand_slug="duofy", theme="tema")
    assert requested_caption_channels(classic) == ["instagram", "linkedin"]
    nutrition = CreationRequest(
        brand_slug="duofy", theme="tema", channel="WhatsApp",
        channels=["WhatsApp", "E-mail"],
    )
    assert requested_caption_channels(nutrition) == []  # nenhum canal social
    multi = CreationRequest(
        brand_slug="duofy", theme="tema", channel="Instagram",
        channels=["Instagram", "LinkedIn", "WhatsApp"],
    )
    assert requested_caption_channels(multi) == ["instagram", "linkedin"]


def test_requested_extra_kinds_from_pieces_and_channels() -> None:
    payload = CreationRequest(
        brand_slug="duofy", theme="tema", channel="Instagram",
        channels=["Instagram", "WhatsApp", "E-mail"],
        pieces=["whatsapp_image_prompt", "desconhecida"],
    )
    kinds = requested_extra_kinds(payload)
    assert kinds == ["whatsapp_image_prompt", "whatsapp", "email"]


def test_validate_only_requires_selected_social_captions() -> None:
    pkg = ContentPackage.model_validate(
        {**_base_package(), "captions": {}, "slides": [], "format": "Mensagem"}
    )
    nutrition = CreationRequest(
        brand_slug="duofy", theme="tema", channel="WhatsApp", channels=["WhatsApp"],
        pieces=["whatsapp"],
    )
    warns = validate_package(pkg, nutrition)
    assert not any("legenda" in w.lower() for w in warns)
    assert any("whatsapp" in w.lower() for w in warns)  # peça pedida e não gerada


async def test_generate_multichannel_explodes_extra_pieces(
    client, auth_headers, patch_ai, monkeypatch, db
):
    extra = [
        {"kind": "whatsapp", "label": "Mensagem WhatsApp", "channel": "WhatsApp",
         "content": "Oi! Vi que você gerencia postos...\n--- Alternativa ---\nOlá!"},
        {"kind": "whatsapp_image_prompt", "label": "Prompt imagem WhatsApp",
         "channel": "WhatsApp", "content": "Foto quadrada, frentista sorrindo, luz natural."},
        {"kind": "email", "label": "E-mail", "channel": "E-mail",
         "content": "Assunto: Reduza perdas\nPreheader: ...\nCorpo: ...\nCTA: Agendar conversa"},
    ]
    _patch_llm(monkeypatch, _base_package(extra))
    resp = client.post(
        "/api/cocreation/generate",
        json={
            "brand_slug": "duofy",
            "theme": "Nutrição multicanal",
            "channel": "Instagram",
            "format": "Carrossel",
            "channels": ["Instagram", "LinkedIn", "WhatsApp", "E-mail"],
            "pieces": ["whatsapp", "whatsapp_image_prompt", "email"],
            "briefing_filters": {"finalidade": "Nutrição de leads"},
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["warnings"] == []
    pkg = body["package"]
    # mesmo carrossel para IG e LinkedIn, legendas diferentes
    assert len(pkg["slides"]) == 2
    assert pkg["captions"]["instagram"] != pkg["captions"]["linkedin"]
    assert len(pkg["extra_pieces"]) == 3

    # explosão: peças derivadas incluem as extras com os kinds certos
    pieces = (
        (await db.execute(
            select(ContentPiece).where(ContentPiece.output_id == body["output_id"])
        )).scalars().all()
    )
    kinds = {p.kind for p in pieces}
    assert {"carousel", "caption_instagram", "caption_linkedin",
            "whatsapp", "whatsapp_image_prompt", "email"} <= kinds
    # briefing_filters persistido no Output
    from app.models import Output

    output = await db.get(Output, body["output_id"])
    assert output is not None
    assert output.briefing_json == {"finalidade": "Nutrição de leads"}


async def test_generate_warns_when_requested_piece_missing(
    client, auth_headers, patch_ai, monkeypatch
):
    _patch_llm(monkeypatch, _base_package([]))  # modelo não gerou as extras
    resp = client.post(
        "/api/cocreation/generate",
        json={
            "brand_slug": "duofy",
            "theme": "Pedimos WhatsApp mas não veio",
            "channel": "Instagram",
            "format": "Carrossel",
            "channels": ["Instagram", "LinkedIn", "WhatsApp"],
            "pieces": ["whatsapp"],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    assert any("whatsapp" in w.lower() for w in resp.json()["warnings"])


async def test_cocreation_c1_blocks_cross_brand(client, auth_headers, patch_ai, monkeypatch, db):
    """C1 na cocriação: gerar para marca fora do escopo → 404; ler pacote alheio → 404."""
    from uuid import uuid4

    from app.models import User
    from app.security import create_access_token, hash_password

    _patch_llm(monkeypatch, _base_package())
    gen = client.post(
        "/api/cocreation/generate",
        json={"brand_slug": "postos", "theme": "Pacote da outra marca"},
        headers=auth_headers,
    )
    assert gen.status_code == 200, gen.text
    oid = gen.json()["output_id"]

    scoped = User(
        email=f"cocre-{uuid4().hex[:10]}@t.com", name="Scoped",
        password_hash=hash_password("x" * 10), role="manager", is_active=True,
        brand_scope=["duofy"],
    )
    db.add(scoped)
    await db.commit()
    await db.refresh(scoped)
    headers = {"Authorization": f"Bearer {create_access_token(scoped)}"}

    assert client.get(f"/api/cocreation/{oid}", headers=headers).status_code == 404
    blocked = client.post(
        "/api/cocreation/generate",
        json={"brand_slug": "postos", "theme": "Tentativa cross-brand"},
        headers=headers,
    )
    assert blocked.status_code == 404
    refine = client.post(
        f"/api/cocreation/{oid}/refine",
        json={"target": "cta", "instruction": "mais direto"},
        headers=headers,
    )
    assert refine.status_code == 404
