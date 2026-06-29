from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_config import agent_system_prompt
from app.agent_limits import get_token_budget
from app.models import Agent, ProviderCredential
from app.orchestrator_llm import build_orchestrator_chat_model
from app.orchestrator_tools import build_tools


def psycopg_dsn_from_async_url(async_url: str) -> str:
    """Convert a postgresql+asyncpg:// URL to a plain postgresql:// DSN.

    psycopg (sync/async) expects ``postgresql://`` scheme; SQLAlchemy async
    drivers use ``postgresql+asyncpg://``.  This helper strips the driver
    suffix so the DSN can be handed directly to AsyncPostgresSaver.

    V1 uses MemorySaver (the default in build_graph).

    V2 — activate Postgres persistence by entering
    ``AsyncPostgresSaver.from_conn_string(psycopg_dsn_from_async_url(settings.database_url))``
    once in a Celery ``worker_init`` hook, calling ``.setup()``, and passing
    the saver to ``build_graph(..., checkpointer=saver)``.
    AsyncPostgresSaver.from_conn_string is an ``@asynccontextmanager`` — enter
    it once per worker process, not once per request, to avoid connection leaks.
    """
    return async_url.replace("postgresql+asyncpg://", "postgresql://")

MAX_STEPS = 5

LogFn = Callable[[str], Awaitable[None]]


class OrchestratorState(TypedDict):
    messages: Annotated[list, add_messages]
    brand_slug: str
    task_id: int
    step_count: int


def _message_text(message) -> str:
    """Coerce a message's .content to a plain str.

    Some models (e.g. Claude via OpenRouter) return content as a list of
    content blocks rather than a bare string.  This helper extracts the text
    so downstream code always receives a str.
    """
    content = message.content
    if isinstance(content, str):
        return content
    # list of content blocks, e.g. [{"type": "text", "text": "..."}]
    parts = []
    for part in content:
        if isinstance(part, dict) and "text" in part:
            parts.append(part["text"])
        else:
            parts.append(str(part))
    return "".join(parts)


def _provider_for_model(model: str) -> str:
    if model.startswith("openai/") or model.startswith("anthropic/") or model.startswith("~"):
        return "openrouter"
    if model.startswith("gpt-"):
        return "openai"
    if model.startswith("claude-"):
        return "anthropic"
    return "openrouter"


def build_graph(model, tools, *, checkpointer=None):
    bound = model.bind_tools(tools)
    tools_by_name = {t.name: t for t in tools}

    async def agent_node(state: OrchestratorState) -> dict:
        response = await bound.ainvoke(state["messages"])
        return {"messages": [response]}

    async def tools_node(state: OrchestratorState) -> dict:
        last = state["messages"][-1]
        out_messages = []
        for call in last.tool_calls:
            tool = tools_by_name.get(call["name"])
            try:
                if tool is None:
                    content = f"Ferramenta desconhecida: {call['name']}"
                else:
                    content = await tool.ainvoke(call["args"])
            except Exception as exc:  # erro vira observação, não quebra o loop
                content = f"Erro ao executar {call['name']}: {exc}"
            out_messages.append(ToolMessage(content=str(content), tool_call_id=call["id"]))
        return {"messages": out_messages, "step_count": state["step_count"] + 1}

    async def final_node(state: OrchestratorState) -> dict:
        nudge = SystemMessage(
            content="Resuma em português o que foi feito, citando os IDs criados e "
            "para onde o usuário deve ir (ex: /approvals, /content). Não chame ferramentas."
        )
        response = await model.ainvoke(state["messages"] + [nudge])
        return {"messages": [response]}

    def route(state: OrchestratorState) -> str:
        last = state["messages"][-1]
        has_tool_calls = isinstance(last, AIMessage) and bool(last.tool_calls)
        if has_tool_calls and state["step_count"] < MAX_STEPS:
            return "tools"
        if has_tool_calls:  # bateu no teto ainda querendo ferramenta
            return "final"
        return END

    graph = StateGraph(OrchestratorState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tools_node)
    graph.add_node("final", final_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", route, {"tools": "tools", "final": "final", END: END})
    graph.add_edge("tools", "agent")
    graph.add_edge("final", END)
    return graph.compile(checkpointer=checkpointer or MemorySaver())


async def _load_orchestrator(db: AsyncSession) -> tuple[ProviderCredential, Agent, str]:
    agent_result = await db.execute(select(Agent).where(Agent.slug == "orchestrator"))
    agent = agent_result.scalar_one_or_none()
    if agent is None or not agent.is_active:
        raise RuntimeError("Agente orchestrator não encontrado ou inativo.")
    provider = _provider_for_model(agent.default_model)
    cred_result = await db.execute(
        select(ProviderCredential).where(ProviderCredential.provider == provider)
    )
    credential = cred_result.scalar_one_or_none()
    if credential is None or not credential.is_enabled:
        raise RuntimeError(
            f"Configure e habilite o provedor {provider} em Admin > Configurações > Modelos LLM."
        )
    model = credential.default_model or agent.default_model
    return credential, agent, model


async def run_orchestrator(
    db: AsyncSession,
    *,
    task_id: int,
    brand_slug: str,
    user_message: str,
    log: LogFn,
) -> str:
    credential, agent, model_name = await _load_orchestrator(db)
    budget = await get_token_budget(db, "orchestrator")
    chat_model = build_orchestrator_chat_model(
        credential, model_name, task_id=task_id, brand_slug=brand_slug, max_tokens=budget
    )
    tools = build_tools(db, brand_slug=brand_slug, task_id=task_id, log=log)
    graph = build_graph(chat_model, tools)

    system = SystemMessage(
        content=agent_system_prompt(agent, [f"Marca ativa: {brand_slug}."], brand_slug=brand_slug)
    )
    state = await graph.ainvoke(
        {
            "messages": [system, HumanMessage(content=user_message)],
            "brand_slug": brand_slug,
            "task_id": task_id,
            "step_count": 0,
        },
        config={"configurable": {"thread_id": str(task_id)}},
    )
    return _message_text(state["messages"][-1])
