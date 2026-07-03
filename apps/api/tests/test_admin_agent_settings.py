import json

import pytest
from fastapi import HTTPException

from app.routers import admin
from app.schemas import AgentSettingsUpdate


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_update_agent_settings_persists(monkeypatch):
    store = {}

    async def fake_upsert(db, key, value):
        store[key] = value

    async def fake_get(db, key):
        return store.get(key)

    monkeypatch.setattr(admin, "_upsert_setting", fake_upsert)
    monkeypatch.setattr(admin, "_setting_value", fake_get)

    class _Db:
        async def commit(self):
            pass

    payload = AgentSettingsUpdate(
        token_budgets={"research_agent": 8000},
        research_depth={"deep": {"sources": 20, "excerpt": 5000}},
    )
    result = await admin.update_agent_settings(payload, _current_user=None, db=_Db())
    assert result.token_budgets["research_agent"] == 8000
    assert json.loads(store[admin.AGENT_TOKEN_BUDGETS_KEY])["research_agent"] == 8000


@pytest.mark.anyio
async def test_get_agent_settings_merges_saved_with_defaults(monkeypatch):
    saved = {admin.AGENT_TOKEN_BUDGETS_KEY: json.dumps({"research_agent": 9000})}

    async def fake_get(db, key):
        return saved.get(key)

    monkeypatch.setattr(admin, "_setting_value", fake_get)

    class _Db:
        pass

    result = await admin.get_agent_settings(_current_user=None, db=_Db())
    # Saved value overrides config default for research_agent
    assert result.token_budgets["research_agent"] == 9000
    # Non-overridden default from agent_limits.yaml is still present
    assert result.token_budgets["content_agent"] == 12000


@pytest.mark.anyio
async def test_update_agent_settings_rejects_out_of_range(monkeypatch):
    monkeypatch.setattr(admin, "_upsert_setting", lambda *a, **k: None)

    class _Db:
        async def commit(self):
            pass

    with pytest.raises(HTTPException):
        await admin.update_agent_settings(
            AgentSettingsUpdate(token_budgets={"research_agent": 999999}, research_depth={}),
            _current_user=None,
            db=_Db(),
        )
