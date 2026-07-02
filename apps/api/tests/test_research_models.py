"""S0 — lista de modelos de pesquisa carregada do YAML."""

from __future__ import annotations

from app.research_models import allowed_research_model_ids, load_research_models


def test_load_research_models_returns_six_enabled():
    models = load_research_models()
    ids = {m["model_id"] for m in models}
    assert "anthropic/claude-opus-4.8" in ids
    assert "google/gemini-2.5-pro" in ids
    assert len(models) >= 6
    assert all("/" in m["model_id"] and m["label"] for m in models)


def test_allowed_ids_is_a_set():
    ids = allowed_research_model_ids()
    assert "z-ai/glm-5" in ids
    assert "modelo-inexistente" not in ids
