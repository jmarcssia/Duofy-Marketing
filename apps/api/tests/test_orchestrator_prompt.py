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
