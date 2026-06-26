# Orquestrador Multiagente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Chat em um orquestrador agêntico (LangGraph + tool-calling nativo) que entende a intenção, chama os agentes certos como ferramentas em loop (teto 5 passos), cria rascunhos e roda o Guardião, mantendo cada agente acionável isoladamente pelas páginas.

**Architecture:** Grafo ReAct (nó `agent` ↔ nó `tools`, com nó `final` de resumo). As ferramentas embrulham os serviços existentes (`run_market_research`, `generate_content_output`, `generate_press_output`, `generate_calendar_events`, `build_rag_context`). O LLM roda via `ChatOpenAI` apontado pro OpenRouter com a credencial do banco; custo gravado em `model_calls` por callback. Chat (worker Celery) → grafo; páginas seguem chamando serviços direto.

**Tech Stack:** Python 3.11 (container) / 3.12 (venv), FastAPI, SQLAlchemy async, Celery, LangGraph, langchain-core, langchain-openai, OpenRouter (Claude).

## Global Constraints

- Aprovação final é sempre humana; o Guardião nunca é pulado. O orquestrador cria rascunho e roda o Guardião (`review_output_quality(force=True)`), setando `output.status = "review" if review.passed else "needs_adjustment"`. Nunca seta `approved`.
- Teto de passos do loop: **5** (constante `MAX_STEPS = 5`).
- A marca (`brand_slug`) vem do contexto da sessão de chat, nunca de argumento do LLM.
- Não criar migration Alembic; o checkpointer do LangGraph gerencia as próprias tabelas.
- Não alterar as páginas nem os serviços existentes (só consumi-los).
- Idioma das respostas e prompts: português do Brasil.
- Rodar checks com o venv: `.venv/Scripts/python.exe -m ruff ...` e `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest ...`.

---

### Task 1: Adicionar dependências do LangGraph

**Files:**
- Modify: `apps/api/requirements.txt`

**Interfaces:**
- Consumes: nada.
- Produces: pacotes `langgraph`, `langchain_core`, `langchain_openai` importáveis no ambiente.

- [ ] **Step 1: Adicionar as dependências ao requirements**

Acrescentar ao final de `apps/api/requirements.txt`:

```
langgraph>=0.2.0
langchain-core>=0.3.0
langchain-openai>=0.2.0
langgraph-checkpoint-postgres>=2.0.0
```

- [ ] **Step 2: Instalar no venv**

Run: `.venv/Scripts/python.exe -m pip install "langgraph>=0.2.0" "langchain-core>=0.3.0" "langchain-openai>=0.2.0" "langgraph-checkpoint-postgres>=2.0.0"`
Expected: instala sem erro de resolução; imprime as versões resolvidas.

- [ ] **Step 3: Verificar import**

Run: `.venv/Scripts/python.exe -c "import langgraph, langchain_core, langchain_openai; from langgraph.graph import StateGraph; print('ok')"`
Expected: imprime `ok`.

- [ ] **Step 4: Rebuild dos containers que usam o requirements**

Run: `docker compose build api worker`
Expected: build conclui sem erro (instala as novas deps na imagem).

- [ ] **Step 5: Commit**

```bash
git add apps/api/requirements.txt
git commit -m "build(api): adiciona LangGraph e langchain-openai"
```

---

### Task 2: `orchestrator_llm.py` — chat model + rastreio de custo

**Files:**
- Create: `apps/api/app/orchestrator_llm.py`
- Test: `apps/api/tests/test_orchestrator_llm.py`

**Interfaces:**
- Consumes: `ProviderCredential` (campos `provider`, `api_key_encrypted`, `base_url`, `default_model`, `is_enabled`); `decrypt_secret` (app.crypto); `record_model_call` (app.metrics, keyword-only).
- Produces:
  - `class ModelCallTracker(AsyncCallbackHandler)` — captura uso e grava em `model_calls`.
  - `def build_orchestrator_chat_model(credential: ProviderCredential, model: str, *, task_id: int, brand_slug: str | None) -> ChatOpenAI`

- [ ] **Step 1: Escrever o teste do callback de custo**

```python
# apps/api/tests/test_orchestrator_llm.py
import pytest
from langchain_core.outputs import LLMResult, ChatGeneration
from langchain_core.messages import AIMessage

from app import orchestrator_llm


@pytest.mark.asyncio
async def test_model_call_tracker_records_usage(monkeypatch):
    captured = {}

    async def fake_record(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(orchestrator_llm, "record_model_call", fake_record)

    tracker = orchestrator_llm.ModelCallTracker(
        task_id=7, agent_slug="orchestrator", brand_slug="duofy_solucoes",
        provider="openrouter", model="anthropic/claude-sonnet",
    )
    gen = ChatGeneration(message=AIMessage(content="oi"))
    result = LLMResult(
        generations=[[gen]],
        llm_output={"token_usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}},
    )
    await tracker.on_llm_end(result)

    assert captured["task_id"] == 7
    assert captured["provider"] == "openrouter"
    assert captured["input_tokens"] == 10
    assert captured["output_tokens"] == 5
    assert captured["total_tokens"] == 15
    assert captured["status"] == "completed"
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_orchestrator_llm.py -v`
Expected: FAIL com `ModuleNotFoundError`/`AttributeError` (módulo/classe inexistente).

- [ ] **Step 3: Implementar o módulo**

```python
# apps/api/app/orchestrator_llm.py
from __future__ import annotations

from typing import Any

from langchain_core.callbacks import AsyncCallbackHandler
from langchain_core.outputs import LLMResult
from langchain_openai import ChatOpenAI

from app.crypto import decrypt_secret
from app.metrics import (
    estimate_cost_usd,
    estimate_tokens_from_text,
    record_model_call,
)
from app.models import ProviderCredential

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class ModelCallTracker(AsyncCallbackHandler):
    def __init__(
        self,
        *,
        task_id: int | None,
        agent_slug: str | None,
        brand_slug: str | None,
        provider: str,
        model: str,
    ) -> None:
        self.task_id = task_id
        self.agent_slug = agent_slug
        self.brand_slug = brand_slug
        self.provider = provider
        self.model = model

    async def on_llm_end(self, response: LLMResult, **kwargs: Any) -> None:
        usage = (response.llm_output or {}).get("token_usage", {}) or {}
        input_tokens = usage.get("prompt_tokens")
        output_tokens = usage.get("completion_tokens")
        total_tokens = usage.get("total_tokens")
        estimated = estimate_cost_usd(
            provider=self.provider,
            model=self.model,
            input_tokens=input_tokens or 0,
            output_tokens=output_tokens or 0,
            raw_usage=usage,
        )
        await record_model_call(
            task_type="orchestrator",
            task_id=self.task_id,
            agent_slug=self.agent_slug,
            brand_slug=self.brand_slug,
            provider=self.provider,
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            estimated_cost_usd=estimated,
            latency_ms=None,
            status="completed",
            error=None,
            raw_usage=usage or None,
        )

    async def on_llm_error(self, error: BaseException, **kwargs: Any) -> None:
        await record_model_call(
            task_type="orchestrator",
            task_id=self.task_id,
            agent_slug=self.agent_slug,
            brand_slug=self.brand_slug,
            provider=self.provider,
            model=self.model,
            input_tokens=None,
            output_tokens=None,
            total_tokens=None,
            estimated_cost_usd=None,
            latency_ms=None,
            status="failed",
            error=str(error),
            raw_usage=None,
        )


def build_orchestrator_chat_model(
    credential: ProviderCredential,
    model: str,
    *,
    task_id: int,
    brand_slug: str | None,
) -> ChatOpenAI:
    api_key = decrypt_secret(credential.api_key_encrypted)
    base_url = credential.base_url or OPENROUTER_BASE_URL
    tracker = ModelCallTracker(
        task_id=task_id,
        agent_slug="orchestrator",
        brand_slug=brand_slug,
        provider=credential.provider,
        model=model,
    )
    return ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url,
        temperature=0.3,
        max_tokens=1200,
        callbacks=[tracker],
        default_headers={
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Duofy V1 Local",
        },
    )
```

Nota: `estimate_tokens_from_text` é importado para uso futuro do fallback; se o linter reclamar de import não usado, removê-lo desta importação.

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_orchestrator_llm.py -v`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
.venv/Scripts/python.exe -m ruff check apps/api/app/orchestrator_llm.py apps/api/tests/test_orchestrator_llm.py
git add apps/api/app/orchestrator_llm.py apps/api/tests/test_orchestrator_llm.py
git commit -m "feat(orchestrator): chat model OpenRouter com rastreio de custo"
```

---

### Task 3: `orchestrator_tools.py` — ferramentas do orquestrador

**Files:**
- Create: `apps/api/app/orchestrator_tools.py`
- Test: `apps/api/tests/test_orchestrator_tools.py`

**Interfaces:**
- Consumes: `run_market_research(db, ResearchRunRequest) -> Output`; `generate_content_output(db, ContentGenerateRequest) -> Output`; `generate_press_output(db, PressGenerateRequest) -> Output`; `generate_calendar_events(db, CalendarGenerateRequest) -> list[CalendarEvent]`; `build_rag_context(db, query, brand_slug, category=None, limit=...) -> str`; `review_output_quality(db, output, *, force=False) -> QualityReview`. Schemas em `app.schemas`.
- Produces: `def build_tools(db: AsyncSession, *, brand_slug: str, task_id: int, log: Callable[[str], Awaitable[None]]) -> list[StructuredTool]`.

- [ ] **Step 1: Escrever o teste das ferramentas (com serviços fakeados)**

```python
# apps/api/tests/test_orchestrator_tools.py
import pytest

from app import orchestrator_tools


class _FakeOutput:
    def __init__(self, id, status="draft"):
        self.id = id
        self.status = status


class _FakeReview:
    def __init__(self, passed=True, score=88):
        self.passed = passed
        self.score = score


@pytest.mark.asyncio
async def test_create_content_tool_creates_draft_and_runs_guardian(monkeypatch):
    calls = {}

    async def fake_generate(db, payload):
        calls["payload"] = payload
        return _FakeOutput(id=51, status=payload.status)

    async def fake_review(db, output, *, force=False):
        calls["reviewed"] = (output.id, force)
        return _FakeReview(passed=True, score=88)

    logs = []

    async def fake_log(msg):
        logs.append(msg)

    monkeypatch.setattr(orchestrator_tools, "generate_content_output", fake_generate)
    monkeypatch.setattr(orchestrator_tools, "review_output_quality", fake_review)

    tools = orchestrator_tools.build_tools(
        db=object(), brand_slug="duofy_solucoes", task_id=1, log=fake_log
    )
    create_content = {t.name: t for t in tools}["create_content"]

    result = await create_content.ainvoke(
        {"channel": "LinkedIn", "format": "Post LinkedIn", "briefing": "tema x"}
    )

    assert calls["payload"].brand_slug == "duofy_solucoes"
    assert calls["payload"].channel == "LinkedIn"
    assert calls["payload"].status == "draft"
    assert calls["reviewed"] == (51, True)
    assert "51" in result
    assert "88" in result
    assert logs  # logou progresso


@pytest.mark.asyncio
async def test_research_tool_maps_params(monkeypatch):
    calls = {}

    async def fake_research(db, payload):
        calls["payload"] = payload
        return _FakeOutput(id=50)

    async def fake_log(msg):
        pass

    monkeypatch.setattr(orchestrator_tools, "run_market_research", fake_research)

    tools = orchestrator_tools.build_tools(
        db=object(), brand_slug="duofy_solucoes", task_id=1, log=fake_log
    )
    research = {t.name: t for t in tools}["research_market"]

    result = await research.ainvoke({"theme": "mercado de IA"})

    assert calls["payload"].brand_slug == "duofy_solucoes"
    assert calls["payload"].theme == "mercado de IA"
    assert "50" in result
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_orchestrator_tools.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar as ferramentas**

```python
# apps/api/app/orchestrator_tools.py
from __future__ import annotations

from collections.abc import Awaitable, Callable

from langchain_core.tools import StructuredTool
from sqlalchemy.ext.asyncio import AsyncSession

from app.calendar_service import generate_calendar_events, generate_press_output
from app.content_generation import generate_content_output
from app.quality_guardian import review_output_quality
from app.rag import build_rag_context
from app.research_service import run_market_research
from app.schemas import (
    CalendarGenerateRequest,
    ContentGenerateRequest,
    PressGenerateRequest,
    ResearchRunRequest,
)

from datetime import UTC, datetime, timedelta

LogFn = Callable[[str], Awaitable[None]]


async def _submit_to_guardian(db: AsyncSession, output) -> str:
    review = await review_output_quality(db, output, force=True)
    output.status = "review" if review.passed else "needs_adjustment"
    await db.commit()
    return f"score {review.score}/100, status {output.status}"


def build_tools(
    db: AsyncSession,
    *,
    brand_slug: str,
    task_id: int,
    log: LogFn,
) -> list[StructuredTool]:
    async def research_market(theme: str, period: str = "últimos 30 dias", depth: str = "quick") -> str:
        await log(f"🔍 Pesquisando: {theme}")
        output = await run_market_research(
            db,
            ResearchRunRequest(brand_slug=brand_slug, theme=theme[:255], period=period, depth=depth),
        )
        return f"Pesquisa concluída. Output #{output.id} (relatório de mercado salvo)."

    async def create_content(channel: str, format: str, briefing: str, category: str = "general") -> str:
        await log(f"✍️ Gerando conteúdo: {format} / {channel}")
        output = await generate_content_output(
            db,
            ContentGenerateRequest(
                brand_slug=brand_slug, category=category, channel=channel,
                format=format, briefing=briefing, status="draft",
            ),
        )
        guardian = await _submit_to_guardian(db, output)
        return f"Conteúdo criado. Output #{output.id} ({guardian})."

    async def create_press(format: str, briefing: str, category: str = "general") -> str:
        await log(f"📣 Gerando assessoria: {format}")
        output = await generate_press_output(
            db,
            PressGenerateRequest(
                brand_slug=brand_slug, category=category, format=format,
                briefing=briefing, status="draft",
            ),
        )
        guardian = await _submit_to_guardian(db, output)
        return f"Press criado. Output #{output.id} ({guardian})."

    async def create_calendar(
        objective: str,
        period_days: int = 14,
        channels: list[str] | None = None,
        category: str = "general",
    ) -> str:
        await log(f"🗓️ Gerando calendário: {objective}")
        now = datetime.now(UTC)
        events = await generate_calendar_events(
            db,
            CalendarGenerateRequest(
                brand_slug=brand_slug, category=category, objective=objective,
                period_start=now, period_end=now + timedelta(days=period_days),
                channels=channels or ["LinkedIn", "Instagram", "Assessoria"],
            ),
        )
        linhas = "; ".join(f"#{e.id} {e.title}" for e in events)
        return f"Calendário criado com {len(events)} eventos: {linhas}"

    async def search_memory(query: str) -> str:
        await log(f"📚 Consultando memória: {query}")
        context = await build_rag_context(db=db, query=query, brand_slug=brand_slug)
        return context or "Nenhum trecho relevante encontrado na memória."

    return [
        StructuredTool.from_function(
            coroutine=research_market,
            name="research_market",
            description="Pesquisa de mercado: coleta fontes externas e gera um relatório. Use quando o pedido envolver mercado, concorrência, tendências ou notícias.",
        ),
        StructuredTool.from_function(
            coroutine=create_content,
            name="create_content",
            description="Gera conteúdo (post, carrossel, artigo) como rascunho e envia ao Guardião. 'channel' ex: LinkedIn, Instagram. 'format' ex: 'Post LinkedIn', 'Carrossel'.",
        ),
        StructuredTool.from_function(
            coroutine=create_press,
            name="create_press",
            description="Gera material de assessoria de imprensa (release/pauta/comunicado) como rascunho e envia ao Guardião.",
        ),
        StructuredTool.from_function(
            coroutine=create_calendar,
            name="create_calendar",
            description="Gera um calendário editorial com eventos para um período (period_days). Use quando o pedido for sobre agenda/cronograma/calendário.",
        ),
        StructuredTool.from_function(
            coroutine=search_memory,
            name="search_memory",
            description="Consulta a memória/documentos da marca (RAG). Use para se contextualizar antes de criar algo. Não cria nada.",
        ),
    ]
```

- [ ] **Step 4: Rodar e ver passar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_orchestrator_tools.py -v`
Expected: PASS (2 testes).

- [ ] **Step 5: Lint + commit**

```bash
.venv/Scripts/python.exe -m ruff check apps/api/app/orchestrator_tools.py apps/api/tests/test_orchestrator_tools.py
git add apps/api/app/orchestrator_tools.py apps/api/tests/test_orchestrator_tools.py
git commit -m "feat(orchestrator): ferramentas que embrulham os serviços dos agentes"
```

---

### Task 4: `orchestrator_graph.py` — grafo ReAct + loop

**Files:**
- Create: `apps/api/app/orchestrator_graph.py`
- Test: `apps/api/tests/test_orchestrator_graph.py`

**Interfaces:**
- Consumes: `build_tools` (Task 3); `build_orchestrator_chat_model` (Task 2); `agent_system_prompt` (app.agent_config); `Agent`, `ProviderCredential` (models).
- Produces:
  - `MAX_STEPS = 5`
  - `class OrchestratorState(TypedDict)`
  - `def build_graph(model, tools, *, checkpointer=None)` → grafo compilado
  - `async def run_orchestrator(db, *, task_id, brand_slug, user_message, log) -> str`

- [ ] **Step 1: Escrever o teste do grafo (com chat model roteirizado)**

```python
# apps/api/tests/test_orchestrator_graph.py
import pytest
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import StructuredTool

from app import orchestrator_graph


class ScriptedModel:
    """Chat model falso: devolve uma sequência roteirizada de AIMessages."""

    def __init__(self, scripted):
        self._scripted = list(scripted)
        self._i = 0

    def bind_tools(self, tools):
        return self

    async def ainvoke(self, messages, *args, **kwargs):
        msg = self._scripted[min(self._i, len(self._scripted) - 1)]
        self._i += 1
        return msg


@pytest.mark.asyncio
async def test_graph_runs_tool_then_finishes():
    executed = []

    async def fake_tool_fn(theme: str) -> str:
        executed.append(theme)
        return f"pesquisa de {theme} ok"

    tool = StructuredTool.from_function(
        coroutine=fake_tool_fn, name="research_market", description="pesquisa"
    )

    scripted = [
        AIMessage(
            content="",
            tool_calls=[{"name": "research_market", "args": {"theme": "IA"}, "id": "c1"}],
        ),
        AIMessage(content="Pronto: criei a pesquisa de IA."),  # sem tool_calls -> final via agent
    ]
    model = ScriptedModel(scripted)
    graph = orchestrator_graph.build_graph(model, [tool])

    state = await graph.ainvoke(
        {
            "messages": [],
            "brand_slug": "duofy_solucoes",
            "task_id": 1,
            "step_count": 0,
            "created": [],
        },
        config={"configurable": {"thread_id": "1"}},
    )

    assert executed == ["IA"]
    last = state["messages"][-1]
    assert "pesquisa de IA" in last.content


@pytest.mark.asyncio
async def test_graph_respects_step_cap():
    async def fake_tool_fn() -> str:
        return "ok"

    tool = StructuredTool.from_function(
        coroutine=fake_tool_fn, name="loop", description="loop"
    )
    # modelo que SEMPRE pede a ferramenta -> deve parar no teto
    always_tool = AIMessage(
        content="", tool_calls=[{"name": "loop", "args": {}, "id": "c"}]
    )
    final = AIMessage(content="resumo final")
    model = ScriptedModel([always_tool] * 10 + [final])
    graph = orchestrator_graph.build_graph(model, [tool])

    state = await graph.ainvoke(
        {"messages": [], "brand_slug": "b", "task_id": 1, "step_count": 0, "created": []},
        config={"configurable": {"thread_id": "1"}},
    )

    # nó tools roda no máximo MAX_STEPS vezes
    tool_msgs = [m for m in state["messages"] if isinstance(m, ToolMessage)]
    assert len(tool_msgs) == orchestrator_graph.MAX_STEPS
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_orchestrator_graph.py -v`
Expected: FAIL com `ModuleNotFoundError`/`AttributeError`.

- [ ] **Step 3: Implementar o grafo**

```python
# apps/api/app/orchestrator_graph.py
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
from app.models import Agent, ProviderCredential
from app.orchestrator_llm import build_orchestrator_chat_model
from app.orchestrator_tools import build_tools

MAX_STEPS = 5

LogFn = Callable[[str], Awaitable[None]]


class OrchestratorState(TypedDict):
    messages: Annotated[list, add_messages]
    brand_slug: str
    task_id: int
    step_count: int
    created: list[dict]


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
            out_messages.append(
                ToolMessage(content=str(content), tool_call_id=call["id"])
            )
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


async def _load_orchestrator(db: AsyncSession) -> tuple[ProviderCredential, str]:
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
    chat_model = build_orchestrator_chat_model(
        credential, model_name, task_id=task_id, brand_slug=brand_slug
    )
    tools = build_tools(db, brand_slug=brand_slug, task_id=task_id, log=log)
    graph = build_graph(chat_model, tools)

    system = SystemMessage(content=agent_system_prompt(agent, [f"Marca ativa: {brand_slug}."]))
    state = await graph.ainvoke(
        {
            "messages": [system, HumanMessage(content=user_message)],
            "brand_slug": brand_slug,
            "task_id": task_id,
            "step_count": 0,
            "created": [],
        },
        config={"configurable": {"thread_id": str(task_id)}},
    )
    return state["messages"][-1].content
```

Nota: `_load_orchestrator` retorna 3 valores (`credential, agent, model`); a anotação `-> tuple[...]` pode ser ajustada para `tuple[ProviderCredential, Agent, str]` — importe `Agent` já está disponível.

- [ ] **Step 4: Rodar e ver passar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_orchestrator_graph.py -v`
Expected: PASS (2 testes).

- [ ] **Step 5: Lint + commit**

```bash
.venv/Scripts/python.exe -m ruff check apps/api/app/orchestrator_graph.py apps/api/tests/test_orchestrator_graph.py
git add apps/api/app/orchestrator_graph.py apps/api/tests/test_orchestrator_graph.py
git commit -m "feat(orchestrator): grafo ReAct com loop e teto de passos"
```

---

### Task 5: Integrar no Chat (substituir classify_task)

**Files:**
- Modify: `apps/api/app/task_service.py`
- Modify: `apps/api/app/routers/chat.py:179` e `:22` (import e uso de `classify_task`)
- Test: `apps/api/tests/test_orchestrator_integration.py`

**Interfaces:**
- Consumes: `run_orchestrator` (Task 4).
- Produces: chat sempre roteia para o orquestrador; `AgentTask.task_type = "orchestrate"`.

- [ ] **Step 1: Escrever o teste de integração (orquestrador fakeado)**

```python
# apps/api/tests/test_orchestrator_integration.py
import pytest

from app import task_service
from app.models import AgentTask
from app.db import AsyncSessionLocal


@pytest.mark.asyncio
async def test_execute_agent_task_runs_orchestrator(monkeypatch):
    async def fake_run(db, *, task_id, brand_slug, user_message, log):
        await log("passo de teste")
        return f"resposta para: {user_message}"

    monkeypatch.setattr(task_service, "run_orchestrator", fake_run)

    async with AsyncSessionLocal() as db:
        task = AgentTask(
            session_id=None, user_id=None, brand_slug="duofy_solucoes",
            task_type="orchestrate", status="queued", input="escreva um post",
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)

        result = await task_service.execute_agent_task(db, task.id)

    assert result.status == "completed"
    assert "escreva um post" in result.result
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_orchestrator_integration.py -v`
Expected: FAIL (`run_orchestrator` não existe em task_service / lógica ainda roteia pelo if/elif).

- [ ] **Step 3: Reescrever `execute_agent_task` e remover `classify_task`**

Substituir, em `apps/api/app/task_service.py`, a função `classify_task` (remover) e `execute_agent_task` por:

```python
# topo do arquivo: ajustar imports
from app.orchestrator_graph import run_orchestrator
# (remover imports não mais usados: run_market_research, generate_content_output,
#  generate_calendar_events, generate_press_output, generate_report, run_agent,
#  e os schemas/timedelta/datetime se ficarem órfãos — rodar ruff para confirmar)


async def execute_agent_task(db: AsyncSession, task_id: int) -> AgentTask:
    result = await db.execute(select(AgentTask).where(AgentTask.id == task_id))
    task = result.scalar_one()
    task.status = "running"
    await add_task_log(db, task.id, "Tarefa iniciada pelo worker.")
    await db.commit()
    await db.refresh(task)

    brand_slug = demo_brand_slug(task.brand_slug)

    async def log(message: str) -> None:
        await add_task_log(db, task.id, message)
        await db.commit()

    try:
        answer = await run_orchestrator(
            db,
            task_id=task.id,
            brand_slug=brand_slug,
            user_message=task.input,
            log=log,
        )
        return await _complete_task(db, task, answer, "orchestrator", None)
    except Exception as exc:
        return await _fail_task(db, task, exc)
```

Manter `add_task_log`, `demo_brand_slug`, `_complete_task`, `_fail_task`, `normalize_text` (se usado em outro lugar; senão remover) e `_current_output_content` (se não usado, remover — confirmar com ruff).

- [ ] **Step 4: Atualizar `chat.py` para não usar `classify_task`**

Em `apps/api/app/routers/chat.py`:
- Remover `classify_task` do import da linha 22 (deixar `from app.task_service import add_task_log`).
- Na linha ~179, trocar `task_type=classify_task(payload.content),` por `task_type="orchestrate",`.

- [ ] **Step 5: Rodar o teste e a suíte toda**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests -v`
Expected: PASS em tudo (14 antigos + novos).

- [ ] **Step 6: Lint + commit**

```bash
.venv/Scripts/python.exe -m ruff check apps/api/app apps/api/tests
git add apps/api/app/task_service.py apps/api/app/routers/chat.py apps/api/tests/test_orchestrator_integration.py
git commit -m "feat(chat): roteia mensagens para o orquestrador agêntico"
```

---

### Task 6: Persistência Postgres (checkpointer)

**Files:**
- Modify: `apps/api/app/orchestrator_graph.py`
- Modify: `apps/api/app/settings.py` (helper de URL psycopg, se ainda não houver)
- Test: `apps/api/tests/test_orchestrator_graph.py` (adicionar teste do helper de URL)

**Interfaces:**
- Consumes: `DATABASE_URL` (formato `postgresql+asyncpg://...`).
- Produces: `def psycopg_dsn_from_async_url(async_url: str) -> str`; `run_orchestrator` usa `AsyncPostgresSaver`.

- [ ] **Step 1: Escrever o teste do conversor de URL**

```python
# adicionar em apps/api/tests/test_orchestrator_graph.py
def test_psycopg_dsn_from_async_url():
    from app.orchestrator_graph import psycopg_dsn_from_async_url

    out = psycopg_dsn_from_async_url(
        "postgresql+asyncpg://duofy:duofy@postgres:5432/duofy_v1"
    )
    assert out == "postgresql://duofy:duofy@postgres:5432/duofy_v1"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_orchestrator_graph.py::test_psycopg_dsn_from_async_url -v`
Expected: FAIL (`ImportError`).

- [ ] **Step 3: Implementar o conversor e ligar o saver (com fallback)**

Adicionar em `orchestrator_graph.py`:

```python
def psycopg_dsn_from_async_url(async_url: str) -> str:
    return async_url.replace("postgresql+asyncpg://", "postgresql://")
```

E em `run_orchestrator`, trocar a criação do grafo por uma versão que tenta o Postgres e cai para memória (Plano B) se indisponível:

```python
    from app.settings import get_settings

    checkpointer = None
    try:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

        dsn = psycopg_dsn_from_async_url(get_settings().database_url)
        cm = AsyncPostgresSaver.from_conn_string(dsn)
        saver = await cm.__aenter__()
        await saver.setup()
        checkpointer = saver
    except Exception:  # noqa: BLE001 — fallback para memória se Postgres/psycopg indisponível
        checkpointer = None

    graph = build_graph(chat_model, tools, checkpointer=checkpointer)
```

Nota: `get_settings().database_url` deve existir (confirmar nome do atributo em `settings.py`; se for `DATABASE_URL`/`database_url`, ajustar). Se o atributo tiver outro nome, usar o correto.

- [ ] **Step 4: Rodar o teste do conversor + suíte**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_orchestrator_graph.py -v`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
.venv/Scripts/python.exe -m ruff check apps/api/app/orchestrator_graph.py
git add apps/api/app/orchestrator_graph.py apps/api/tests/test_orchestrator_graph.py
git commit -m "feat(orchestrator): checkpointer Postgres com fallback em memória"
```

---

### Task 7: Reescrever o prompt do orquestrador

**Files:**
- Modify: `config/agents/orchestrator.md`
- Test: `apps/api/tests/test_orchestrator_prompt.py`

**Interfaces:**
- Consumes: `read_agent_prompt("orchestrator")`.
- Produces: prompt que descreve as ferramentas e o comportamento.

- [ ] **Step 1: Escrever o teste de marcadores do prompt**

```python
# apps/api/tests/test_orchestrator_prompt.py
from app.agent_config import read_agent_prompt


def test_orchestrator_prompt_describes_tools():
    prompt = read_agent_prompt("orchestrator")
    for marker in ["research_market", "create_content", "create_press", "create_calendar", "Guardião"]:
        assert marker in prompt
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_orchestrator_prompt.py -v`
Expected: FAIL (marcadores ausentes no prompt atual).

- [ ] **Step 3: Reescrever `config/agents/orchestrator.md`**

```markdown
# Orquestrador Duofy

Você é o orquestrador do Duofy. Recebe um pedido em linguagem natural no chat e o resolve usando as ferramentas disponíveis, em sequência quando necessário.

## Como agir
- Entenda a intenção real do pedido (não só palavras-chave).
- Se precisar de contexto da marca, use `search_memory` antes de criar algo.
- Para pedidos compostos, encadeie ferramentas (ex: pesquisar e depois escrever): chame `research_market` e depois `create_content` usando o que foi descoberto.
- Extraia os parâmetros corretos do pedido (canal, formato, período). Não invente a marca — ela já está no contexto.
- Você tem no máximo 5 passos de ferramenta por pedido. Seja direto.

## Ferramentas
- `research_market(theme, period?, depth?)`: pesquisa de mercado/concorrência/tendências; gera relatório.
- `create_content(channel, format, briefing, category?)`: gera post/carrossel/artigo como rascunho e envia ao Guardião de Qualidade.
- `create_press(format, briefing, category?)`: gera release/pauta/comunicado como rascunho e envia ao Guardião.
- `create_calendar(objective, period_days?, channels?)`: gera calendário editorial.
- `search_memory(query)`: consulta a memória/documentos da marca (não cria nada).

## Regras
- Você cria rascunhos e roda o Guardião; a aprovação final é sempre do humano. Nunca afirme que algo foi aprovado.
- Se nenhum ferramenta for necessária (saudação, dúvida geral), responda diretamente.
- Resposta final em português, resumindo o que foi feito, citando os IDs criados e indicando onde revisar (/approvals, /content, /calendar).
- Se um provedor LLM não estiver configurado ou uma ferramenta falhar, explique de forma clara e objetiva.
```

- [ ] **Step 4: Rodar e ver passar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_orchestrator_prompt.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config/agents/orchestrator.md apps/api/tests/test_orchestrator_prompt.py
git commit -m "feat(orchestrator): prompt descreve ferramentas e comportamento"
```

---

### Task 8: Verificação fim-a-fim

**Files:** nenhum (verificação).

- [ ] **Step 1: Rebuild e subir api/worker**

Run: `docker compose up -d --build api worker`
Expected: containers sobem saudáveis.

- [ ] **Step 2: Bateria de checks**

Run:
```bash
.venv/Scripts/python.exe -m ruff check apps/api/app apps/api/alembic apps/api/tests
PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests -q
curl -s http://localhost:8000/health
```
Expected: ruff ok; todos os testes passam; health `ok`.

- [ ] **Step 3: Smoke manual via Chat (com provedor configurado)**

No frontend (`/chat`), enviar: "Pesquise o mercado de IA para marketing e escreva um post de LinkedIn sobre isso."
Expected: nos logs da tarefa (SSE) aparecem `🔍 Pesquisando...` e `✍️ Gerando conteúdo...`; ao final, a resposta resume os IDs criados; em `/approvals` aparece o post em status `review` com score do Guardião.

- [ ] **Step 4: Smoke de regressão das páginas**

Abrir `/content` e gerar um conteúdo direto; abrir `/research` e rodar uma pesquisa direta.
Expected: funcionam normalmente (sem regressão), provando que os agentes seguem isolados.

- [ ] **Step 5: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "test(orchestrator): verificação fim-a-fim do orquestrador multiagente"
```

---

## Self-Review (preenchido)

**Cobertura do spec:** problema/objetivo → Tasks 1-8; loop agêntico/teto → Task 4; ferramentas (4 + RAG) → Task 3; rascunho + Guardião → Task 3 (`_submit_to_guardian`); LangGraph/estado → Task 4; persistência Postgres + fallback → Task 6; LLM+custo → Task 2; chat=cérebro / páginas isoladas → Tasks 5 e 8; prompt → Task 7; observabilidade (logs SSE) → Task 3/5 (`log`); testes determinísticos → Tasks 2-5; critérios de sucesso → Task 8.

**Pontos a confirmar na execução (não bloqueiam o plano):**
- Nome exato do atributo de URL em `settings.py` (Task 6, Step 3) — ajustar para o real.
- Versões exatas das deps resolvidas no pip (Task 1) — registrar no commit.
- API de `AsyncPostgresSaver.from_conn_string` pode variar por versão do `langgraph-checkpoint-postgres`; se a assinatura diferir, o fallback em memória mantém o V1 funcional (Task 6).
