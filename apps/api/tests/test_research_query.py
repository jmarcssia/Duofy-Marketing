"""S0 — a query do Google News nao injeta a string de periodo e usa when:Nd."""

from __future__ import annotations

from types import SimpleNamespace

from app.research_service import _google_news_rss_url, _period_days


def test_period_days_parses_number():
    assert _period_days("ultimos 30 dias") == 30
    assert _period_days("7 dias") == 7
    assert _period_days("") == 30  # fallback


def test_query_has_when_and_no_period_words():
    brand = SimpleNamespace(niche="deathcare")
    url = _google_news_rss_url("deathcare pet", brand, "ultimos 30 dias")
    assert "when%3A30d" in url or "when:30d" in url
    # a string literal do periodo NAO pode entrar na busca
    assert "ultimos" not in url
    assert "deathcare" in url
