import json

import pytest

from app import agent_limits


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"



@pytest.mark.anyio
async def test_token_budget_from_db(monkeypatch):
    async def fake_setting(db, key):
        if key == agent_limits.AGENT_TOKEN_BUDGETS_KEY:
            return json.dumps({"research_agent": 7777})
        return None
    monkeypatch.setattr(agent_limits, "_setting_value", fake_setting)
    assert await agent_limits.get_token_budget(object(), "research_agent") == 7777


@pytest.mark.anyio
async def test_token_budget_falls_back_to_config(monkeypatch):
    async def fake_setting(db, key):
        return None  # nada no Admin
    monkeypatch.setattr(agent_limits, "_setting_value", fake_setting)
    # default do YAML
    assert await agent_limits.get_token_budget(object(), "content_agent") == 4000


@pytest.mark.anyio
async def test_token_budget_unknown_agent_uses_default(monkeypatch):
    async def fake_setting(db, key):
        return None
    monkeypatch.setattr(agent_limits, "_setting_value", fake_setting)
    assert await agent_limits.get_token_budget(object(), "agente_inexistente") == 1500


@pytest.mark.anyio
async def test_token_budget_invalid_db_value_falls_back(monkeypatch):
    async def fake_setting(db, key):
        return "isto nao e json"
    monkeypatch.setattr(agent_limits, "_setting_value", fake_setting)
    assert await agent_limits.get_token_budget(object(), "content_agent") == 4000


@pytest.mark.anyio
async def test_research_depth_from_config(monkeypatch):
    async def fake_setting(db, key):
        return None
    monkeypatch.setattr(agent_limits, "_setting_value", fake_setting)
    result = await agent_limits.get_research_depth_limits(object(), "deep")
    assert result == {"sources": 30, "excerpt": 6000}


@pytest.mark.anyio
async def test_research_depth_unknown_uses_quick(monkeypatch):
    async def fake_setting(db, key):
        return None
    monkeypatch.setattr(agent_limits, "_setting_value", fake_setting)
    result = await agent_limits.get_research_depth_limits(object(), "xpto")
    assert result == {"sources": 5, "excerpt": 1800}


@pytest.mark.anyio
async def test_research_depth_invalid_db_falls_back_to_config(monkeypatch):
    import json
    async def fake_setting(db, key):
        if key == agent_limits.RESEARCH_DEPTH_LIMITS_KEY:
            db_data = {
                "deep": {"sources": 0, "excerpt": 100},
                "quick": {"sources": 5, "excerpt": 600},
            }
            return json.dumps(db_data)
        return None
    monkeypatch.setattr(agent_limits, "_setting_value", fake_setting)
    # DB "deep" is invalid -> must use config "deep" (30/6000), NOT DB "quick"
    result = await agent_limits.get_research_depth_limits(object(), "deep")
    assert result == {"sources": 30, "excerpt": 6000}
