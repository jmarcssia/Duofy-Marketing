from __future__ import annotations

from datetime import date
from unicodedata import combining, normalize

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_config import agent_system_prompt
from app.agent_limits import get_token_budget
from app.llm import LLMConfigurationError, call_llm
from app.models import Agent, AgentRun, ProviderCredential
from app.rag import build_rag_context


def _provider_for_model(model: str) -> str:
    if model.startswith("openai/") or model.startswith("gpt-"):
        return "openrouter" if "/" in model else "openai"
    if model.startswith("anthropic/") or model.startswith("~anthropic/"):
        return "openrouter"
    if model.startswith("claude-"):
        return "anthropic"
    return "openrouter"


def _system_prompt(agent: Agent) -> str:
    return agent_system_prompt(
        agent,
        [
            f"Agente ativo: {agent.name} ({agent.slug}).",
            f"Data atual do sistema: {date.today().isoformat()}.",
            "Quando o usuário pedir informação atual, use fontes atuais.",
            "Se a fonte encontrada for antiga, diga explicitamente que não encontrou dado atual.",
        ],
    )


def _plain_text(value: str) -> str:
    return "".join(
        char for char in normalize("NFKD", value.lower()) if not combining(char)
    )


def _needs_current_info(agent: Agent, prompt: str, provider: str) -> bool:
    if provider != "openrouter":
        return False
    normalized_prompt = _plain_text(prompt)
    current_markers = [
        "hoje",
        "agora",
        "atual",
        "atuais",
        "ultimos",
        "preco",
        "noticia",
        "mercado",
        "tendencia",
    ]
    return agent.slug == "research_agent" or any(
        marker in normalized_prompt for marker in current_markers
    )


def _uses_rag(agent: Agent) -> bool:
    return agent.slug in {"content_agent", "research_agent", "orchestrator"}


async def run_agent(
    db: AsyncSession,
    agent_slug: str,
    prompt: str,
    provider_override: str | None = None,
    model_override: str | None = None,
    brand_slug: str | None = None,
) -> AgentRun:
    agent_result = await db.execute(select(Agent).where(Agent.slug == agent_slug))
    agent = agent_result.scalar_one_or_none()
    if agent is None or not agent.is_active:
        raise LLMConfigurationError("Agente nao encontrado ou inativo.")

    model = model_override or agent.default_model
    provider = provider_override or _provider_for_model(model)
    credential_result = await db.execute(
        select(ProviderCredential).where(ProviderCredential.provider == provider)
    )
    credential = credential_result.scalar_one_or_none()
    if credential is None or not credential.is_enabled:
        raise LLMConfigurationError(
            f"Configure e habilite o provedor {provider} em Admin > Configuracoes > Modelos LLM."
        )

    try:
        rag_context = ""
        if _uses_rag(agent):
            rag_context = await build_rag_context(
                db=db,
                query=prompt,
                brand_slug=brand_slug,
            )
        user_prompt = prompt
        if rag_context:
            user_prompt = (
                f"{prompt}\n\n"
                "Contexto recuperado da memoria/documentos da Duofy:\n"
                f"{rag_context}\n\n"
                "Use esse contexto quando for relevante e nao invente informacoes "
                "que nao estejam nele."
            )

        budget = await get_token_budget(db, agent.slug)
        result = await call_llm(
            credential=credential,
            model=credential.default_model or model,
            system_prompt=_system_prompt(agent),
            user_prompt=user_prompt,
            use_web_search=_needs_current_info(agent, prompt, provider),
            task_type="agent_run",
            agent_slug=agent.slug,
            brand_slug=brand_slug,
            max_tokens=budget,
        )
        run = AgentRun(
            agent_slug=agent.slug,
            provider=result.provider,
            model=result.model,
            prompt=prompt,
            output=result.output,
            status="completed",
        )
    except Exception as exc:
        run = AgentRun(
            agent_slug=agent.slug,
            provider=provider,
            model=model,
            prompt=prompt,
            output="",
            status="failed",
            error=str(exc),
        )

    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run
