"""S0 — modelos Briefing e ResearchTheme existem e mapeiam as colunas esperadas."""

from __future__ import annotations

from app.models import Briefing, ResearchTheme


def test_research_theme_columns():
    cols = ResearchTheme.__table__.columns.keys()
    assert {"id", "title", "notes", "brand_slug", "created_at", "updated_at"} <= set(cols)


def test_briefing_columns():
    cols = Briefing.__table__.columns.keys()
    assert {
        "id", "user_id", "brand_slug", "request_text", "tipo", "objetivo",
        "resumo_plano", "agente_alvo", "tema_sugerido", "status",
        "model_override", "research_theme_id", "result_kind", "result_id",
    } <= set(cols)
