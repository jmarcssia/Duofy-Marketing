"""Fase de planejamento do orquestrador: classifica a solicitacao e propoe um plano.

Uma unica chamada LLM curta que devolve JSON. Nao executa nenhuma tarefa.
"""

from __future__ import annotations

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_limits import get_token_budget
from app.llm import LLMConfigurationError, call_llm, provider_for_model
from app.models import Agent, ProviderCredential

logger = logging.getLogger(__name__)

VALID_TIPOS = {"pesquisa", "conteudo", "imprensa", "calendario", "conversa"}

_PLAN_SYSTEM = (
    "Voce e o Orquestrador da Duofy. Antes de executar qualquer tarefa, voce faz um BRIEFING.\n"
    "Classifique a solicitacao do usuario e responda APENAS com um objeto JSON valido, "
    "sem texto ao redor, com as chaves:\n"
    '{"tipo": "pesquisa|conteudo|imprensa|calendario|conversa", "objetivo": "...", '
    '"resumo_do_plano": "...", "agente_alvo": "research|content|press|calendar|null", '
    '"tema_sugerido": "... ou null"}\n'
    "- tipo 'conversa' = pergunta/bate-papo que voce mesmo responde, sem acionar agente.\n"
    "- 'pesquisa' = mercado, concorrencia, tendencias, noticias, dados atuais.\n"
    "- 'conteudo' = criar/redigir peca de conteudo. 'imprensa' = release/assessoria. "
    "'calendario' = planejar calendario.\n"
    "Seja conciso. Escreva objetivo e resumo_do_plano em portugues."
)


def _coerce_plan(raw: str) -> dict:
    """Extrai o JSON do texto do LLM; devolve um plano 'conversa' se falhar."""
    fallback = {
        "tipo": "conversa", "objetivo": "", "resumo_do_plano": "",
        "agente_alvo": None, "tema_sugerido": None,
    }
    text = (raw or "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return fallback
    try:
        data = json.loads(text[start : end + 1])
    except (ValueError, TypeError):
        return fallback
    tipo = str(data.get("tipo", "conversa")).strip().lower()
    if tipo not in VALID_TIPOS:
        tipo = "conversa"
    agente = data.get("agente_alvo")
    tema = data.get("tema_sugerido")
    agente_valido = agente and str(agente).lower() != "null"
    tema_valido = tema and str(tema).lower() != "null"
    return {
        "tipo": tipo,
        "objetivo": str(data.get("objetivo") or "")[:2000],
        "resumo_do_plano": str(data.get("resumo_do_plano") or "")[:2000],
        "agente_alvo": str(agente).strip().lower() if agente_valido else None,
        "tema_sugerido": str(tema)[:255] if tema_valido else None,
    }


async def plan_task(db: AsyncSession, *, prompt: str, brand_slug: str | None) -> dict:
    agent_result = await db.execute(select(Agent).where(Agent.slug == "orchestrator"))
    agent = agent_result.scalar_one_or_none()
    if agent is None or not agent.is_active:
        raise LLMConfigurationError("Agente orchestrator nao encontrado ou inativo.")
    model = agent.default_model
    provider = provider_for_model(model)
    credential = (
        await db.execute(select(ProviderCredential).where(ProviderCredential.provider == provider))
    ).scalar_one_or_none()
    if credential is None or not credential.is_enabled:
        raise LLMConfigurationError(
            f"Configure e habilite o provedor {provider} em Admin > Configuracoes > Modelos LLM."
        )

    budget = min(await get_token_budget(db, "orchestrator"), 800)
    result = await call_llm(
        credential=credential,
        model=model,
        system_prompt=_PLAN_SYSTEM,
        user_prompt=f"Marca ativa: {brand_slug or 'nao informada'}.\nSolicitacao: {prompt}",
        task_type="orchestrator_planning",
        agent_slug="orchestrator",
        brand_slug=brand_slug,
        max_tokens=budget,
    )
    return _coerce_plan(result.output)
