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


@pytest.mark.anyio
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


@pytest.mark.anyio
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
