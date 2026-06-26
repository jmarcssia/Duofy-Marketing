# SP1 — Qualidade do Orquestrador & Pesquisa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar o truncamento de saída (teto fixo de 1200 tokens) e de entrada da pesquisa, tornar orçamento de tokens por agente e profundidade de pesquisa configuráveis no Admin (DB→config→fallback), e mostrar progresso ao vivo no chat.

**Architecture:** Um resolver central lê limites na ordem Admin(DB)→config YAML→fallback. `call_llm` passa a aceitar `max_tokens`; cada serviço resolve o orçamento do seu agente e o repassa. A pesquisa lê nº de fontes/tamanho de trecho do resolver por `depth`. Endpoints+UI de Admin no padrão `quality-settings` (tabela `Setting`, sem migration). O chat já renderiza `activeTask.logs`; as ferramentas passam a logar início+conclusão com link do artefato.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic v2, PyYAML, Next.js 14, LangGraph/langchain-openai.

## Global Constraints

- Ordem de resolução de qualquer limite: Admin (tabela `Setting`, JSON) → default em `config/rules/agent_limits.yaml` → fallback hardcoded. Valor inválido em um nível cai para o próximo, nunca quebra a chamada.
- Sem migration Alembic (tabela `Setting` já existe; helpers `_setting_value`/`_upsert_setting` em `apps/api/app/routers/admin.py`).
- Defaults: token_budgets `{research_agent:6000, content_agent:4000, press_agent:3000, quality_guardian:2000, orchestrator:2000, default:1500}`; research_depth `{quick:{sources:8,excerpt:1800}, standard:{sources:12,excerpt:3000}, deep:{sources:15,excerpt:4000}}`. Fallback código: budget 1500, depth quick.
- Intervalos válidos: budget 256–32000; sources 1–30; excerpt 500–20000.
- Testes async com `@pytest.mark.anyio`; cada arquivo de teste define `anyio_backend` fixture retornando `"asyncio"`. Sem DB real nos testes (objetos em memória / fake session). Rodar venv: `.venv/Scripts/python.exe`; pytest com `PYTHONPATH=apps/api`.
- Idioma PT-BR nas mensagens ao usuário. Não modificar serviços/páginas fora do escopo descrito.

---

### Task 1: Config de limites + resolver

**Files:**
- Create: `config/rules/agent_limits.yaml`
- Create: `apps/api/app/agent_limits.py`
- Test: `apps/api/tests/test_agent_limits.py`

**Interfaces:**
- Consumes: `read_config_text("rules", "agent_limits.yaml")` (de `app.agent_config`); `_setting_value(db, key)` (de `app.routers.admin`).
- Produces:
  - `AGENT_TOKEN_BUDGETS_KEY = "agent_token_budgets"`, `RESEARCH_DEPTH_LIMITS_KEY = "research_depth_limits"`
  - `async def get_token_budget(db, agent_slug: str) -> int`
  - `async def get_research_depth_limits(db, depth: str) -> dict` → `{"sources": int, "excerpt": int}`

- [ ] **Step 1: Criar o YAML de defaults**

`config/rules/agent_limits.yaml`:
```yaml
token_budgets:
  research_agent: 6000
  content_agent: 4000
  press_agent: 3000
  quality_guardian: 2000
  orchestrator: 2000
  default: 1500
research_depth:
  quick:    { sources: 8,  excerpt: 1800 }
  standard: { sources: 12, excerpt: 3000 }
  deep:     { sources: 15, excerpt: 4000 }
```

- [ ] **Step 2: Escrever os testes (fakes, sem DB real)**

`apps/api/tests/test_agent_limits.py`:
```python
import json
import pytest

from app import agent_limits


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class _FakeDb:
    """db.execute(select(Setting)...).scalar_one_or_none() devolve um Setting ou None."""
    def __init__(self, value_by_key=None):
        self._values = value_by_key or {}

    async def execute(self, stmt):
        # heurística: o resolver chama _setting_value(db, key); aqui devolvemos
        # um objeto cujo .scalar_one_or_none() reflete o último key consultado.
        # Para simplificar, monkeypatch _setting_value diretamente nos testes.
        raise NotImplementedError


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
    assert await agent_limits.get_research_depth_limits(object(), "deep") == {"sources": 15, "excerpt": 4000}


@pytest.mark.anyio
async def test_research_depth_unknown_uses_quick(monkeypatch):
    async def fake_setting(db, key):
        return None
    monkeypatch.setattr(agent_limits, "_setting_value", fake_setting)
    assert await agent_limits.get_research_depth_limits(object(), "xpto") == {"sources": 8, "excerpt": 1800}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_agent_limits.py -v`
Expected: FAIL (`ModuleNotFoundError: app.agent_limits`).

- [ ] **Step 4: Implementar o resolver**

`apps/api/app/agent_limits.py`:
```python
from __future__ import annotations

import json
import logging

import yaml

from app.agent_config import read_config_text
from app.routers.admin import _setting_value

logger = logging.getLogger(__name__)

AGENT_TOKEN_BUDGETS_KEY = "agent_token_budgets"
RESEARCH_DEPTH_LIMITS_KEY = "research_depth_limits"

_FALLBACK_BUDGET = 1500
_FALLBACK_DEPTH = {"sources": 8, "excerpt": 1800}


def _config() -> dict:
    try:
        return yaml.safe_load(read_config_text("rules", "agent_limits.yaml")) or {}
    except Exception as exc:  # noqa: BLE001 - config ausente/inválida cai para fallback
        logger.warning("agent_limits.yaml indisponível: %s", exc)
        return {}


def _db_json(value: str | None) -> dict:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        return {}


async def get_token_budget(db, agent_slug: str) -> int:
    cfg = _config().get("token_budgets", {})
    db_map = _db_json(await _setting_value(db, AGENT_TOKEN_BUDGETS_KEY))
    for source in (db_map, cfg):
        raw = source.get(agent_slug, source.get("default"))
        if isinstance(raw, int) and 256 <= raw <= 32000:
            return raw
    return _FALLBACK_BUDGET


async def get_research_depth_limits(db, depth: str) -> dict:
    cfg = _config().get("research_depth", {})
    db_map = _db_json(await _setting_value(db, RESEARCH_DEPTH_LIMITS_KEY))
    for source in (db_map, cfg):
        entry = source.get(depth) or source.get("quick")
        if isinstance(entry, dict):
            sources = entry.get("sources")
            excerpt = entry.get("excerpt")
            if isinstance(sources, int) and 1 <= sources <= 30 and isinstance(excerpt, int) and 500 <= excerpt <= 20000:
                return {"sources": sources, "excerpt": excerpt}
    return dict(_FALLBACK_DEPTH)
```

Nota: import de `_setting_value` a partir de `app.routers.admin` é seguro (admin.py não importa agent_limits → sem ciclo). Se um ciclo surgir, mover `_setting_value`/`_upsert_setting` para um módulo `app/settings_store.py` e importar de lá em ambos.

- [ ] **Step 5: Rodar e ver passar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_agent_limits.py -v`
Expected: PASS (6 testes).

- [ ] **Step 6: Lint + commit**

```bash
.venv/Scripts/python.exe -m ruff check apps/api/app/agent_limits.py apps/api/tests/test_agent_limits.py
git add config/rules/agent_limits.yaml apps/api/app/agent_limits.py apps/api/tests/test_agent_limits.py
git commit -m "feat(limits): resolver de orçamento de tokens e profundidade (DB->config->fallback)"
```

---

### Task 2: `call_llm` aceita `max_tokens`

**Files:**
- Modify: `apps/api/app/llm.py:71` (assinatura), `:195`, `:237` (payloads)
- Test: `apps/api/tests/test_llm_max_tokens.py`

**Interfaces:**
- Produces: `call_llm(..., max_tokens: int | None = None)` — quando `None`, usa 1200 (compat). O valor é repassado ao payload do provedor.

- [ ] **Step 1: Escrever o teste (httpx fakeado)**

`apps/api/tests/test_llm_max_tokens.py`:
```python
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_llm_max_tokens.py -v`
Expected: FAIL (`call_llm`/`_call_openai_compatible` ainda não aceitam `max_tokens`).

- [ ] **Step 3: Implementar**

Em `apps/api/app/llm.py`:
- `call_llm` ganha `max_tokens: int | None = None` na assinatura (Step "Produces").
- Calcular `effective_max = max_tokens or 1200` e repassar para `_call_openai_compatible` e `_call_anthropic` (adicionar parâmetro `max_tokens: int` nessas duas funções).
- Nos payloads, trocar `"max_tokens": 1200` por `"max_tokens": max_tokens` (linhas atuais 195 e 237).

Trecho de `call_llm` (repasse):
```python
        if provider == "openrouter":
            result = await _call_openai_compatible(
                credential=credential, model=model, system_prompt=system_prompt,
                user_prompt=user_prompt, base_url=credential.base_url or "https://openrouter.ai/api/v1",
                extra_headers={"HTTP-Referer": "http://localhost:3000", "X-OpenRouter-Title": "Duofy V1 Local"},
                use_web_search=use_web_search, max_tokens=max_tokens or 1200,
            )
        elif provider == "openai":
            result = await _call_openai_compatible(
                credential=credential, model=model, system_prompt=system_prompt,
                user_prompt=user_prompt, base_url=credential.base_url or "https://api.openai.com/v1",
                max_tokens=max_tokens or 1200,
            )
        elif provider == "anthropic":
            result = await _call_anthropic(credential, model, system_prompt, user_prompt, max_tokens=max_tokens or 1200)
```
`_call_openai_compatible` e `_call_anthropic`: adicionar `max_tokens: int` e usar no `payload["max_tokens"]`.

- [ ] **Step 4: Rodar e ver passar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_llm_max_tokens.py apps/api/tests -q`
Expected: PASS (novo + suíte sem regressão).

- [ ] **Step 5: Lint + commit**

```bash
.venv/Scripts/python.exe -m ruff check apps/api/app/llm.py apps/api/tests/test_llm_max_tokens.py
git add apps/api/app/llm.py apps/api/tests/test_llm_max_tokens.py
git commit -m "feat(llm): call_llm aceita max_tokens (default 1200)"
```

---

### Task 3: Aplicar orçamento por agente nos serviços

**Files:**
- Modify: `apps/api/app/research_service.py:421`, `apps/api/app/content_generation.py:152`, `apps/api/app/calendar_service.py:198,297`, `apps/api/app/quality_guardian.py:496`, `apps/api/app/orchestrator.py:109`, `apps/api/app/orchestrator_llm.py` (param), `apps/api/app/orchestrator_graph.py` (run_orchestrator resolve e passa)
- Test: `apps/api/tests/test_agent_budgets_applied.py`

**Interfaces:**
- Consumes: `get_token_budget(db, slug)` (Task 1); `call_llm(..., max_tokens=...)` (Task 2).
- Produces: `build_orchestrator_chat_model(credential, model, *, task_id, brand_slug, max_tokens: int)`.

- [ ] **Step 1: Escrever o teste (captura o max_tokens via call_llm fakeado)**

`apps/api/tests/test_agent_budgets_applied.py`:
```python
import pytest

from app import research_service, content_generation, agent_limits


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_research_uses_resolved_budget(monkeypatch):
    captured = {}

    async def fake_budget(db, slug):
        assert slug == "research_agent"
        return 6000

    async def fake_call_llm(**kwargs):
        captured["max_tokens"] = kwargs.get("max_tokens")
        from app.llm import LLMResult
        return LLMResult(output="# Rel\ncorpo", provider="openrouter", model="m")

    monkeypatch.setattr(research_service, "get_token_budget", fake_budget)
    monkeypatch.setattr(research_service, "call_llm", fake_call_llm)
    # short-circuita coleta e RAG para isolar o budget
    async def fake_collect(db, payload, brand):
        return []
    monkeypatch.setattr(research_service, "collect_research_sources", fake_collect)
    async def fake_rag(**kwargs):
        return ""
    monkeypatch.setattr(research_service, "build_rag_context", fake_rag)

    # ... montar payload/brand/cred mínimos via fakes da sessão; ver nota abaixo
    # A asserção central:
    # assert captured["max_tokens"] == 6000
```

Nota de implementação do teste: `run_market_research` faz várias queries de DB. Para um teste unitário sem DB real, o caminho mais limpo é extrair a chamada LLM real já com `max_tokens` resolvido e testar que o valor passado é o do `get_token_budget`. Se o setup de fakes da sessão ficar grande, prefira um teste focado em `content_generation`/`research_service` que monkeypatcha `get_token_budget` + `call_llm` e usa uma fake session que devolve Agent/Brand/Credential em memória (padrão `_FakeSession` já usado em `test_orchestrator_integration.py`). Garanta a asserção `captured["max_tokens"] == <budget>` para pelo menos `research_agent` e `content_agent`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_agent_budgets_applied.py -v`
Expected: FAIL (serviços ainda não resolvem/passam budget).

- [ ] **Step 3: Implementar a fiação do budget**

Em cada serviço, antes do `call_llm`, resolver e passar:
- `research_service.py` (import `from app.agent_limits import get_token_budget`): antes da linha 421, `budget = await get_token_budget(db, "research_agent")`; adicionar `max_tokens=budget` à chamada `call_llm`.
- `content_generation.py`: `budget = await get_token_budget(db, "content_agent")`; `max_tokens=budget`.
- `calendar_service.py` (linha 198 = calendar_agent; 297 = press_agent): `await get_token_budget(db, "calendar_agent")` e `await get_token_budget(db, "press_agent")` respectivamente; `max_tokens=budget`.
- `quality_guardian.py:496`: `budget = await get_token_budget(db, "quality_guardian")`; `max_tokens=budget`.
- `orchestrator.py:109` (run_agent direto): `budget = await get_token_budget(db, agent.slug)`; `max_tokens=budget`.
- `orchestrator_llm.build_orchestrator_chat_model`: adicionar parâmetro `max_tokens: int` e usar no `ChatOpenAI(max_tokens=max_tokens)` (substituindo o 1200 fixo).
- `orchestrator_graph.run_orchestrator`: `budget = await get_token_budget(db, "orchestrator")` e passar `max_tokens=budget` para `build_orchestrator_chat_model`.

- [ ] **Step 4: Rodar e ver passar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_agent_budgets_applied.py apps/api/tests -q`
Expected: PASS (novo + suíte sem regressão).

- [ ] **Step 5: Lint + commit**

```bash
.venv/Scripts/python.exe -m ruff check apps/api/app apps/api/tests
git add -A
git commit -m "feat(agents): aplica orçamento de tokens por agente em todas as chamadas LLM"
```

---

### Task 4: Profundidade da coleta de pesquisa por `depth`

**Files:**
- Modify: `apps/api/app/research_service.py` (`MAX_SOURCES`, `_evidence_excerpt`, `collect_research_sources`)
- Test: `apps/api/tests/test_research_depth.py`

**Interfaces:**
- Consumes: `get_research_depth_limits(db, depth)` (Task 1).
- Produces: coleta usa `sources`/`excerpt` resolvidos; `_evidence_excerpt(text, limit)` passa a receber o limite.

- [ ] **Step 1: Escrever o teste**

`apps/api/tests/test_research_depth.py`:
```python
from app.research_service import _evidence_excerpt


def test_evidence_excerpt_respects_limit():
    text = "palavra " * 1000  # ~8000 chars
    assert len(_evidence_excerpt(text, 3000)) <= 3000
    assert len(_evidence_excerpt(text, 1800)) <= 1800
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_research_depth.py -v`
Expected: FAIL (`_evidence_excerpt` só aceita 1 argumento hoje).

- [ ] **Step 3: Implementar**

Em `apps/api/app/research_service.py`:
- `def _evidence_excerpt(text: str, limit: int) -> str: return " ".join(text.split())[:limit]`
- `collect_research_sources` resolve os limites no início: `limits = await get_research_depth_limits(db, payload.depth)`; usar `limits["sources"]` no lugar de `MAX_SOURCES` (feed `[: sources*2]`, `items[:sources]`, checagem `len(unique) >= sources`) e `limits["excerpt"]` ao chamar `_evidence_excerpt(text, limits["excerpt"])`.
- Import: `from app.agent_limits import get_research_depth_limits`.
- Manter `MAX_SOURCES` como fallback interno só se ainda referenciado; senão remover (ruff confirma).

- [ ] **Step 4: Rodar e ver passar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_research_depth.py apps/api/tests -q`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
.venv/Scripts/python.exe -m ruff check apps/api/app/research_service.py apps/api/tests/test_research_depth.py
git add apps/api/app/research_service.py apps/api/tests/test_research_depth.py
git commit -m "feat(research): coleta usa profundidade configurável (fontes e trecho por depth)"
```

---

### Task 5: Admin — endpoints de settings dos agentes

**Files:**
- Modify: `apps/api/app/routers/admin.py`, `apps/api/app/schemas.py`
- Test: `apps/api/tests/test_admin_agent_settings.py`

**Interfaces:**
- Consumes: `_setting_value`/`_upsert_setting`; `Setting`; chaves `AGENT_TOKEN_BUDGETS_KEY`/`RESEARCH_DEPTH_LIMITS_KEY` (Task 1).
- Produces: `GET /api/admin/agent-settings`, `PUT /api/admin/agent-settings`; schemas `AgentSettingsRead`, `AgentSettingsUpdate`.

- [ ] **Step 1: Escrever o teste (fake session no padrão do projeto)**

`apps/api/tests/test_admin_agent_settings.py`:
```python
import json
import pytest

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
async def test_update_agent_settings_rejects_out_of_range(monkeypatch):
    monkeypatch.setattr(admin, "_upsert_setting", lambda *a, **k: None)

    class _Db:
        async def commit(self):
            pass

    with pytest.raises(Exception):
        await admin.update_agent_settings(
            AgentSettingsUpdate(token_budgets={"research_agent": 999999}, research_depth={}),
            _current_user=None, db=_Db(),
        )
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_admin_agent_settings.py -v`
Expected: FAIL (endpoints/schemas inexistentes).

- [ ] **Step 3: Implementar schemas**

Em `apps/api/app/schemas.py` (perto de QualitySettings):
```python
class AgentSettingsRead(BaseModel):
    token_budgets: dict[str, int]
    research_depth: dict[str, dict[str, int]]


class AgentSettingsUpdate(BaseModel):
    token_budgets: dict[str, int]
    research_depth: dict[str, dict[str, int]]
```

- [ ] **Step 4: Implementar endpoints**

Em `apps/api/app/routers/admin.py` (importar as chaves e os defaults de `app.agent_limits`; importar `json`, `HTTPException`, `status` já presentes):
```python
from app.agent_limits import AGENT_TOKEN_BUDGETS_KEY, RESEARCH_DEPTH_LIMITS_KEY
from app.agent_limits import _config as _limits_config  # defaults para merge


def _validate_budgets(budgets: dict[str, int]) -> None:
    for slug, value in budgets.items():
        if not (256 <= value <= 32000):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Orçamento inválido para {slug} (256–32000).")


def _validate_depth(depth: dict[str, dict[str, int]]) -> None:
    for name, entry in depth.items():
        s, e = entry.get("sources"), entry.get("excerpt")
        if not (isinstance(s, int) and 1 <= s <= 30 and isinstance(e, int) and 500 <= e <= 20000):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Profundidade inválida em {name}.")


@router.get("/agent-settings", response_model=AgentSettingsRead)
async def get_agent_settings(_current_user: Annotated[User, Depends(require_admin)],
                             db: Annotated[AsyncSession, Depends(get_db)]) -> AgentSettingsRead:
    cfg = _limits_config()
    budgets = dict(cfg.get("token_budgets", {}))
    depth = dict(cfg.get("research_depth", {}))
    saved_b = await _setting_value(db, AGENT_TOKEN_BUDGETS_KEY)
    saved_d = await _setting_value(db, RESEARCH_DEPTH_LIMITS_KEY)
    if saved_b:
        try: budgets.update(json.loads(saved_b))
        except (ValueError, TypeError): pass
    if saved_d:
        try: depth.update(json.loads(saved_d))
        except (ValueError, TypeError): pass
    return AgentSettingsRead(token_budgets=budgets, research_depth=depth)


@router.put("/agent-settings", response_model=AgentSettingsRead)
async def update_agent_settings(payload: AgentSettingsUpdate,
                                _current_user: Annotated[User, Depends(require_admin)],
                                db: Annotated[AsyncSession, Depends(get_db)]) -> AgentSettingsRead:
    _validate_budgets(payload.token_budgets)
    _validate_depth(payload.research_depth)
    await _upsert_setting(db, AGENT_TOKEN_BUDGETS_KEY, json.dumps(payload.token_budgets))
    await _upsert_setting(db, RESEARCH_DEPTH_LIMITS_KEY, json.dumps(payload.research_depth))
    await db.commit()
    return AgentSettingsRead(token_budgets=payload.token_budgets, research_depth=payload.research_depth)
```
Atenção ao ciclo de import: `agent_limits` importa `_setting_value` de `routers.admin`, e `admin` importará chaves/`_config` de `agent_limits`. Importar dentro das funções OU mover `_setting_value`/`_upsert_setting` para `app/settings_store.py` (preferível) e ajustar os imports de ambos. Resolver o ciclo nesta task se ele aparecer.

- [ ] **Step 5: Rodar e ver passar + suíte**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_admin_agent_settings.py apps/api/tests -q`
Expected: PASS.

- [ ] **Step 6: Lint + commit**

```bash
.venv/Scripts/python.exe -m ruff check apps/api/app apps/api/tests
git add -A
git commit -m "feat(admin): endpoints GET/PUT agent-settings (orçamento e profundidade)"
```

---

### Task 6: Admin UI — seção "Limites dos Agentes"

**Files:**
- Modify: `apps/web/lib/api.ts` (tipos), `apps/web/app/(app)/admin/config/page.tsx` (seção + fetch/save)
- Verify: manual (sem harness de teste frontend no projeto)

**Interfaces:**
- Consumes: `GET/PUT /api/admin/agent-settings` (Task 5).

- [ ] **Step 1: Adicionar tipos em `apps/web/lib/api.ts`**

```typescript
export type AgentSettings = {
  token_budgets: Record<string, number>
  research_depth: Record<string, { sources: number; excerpt: number }>
}
```

- [ ] **Step 2: Adicionar a seção em `admin/config/page.tsx`**

Seguir o padrão das seções existentes (mesma estilização/cards). Carregar com `apiFetch<AgentSettings>("/api/admin/agent-settings", token)` no load; renderizar inputs numéricos para cada agente em `token_budgets` e para cada nível de `research_depth` (`sources`/`excerpt`); salvar com `apiFetch("/api/admin/agent-settings", token, { method: "PUT", body: JSON.stringify(state) })`. Mostrar erro 400 (intervalo inválido) em um aviso, no padrão de erro já usado na página.

- [ ] **Step 3: Verificar build + lint do frontend**

Run: `npm.cmd --prefix apps/web run lint && npm.cmd --prefix apps/web run build`
Expected: lint limpo; build com as 17 rotas, sem erro.

- [ ] **Step 4: Verificação manual**

Subir (`docker compose up -d --build web api`), abrir `/admin/config`, editar um orçamento e a profundidade `deep`, salvar, recarregar e confirmar persistência; testar valor fora do intervalo → mensagem de erro.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api.ts "apps/web/app/(app)/admin/config/page.tsx"
git commit -m "feat(admin-ui): seção Limites dos Agentes (orçamento e profundidade)"
```

---

### Task 7: Progresso ao vivo no chat

**Files:**
- Modify: `apps/api/app/orchestrator_tools.py` (logs início+fim com id do artefato)
- Modify: `apps/web/app/(app)/chat/page.tsx` (trilha de progresso + links)
- Test: `apps/api/tests/test_orchestrator_tools.py` (estender)

**Interfaces:**
- Consumes: o `log` closure já passado para `build_tools`.

- [ ] **Step 1: Estender o teste das ferramentas (log de início E conclusão com id)**

Adicionar em `apps/api/tests/test_orchestrator_tools.py` (reusando os fakes existentes) um teste que captura os logs e asserta que `create_content` loga uma mensagem de início e uma de conclusão contendo o id do output (ex.: `"#51"`):
```python
@pytest.mark.anyio
async def test_create_content_logs_start_and_finish(monkeypatch):
    logs = []
    async def fake_log(msg): logs.append(msg)
    async def fake_generate(db, payload):
        return _FakeOutput(id=51, status=payload.status)
    async def fake_review(db, output, *, force=False):
        return _FakeReview(passed=True, score=88)
    monkeypatch.setattr(orchestrator_tools, "generate_content_output", fake_generate)
    monkeypatch.setattr(orchestrator_tools, "review_output_quality", fake_review)
    tools = orchestrator_tools.build_tools(db=_FakeDb(), brand_slug="duofy_solucoes", task_id=1, log=fake_log)
    await {t.name: t for t in tools}["create_content"].ainvoke(
        {"channel": "LinkedIn", "format": "Post LinkedIn", "briefing": "tema x para o post"})
    assert any("#51" in m for m in logs)        # log de conclusão tem o id
    assert len(logs) >= 2                          # início + conclusão
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_orchestrator_tools.py::test_create_content_logs_start_and_finish -v`
Expected: FAIL (hoje só há log de início, sem id na conclusão).

- [ ] **Step 3: Implementar logs de conclusão nas ferramentas**

Em `apps/api/app/orchestrator_tools.py`, em cada ferramenta que cria artefato, após criar e (quando aplicável) rodar o Guardião, emitir um segundo `await log(...)` com o id e a área:
- research: `await log(f"✅ Pesquisa #{output.id} criada — ver em /research")`
- content: `await log(f"✅ Conteúdo #{output.id} em revisão ({guardian}) — ver em /approvals")`
- press: `await log(f"✅ Press #{output.id} em revisão ({guardian}) — ver em /approvals")`
- calendar: `await log(f"✅ Calendário criado: {len(events)} eventos — ver em /calendar")`

- [ ] **Step 4: Rodar e ver passar**

Run: `PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests/test_orchestrator_tools.py apps/api/tests -q`
Expected: PASS.

- [ ] **Step 5: Frontend — trilha de progresso**

Em `apps/web/app/(app)/chat/page.tsx`, o bloco que renderiza `activeTask.logs` (linha ~292): destacá-lo como uma trilha de progresso sob a mensagem pendente do assistente, e transformar trechos `/research`, `/approvals`, `/content`, `/calendar` em links (`<Link href=...>`). Garantir que `streamTask` atualize `activeTask` incrementalmente (já faz via stream; confirmar que cada chunk faz `setActiveTask`).

- [ ] **Step 6: Build/lint frontend + commit**

```bash
npm.cmd --prefix apps/web run lint && npm.cmd --prefix apps/web run build
git add apps/api/app/orchestrator_tools.py apps/api/tests/test_orchestrator_tools.py "apps/web/app/(app)/chat/page.tsx"
git commit -m "feat(chat): progresso ao vivo com logs de conclusão e links de artefato"
```

---

### Task 8: Verificação fim-a-fim

**Files:** nenhum (verificação).

- [ ] **Step 1: Checks determinísticos**

Run:
```bash
.venv/Scripts/python.exe -m ruff check apps/api/app apps/api/alembic apps/api/tests
PYTHONPATH=apps/api .venv/Scripts/python.exe -m pytest apps/api/tests -q
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run build
```
Expected: ruff limpo; todos os testes passam; lint/build do front ok.

- [ ] **Step 2: Subir e health**

Run: `docker compose up -d --build api worker web && curl -s http://localhost:8000/health`
Expected: health `ok`.

- [ ] **Step 3: Smoke manual (provedor configurado)**

`/admin/config` → ajustar `research_agent` para 6000 e `deep` para sources=15. No `/chat`: "Faça uma pesquisa profunda do mercado de X e escreva um relatório." Esperado: trilha de progresso ao vivo com "✅ Pesquisa #N — /research"; relatório em /research claramente mais longo que ~900 palavras; ao mudar o orçamento no Admin para um valor baixo, a próxima execução encurta (prova DB→efeito).

- [ ] **Step 4: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "test(sp1): verificação fim-a-fim qualidade orquestrador e pesquisa"
```

---

## Self-Review (preenchido)

**Cobertura do spec:** resolver DB→config→fallback → Task 1; teto por agente em todas as chamadas → Tasks 2+3; coleta por depth → Task 4; Admin endpoints → Task 5; Admin UI → Task 6; progresso ao vivo (logs+frontend) → Task 7; sem migration → respeitado (tabela Setting); critérios de sucesso → Task 8.

**Pontos a confirmar na execução (não bloqueiam):**
- Ciclo de import `agent_limits` ↔ `routers.admin` (`_setting_value`): resolver movendo os helpers para `app/settings_store.py` se necessário (sinalizado nas Tasks 1 e 5).
- O teste da Task 3 pode exigir fake session no padrão de `test_orchestrator_integration.py`; a asserção essencial (`max_tokens == budget`) está definida.
- Frontends (Tasks 6 e 7) têm verificação manual por não haver harness de teste de UI no projeto.
