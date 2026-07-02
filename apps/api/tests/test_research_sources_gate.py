"""S0 — evidencia-piso via snippet e contagem de fontes usaveis."""

from __future__ import annotations

import pytest

from app.research_service import (
    CollectedSource,
    SourceCandidate,
    _dedupe_by_domain,
    count_usable_sources,
)

pytestmark = pytest.mark.anyio


def _collected(url: str, status: str = "collected") -> CollectedSource:
    return CollectedSource(
        title="t", url=url, publisher=None, published_at=None,
        reliability="C", source_kind="rss", status=status, evidence="x", error=None,
    )


def test_count_usable_sources_counts_only_collected():
    items = [_collected("a"), _collected("b", status="failed"), _collected("c")]
    assert count_usable_sources(items) == 2


def test_dedupe_by_domain_limits_per_domain():
    cands = [
        SourceCandidate(title="1", url="https://g1.globo.com/a", source_kind="rss"),
        SourceCandidate(title="2", url="https://g1.globo.com/b", source_kind="rss"),
        SourceCandidate(title="3", url="https://g1.globo.com/c", source_kind="rss"),
        SourceCandidate(title="4", url="https://exame.com/x", source_kind="rss"),
    ]
    out = _dedupe_by_domain(cands, sources=10, per_domain=2)
    globo = [c for c in out if "globo.com" in c.url]
    assert len(globo) == 2  # terceiro do mesmo dominio descartado
    assert any("exame.com" in c.url for c in out)


async def test_collect_candidate_uses_summary_when_page_empty(monkeypatch):
    from app import research_service as rs

    async def fake_fetch(url: str) -> str:
        return ""  # pagina sem texto

    monkeypatch.setattr(rs, "_fetch_url_text", fake_fetch)
    cand = SourceCandidate(
        title="Nota", url="https://news.google.com/rss/articles/abc",
        source_kind="rss", summary="Trecho real do snippet do RSS sobre o tema.",
    )
    result = await rs._collect_candidate(cand, use_playwright=False, excerpt_limit=1800)
    assert result.status == "collected"
    assert "snippet" in result.evidence.lower()
