"""Entrega V1 para teste real (2026-07-06): Guardião automático, ajuste com feedback,
RAG com qualidade, upload MD/YAML, pacote vazio e no-silent-fallback de embedding."""

from __future__ import annotations

import json

import pytest
from sqlalchemy import func, select

from app.models import DocumentChunk, QualityReview
from app.schemas import CreationRequest

pytestmark = pytest.mark.anyio


def _patch_llm(monkeypatch, pkg: dict):
    from app.llm import LLMResult

    async def fake(**kwargs):
        return LLMResult(output=json.dumps(pkg), provider="openrouter", model="m")

    monkeypatch.setattr("app.cocreation_service.call_llm", fake)


def _pkg(extra=None) -> dict:
    return {
        "brand_slug": "duofy", "channel": "Instagram", "format": "Carrossel",
        "persona": "Gestor", "objetivo": "Autoridade", "cta": "Fale conosco.",
        "captions": {"instagram": "Legenda IG.", "linkedin": "Análise B2B."},
        "slides": [{"numero": 1, "funcao": "abertura", "texto": "A", "texto_arte": "A",
                    "image_prompt": "Foto 4:5.", "alt_text": "A"}],
        "visual_direction": {"conceito": "editorial"}, "extra_pieces": extra or [],
        "factualidade": ["ok"], "checklist": ["ok"],
    }


# ---------------------------------------------- F1: Guardião automático

async def test_guardian_runs_after_cocreation(client, auth_headers, patch_ai, monkeypatch, db):
    _patch_llm(monkeypatch, _pkg())
    resp = client.post(
        "/api/cocreation/generate",
        json={"brand_slug": "duofy", "theme": "Tema teste", "channel": "Instagram",
              "format": "Carrossel"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    output_id = resp.json()["output_id"]
    n = (await db.execute(
        select(func.count(QualityReview.id)).where(QualityReview.output_id == output_id)
    )).scalar_one()
    assert n >= 1  # o Guardião rodou automaticamente e persistiu a avaliação


# ---------------------------------------------- F9: pacote vazio rejeitado

async def test_empty_package_rejected(client, auth_headers, patch_ai, monkeypatch):
    _patch_llm(monkeypatch, {})  # LLM devolve pacote vazio
    resp = client.post(
        "/api/cocreation/generate",
        json={"brand_slug": "duofy", "theme": "Tema teste", "channel": "Instagram",
              "format": "Carrossel"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "vazio" in resp.json()["detail"].lower()


# ---------------------------------------------- F2: refino cria nova versão

async def test_guardian_refine_creates_new_version(client, auth_headers, patch_ai, monkeypatch):
    _patch_llm(monkeypatch, _pkg())
    gen = client.post(
        "/api/cocreation/generate",
        json={"brand_slug": "duofy", "theme": "Tema teste", "channel": "Instagram",
              "format": "Carrossel"},
        headers=auth_headers,
    )
    assert gen.status_code == 200, gen.text
    oid = gen.json()["output_id"]
    v1 = gen.json()["version_number"]
    ref = client.post(
        f"/api/cocreation/{oid}/refine",
        json={"target": "guardian", "use_guardian_feedback": True, "human_note": "Deixe o CTA mais claro."},
        headers=auth_headers,
    )
    assert ref.status_code == 200, ref.text
    assert ref.json()["version_number"] > v1  # nova versão, histórico preservado


# ---------------------------------------------- F7: upload MD/YAML gera chunks

async def _upload(client, headers, filename, content: bytes, ctype: str, brand="duofy"):
    return client.post(
        "/api/documents/upload",
        files={"file": (filename, content, ctype)},
        data={"brand_slug": brand},
        headers=headers,
    )


async def test_markdown_upload_generates_chunks(client, auth_headers, patch_ai, db):
    body = ("# Tom de voz\n\n" + "Objetividade e clareza comercial. " * 60).encode("utf-8")
    resp = await _upload(client, auth_headers, "tom.md", body, "text/markdown")
    assert resp.status_code in (200, 201), resp.text
    doc_id = resp.json()["id"]
    n = (await db.execute(
        select(func.count(DocumentChunk.id)).where(DocumentChunk.document_id == doc_id)
    )).scalar_one()
    assert n >= 1


async def test_yaml_upload_generates_chunks(client, auth_headers, patch_ai, db):
    body = ("persona: gestor de postos\n" + "dores:\n" + "  - margem\n" * 80).encode("utf-8")
    resp = await _upload(client, auth_headers, "personas.yaml", body, "application/x-yaml")
    assert resp.status_code in (200, 201), resp.text
    doc_id = resp.json()["id"]
    n = (await db.execute(
        select(func.count(DocumentChunk.id)).where(DocumentChunk.document_id == doc_id)
    )).scalar_one()
    assert n >= 1


# ---------------------------------------------- F8: RAG qualidade (unit)

async def test_rag_applies_min_score_and_dedup(monkeypatch, db):
    from app import rag

    def hit(i, content, score):
        return rag.MemoryHit(id=i, kind="memory_entry", document_id=None, brand_slug="duofy",
                             category="c", source_type="s", title=f"t{i}", content=content, score=score)

    async def fake_search(**kwargs):
        return [hit(1, "conteudo relevante", 0.9), hit(2, "conteudo relevante", 0.9),  # duplicado
                hit(3, "irrelevante", 0.05)]

    monkeypatch.setattr(rag, "search_memory", fake_search)
    monkeypatch.setattr(rag.get_settings(), "rag_min_score", 0.2, raising=False)
    ctx = await rag.build_rag_context(db=db, query="q", brand_slug="duofy")
    # dedup: "conteudo relevante" entra uma vez; score 0.05 fica abaixo do piso 0.2.
    assert ctx.count("conteudo relevante") == 1
    assert "irrelevante" not in ctx


# ---------------------------------------------- F6: no-silent-fallback

def test_embedding_no_silent_fallback(monkeypatch):
    from app import embeddings
    from app.settings import get_settings

    monkeypatch.setattr(get_settings(), "allow_sha256_embedding_fallback", False, raising=False)
    with pytest.raises(embeddings.EmbeddingError):
        embeddings._sha256_embedding_or_raise("qualquer texto", reason="teste")


def test_embedding_fallback_allowed_returns_vector(monkeypatch):
    from app import embeddings
    from app.settings import get_settings

    monkeypatch.setattr(get_settings(), "allow_sha256_embedding_fallback", True, raising=False)
    vec = embeddings._sha256_embedding_or_raise("texto de teste", reason="teste")
    assert len(vec) == embeddings.EMBEDDING_DIMENSIONS
