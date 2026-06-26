import pytest
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, LLMResult

from app import orchestrator_llm


@pytest.mark.anyio
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
    usage = {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
    result = LLMResult(
        generations=[[gen]],
        llm_output={"token_usage": usage},
    )
    await tracker.on_llm_end(result)

    assert captured["task_id"] == 7
    assert captured["provider"] == "openrouter"
    assert captured["input_tokens"] == 10
    assert captured["output_tokens"] == 5
    assert captured["total_tokens"] == 15
    assert captured["status"] == "completed"
