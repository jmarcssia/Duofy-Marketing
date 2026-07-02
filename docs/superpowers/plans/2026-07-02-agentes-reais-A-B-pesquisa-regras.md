# Agentes reais — Parte A+B (pesquisa real + motor de regras) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o `research_agent` coletar fontes reais e nunca produzir relatório hipotético, e criar um motor de regras (config + validação) que os agentes seguem e o Guardião aplica.

**Architecture:** Corrige a coleta de fontes (query `when:Nd`, snippet do RSS como evidência-piso, dedupe por domínio) e adiciona uma porta de fontes mínimas que recusa honestamente (sem criar Output). Introduz `config/rules/agent_rules.yaml` + loader + validador, injetados no prompt e aplicados pelo Guardião. Markdown continua o formato canônico.

**Tech Stack:** FastAPI + SQLAlchemy async + Pydantic v2 + Alembic (não usado aqui) + pytest/anyio; YAML de config via `read_config_text`.

## Global Constraints

- **Não reescrever arquitetura.** Reusar `run_market_research`, `collect_research_sources`, `call_llm`, `read_config_text`, `quality_guardian`. Markdown segue canônico (sem JSON).
- **Mínimo de fontes:** Rápida (`quick`) = 3, Profunda (`deep`) = 5. Valores vêm de `config/rules/agent_rules.yaml`.
- **Sem fonte suficiente → recusa honesta:** `run_market_research` levanta `InsufficientSourcesError`; o endpoint de approve devolve **422** com mensagem amigável e **não cria Output**.
- **Termos proibidos em pesquisa** (crítico): `confiança nula`, `ausência total de fontes`, `vácuo de informação`, `hipotético`.
- **Seções obrigatórias de pesquisa:** `Resumo executivo`, `Sinais de mercado`, `Oportunidades`, `Concorrentes`, `Riscos`, `Recomendações`, `Sugestões de pauta`, `Fontes`.
- **Testes S0:** banco `duofy_v1_test`, `@pytest.mark.anyio`, fixtures `client`/`auth_headers`/`patch_ai` de `apps/api/tests/conftest.py`. Rodar pytest/ruff com o venv da RAIZ `C:\DUOFY_V1_MARKETING_AI\.venv` (tem todas as deps). CI = `ruff check app alembic` (não lint `tests/`), line-length 100.
- Caminhos relativos a `C:\DUOFY_V1_MARKETING_AI`. Backend em `apps/api`.

---

## File Structure

**Novos:**
- `apps/api/app/errors.py` — `InsufficientSourcesError`.
- `apps/api/app/agent_rules.py` — loader de `config/rules/agent_rules.yaml`.
- `apps/api/app/rules_validation.py` — `validate_document`.
- `config/rules/agent_rules.yaml` — regras de máquina por agente.
- Testes: `apps/api/tests/test_research_query.py`, `test_research_sources_gate.py`, `test_agent_rules.py`, `test_rules_validation.py`, `test_flow_research_insufficient.py`.

**Modificados:**
- `apps/api/app/research_service.py` — query, snippet, dedupe por domínio, `count_usable_sources`, gate.
- `apps/api/app/briefing_service.py` — deixa `InsufficientSourcesError` propagar.
- `apps/api/app/routers/orchestrator.py` — mapeia `InsufficientSourcesError` → 422.
- `apps/api/app/content_generation.py` e `apps/api/app/research_service.py` — injeção de regras no prompt.
- `apps/api/app/quality_guardian.py` — incorpora `validate_document`.

---

## Task 1: Query correta do Google News (`when:Nd`, sem período embutido)

**Files:**
- Modify: `apps/api/app/research_service.py` (`_google_news_rss_url`, novo `_period_days`)
- Test: `apps/api/tests/test_research_query.py`

**Interfaces:**
- Produces: `_period_days(period: str) -> int` (dias; default 30); `_google_news_rss_url(theme, brand, period) -> str` que usa `when:{days}d` e NÃO injeta a string de período na busca.

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/api/tests/test_research_query.py`:

```python
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest tests/test_research_query.py -v`
Expected: FAIL (`ImportError: cannot import name '_period_days'`).

- [ ] **Step 3: Implementar**

Em `apps/api/app/research_service.py`, adicionar `import re` no topo (se ainda não houver) e substituir `_google_news_rss_url`:

```python
def _period_days(period: str) -> int:
    match = re.search(r"(\d+)", period or "")
    if match:
        value = int(match.group(1))
        if 1 <= value <= 365:
            return value
    return 30


def _google_news_rss_url(theme: str, brand: Brand, period: str) -> str:
    days = _period_days(period)
    query = quote_plus(f"{theme} {brand.niche} when:{days}d")
    return f"https://news.google.com/rss/search?q={query}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest tests/test_research_query.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/research_service.py apps/api/tests/test_research_query.py
git commit -m "fix(research): query do Google News usa when:Nd e nao injeta o periodo na busca"
```

---

## Task 2: Snippet do RSS como evidência-piso + dedupe por domínio

**Files:**
- Modify: `apps/api/app/research_service.py` (`SourceCandidate`, `_rss_candidates`, `_collect_candidate`, `_dedupe_candidates`, `collect_research_sources`)
- Test: `apps/api/tests/test_research_sources_gate.py` (parte 1)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `SourceCandidate` ganha campo `summary: str | None = None`; `_collect_candidate` usa `candidate.summary` como evidência quando a página não rende texto; `_dedupe_by_domain(candidates, sources, per_domain=2) -> list[SourceCandidate]`; `count_usable_sources(sources: list[CollectedSource]) -> int`.

- [ ] **Step 1: Escrever os testes que falham**

Create `apps/api/tests/test_research_sources_gate.py`:

```python
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest tests/test_research_sources_gate.py -v`
Expected: FAIL (`ImportError` de `_dedupe_by_domain`/`count_usable_sources`, e `SourceCandidate` sem `summary`).

- [ ] **Step 3: Adicionar `summary` ao `SourceCandidate`**

Em `apps/api/app/research_service.py`, na dataclass `SourceCandidate`, adicionar o campo:

```python
@dataclass(frozen=True)
class SourceCandidate:
    title: str
    url: str
    publisher: str | None = None
    published_at: str | None = None
    source_kind: str = "rss"
    summary: str | None = None
```

- [ ] **Step 4: Capturar o snippet no `_rss_candidates`**

Em `_rss_candidates`, ao montar cada `SourceCandidate`, incluir o resumo do feed:

```python
        candidates.append(
            SourceCandidate(
                title=str(entry.get("title", "Fonte sem titulo")).strip(),
                url=url,
                publisher=str(entry.get("source", {}).get("title", "") or "") or None,
                published_at=str(entry.get("published", "") or "") or None,
                source_kind="rss",
                summary=(str(entry.get("summary", "") or "").strip() or None),
            )
        )
```

- [ ] **Step 5: Usar o snippet como evidência-piso no `_collect_candidate`**

Substituir o corpo do `try` em `_collect_candidate` para cair no snippet quando a página não rende texto:

```python
    publisher = candidate.publisher or _publisher_from_url(candidate.url)
    snippet = _plain_text_from_html(candidate.summary) if candidate.summary else ""
    try:
        text = await _fetch_url_text(candidate.url)
        source_kind = "http" if candidate.source_kind == "rss" else candidate.source_kind
        if len(text) < 450 and use_playwright:
            try:
                text = await _fetch_with_playwright(candidate.url)
                source_kind = "playwright"
            except Exception:
                text = text  # mantem o que tiver; snippet abaixo cobre o piso
        if len(text) < 200 and snippet:
            text = snippet
            source_kind = "rss_snippet"
        evidence = _evidence_excerpt(text, excerpt_limit)
        status = "collected" if evidence else "failed"
        error = None if evidence else "Fonte sem texto extraivel."
    except Exception as exc:
        # falha ao buscar a pagina: usa o snippet do RSS como piso
        if snippet:
            evidence = _evidence_excerpt(snippet, excerpt_limit)
            status = "collected"
            error = None
            source_kind = "rss_snippet"
        else:
            evidence = ""
            status = "failed"
            error = str(exc)[:800]
            source_kind = candidate.source_kind
```

> Note: o teste `test_collect_candidate_uses_summary_when_page_empty` espera que a evidência contenha "snippet" — garanta que o texto do snippet do teste ("...snippet do RSS...") entra em `evidence`. O snippet do teste contém a palavra "snippet"; o `_plain_text_from_html` de um texto puro devolve o próprio texto.

- [ ] **Step 6: Adicionar `_dedupe_by_domain` e `count_usable_sources`**

Adicionar ao `research_service.py` (perto de `_dedupe_candidates`):

```python
def _dedupe_by_domain(
    candidates: list[SourceCandidate], sources: int, per_domain: int = 2
) -> list[SourceCandidate]:
    """Prioriza diversidade: no maximo `per_domain` fontes por dominio, ate `sources`."""
    seen_urls: set[str] = set()
    per_host: dict[str, int] = {}
    unique: list[SourceCandidate] = []
    for candidate in candidates:
        if candidate.url in seen_urls:
            continue
        host = _publisher_from_url(candidate.url) or candidate.url
        if per_host.get(host, 0) >= per_domain:
            continue
        seen_urls.add(candidate.url)
        per_host[host] = per_host.get(host, 0) + 1
        unique.append(candidate)
        if len(unique) >= sources:
            break
    return unique


def count_usable_sources(sources: list[CollectedSource]) -> int:
    return sum(1 for s in sources if s.status == "collected")
```

- [ ] **Step 7: Usar dedupe por domínio no `collect_research_sources`**

Em `collect_research_sources`, trocar a linha `unique = _dedupe_candidates(candidates, sources)` por:

```python
    if payload.depth == "deep":
        unique = _dedupe_by_domain(candidates, sources, per_domain=2)
    else:
        unique = _dedupe_candidates(candidates, sources)
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest tests/test_research_sources_gate.py -v`
Expected: PASS (3 passed).

- [ ] **Step 9: Commit**

```bash
git add apps/api/app/research_service.py apps/api/tests/test_research_sources_gate.py
git commit -m "feat(research): snippet do RSS como evidencia-piso + dedupe por dominio na profunda"
```

---

## Task 3: `InsufficientSourcesError` + porta de fontes mínimas no fluxo

**Files:**
- Create: `apps/api/app/errors.py`
- Modify: `apps/api/app/research_service.py` (`run_market_research`), `apps/api/app/routers/orchestrator.py` (mapear → 422)
- Test: `apps/api/tests/test_flow_research_insufficient.py`

**Interfaces:**
- Consumes: `count_usable_sources` (Task 2).
- Produces: `InsufficientSourcesError(theme, found, needed)` (atributos `theme`, `found`, `needed`); `run_market_research` levanta a exceção quando `count_usable_sources(collected) < min` (min: quick=3, deep=5, hardcoded aqui — substituído pela regra na Task 4).

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/api/tests/test_flow_research_insufficient.py`:

```python
"""S0 — pesquisa sem fontes suficientes recusa (422) e nao cria Output."""

from __future__ import annotations

import json

import pytest

from app.models import Output
from sqlalchemy import func, select

pytestmark = pytest.mark.anyio


async def test_research_without_sources_returns_422_and_no_output(
    client, auth_headers, patch_ai, monkeypatch, db
):
    # forca a coleta a devolver zero fontes usaveis
    from app import research_service as rs

    async def fake_collect(db_, payload, brand):
        return []

    monkeypatch.setattr(rs, "collect_research_sources", fake_collect)

    # plano de pesquisa em branco -> pending
    plan = client.post(
        "/api/orchestrator/plan-research",
        json={"brand_slug": "deathcare", "theme": "tema sem noticias xyzqwe"},
        headers=auth_headers,
    )
    assert plan.status_code == 200, plan.text
    bid = plan.json()["id"]

    before = (await db.execute(select(func.count()).select_from(Output))).scalar_one()

    approve = client.post(
        f"/api/orchestrator/briefings/{bid}/approve",
        json={"model_override": "anthropic/claude-opus-4.8", "depth": "quick"},
        headers=auth_headers,
    )
    assert approve.status_code == 422, approve.text
    assert "fontes" in approve.json()["detail"].lower()

    after = (await db.execute(select(func.count()).select_from(Output))).scalar_one()
    assert after == before  # nenhum Output criado
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest tests/test_flow_research_insufficient.py -v`
Expected: FAIL (o approve hoje devolve 200/500, não 422).

- [ ] **Step 3: Criar a exceção**

Create `apps/api/app/errors.py`:

```python
"""Erros de dominio dos agentes."""

from __future__ import annotations


class InsufficientSourcesError(Exception):
    """A pesquisa nao encontrou fontes reais suficientes; nao gerar relatorio hipotetico."""

    def __init__(self, *, theme: str, found: int, needed: int) -> None:
        self.theme = theme
        self.found = found
        self.needed = needed
        super().__init__(
            f"Fontes insuficientes para '{theme}': encontrei {found}, preciso de {needed}."
        )
```

- [ ] **Step 4: Aplicar a porta no `run_market_research`**

Em `apps/api/app/research_service.py`, adicionar o import no topo:

```python
from app.errors import InsufficientSourcesError
```

E logo após a linha `collected_sources = await collect_research_sources(db, payload, brand)` (dentro de `run_market_research`), inserir:

```python
    _min = {"quick": 3, "deep": 5}.get(payload.depth, 3)
    _usable = count_usable_sources(collected_sources)
    if _usable < _min:
        raise InsufficientSourcesError(theme=payload.theme, found=_usable, needed=_min)
```

> A exceção é levantada ANTES de qualquer `db.add`/commit de Output, então nenhum Output é criado. O `except Exception` existente em `run_market_research` (que grava um AgentRun "failed" e re-levanta) vai capturar e re-levantar — tudo bem, o Output não é criado e a exceção chega ao router.

- [ ] **Step 5: Mapear para 422 no router**

Em `apps/api/app/routers/orchestrator.py`, no endpoint `approve`, adicionar o import:

```python
from app.errors import InsufficientSourcesError
```

E no bloco `try/except` do approve, adicionar um `except` ESPECÍFICO **antes** do `except Exception` genérico:

```python
    except InsufficientSourcesError as exc:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Nao encontrei fontes suficientes sobre '{exc.theme}' "
                f"(achei {exc.found}, preciso de {exc.needed}). "
                "Refine o tema ou informe URLs."
            ),
        ) from exc
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest tests/test_flow_research_insufficient.py -v`
Expected: PASS (1 passed).

- [ ] **Step 7: Regressão do fluxo de briefing**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest tests/test_flow_briefing.py -q`
Expected: PASS (os testes de pesquisa que usam `patch_ai` — confirmar que a coleta com `patch_ai` ainda devolve fontes suficientes; se algum teste de pesquisa quebrar por causa da porta, ele deve passar a mockar `collect_research_sources` para devolver ≥3 fontes usáveis — ajuste o teste, não o código).

- [ ] **Step 8: Commit**

```bash
git add apps/api/app/errors.py apps/api/app/research_service.py apps/api/app/routers/orchestrator.py apps/api/tests/test_flow_research_insufficient.py
git commit -m "feat(research): porta de fontes minimas — recusa honesta (422) sem criar Output"
```

---

## Task 4: `config/rules/agent_rules.yaml` + loader

**Files:**
- Create: `config/rules/agent_rules.yaml`, `apps/api/app/agent_rules.py`
- Modify: `apps/api/app/research_service.py` (usar `min_sources_for` na porta)
- Test: `apps/api/tests/test_agent_rules.py`

**Interfaces:**
- Consumes: `read_config_text` (agent_config).
- Produces: `get_agent_rules(agent_slug: str) -> dict`; `min_sources_for(agent_slug: str, depth: str) -> int`; `required_sections_for(agent_slug: str, channel: str | None = None) -> list[str]`; `forbidden_terms_for(agent_slug: str) -> list[str]`; `citation_required_for(agent_slug: str) -> bool`.

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/api/tests/test_agent_rules.py`:

```python
"""S0 — regras de maquina por agente (config/rules/agent_rules.yaml)."""

from __future__ import annotations

from app.agent_rules import (
    citation_required_for,
    forbidden_terms_for,
    get_agent_rules,
    min_sources_for,
    required_sections_for,
)


def test_min_sources_research():
    assert min_sources_for("research_agent", "quick") == 3
    assert min_sources_for("research_agent", "deep") == 5


def test_required_sections_research_has_fontes():
    secs = required_sections_for("research_agent")
    assert "Fontes" in secs
    assert "Resumo executivo" in secs


def test_forbidden_and_citation():
    assert "confiança nula" in [t.lower() for t in forbidden_terms_for("research_agent")]
    assert citation_required_for("research_agent") is True


def test_unknown_agent_is_empty_safe():
    assert get_agent_rules("inexistente") == {}
    assert min_sources_for("inexistente", "quick") == 3  # fallback
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest tests/test_agent_rules.py -v`
Expected: FAIL (`ModuleNotFoundError: app.agent_rules`).

- [ ] **Step 3: Criar o YAML**

Create `config/rules/agent_rules.yaml`:

```yaml
# Regras de maquina por agente: injetadas no prompt E validadas apos a geracao.
research_agent:
  min_sources: { quick: 3, deep: 5 }
  required_sections:
    - "Resumo executivo"
    - "Sinais de mercado"
    - "Oportunidades"
    - "Concorrentes"
    - "Riscos"
    - "Recomendações"
    - "Sugestões de pauta"
    - "Fontes"
  citation_required: true
  forbidden:
    - "confiança nula"
    - "ausência total de fontes"
    - "vácuo de informação"
    - "hipotético"
content_agent:
  required_sections:
    default:
      - "Objetivo editorial"
      - "Conteúdo final"
      - "CTA"
  citation_required: false
  forbidden:
    - "[preencher]"
    - "lorem ipsum"
```

- [ ] **Step 4: Criar o loader**

Create `apps/api/app/agent_rules.py`:

```python
"""Carrega regras de maquina por agente de config/rules/agent_rules.yaml."""

from __future__ import annotations

import logging

import yaml

from app.agent_config import read_config_text

logger = logging.getLogger(__name__)

_DEFAULT_MIN_SOURCES = {"quick": 3, "deep": 5}


def get_agent_rules(agent_slug: str) -> dict:
    try:
        data = yaml.safe_load(read_config_text("rules", "agent_rules.yaml")) or {}
    except Exception as exc:  # noqa: BLE001 - config ausente cai para vazio
        logger.warning("agent_rules.yaml indisponivel: %s", exc)
        return {}
    rules = data.get(agent_slug)
    return rules if isinstance(rules, dict) else {}


def min_sources_for(agent_slug: str, depth: str) -> int:
    rules = get_agent_rules(agent_slug)
    table = rules.get("min_sources") if isinstance(rules.get("min_sources"), dict) else {}
    value = table.get(depth)
    if isinstance(value, int) and 1 <= value <= 50:
        return value
    return _DEFAULT_MIN_SOURCES.get(depth, 3)


def required_sections_for(agent_slug: str, channel: str | None = None) -> list[str]:
    rules = get_agent_rules(agent_slug)
    req = rules.get("required_sections")
    if isinstance(req, list):
        return [str(s) for s in req]
    if isinstance(req, dict):
        # content_agent: por canal com fallback "default"
        key = (channel or "").lower()
        for candidate in (key, "default"):
            if isinstance(req.get(candidate), list):
                return [str(s) for s in req[candidate]]
    return []


def forbidden_terms_for(agent_slug: str) -> list[str]:
    rules = get_agent_rules(agent_slug)
    terms = rules.get("forbidden")
    return [str(t) for t in terms] if isinstance(terms, list) else []


def citation_required_for(agent_slug: str) -> bool:
    return bool(get_agent_rules(agent_slug).get("citation_required", False))
```

- [ ] **Step 5: Usar `min_sources_for` na porta (substitui o hardcode da Task 3)**

Em `apps/api/app/research_service.py`, adicionar o import:

```python
from app.agent_rules import min_sources_for
```

E trocar a linha `_min = {"quick": 3, "deep": 5}.get(payload.depth, 3)` por:

```python
    _min = min_sources_for("research_agent", payload.depth)
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest tests/test_agent_rules.py tests/test_flow_research_insufficient.py -v`
Expected: PASS (todos).

- [ ] **Step 7: Commit**

```bash
git add config/rules/agent_rules.yaml apps/api/app/agent_rules.py apps/api/app/research_service.py apps/api/tests/test_agent_rules.py
git commit -m "feat(rules): motor de regras por agente (agent_rules.yaml + loader) e min_sources na porta"
```

---

## Task 5: Validador de documento (`rules_validation.py`)

**Files:**
- Create: `apps/api/app/rules_validation.py`
- Test: `apps/api/tests/test_rules_validation.py`

**Interfaces:**
- Consumes: `required_sections_for`, `forbidden_terms_for`, `citation_required_for` (Task 4).
- Produces: `validate_document(content: str, agent_slug: str, channel: str | None = None) -> list[dict]` — cada violação `{"severity": "critical"|"required", "message": str}`.

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/api/tests/test_rules_validation.py`:

```python
"""S0 — validacao de documento contra as regras de maquina."""

from __future__ import annotations

from app.rules_validation import validate_document

_OK_RESEARCH = (
    "# Relatorio\n\n## Resumo executivo\nAlgo [1].\n\n## Sinais de mercado\nx [1]\n\n"
    "## Oportunidades\nx\n\n## Concorrentes\nx\n\n## Riscos\nx\n\n## Recomendações\nx\n\n"
    "## Sugestões de pauta\nx\n\n## Fontes\n[1] exemplo.com\n"
)


def test_valid_research_has_no_violations():
    assert validate_document(_OK_RESEARCH, "research_agent") == []


def test_missing_section_is_required_violation():
    content = _OK_RESEARCH.replace("## Fontes\n[1] exemplo.com\n", "")
    viols = validate_document(content, "research_agent")
    assert any(v["severity"] == "required" and "Fontes" in v["message"] for v in viols)


def test_forbidden_term_is_critical():
    content = _OK_RESEARCH + "\nConfiança nula sobre tudo.\n"
    viols = validate_document(content, "research_agent")
    assert any(v["severity"] == "critical" for v in viols)


def test_no_citation_flags_when_required():
    content = _OK_RESEARCH.replace("[1]", "")  # remove todas as citacoes
    viols = validate_document(content, "research_agent")
    assert any("cita" in v["message"].lower() for v in viols)
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest tests/test_rules_validation.py -v`
Expected: FAIL (`ModuleNotFoundError: app.rules_validation`).

- [ ] **Step 3: Implementar**

Create `apps/api/app/rules_validation.py`:

```python
"""Valida um documento gerado contra as regras de maquina do agente."""

from __future__ import annotations

import re

from app.agent_rules import (
    citation_required_for,
    forbidden_terms_for,
    required_sections_for,
)

_CITATION_RE = re.compile(r"\[\d+\]")


def validate_document(content: str, agent_slug: str, channel: str | None = None) -> list[dict]:
    text = content or ""
    lower = text.lower()
    violations: list[dict] = []

    for section in required_sections_for(agent_slug, channel):
        # secao presente se aparece como cabecalho markdown "## Secao" (case-insensitive)
        pattern = re.compile(r"^#{1,6}\s*" + re.escape(section), re.IGNORECASE | re.MULTILINE)
        if not pattern.search(text):
            violations.append(
                {"severity": "required", "message": f"Seção obrigatória ausente: {section}."}
            )

    for term in forbidden_terms_for(agent_slug):
        if term.lower() in lower:
            violations.append(
                {"severity": "critical", "message": f"Termo proibido presente: '{term}'."}
            )

    if citation_required_for(agent_slug) and not _CITATION_RE.search(text):
        violations.append(
            {"severity": "critical", "message": "Nenhuma citação [n] encontrada (citação obrigatória)."}
        )

    return violations
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest tests/test_rules_validation.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/rules_validation.py apps/api/tests/test_rules_validation.py
git commit -m "feat(rules): validate_document (secoes obrigatorias, termos proibidos, citacao)"
```

---

## Task 6: Injeção de regras no prompt + integração no Guardião

**Files:**
- Modify: `apps/api/app/research_service.py` (`_system_prompt` ou `_user_prompt` da pesquisa), `apps/api/app/content_generation.py` (idem), `apps/api/app/quality_guardian.py` (`assess_output_quality`)
- Test: `apps/api/tests/test_guardian_rules.py`

**Interfaces:**
- Consumes: `required_sections_for`, `forbidden_terms_for`, `citation_required_for` (Task 4), `validate_document` (Task 5).
- Produces: bloco de regras anexado ao user prompt de pesquisa e conteúdo; violações de `validate_document` incorporadas ao resultado do Guardião (críticas → `critical_failures`; required → `required_fixes`).

- [ ] **Step 1: Escrever o teste que falha (Guardião incorpora violações)**

Create `apps/api/tests/test_guardian_rules.py`:

```python
"""S0 — o Guardiao incorpora as violacoes de regras de maquina."""

from __future__ import annotations

import pytest

from app.models import Output, OutputVersion
from app.quality_guardian import assess_output_quality

pytestmark = pytest.mark.anyio


async def test_guardian_flags_forbidden_term_as_critical(db):
    output = Output(
        brand_slug="deathcare", category="research", channel="Pesquisa",
        format="research_report", title="R", briefing="b", status="draft",
        provider="openrouter", model="x",
    )
    db.add(output)
    await db.flush()
    version = OutputVersion(
        output_id=output.id, version_number=1,
        content="# R\n\n## Resumo executivo\nConfiança nula.\n",
        editor_note="t",
    )
    db.add(version)
    await db.flush()

    assessment = assess_output_quality(output, version.content)
    joined = " ".join(assessment.critical_failures).lower()
    assert "proibido" in joined or "confiança nula" in joined
```

> Confirme a forma real de `assess_output_quality` (assinatura e o objeto retornado com `.critical_failures`) lendo `apps/api/app/quality_guardian.py` antes de implementar; ajuste a chamada do teste para a assinatura real (pode ser `assess_output_quality(output, content)` ou receber o profile). O importante é o assert de que o termo proibido vira falha crítica.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest tests/test_guardian_rules.py -v`
Expected: FAIL (o Guardião ainda não incorpora `validate_document`).

- [ ] **Step 3: Integrar `validate_document` no Guardião**

Em `apps/api/app/quality_guardian.py`, no `assess_output_quality` (avaliação local), após montar as listas de falhas, incorporar as violações de regra. Adicionar o import:

```python
from app.rules_validation import validate_document
```

E, dentro de `assess_output_quality`, derivar o `agent_slug` do canal (`"research_agent"` se `output.channel == "Pesquisa"`, senão `"content_agent"`) e aplicar:

```python
    _agent_slug = "research_agent" if output.channel == "Pesquisa" else "content_agent"
    for _v in validate_document(content, _agent_slug, channel=output.channel):
        if _v["severity"] == "critical":
            critical_failures.append(_v["message"])
        else:
            required_fixes.append(_v["message"])
```

> Use os nomes reais das listas locais do `assess_output_quality` (ex.: `critical_failures`, `required_fixes`) — leia a função e adapte. Recalcule o `score`/`passed` se a função computa penalidades a partir dessas listas (siga o padrão existente; se o score é derivado depois das listas, apenas anexe antes do cálculo).

- [ ] **Step 4: Injetar regras no prompt de pesquisa**

Em `apps/api/app/research_service.py`, na função que monta o user prompt da pesquisa (`_user_prompt`), anexar um bloco de regras ao final. Adicionar imports:

```python
from app.agent_rules import citation_required_for, forbidden_terms_for, required_sections_for
```

E construir e anexar o bloco (dentro de `_user_prompt`, antes do return):

```python
    _secs = required_sections_for("research_agent")
    _forb = forbidden_terms_for("research_agent")
    regras = (
        "\n\nREGRAS OBRIGATORIAS DESTA EXECUCAO:\n"
        f"- Estruture a resposta EXATAMENTE com estas secoes (##): {', '.join(_secs)}.\n"
        + ("- Cite a fonte [n] em toda afirmacao factual; sem fonte, nao afirme.\n"
           if citation_required_for("research_agent") else "")
        + f"- NUNCA use estes termos: {', '.join(_forb)}.\n"
        + "- Baseie-se APENAS nas fontes coletadas e no contexto RAG; nada de hipotetico.\n"
    )
```

Anexar `regras` ao texto retornado pelo `_user_prompt` (concatenar ao final do prompt do usuário).

- [ ] **Step 5: Injetar regras no prompt de conteúdo**

Em `apps/api/app/content_generation.py`, no `_user_prompt`, anexar de forma análoga (usando `required_sections_for("content_agent", payload.channel)` e `forbidden_terms_for("content_agent")`; conteúdo não exige citação):

```python
    from app.agent_rules import forbidden_terms_for, required_sections_for
    _secs = required_sections_for("content_agent", payload.channel)
    _forb = forbidden_terms_for("content_agent")
    regras = (
        "\n\nREGRAS OBRIGATORIAS DESTA EXECUCAO:\n"
        f"- Inclua ao menos as secoes (##): {', '.join(_secs)}.\n"
        f"- NUNCA use: {', '.join(_forb)}.\n"
        "- Nao invente produto, funcionalidade, case, cliente, preco ou %.\n"
    )
```

Anexar ao user prompt.

- [ ] **Step 6: Rodar os testes de regra + Guardião**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest tests/test_guardian_rules.py tests/test_rules_validation.py -v`
Expected: PASS.

- [ ] **Step 7: Regressão + ruff**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest -q && ..\.venv\Scripts\python.exe -m ruff check app`
Expected: suíte verde (com os novos testes), ruff limpo. Ajuste testes existentes do Guardião que passem a receber violações novas (se algum conteúdo de teste não tiver as seções obrigatórias e agora acuse `required_fixes`, atualize a expectativa do teste — o comportamento novo é correto).

- [ ] **Step 8: Commit**

```bash
git add apps/api/app/quality_guardian.py apps/api/app/research_service.py apps/api/app/content_generation.py apps/api/tests/test_guardian_rules.py
git commit -m "feat(rules): injeta regras no prompt (pesquisa/conteudo) e Guardiao aplica validate_document"
```

---

## Task 7: Regressão final + smoke ao vivo

- [ ] **Step 1: Suíte completa + ruff (escopo CI)**

Run: `cd apps/api && ..\.venv\Scripts\python.exe -m pytest -q && ..\.venv\Scripts\python.exe -m ruff check app alembic`
Expected: tudo verde, ruff limpo.

- [ ] **Step 2: Smoke ao vivo — pesquisa REAL encontra fontes**

Com a stack docker rodando (a api recarrega sozinha), autenticar e rodar uma pesquisa rápida real sobre um tema com notícias:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@duofy.com.br","password":"admin123456"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
BID=$(curl -s -X POST http://localhost:8000/api/orchestrator/plan-research -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"brand_slug":"deathcare","theme":"deathcare pet"}' | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -X POST "http://localhost:8000/api/orchestrator/briefings/$BID/approve" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"model_override":"google/gemini-2.5-pro","depth":"quick"}' -w "\nHTTP %{http_code}\n"
```

Expected: **HTTP 200** com `status="executed"` e um `result_id`. Em seguida, confirmar que o Output tem fontes:

```bash
# pegar o result_id do passo anterior e consultar as fontes
curl -s "http://localhost:8000/api/research/reports/<result_id>" -H "Authorization: Bearer $TOKEN" | python -c "import sys,json; d=json.load(sys.stdin); print('fontes:', len(d.get('sources',[])), '| status:', d['status'])"
```

Expected: `fontes: >=3`. Se `InsufficientSources` (422) num tema que deveria ter notícias, revisar a coleta.

- [ ] **Step 3: Commit final (se houver ajustes)**

```bash
git add -A && git commit -m "chore(agentes): regressao verde + smoke de pesquisa real"
```

---

## Self-Review (autor do plano)

**Spec coverage (A+B):**
- A1 query correta → Task 1. ✓
- A2 snippet evidência-piso → Task 2. ✓
- A3 dedupe por domínio (deep) → Task 2. ✓
- A4 porta de fontes mínimas + recusa 422 sem Output → Task 3 (min via regra na Task 4). ✓
- B1 agent_rules.yaml → Task 4. ✓
- B2 loader → Task 4. ✓
- B3 injeção no prompt (pesquisa+conteúdo) → Task 6. ✓
- B4 validação + Guardião → Tasks 5, 6. ✓
- Erros: InsufficientSources→422; YAML ausente→fallback vazio → Tasks 3, 4. ✓

**Fora deste plano (vão para o plano nº 2 — Parte C+D):** renderização em cards (`SectionedDocument`), `SourceList`, `sources` no `/api/outputs/{id}`, e o polimento de conteúdo na UI. A saída já é markdown renderizado (não cru); os cards são melhoria visual do plano nº 2.

**Placeholder scan:** os Steps que dependem de nomes internos reais (Guardião `assess_output_quality`, `_user_prompt`) trazem instrução explícita para ler a função e adaptar os nomes — não são TODOs, são pontos de integração com código existente cujo nome exato o implementador confirma no arquivo. O código novo (errors, agent_rules, rules_validation, query, snippet, gate) está completo.

**Type consistency:** `count_usable_sources`, `_dedupe_by_domain`, `min_sources_for`, `InsufficientSourcesError(theme/found/needed)`, `validate_document(...) -> list[{severity,message}]` consistentes entre tasks 2→3→4→5→6.
