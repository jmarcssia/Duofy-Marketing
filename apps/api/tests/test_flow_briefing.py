"""S0 — fluxo de briefing: planejar -> aprovar, com override de modelo so em pesquisa."""

from __future__ import annotations

import json

import pytest

pytestmark = pytest.mark.anyio


def _force_plan(monkeypatch, tipo: str, tema: str | None = None):
    async def fake_call_llm(credential, model, system_prompt, user_prompt, **kwargs):
        from app.llm import LLMResult
        if kwargs.get("task_type") == "orchestrator_planning":
            out = json.dumps({
                "tipo": tipo, "objetivo": "obj", "resumo_do_plano": "plano",
                "agente_alvo": {"pesquisa": "research", "conteudo": "content"}.get(tipo),
                "tema_sugerido": tema,
            })
        else:
            out = "# Resultado\n\nConteudo gerado."
        return LLMResult(output=out, provider=credential.provider, model=model,
                         input_tokens=1, output_tokens=1, total_tokens=2,
                         estimated_cost_usd=0.0, latency_ms=1, raw_usage={})
    # cobre todos os modulos que chamam call_llm no fluxo
    for mod in ("orchestrator_planning", "research_service", "orchestrator", "briefing_service"):
        monkeypatch.setattr(f"app.{mod}.call_llm", fake_call_llm, raising=False)


async def test_research_models_endpoint(client, auth_headers):
    res = client.get("/api/research-models", headers=auth_headers)
    assert res.status_code == 200, res.text
    ids = {m["model_id"] for m in res.json()}
    assert "anthropic/claude-opus-4.8" in ids


async def test_conversa_returns_direct_answer_no_pending(client, auth_headers, patch_ai, monkeypatch):
    _force_plan(monkeypatch, "conversa")
    res = client.post("/api/orchestrator/plan", json={"prompt": "oi, quem e voce?", "brand_slug": "duofy"}, headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["tipo"] == "conversa"
    assert body["status"] != "pending"
    assert body["direct_answer"]


async def test_research_task_creates_pending_then_approves_with_model(client, auth_headers, patch_ai, monkeypatch):
    _force_plan(monkeypatch, "pesquisa", tema="IA no varejo")
    plan = client.post("/api/orchestrator/plan", json={"prompt": "pesquise IA no varejo", "brand_slug": "duofy"}, headers=auth_headers)
    assert plan.status_code == 200, plan.text
    b = plan.json()
    assert b["tipo"] == "pesquisa"
    assert b["status"] == "pending"
    briefing_id = b["id"]

    approve = client.post(
        f"/api/orchestrator/briefings/{briefing_id}/approve",
        json={"model_override": "anthropic/claude-opus-4.8"},
        headers=auth_headers,
    )
    assert approve.status_code == 200, approve.text
    assert approve.json()["briefing"]["status"] == "executed"


async def test_approve_rejects_model_not_in_whitelist(client, auth_headers, patch_ai, monkeypatch):
    _force_plan(monkeypatch, "pesquisa", tema="tema")
    plan = client.post("/api/orchestrator/plan", json={"prompt": "pesquise algo", "brand_slug": "duofy"}, headers=auth_headers)
    briefing_id = plan.json()["id"]
    approve = client.post(
        f"/api/orchestrator/briefings/{briefing_id}/approve",
        json={"model_override": "modelo/invalido-x"},
        headers=auth_headers,
    )
    assert approve.status_code == 422, approve.text


async def test_approve_ignores_model_override_for_non_research(client, auth_headers, patch_ai, monkeypatch):
    _force_plan(monkeypatch, "conteudo")
    plan = client.post("/api/orchestrator/plan", json={"prompt": "escreva um post", "brand_slug": "duofy"}, headers=auth_headers)
    b = plan.json()
    assert b["tipo"] == "conteudo" and b["status"] == "pending"
    approve = client.post(
        f"/api/orchestrator/briefings/{b['id']}/approve",
        json={"model_override": "anthropic/claude-opus-4.8"},  # deve ser ignorado, nao 422
        headers=auth_headers,
    )
    assert approve.status_code == 200, approve.text
    assert approve.json()["briefing"]["model_override"] is None


async def test_approve_marks_failed_and_allows_retry_when_agent_run_fails(
    client, auth_headers, patch_ai, monkeypatch
):
    _force_plan(monkeypatch, "conteudo")

    async def fake_call_llm_fails(*args, **kwargs):
        raise RuntimeError("LLM down")

    # aplicado apos _force_plan para vencer o monkeypatch de app.orchestrator.call_llm
    monkeypatch.setattr("app.orchestrator.call_llm", fake_call_llm_fails, raising=False)

    plan = client.post(
        "/api/orchestrator/plan",
        json={"prompt": "escreva um post", "brand_slug": "duofy"},
        headers=auth_headers,
    )
    b = plan.json()
    assert b["tipo"] == "conteudo" and b["status"] == "pending"
    briefing_id = b["id"]

    approve = client.post(
        f"/api/orchestrator/briefings/{briefing_id}/approve",
        json={},
        headers=auth_headers,
    )
    assert approve.status_code == 200, approve.text
    assert approve.json()["briefing"]["status"] == "failed"

    retry = client.post(
        f"/api/orchestrator/briefings/{briefing_id}/approve",
        json={},
        headers=auth_headers,
    )
    assert retry.status_code == 200, retry.text
    assert retry.json()["briefing"]["status"] == "failed"


async def test_plan_from_theme_skips_llm(client, auth_headers, patch_ai, monkeypatch):
    theme = client.post(
        "/api/research-themes",
        json={"title": "Hidrogenio verde", "brand_slug": "postos"},
        headers=auth_headers,
    ).json()

    # Sem forcar plan: se chamasse o LLM classificador, o patch_ai devolveria FAKE_OUTPUT_MD (nao-JSON) -> conversa.
    res = client.post(
        "/api/orchestrator/plan-from-theme",
        json={"research_theme_id": theme["id"], "brand_slug": "postos"},
        headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    b = res.json()
    assert b["tipo"] == "pesquisa"
    assert b["status"] == "pending"
    assert b["tema_sugerido"] == "Hidrogenio verde"
    assert b["research_theme_id"] == theme["id"]
