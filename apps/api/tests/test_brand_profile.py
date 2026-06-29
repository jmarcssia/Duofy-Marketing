from app.agent_config import agent_system_prompt, read_brand_profile
from app.models import Agent


def _agent(slug: str = "content_agent") -> Agent:
    return Agent(slug=slug, name="x", default_model="~anthropic/claude-sonnet-latest", is_active=True)


def test_read_brand_profile_returns_text_for_real_brand():
    profile = read_brand_profile("deathcare")
    assert profile is not None
    assert "DeathCare" in profile
    # sensibilidade do nicho precisa estar no perfil
    assert "dignidade" in profile.lower()


def test_read_brand_profile_is_graceful_for_unknown_brand():
    assert read_brand_profile("marca_inexistente_xyz") is None


def test_system_prompt_injects_active_brand_voice():
    prompt = agent_system_prompt(_agent(), brand_slug="deathcare")
    assert "Perfil da marca ativa" in prompt
    assert "DeathCare" in prompt
    # tom sensível do nicho chega ao agente
    assert "luto" in prompt.lower()


def test_system_prompt_without_brand_has_no_profile_block():
    prompt = agent_system_prompt(_agent(), brand_slug=None)
    assert "Perfil da marca ativa" not in prompt


def test_system_prompt_graceful_when_profile_missing():
    # não deve quebrar nem injetar bloco vazio para marca sem perfil
    prompt = agent_system_prompt(_agent(), brand_slug="marca_inexistente_xyz")
    assert "Perfil da marca ativa" not in prompt
