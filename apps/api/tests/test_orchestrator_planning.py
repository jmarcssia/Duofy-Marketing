"""S0 — o planejador classifica a solicitacao e sempre devolve um plano valido."""

from __future__ import annotations

import json

import pytest

from app.orchestrator_planning import plan_task

pytestmark = pytest.mark.anyio

VALID_TIPOS = {"pesquisa", "conteudo", "imprensa", "calendario", "conversa"}


async def test_plan_parses_llm_json(db, patch_ai, monkeypatch):
    async def fake_call_llm(credential, model, system_prompt, user_prompt, **kwargs):
        from app.llm import LLMResult
        payload = json.dumps({
            "tipo": "pesquisa", "objetivo": "Mapear tendencias",
            "resumo_do_plano": "Rodar pesquisa de mercado", "agente_alvo": "research",
            "tema_sugerido": "IA no varejo",
        })
        return LLMResult(output=payload, provider=credential.provider, model=model,
                         input_tokens=1, output_tokens=1, total_tokens=2,
                         estimated_cost_usd=0.0, latency_ms=1, raw_usage={})
    monkeypatch.setattr("app.orchestrator_planning.call_llm", fake_call_llm)

    plan = await plan_task(db, prompt="pesquise tendencias de IA no varejo", brand_slug="duofy")
    assert plan["tipo"] == "pesquisa"
    assert plan["tema_sugerido"] == "IA no varejo"


async def test_plan_falls_back_to_conversa_on_bad_json(db, patch_ai, monkeypatch):
    async def fake_call_llm(credential, model, system_prompt, user_prompt, **kwargs):
        from app.llm import LLMResult
        return LLMResult(output="isto nao e json", provider=credential.provider, model=model,
                         input_tokens=1, output_tokens=1, total_tokens=2,
                         estimated_cost_usd=0.0, latency_ms=1, raw_usage={})
    monkeypatch.setattr("app.orchestrator_planning.call_llm", fake_call_llm)

    plan = await plan_task(db, prompt="oi tudo bem?", brand_slug="duofy")
    assert plan["tipo"] in VALID_TIPOS
    assert plan["tipo"] == "conversa"
