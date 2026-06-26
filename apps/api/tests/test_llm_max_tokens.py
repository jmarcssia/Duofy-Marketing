import pytest

from app import llm
from app.models import ProviderCredential


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _cred() -> ProviderCredential:
    return ProviderCredential(
        provider="openrouter", api_key_encrypted=None, base_url=None,
        default_model="anthropic/claude-sonnet", is_enabled=True,
    )


@pytest.mark.anyio
async def test_call_llm_passes_custom_max_tokens(monkeypatch):
    captured = {}

    async def fake_compat(*, credential, model, system_prompt, user_prompt, base_url,
                          extra_headers=None, use_web_search=False, max_tokens):
        captured["max_tokens"] = max_tokens
        return llm.LLMResult(output="ok", provider="openrouter", model=model)

    monkeypatch.setattr(llm, "_call_openai_compatible", fake_compat)
    monkeypatch.setattr(llm, "record_model_call", _noop_record)

    await llm.call_llm(credential=_cred(), model="anthropic/claude-sonnet",
                       system_prompt="s", user_prompt="u", max_tokens=5000)
    assert captured["max_tokens"] == 5000


async def _noop_record(**kwargs):
    return None
