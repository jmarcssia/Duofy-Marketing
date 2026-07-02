"""S0 — parser do HTML do DuckDuckGo (busca web geral da pesquisa)."""

from __future__ import annotations

from app.research_service import _decode_ddg_url, parse_ddg_html

_SAMPLE_HTML = """
<html><body>
  <div class="result">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.petfenix.com%2F&rut=x">
      PetFenix Crematorio de Animais
    </a>
    <a class="result__snippet">Crematorio pet com cerimonia de despedida em todo o Brasil.</a>
  </div>
  <div class="result">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fg1.globo.com%2Fnoticia%2Fpet">
      Funerais de pet aquecem o mercado
    </a>
    <a class="result__snippet">Luto pet movimenta o setor funerario e a cremacao de animais.</a>
  </div>
</body></html>
"""


def test_decode_ddg_url_extracts_real_url():
    href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.petfenix.com%2F&rut=abc"
    assert _decode_ddg_url(href) == "https://www.petfenix.com/"


def test_parse_ddg_html_returns_candidates_with_url_and_snippet():
    cands = parse_ddg_html(_SAMPLE_HTML, sources=10)
    assert len(cands) == 2
    urls = {c.url for c in cands}
    assert "https://www.petfenix.com/" in urls
    assert any("g1.globo.com" in c.url for c in cands)
    first = cands[0]
    assert first.source_kind == "ddg"
    assert first.summary and "cremat" in first.summary.lower()
    assert first.url.startswith("http")  # nunca deixa o redirect do DDG
