"""S0 — o prompt do orquestrador descreve o comportamento de briefing."""

from __future__ import annotations

from app.agent_config import read_agent_prompt


def test_orchestrator_prompt_describes_tools():
    prompt = read_agent_prompt("orchestrator")
    markers = [
        "research_market",
        "create_content",
        "create_press",
        "create_calendar",
        "Guardião",
    ]
    for marker in markers:
        assert marker in prompt


def test_orchestrator_prompt_mentions_briefing():
    text = read_agent_prompt("orchestrator").lower()
    # Check for the key phrase about mounting a briefing
    assert "monta um" in text and "briefing" in text
