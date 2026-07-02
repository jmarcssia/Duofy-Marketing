# Orquestrador: Briefing por tarefa + Modelo de Pesquisa + Banco de Temas de Pesquisa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No chat do Orquestrador (`/operations`), antes de executar qualquer tarefa de agente, gerar um briefing que o usuário aprova num painel; permitir escolher o modelo LLM apenas em tarefas de Pesquisa; e dar acesso a um banco de temas de pesquisa (separado) por marca.

**Architecture:** Duas fases síncronas — **planejar** (`POST /api/orchestrator/plan`: uma chamada LLM curta classifica a solicitação e cria um `Briefing` pendente) e **executar** (`POST /api/orchestrator/briefings/{id}/approve`: roda o agente real com os overrides). Reusa `run_market_research` (que já aceita `model`) para pesquisa e `run_agent` para os demais. Banco de temas de pesquisa é uma tabela nova `research_themes` com CRUD/import no padrão do `content_themes`. Lista de modelos vem de `config/research_models.yml`.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (async, `Mapped`/`mapped_column`) + Alembic + Pydantic v2 no backend; Next.js (App Router, client components) + TypeScript + Tailwind no frontend; Postgres; pytest + anyio nos testes.

## Global Constraints

- **Não reescrever arquitetura.** Reusar `run_agent` (orchestrator.py), `run_market_research` (research_service.py), `call_llm` (llm.py), `read_config_text` (agent_config.py). Nada de Celery/checkpointer novo.
- **Chat ao vivo é síncrono** via `POST /api/agents/run`. Todos os endpoints novos são síncronos (sem enfileiramento). O caminho `chat.sessions`+Celery NÃO é usado pela UI e não deve ser tocado.
- **Modelo escolhível só em Pesquisa.** `model_override` só é aceito quando `tipo == "pesquisa"` e apenas para ids presentes em `config/research_models.yml`. Demais agentes usam `Agent.default_model`.
- **Isolamento por marca.** Toda query de tema e todo briefing carregam `brand_slug`. Filtrar sempre.
- **Padrão ORM:** `Mapped[T] = mapped_column(...)`, herdando `TimestampMixin` (dá `created_at`/`updated_at`).
- **Padrão Pydantic v2:** `BaseModel` + `Field(...)` inline; `Literal[...]` para enums.
- **Migration head atual:** `0017_drop_content_scripts`. A nova migration encadeia nela.
- **Testes S0:** banco `duofy_v1_test`, `@pytest.mark.anyio`, fixtures `client`/`auth_headers`/`patch_ai` de `apps/api/tests/conftest.py`. `patch_ai` faz monkeypatch de `app.<mod>.call_llm` — módulos novos que importam `call_llm` precisam ser adicionados à lista do `patch_ai`.
- **Modelos de pesquisa (todos OpenRouter, ids com `/` → `provider_for_model` resolve openrouter):** `google/gemini-3.1-pro`, `z-ai/glm-5.2`, `minimax/minimax-m3`, `anthropic/claude-opus-4.8`, `openai/gpt-5.5-pro`, `deepseek/deepseek-v4-flash`.
- **Todos os caminhos de arquivo são relativos a `C:\DUOFY_V1_MARKETING_AI`.** Backend em `apps/api`, frontend em `apps/web`. Rodar pytest a partir de `apps/api`.

---

## File Structure

**Backend (novos):**
- `apps/api/app/research_models.py` — carrega/valida a lista de modelos de pesquisa do YAML.
- `apps/api/app/orchestrator_planning.py` — a fase de planejamento (classificação LLM → plano estruturado).
- `apps/api/app/briefing_service.py` — cria briefing, aprova (executa), mapeia tipo→execução.
- `apps/api/app/routers/research_themes.py` — CRUD + import do banco de temas de pesquisa.
- `apps/api/app/routers/orchestrator.py` — `/plan`, `/plan-from-theme`, `/briefings/{id}`, `/briefings/{id}/approve`, `/research-models`.
- `apps/api/alembic/versions/0018_briefings_research_themes.py` — cria `briefings` e `research_themes`.
- `config/research_models.yml` — lista dos 6 modelos.
- `apps/api/tests/test_flow_briefing.py`, `test_research_themes.py`, `test_research_models.py` — testes S0.

**Backend (modificados):**
- `apps/api/app/models.py` — classes `Briefing` e `ResearchTheme`.
- `apps/api/app/schemas.py` — schemas de briefing, tema de pesquisa, modelo.
- `apps/api/app/main.py` — registrar os 2 routers novos.
- `apps/api/tests/conftest.py` — adicionar módulos novos à lista do `patch_ai`.
- `config/agents/orchestrator.md` — instrução de comportamento do briefing (skill).

**Frontend (novos):**
- `apps/web/app/(app)/operations/BriefingPanel.tsx` — painel lateral/modal do briefing.
- `apps/web/app/(app)/operations/ThemePicker.tsx` — popover do botão "Temas".

**Frontend (modificados):**
- `apps/web/lib/api.ts` — tipos `Briefing`, `ResearchTheme`, `ResearchModel` e helpers.
- `apps/web/app/(app)/operations/page.tsx` — trocar envio direto por fluxo de plan→painel + botão Temas.
- `apps/web/app/(app)/memory/page.tsx` — seção "Temas de pesquisa" (CRUD + CSV).

---

## Task 1: Modelos `Briefing` e `ResearchTheme` + migration + schemas

**Files:**
- Modify: `apps/api/app/models.py`
- Modify: `apps/api/app/schemas.py`
- Create: `apps/api/alembic/versions/0018_briefings_research_themes.py`
- Test: `apps/api/tests/test_models_briefing.py`

**Interfaces:**
- Produces: modelo `Briefing` (tabela `briefings`) com colunas `id, user_id, brand_slug, request_text, tipo, objetivo, resumo_plano, agente_alvo, tema_sugerido, status, model_override, research_theme_id, result_kind, result_id, created_at, updated_at`.
- Produces: modelo `ResearchTheme` (tabela `research_themes`) com `id, title, notes, brand_slug, created_at, updated_at`.
- Produces: schemas `ResearchThemeCreate`, `ResearchThemeRead`, `BriefingRead`, `PlanRequest`, `PlanFromThemeRequest`, `BriefingApproveRequest`, `BriefingApproveResponse`, `ResearchModelRead`, `ThemeImportResult` (reusa o existente).

- [ ] **Step 1: Escrever o teste que falha (models importáveis e instanciáveis)**

Create `apps/api/tests/test_models_briefing.py`:

```python
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
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/api && python -m pytest tests/test_models_briefing.py -v`
Expected: FAIL com `ImportError: cannot import name 'Briefing'`.

- [ ] **Step 3: Adicionar as classes em `models.py`**

No fim de `apps/api/app/models.py` (após `ContentTheme`), adicionar:

```python
class ResearchTheme(TimestampMixin, Base):
    """Banco de temas de pesquisa — pautas para disparar pesquisas de mercado (por marca)."""

    __tablename__ = "research_themes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    brand_slug: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)


class Briefing(TimestampMixin, Base):
    """Plano proposto pelo orquestrador antes de executar uma tarefa de agente."""

    __tablename__ = "briefings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    brand_slug: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    request_text: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    objetivo: Mapped[str] = mapped_column(Text, nullable=False, default="")
    resumo_plano: Mapped[str] = mapped_column(Text, nullable=False, default="")
    agente_alvo: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tema_sugerido: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True, nullable=False, default="pending")
    model_override: Mapped[str | None] = mapped_column(String(120), nullable=True)
    research_theme_id: Mapped[int | None] = mapped_column(
        ForeignKey("research_themes.id"), nullable=True
    )
    result_kind: Mapped[str | None] = mapped_column(String(80), nullable=True)
    result_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

> Confirme que `ForeignKey`, `Integer`, `String`, `Text`, `Mapped`, `mapped_column` e `TimestampMixin` já estão importados no topo de `models.py` (estão — `ContentTheme`/`AgentTask` usam todos). Se `Text` não estiver no import, adicione-o.

- [ ] **Step 4: Rodar o teste de modelos e confirmar que passa**

Run: `cd apps/api && python -m pytest tests/test_models_briefing.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Criar a migration Alembic**

Create `apps/api/alembic/versions/0018_briefings_research_themes.py`:

```python
"""briefings + research_themes (briefing do orquestrador e banco de temas de pesquisa)

Revision ID: 0018_briefings_research_themes
Revises: 0017_drop_content_scripts
Create Date: 2026-07-02 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0018_briefings_research_themes"
down_revision: str | None = "0017_drop_content_scripts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "research_themes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("brand_slug", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_research_themes_brand_slug", "research_themes", ["brand_slug"])

    op.create_table(
        "briefings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("brand_slug", sa.String(length=120), nullable=True),
        sa.Column("request_text", sa.Text(), nullable=False),
        sa.Column("tipo", sa.String(length=40), nullable=False),
        sa.Column("objetivo", sa.Text(), nullable=False, server_default=""),
        sa.Column("resumo_plano", sa.Text(), nullable=False, server_default=""),
        sa.Column("agente_alvo", sa.String(length=80), nullable=True),
        sa.Column("tema_sugerido", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="pending"),
        sa.Column("model_override", sa.String(length=120), nullable=True),
        sa.Column("research_theme_id", sa.Integer(), sa.ForeignKey("research_themes.id"), nullable=True),
        sa.Column("result_kind", sa.String(length=80), nullable=True),
        sa.Column("result_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_briefings_brand_slug", "briefings", ["brand_slug"])
    op.create_index("ix_briefings_status", "briefings", ["status"])
    op.create_index("ix_briefings_tipo", "briefings", ["tipo"])
    op.create_index("ix_briefings_user_id", "briefings", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_briefings_user_id", table_name="briefings")
    op.drop_index("ix_briefings_tipo", table_name="briefings")
    op.drop_index("ix_briefings_status", table_name="briefings")
    op.drop_index("ix_briefings_brand_slug", table_name="briefings")
    op.drop_table("briefings")
    op.drop_index("ix_research_themes_brand_slug", table_name="research_themes")
    op.drop_table("research_themes")
```

- [ ] **Step 6: Aplicar a migration no banco de dev e no banco de teste**

Run (dev): `cd apps/api && alembic upgrade head`
Expected: `Running upgrade 0017_drop_content_scripts -> 0018_briefings_research_themes`.

Run (teste): `cd apps/api && $env:DATABASE_URL="postgresql+asyncpg://postgres:postgres@127.0.0.1:5433/duofy_v1_test"; alembic upgrade head`
Expected: mesma linha de upgrade. (Ajuste a URL se o conftest usar outra; confira `apps/api/tests/conftest.py` para a URL exata do banco de teste.)

- [ ] **Step 7: Adicionar os schemas em `schemas.py`**

Em `apps/api/app/schemas.py`, adicionar (perto dos schemas de tema/agent). Confirme que `Literal` está importado de `typing` (está — `ResearchRunRequest` usa):

```python
class ResearchThemeCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)
    brand_slug: str | None = Field(default=None, max_length=120)


class ResearchThemeRead(BaseModel):
    id: int
    title: str
    notes: str | None = None
    brand_slug: str | None = None


class ResearchModelRead(BaseModel):
    label: str
    model_id: str


class PlanRequest(BaseModel):
    prompt: str = Field(min_length=2)
    brand_slug: str | None = Field(default=None, max_length=120)


class PlanFromThemeRequest(BaseModel):
    research_theme_id: int
    brand_slug: str | None = Field(default=None, max_length=120)


class BriefingApproveRequest(BaseModel):
    model_override: str | None = Field(default=None, max_length=120)
    research_theme_id: int | None = None


class BriefingRead(BaseModel):
    id: int
    brand_slug: str | None = None
    request_text: str
    tipo: str
    objetivo: str
    resumo_plano: str
    agente_alvo: str | None = None
    tema_sugerido: str | None = None
    status: str
    model_override: str | None = None
    research_theme_id: int | None = None
    result_kind: str | None = None
    result_id: int | None = None
    direct_answer: str | None = None  # preenchido quando tipo == "conversa"


class BriefingApproveResponse(BaseModel):
    briefing: BriefingRead
    answer: str
    result_kind: str | None = None
    result_id: int | None = None
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/app/models.py apps/api/app/schemas.py apps/api/alembic/versions/0018_briefings_research_themes.py apps/api/tests/test_models_briefing.py
git commit -m "feat(briefing): modelos Briefing e ResearchTheme + migration + schemas"
```

---

## Task 2: Config `research_models.yml` + loader + `GET /api/research-models`

**Files:**
- Create: `config/research_models.yml`
- Create: `apps/api/app/research_models.py`
- Test: `apps/api/tests/test_research_models.py`

**Interfaces:**
- Consumes: `read_config_text` de `app.agent_config`.
- Produces: `load_research_models() -> list[dict]` (cada `{"label": str, "model_id": str}`, só habilitados); `allowed_research_model_ids() -> set[str]`.
- Produces: endpoint `GET /api/research-models` → `list[ResearchModelRead]` (adicionado no router da Task 5, mas a lista/loader é entregue aqui).

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/api/tests/test_research_models.py`:

```python
"""S0 — lista de modelos de pesquisa carregada do YAML."""

from __future__ import annotations

from app.research_models import allowed_research_model_ids, load_research_models


def test_load_research_models_returns_six_enabled():
    models = load_research_models()
    ids = {m["model_id"] for m in models}
    assert "anthropic/claude-opus-4.8" in ids
    assert "google/gemini-3.1-pro" in ids
    assert len(models) >= 6
    assert all("/" in m["model_id"] and m["label"] for m in models)


def test_allowed_ids_is_a_set():
    ids = allowed_research_model_ids()
    assert "z-ai/glm-5.2" in ids
    assert "modelo-inexistente" not in ids
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/api && python -m pytest tests/test_research_models.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.research_models'`.

- [ ] **Step 3: Criar o arquivo de config**

Create `config/research_models.yml`:

```yaml
# Modelos LLM oferecidos no briefing de Pesquisa do Orquestrador.
# Todos via OpenRouter (id com "/"). Editar aqui não exige deploy.
models:
  - label: "Gemini 3.1 Pro"
    model_id: "google/gemini-3.1-pro"
    enabled: true
  - label: "GLM-5.2"
    model_id: "z-ai/glm-5.2"
    enabled: true
  - label: "MiniMax M3"
    model_id: "minimax/minimax-m3"
    enabled: true
  - label: "Claude Opus 4.8"
    model_id: "anthropic/claude-opus-4.8"
    enabled: true
  - label: "GPT-5.5 Pro"
    model_id: "openai/gpt-5.5-pro"
    enabled: true
  - label: "DeepSeek V4 Flash"
    model_id: "deepseek/deepseek-v4-flash"
    enabled: true
```

- [ ] **Step 4: Criar o loader**

Create `apps/api/app/research_models.py`:

```python
"""Carrega a lista de modelos LLM oferecidos no briefing de Pesquisa (config/research_models.yml)."""

from __future__ import annotations

import logging

import yaml

from app.agent_config import read_config_text

logger = logging.getLogger(__name__)


def load_research_models() -> list[dict]:
    """Retorna [{"label", "model_id"}] apenas dos modelos habilitados. Lista vazia se o YAML sumir."""
    try:
        data = yaml.safe_load(read_config_text("research_models.yml")) or {}
    except Exception as exc:  # arquivo ausente/ilegível não deve derrubar a API
        logger.warning("research_models.yml indisponivel: %s", exc)
        return []
    out: list[dict] = []
    for item in data.get("models", []):
        model_id = (item or {}).get("model_id")
        label = (item or {}).get("label")
        if not model_id or not label:
            continue
        if item.get("enabled", True):
            out.append({"label": str(label), "model_id": str(model_id)})
    return out


def allowed_research_model_ids() -> set[str]:
    """Conjunto de model_ids válidos para override de pesquisa (whitelist)."""
    return {m["model_id"] for m in load_research_models()}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd apps/api && python -m pytest tests/test_research_models.py -v`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add config/research_models.yml apps/api/app/research_models.py apps/api/tests/test_research_models.py
git commit -m "feat(briefing): lista de modelos de pesquisa via config/research_models.yml"
```

---

## Task 3: Router de temas de pesquisa (CRUD + import)

**Files:**
- Create: `apps/api/app/routers/research_themes.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/test_research_themes.py`

**Interfaces:**
- Consumes: `ResearchTheme` (Task 1), `ResearchThemeCreate`/`ResearchThemeRead`/`ThemeImportResult` (Task 1), `record_audit_event`, `get_db`, `get_current_user`.
- Produces: rotas `GET /api/research-themes?brand_slug=&q=`, `POST /api/research-themes`, `DELETE /api/research-themes/{id}`, `POST /api/research-themes/import`.

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/api/tests/test_research_themes.py`:

```python
"""S0 — CRUD + import do banco de temas de pesquisa, isolado por marca."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.anyio


async def test_create_list_delete_research_theme(client, auth_headers):
    created = client.post(
        "/api/research-themes",
        json={"title": "Tendencias de IA no varejo", "notes": "foco Q3", "brand_slug": "duofy"},
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    theme_id = created.json()["id"]

    listed = client.get("/api/research-themes?brand_slug=duofy", headers=auth_headers)
    assert listed.status_code == 200, listed.text
    assert any(t["id"] == theme_id for t in listed.json())

    # marca diferente não vê
    other = client.get("/api/research-themes?brand_slug=postos", headers=auth_headers)
    assert all(t["id"] != theme_id for t in other.json())

    deleted = client.delete(f"/api/research-themes/{theme_id}", headers=auth_headers)
    assert deleted.status_code == 204, deleted.text


async def test_search_filter_q(client, auth_headers):
    client.post("/api/research-themes", json={"title": "Precos de combustivel", "brand_slug": "postos"}, headers=auth_headers)
    client.post("/api/research-themes", json={"title": "Logistica reversa", "brand_slug": "postos"}, headers=auth_headers)
    found = client.get("/api/research-themes?brand_slug=postos&q=combustivel", headers=auth_headers)
    assert found.status_code == 200
    titles = [t["title"] for t in found.json()]
    assert "Precos de combustivel" in titles
    assert "Logistica reversa" not in titles


async def test_import_csv(client, auth_headers):
    csv_body = "TITULO;NOTAS\nMercado de energia solar;crescimento 2026\nHidrogenio verde;\n"
    res = client.post(
        "/api/research-themes/import?brand_slug=postos",
        content=csv_body,
        headers={**auth_headers, "Content-Type": "text/csv"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["inserted"] >= 2
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/api && python -m pytest tests/test_research_themes.py -v`
Expected: FAIL (404 nas rotas — router ainda não registrado).

- [ ] **Step 3: Criar o router**

Create `apps/api/app/routers/research_themes.py`:

```python
from __future__ import annotations

import csv
import io
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_service import record_audit_event
from app.db import get_db
from app.dependencies import get_current_user
from app.models import ResearchTheme, User
from app.schemas import ResearchThemeCreate, ResearchThemeRead, ThemeImportResult

router = APIRouter(prefix="/api/research-themes", tags=["research-themes"])


def _read(theme: ResearchTheme) -> ResearchThemeRead:
    return ResearchThemeRead(
        id=theme.id, title=theme.title, notes=theme.notes, brand_slug=theme.brand_slug
    )


def _decode(raw: bytes | str) -> str:
    if isinstance(raw, str):
        return raw
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _parse_csv(raw: bytes | str) -> list[dict]:
    """CSV separador ';', colunas TITULO;NOTAS (NOTAS opcional). Ignora cabecalho e linhas vazias."""
    reader = csv.reader(io.StringIO(_decode(raw)), delimiter=";")
    themes: list[dict] = []
    for i, row in enumerate(reader):
        cells = [(c or "").strip() for c in row]
        cells += [""] * (2 - len(cells))
        titulo, notas = cells[0], cells[1]
        if i == 0 and titulo.upper() in {"TITULO", "TÍTULO"}:
            continue
        if not titulo:
            continue
        themes.append({"title": titulo[:255], "notes": (notas or None)})
    return themes


@router.get("", response_model=list[ResearchThemeRead])
async def list_research_themes(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
) -> list[ResearchThemeRead]:
    stmt = select(ResearchTheme).order_by(ResearchTheme.title)
    if brand_slug:
        stmt = stmt.where(ResearchTheme.brand_slug == brand_slug)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(ResearchTheme.title.ilike(like) | ResearchTheme.notes.ilike(like))
    rows = (await db.execute(stmt.limit(limit))).scalars().all()
    return [_read(t) for t in rows]


@router.post("", response_model=ResearchThemeRead, status_code=status.HTTP_201_CREATED)
async def create_research_theme(
    payload: ResearchThemeCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResearchThemeRead:
    theme = ResearchTheme(
        title=payload.title.strip(),
        notes=(payload.notes or None),
        brand_slug=(payload.brand_slug or None),
    )
    db.add(theme)
    await db.commit()
    await db.refresh(theme)
    await record_audit_event(
        db, user=current_user, action="research_theme.created", entity_type="research_theme",
        entity_id=theme.id, status="success", brand_slug=theme.brand_slug, agent_slug=None,
        summary=f"Tema de pesquisa criado: {theme.title}", metadata=None,
    )
    await db.commit()
    return _read(theme)


@router.delete("/{theme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_research_theme(
    theme_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    theme = await db.get(ResearchTheme, theme_id)
    if theme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tema de pesquisa nao encontrado.")
    title, brand = theme.title, theme.brand_slug
    await db.delete(theme)
    await db.commit()
    await record_audit_event(
        db, user=current_user, action="research_theme.deleted", entity_type="research_theme",
        entity_id=theme_id, status="success", brand_slug=brand, agent_slug=None,
        summary=f"Tema de pesquisa removido: {title}", metadata=None,
    )
    await db.commit()


@router.post("/import", response_model=ThemeImportResult)
async def import_research_themes_csv(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    brand_slug: str | None = Query(default=None),
) -> ThemeImportResult:
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV vazio.")
    parsed = _parse_csv(raw)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum tema encontrado no CSV (esperado separador ';' com coluna TITULO).",
        )
    existing = set(
        (await db.execute(
            select(ResearchTheme.title).where(ResearchTheme.brand_slug == brand_slug)
        )).scalars().all()
    )
    inserted = 0
    for t in parsed:
        if t["title"] in existing:
            continue
        existing.add(t["title"])
        db.add(ResearchTheme(title=t["title"], notes=t["notes"], brand_slug=brand_slug))
        inserted += 1
    await db.commit()
    await record_audit_event(
        db, user=current_user, action="research_theme.imported", entity_type="research_theme",
        entity_id=None, status="success", brand_slug=brand_slug, agent_slug=None,
        summary=f"Banco de temas de pesquisa importado: {inserted} novos de {len(parsed)}.",
        metadata={"parsed": len(parsed), "inserted": inserted},
    )
    await db.commit()
    return ThemeImportResult(parsed=len(parsed), inserted=inserted, skipped=len(parsed) - inserted)
```

- [ ] **Step 4: Registrar o router em `main.py`**

Em `apps/api/app/main.py`, localizar onde os routers são incluídos (ex.: `app.include_router(themes.router)`) e adicionar ao lado, seguindo o mesmo estilo de import já usado:

```python
from app.routers import research_themes  # junto dos demais imports de routers
...
app.include_router(research_themes.router)  # junto dos demais include_router
```

> Verifique o padrão exato de import no arquivo (pode ser `from app.routers import themes, chat, ...`). Siga o que já existe.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd apps/api && python -m pytest tests/test_research_themes.py -v`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/routers/research_themes.py apps/api/app/main.py apps/api/tests/test_research_themes.py
git commit -m "feat(briefing): banco de temas de pesquisa (CRUD + import CSV) isolado por marca"
```

---

## Task 4: Serviço de planejamento (classificação LLM → plano)

**Files:**
- Create: `apps/api/app/orchestrator_planning.py`
- Modify: `apps/api/tests/conftest.py` (adicionar `orchestrator_planning` à lista do `patch_ai`)
- Test: `apps/api/tests/test_orchestrator_planning.py`

**Interfaces:**
- Consumes: `Agent`, `ProviderCredential` (models), `provider_for_model`/`call_llm`/`LLMConfigurationError` (llm), `get_token_budget` (agent_limits).
- Produces: `async def plan_task(db, *, prompt: str, brand_slug: str | None) -> dict` retornando `{"tipo", "objetivo", "resumo_do_plano", "agente_alvo", "tema_sugerido"}`. `tipo ∈ {"pesquisa","conteudo","imprensa","calendario","conversa"}`. Nunca levanta por JSON inválido — cai para `{"tipo": "conversa", ...}`.

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/api/tests/test_orchestrator_planning.py`:

```python
"""S0 — o planejador classifica a solicitacao e sempre devolve um plano valido."""

from __future__ import annotations

import json

import pytest

from app.orchestrator_planning import plan_task

pytestmark = pytest.mark.anyio

VALID_TIPOS = {"pesquisa", "conteudo", "imprensa", "calendario", "conversa"}


async def test_plan_parses_llm_json(db, patch_ai, monkeypatch):
    async def fake_call_llm(credential, model, system_prompt, user_prompt, **kwargs):
        from app.llm import LLMResult
        payload = json.dumps({
            "tipo": "pesquisa", "objetivo": "Mapear tendencias",
            "resumo_do_plano": "Rodar pesquisa de mercado", "agente_alvo": "research",
            "tema_sugerido": "IA no varejo",
        })
        return LLMResult(output=payload, provider=credential.provider, model=model,
                         input_tokens=1, output_tokens=1, total_tokens=2,
                         estimated_cost_usd=0.0, latency_ms=1, raw_usage={})
    monkeypatch.setattr("app.orchestrator_planning.call_llm", fake_call_llm)

    plan = await plan_task(db, prompt="pesquise tendencias de IA no varejo", brand_slug="duofy")
    assert plan["tipo"] == "pesquisa"
    assert plan["tema_sugerido"] == "IA no varejo"


async def test_plan_falls_back_to_conversa_on_bad_json(db, patch_ai, monkeypatch):
    async def fake_call_llm(credential, model, system_prompt, user_prompt, **kwargs):
        from app.llm import LLMResult
        return LLMResult(output="isto nao e json", provider=credential.provider, model=model,
                         input_tokens=1, output_tokens=1, total_tokens=2,
                         estimated_cost_usd=0.0, latency_ms=1, raw_usage={})
    monkeypatch.setattr("app.orchestrator_planning.call_llm", fake_call_llm)

    plan = await plan_task(db, prompt="oi tudo bem?", brand_slug="duofy")
    assert plan["tipo"] in VALID_TIPOS
    assert plan["tipo"] == "conversa"
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/api && python -m pytest tests/test_orchestrator_planning.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.orchestrator_planning'`.

- [ ] **Step 3: Implementar o planejador**

Create `apps/api/app/orchestrator_planning.py`:

```python
"""Fase de planejamento do orquestrador: classifica a solicitacao e propoe um plano.

Uma unica chamada LLM curta que devolve JSON. Nao executa nenhuma tarefa.
"""

from __future__ import annotations

import json
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_limits import get_token_budget
from app.llm import LLMConfigurationError, call_llm, provider_for_model
from app.models import Agent, ProviderCredential

logger = logging.getLogger(__name__)

VALID_TIPOS = {"pesquisa", "conteudo", "imprensa", "calendario", "conversa"}

_PLAN_SYSTEM = (
    "Voce e o Orquestrador da Duofy. Antes de executar qualquer tarefa, voce faz um BRIEFING.\n"
    "Classifique a solicitacao do usuario e responda APENAS com um objeto JSON valido, sem texto ao redor, "
    "com as chaves:\n"
    '{"tipo": "pesquisa|conteudo|imprensa|calendario|conversa", "objetivo": "...", '
    '"resumo_do_plano": "...", "agente_alvo": "research|content|press|calendar|null", "tema_sugerido": "... ou null"}\n'
    "- tipo 'conversa' = pergunta/bate-papo que voce mesmo responde, sem acionar agente.\n"
    "- 'pesquisa' = mercado, concorrencia, tendencias, noticias, dados atuais.\n"
    "- 'conteudo' = criar/redigir peca de conteudo. 'imprensa' = release/assessoria. 'calendario' = planejar calendario.\n"
    "Seja conciso. Escreva objetivo e resumo_do_plano em portugues."
)


def _coerce_plan(raw: str) -> dict:
    """Extrai o JSON do texto do LLM; devolve um plano 'conversa' se falhar."""
    fallback = {
        "tipo": "conversa", "objetivo": "", "resumo_do_plano": "",
        "agente_alvo": None, "tema_sugerido": None,
    }
    text = (raw or "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return fallback
    try:
        data = json.loads(text[start : end + 1])
    except (ValueError, TypeError):
        return fallback
    tipo = str(data.get("tipo", "conversa")).strip().lower()
    if tipo not in VALID_TIPOS:
        tipo = "conversa"
    agente = data.get("agente_alvo")
    tema = data.get("tema_sugerido")
    return {
        "tipo": tipo,
        "objetivo": str(data.get("objetivo") or "")[:2000],
        "resumo_do_plano": str(data.get("resumo_do_plano") or "")[:2000],
        "agente_alvo": (str(agente).strip().lower() if agente and str(agente).lower() != "null" else None),
        "tema_sugerido": (str(tema)[:255] if tema and str(tema).lower() != "null" else None),
    }


async def plan_task(db: AsyncSession, *, prompt: str, brand_slug: str | None) -> dict:
    agent = (await db.execute(select(Agent).where(Agent.slug == "orchestrator"))).scalar_one_or_none()
    if agent is None or not agent.is_active:
        raise LLMConfigurationError("Agente orchestrator nao encontrado ou inativo.")
    model = agent.default_model
    provider = provider_for_model(model)
    credential = (
        await db.execute(select(ProviderCredential).where(ProviderCredential.provider == provider))
    ).scalar_one_or_none()
    if credential is None or not credential.is_enabled:
        raise LLMConfigurationError(
            f"Configure e habilite o provedor {provider} em Admin > Configuracoes > Modelos LLM."
        )

    budget = min(await get_token_budget(db, "orchestrator"), 800)
    result = await call_llm(
        credential=credential,
        model=model,
        system_prompt=_PLAN_SYSTEM,
        user_prompt=f"Marca ativa: {brand_slug or 'nao informada'}.\nSolicitacao: {prompt}",
        task_type="orchestrator_planning",
        agent_slug="orchestrator",
        brand_slug=brand_slug,
        max_tokens=budget,
    )
    return _coerce_plan(result.output)
```

- [ ] **Step 4: Registrar o módulo no `patch_ai`**

Em `apps/api/tests/conftest.py`, localizar a lista de módulos do `patch_ai` (`for mod in ("content_generation", "calendar_service", "research_service", "orchestrator", "quality_guardian"):`) e adicionar `"orchestrator_planning"` e `"briefing_service"`:

```python
for mod in (
    "content_generation", "calendar_service", "research_service",
    "orchestrator", "quality_guardian", "orchestrator_planning", "briefing_service",
):
    monkeypatch.setattr(f"app.{mod}.call_llm", fake_call_llm, raising=False)
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd apps/api && python -m pytest tests/test_orchestrator_planning.py -v`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/orchestrator_planning.py apps/api/tests/conftest.py apps/api/tests/test_orchestrator_planning.py
git commit -m "feat(briefing): planejador do orquestrador (classificacao LLM em JSON)"
```

---

## Task 5: Serviço de briefing + router do orquestrador (`/plan`, `/plan-from-theme`, approve, models)

**Files:**
- Create: `apps/api/app/briefing_service.py`
- Create: `apps/api/app/routers/orchestrator.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/test_flow_briefing.py`

**Interfaces:**
- Consumes: `plan_task` (Task 4), `run_agent` (orchestrator.py), `run_market_research` (research_service.py), `ResearchRunRequest` (schemas), `allowed_research_model_ids` (Task 2), `Briefing`/`ResearchTheme` (Task 1), schemas da Task 1.
- Produces: `async def create_briefing(db, *, user, prompt, brand_slug) -> Briefing` (roda plan; se `conversa`, executa resposta direta e grava; senão fica `pending`); `async def create_briefing_from_theme(db, *, user, theme, brand_slug) -> Briefing` (sem LLM); `async def approve_briefing(db, *, briefing, model_override, research_theme_id) -> tuple[str, str | None, int | None]` retornando `(answer, result_kind, result_id)`.
- Produces: rotas `POST /api/orchestrator/plan`, `POST /api/orchestrator/plan-from-theme`, `GET /api/orchestrator/briefings/{id}`, `POST /api/orchestrator/briefings/{id}/approve`, `GET /api/research-models`.

- [ ] **Step 1: Escrever o teste de fluxo que falha**

Create `apps/api/tests/test_flow_briefing.py`:

```python
"""S0 — fluxo de briefing: planejar -> aprovar, com override de modelo so em pesquisa."""

from __future__ import annotations

import json

import pytest

pytestmark = pytest.mark.anyio


def _force_plan(monkeypatch, tipo: str, tema: str | None = None):
    async def fake_call_llm(credential, model, system_prompt, user_prompt, **kwargs):
        from app.llm import LLMResult
        if kwargs.get("task_type") == "orchestrator_planning":
            out = json.dumps({
                "tipo": tipo, "objetivo": "obj", "resumo_do_plano": "plano",
                "agente_alvo": {"pesquisa": "research", "conteudo": "content"}.get(tipo),
                "tema_sugerido": tema,
            })
        else:
            out = "# Resultado\n\nConteudo gerado."
        return LLMResult(output=out, provider=credential.provider, model=model,
                         input_tokens=1, output_tokens=1, total_tokens=2,
                         estimated_cost_usd=0.0, latency_ms=1, raw_usage={})
    # cobre todos os modulos que chamam call_llm no fluxo
    for mod in ("orchestrator_planning", "research_service", "orchestrator", "briefing_service"):
        monkeypatch.setattr(f"app.{mod}.call_llm", fake_call_llm, raising=False)


async def test_research_models_endpoint(client, auth_headers):
    res = client.get("/api/research-models", headers=auth_headers)
    assert res.status_code == 200, res.text
    ids = {m["model_id"] for m in res.json()}
    assert "anthropic/claude-opus-4.8" in ids


async def test_conversa_returns_direct_answer_no_pending(client, auth_headers, patch_ai, monkeypatch):
    _force_plan(monkeypatch, "conversa")
    res = client.post("/api/orchestrator/plan", json={"prompt": "oi, quem e voce?", "brand_slug": "duofy"}, headers=auth_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["tipo"] == "conversa"
    assert body["status"] != "pending"
    assert body["direct_answer"]


async def test_research_task_creates_pending_then_approves_with_model(client, auth_headers, patch_ai, monkeypatch):
    _force_plan(monkeypatch, "pesquisa", tema="IA no varejo")
    plan = client.post("/api/orchestrator/plan", json={"prompt": "pesquise IA no varejo", "brand_slug": "duofy"}, headers=auth_headers)
    assert plan.status_code == 200, plan.text
    b = plan.json()
    assert b["tipo"] == "pesquisa"
    assert b["status"] == "pending"
    briefing_id = b["id"]

    approve = client.post(
        f"/api/orchestrator/briefings/{briefing_id}/approve",
        json={"model_override": "anthropic/claude-opus-4.8"},
        headers=auth_headers,
    )
    assert approve.status_code == 200, approve.text
    assert approve.json()["briefing"]["status"] == "executed"


async def test_approve_rejects_model_not_in_whitelist(client, auth_headers, patch_ai, monkeypatch):
    _force_plan(monkeypatch, "pesquisa", tema="tema")
    plan = client.post("/api/orchestrator/plan", json={"prompt": "pesquise algo", "brand_slug": "duofy"}, headers=auth_headers)
    briefing_id = plan.json()["id"]
    approve = client.post(
        f"/api/orchestrator/briefings/{briefing_id}/approve",
        json={"model_override": "modelo/invalido-x"},
        headers=auth_headers,
    )
    assert approve.status_code == 422, approve.text


async def test_approve_ignores_model_override_for_non_research(client, auth_headers, patch_ai, monkeypatch):
    _force_plan(monkeypatch, "conteudo")
    plan = client.post("/api/orchestrator/plan", json={"prompt": "escreva um post", "brand_slug": "duofy"}, headers=auth_headers)
    b = plan.json()
    assert b["tipo"] == "conteudo" and b["status"] == "pending"
    approve = client.post(
        f"/api/orchestrator/briefings/{b['id']}/approve",
        json={"model_override": "anthropic/claude-opus-4.8"},  # deve ser ignorado, nao 422
        headers=auth_headers,
    )
    assert approve.status_code == 200, approve.text
    assert approve.json()["briefing"]["model_override"] is None


async def test_plan_from_theme_skips_llm(client, auth_headers, patch_ai, monkeypatch):
    theme = client.post(
        "/api/research-themes",
        json={"title": "Hidrogenio verde", "brand_slug": "postos"},
        headers=auth_headers,
    ).json()

    # Sem forcar plan: se chamasse o LLM classificador, o patch_ai devolveria FAKE_OUTPUT_MD (nao-JSON) -> conversa.
    res = client.post(
        "/api/orchestrator/plan-from-theme",
        json={"research_theme_id": theme["id"], "brand_slug": "postos"},
        headers=auth_headers,
    )
    assert res.status_code == 200, res.text
    b = res.json()
    assert b["tipo"] == "pesquisa"
    assert b["status"] == "pending"
    assert b["tema_sugerido"] == "Hidrogenio verde"
    assert b["research_theme_id"] == theme["id"]
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/api && python -m pytest tests/test_flow_briefing.py -v`
Expected: FAIL (404 / ModuleNotFound — serviço e router ainda não existem).

- [ ] **Step 3: Implementar o `briefing_service.py`**

Create `apps/api/app/briefing_service.py`:

```python
"""Cria e aprova briefings. Fase 2 (execucao) reusa run_market_research / run_agent."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Briefing, ResearchTheme, User
from app.orchestrator import run_agent
from app.orchestrator_planning import plan_task
from app.research_service import run_market_research
from app.schemas import ResearchRunRequest

# tipo do plano -> agent_slug executor (calendario cai no orquestrador single-shot em V1)
_AGENT_FOR_TIPO = {
    "conteudo": "content_agent",
    "imprensa": "press_agent",
    "calendario": "orchestrator",
}


async def _direct_answer(db: AsyncSession, prompt: str, brand_slug: str | None) -> str:
    run = await run_agent(db=db, agent_slug="orchestrator", prompt=prompt, brand_slug=brand_slug)
    return run.output or run.error or "(sem resposta)"


async def create_briefing(
    db: AsyncSession, *, user: User, prompt: str, brand_slug: str | None
) -> Briefing:
    plan = await plan_task(db, prompt=prompt, brand_slug=brand_slug)
    tipo = plan["tipo"]
    briefing = Briefing(
        user_id=user.id,
        brand_slug=brand_slug,
        request_text=prompt,
        tipo=tipo,
        objetivo=plan["objetivo"],
        resumo_plano=plan["resumo_do_plano"],
        agente_alvo=plan["agente_alvo"],
        tema_sugerido=plan["tema_sugerido"],
        status="pending",
    )
    if tipo == "conversa":
        answer = await _direct_answer(db, prompt, brand_slug)
        briefing.status = "answered"
        briefing.result_kind = "direct"
        # guardamos a resposta direta fora da tabela (retornada no schema); nao persistimos texto longo aqui
        db.add(briefing)
        await db.commit()
        await db.refresh(briefing)
        briefing._direct_answer = answer  # type: ignore[attr-defined]  (campo efemero p/ o router)
        return briefing
    db.add(briefing)
    await db.commit()
    await db.refresh(briefing)
    return briefing


async def create_briefing_from_theme(
    db: AsyncSession, *, user: User, theme: ResearchTheme, brand_slug: str | None
) -> Briefing:
    briefing = Briefing(
        user_id=user.id,
        brand_slug=brand_slug or theme.brand_slug,
        request_text=f"Pesquisa a partir do tema: {theme.title}",
        tipo="pesquisa",
        objetivo=f"Pesquisar o tema '{theme.title}'.",
        resumo_plano=(theme.notes or f"Rodar pesquisa de mercado sobre {theme.title}."),
        agente_alvo="research",
        tema_sugerido=theme.title,
        status="pending",
        research_theme_id=theme.id,
    )
    db.add(briefing)
    await db.commit()
    await db.refresh(briefing)
    return briefing


async def approve_briefing(
    db: AsyncSession, *, briefing: Briefing, model_override: str | None, research_theme_id: int | None
) -> tuple[str, str | None, int | None]:
    """Executa a tarefa aprovada. model_override so vale para pesquisa. Retorna (answer, kind, id)."""
    if briefing.tipo == "pesquisa":
        theme_id = research_theme_id or briefing.research_theme_id
        theme_title = briefing.tema_sugerido or briefing.request_text
        if theme_id is not None:
            theme = await db.get(ResearchTheme, theme_id)
            if theme is not None:
                theme_title = theme.title
                briefing.research_theme_id = theme.id
        briefing.model_override = model_override  # ja validado no router
        output = await run_market_research(
            db,
            ResearchRunRequest(
                brand_slug=briefing.brand_slug or "duofy_solucoes",
                theme=theme_title[:255],
                model=model_override,
            ),
        )
        answer = f"Pesquisa concluida. Relatorio #{output.id} salvo em Pesquisas."
        briefing.status = "executed"
        briefing.result_kind = "research_output"
        briefing.result_id = output.id
        await db.commit()
        await db.refresh(briefing)
        return answer, briefing.result_kind, briefing.result_id

    # nao-pesquisa: sem override de modelo
    agent_slug = _AGENT_FOR_TIPO.get(briefing.tipo, "orchestrator")
    prompt = briefing.request_text
    if briefing.objetivo:
        prompt = f"{briefing.request_text}\n\nObjetivo: {briefing.objetivo}\nPlano: {briefing.resumo_plano}"
    run = await run_agent(db=db, agent_slug=agent_slug, prompt=prompt, brand_slug=briefing.brand_slug)
    answer = run.output or run.error or "(sem resposta)"
    briefing.status = "executed"
    briefing.result_kind = "agent_run"
    briefing.result_id = run.id
    await db.commit()
    await db.refresh(briefing)
    return answer, briefing.result_kind, briefing.result_id
```

- [ ] **Step 4: Implementar o router `orchestrator.py`**

Create `apps/api/app/routers/orchestrator.py`:

```python
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.briefing_service import approve_briefing, create_briefing, create_briefing_from_theme
from app.db import get_db
from app.dependencies import get_current_user
from app.llm import LLMConfigurationError
from app.models import Briefing, ResearchTheme, User
from app.research_models import allowed_research_model_ids, load_research_models
from app.schemas import (
    BriefingApproveRequest,
    BriefingApproveResponse,
    BriefingRead,
    PlanFromThemeRequest,
    PlanRequest,
    ResearchModelRead,
)

router = APIRouter(prefix="/api/orchestrator", tags=["orchestrator"])
models_router = APIRouter(prefix="/api/research-models", tags=["research-models"])


def _briefing_read(b: Briefing, *, direct_answer: str | None = None) -> BriefingRead:
    return BriefingRead(
        id=b.id, brand_slug=b.brand_slug, request_text=b.request_text, tipo=b.tipo,
        objetivo=b.objetivo, resumo_plano=b.resumo_plano, agente_alvo=b.agente_alvo,
        tema_sugerido=b.tema_sugerido, status=b.status, model_override=b.model_override,
        research_theme_id=b.research_theme_id, result_kind=b.result_kind, result_id=b.result_id,
        direct_answer=direct_answer or getattr(b, "_direct_answer", None),
    )


@models_router.get("", response_model=list[ResearchModelRead])
async def list_research_models(
    _current_user: Annotated[User, Depends(get_current_user)],
) -> list[ResearchModelRead]:
    return [ResearchModelRead(label=m["label"], model_id=m["model_id"]) for m in load_research_models()]


@router.post("/plan", response_model=BriefingRead)
async def plan(
    payload: PlanRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BriefingRead:
    try:
        briefing = await create_briefing(
            db, user=current_user, prompt=payload.prompt, brand_slug=payload.brand_slug
        )
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _briefing_read(briefing)


@router.post("/plan-from-theme", response_model=BriefingRead)
async def plan_from_theme(
    payload: PlanFromThemeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BriefingRead:
    theme = await db.get(ResearchTheme, payload.research_theme_id)
    if theme is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tema de pesquisa nao encontrado.")
    briefing = await create_briefing_from_theme(
        db, user=current_user, theme=theme, brand_slug=payload.brand_slug
    )
    return _briefing_read(briefing)


@router.get("/briefings/{briefing_id}", response_model=BriefingRead)
async def get_briefing(
    briefing_id: int,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BriefingRead:
    b = await db.get(Briefing, briefing_id)
    if b is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Briefing nao encontrado.")
    return _briefing_read(b)


@router.post("/briefings/{briefing_id}/approve", response_model=BriefingApproveResponse)
async def approve(
    briefing_id: int,
    payload: BriefingApproveRequest,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BriefingApproveResponse:
    b = await db.get(Briefing, briefing_id)
    if b is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Briefing nao encontrado.")
    if b.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Briefing ja processado (status={b.status}).",
        )

    model_override = payload.model_override
    if b.tipo == "pesquisa":
        if model_override and model_override not in allowed_research_model_ids():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Modelo de pesquisa invalido (fora da lista permitida).",
            )
    else:
        model_override = None  # so pesquisa aceita override

    try:
        answer, kind, result_id = await approve_briefing(
            db, briefing=b, model_override=model_override, research_theme_id=payload.research_theme_id
        )
    except LLMConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return BriefingApproveResponse(
        briefing=_briefing_read(b), answer=answer, result_kind=kind, result_id=result_id
    )
```

- [ ] **Step 5: Registrar os routers em `main.py`**

Em `apps/api/app/main.py`, adicionar junto aos demais:

```python
from app.routers import orchestrator  # junto dos imports de routers
...
app.include_router(orchestrator.router)        # /api/orchestrator/*
app.include_router(orchestrator.models_router) # /api/research-models
```

- [ ] **Step 6: Rodar o teste de fluxo e confirmar que passa**

Run: `cd apps/api && python -m pytest tests/test_flow_briefing.py -v`
Expected: PASS (6 passed).

- [ ] **Step 7: Rodar a suíte inteira (regressão)**

Run: `cd apps/api && python -m pytest -q`
Expected: todos os testes anteriores continuam passando (90+ passed, 2 skipped), mais os novos.

- [ ] **Step 8: Commit**

```bash
git add apps/api/app/briefing_service.py apps/api/app/routers/orchestrator.py apps/api/app/main.py apps/api/tests/test_flow_briefing.py
git commit -m "feat(briefing): endpoints plan/plan-from-theme/approve + lista de modelos de pesquisa"
```

---

## Task 6: Skill do orquestrador (comportamento do briefing no prompt)

**Files:**
- Modify: `config/agents/orchestrator.md`
- Test: `apps/api/tests/test_orchestrator_prompt.py`

**Interfaces:**
- Consumes: `read_agent_prompt` (agent_config).
- Produces: prompt do orquestrador contendo a diretriz de briefing (verificável por substring).

> A classificação em si já está no `_PLAN_SYSTEM` (Task 4, em código). Aqui documentamos o comportamento no prompt configurável do agente para que a resposta direta (`tipo=conversa`) e a delegação sigam o tom certo, editável sem deploy.

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/api/tests/test_orchestrator_prompt.py`:

```python
"""S0 — o prompt do orquestrador descreve o comportamento de briefing."""

from __future__ import annotations

from app.agent_config import read_agent_prompt


def test_orchestrator_prompt_mentions_briefing():
    text = read_agent_prompt("orchestrator").lower()
    assert "briefing" in text
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/api && python -m pytest tests/test_orchestrator_prompt.py -v`
Expected: FAIL (a menos que "briefing" já apareça — nesse caso, ajuste o texto adicionado no Step 3 para uma frase nova e mantenha o assert).

- [ ] **Step 3: Acrescentar a seção de briefing ao prompt**

Ao final de `config/agents/orchestrator.md`, adicionar:

```markdown

## Fluxo de briefing

Antes de executar qualquer tarefa de agente (pesquisa, conteúdo, imprensa, calendário), você primeiro monta um **briefing**: um resumo curto do que entendeu e do plano de ação, para o usuário aprovar. Você não executa nada sem aprovação.

- Se a mensagem for apenas uma conversa ou pergunta que você mesmo responde, responda direto — não há briefing.
- Em tarefas de **pesquisa**, o usuário pode escolher o modelo de LLM e vincular um tema do banco de temas de pesquisa. Nos demais agentes, o modelo é fixo.
- Ao delegar, seja objetivo: diga qual agente vai atuar e com qual foco.
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/api && python -m pytest tests/test_orchestrator_prompt.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add config/agents/orchestrator.md apps/api/tests/test_orchestrator_prompt.py
git commit -m "feat(briefing): documenta o fluxo de briefing na skill do orquestrador"
```

---

## Task 7: Frontend — tipos e helpers de API

**Files:**
- Modify: `apps/web/lib/api.ts`

**Interfaces:**
- Produces: tipos `ResearchTheme`, `ResearchModel`, `Briefing`, `BriefingApproveResponse` e (opcional) helpers finos sobre `apiFetch`. Consumidos pelas Tasks 8–10.

- [ ] **Step 1: Adicionar os tipos em `api.ts`**

Em `apps/web/lib/api.ts`, adicionar (perto de `ContentTheme`):

```typescript
export type ResearchTheme = {
  id: number
  title: string
  notes: string | null
  brand_slug: string | null
}

export type ResearchModel = {
  label: string
  model_id: string
}

export type Briefing = {
  id: number
  brand_slug: string | null
  request_text: string
  tipo: "pesquisa" | "conteudo" | "imprensa" | "calendario" | "conversa"
  objetivo: string
  resumo_plano: string
  agente_alvo: string | null
  tema_sugerido: string | null
  status: string
  model_override: string | null
  research_theme_id: number | null
  result_kind: string | null
  result_id: number | null
  direct_answer: string | null
}

export type BriefingApproveResponse = {
  briefing: Briefing
  answer: string
  result_kind: string | null
  result_id: number | null
}
```

- [ ] **Step 2: Verificar build de tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erros novos (o arquivo só acrescenta tipos).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api.ts
git commit -m "feat(briefing): tipos TS de briefing, tema de pesquisa e modelo"
```

---

## Task 8: Frontend — seção "Temas de pesquisa" na Memória

**Files:**
- Modify: `apps/web/app/(app)/memory/page.tsx`

**Interfaces:**
- Consumes: `ResearchTheme` (Task 7), `apiFetch`, `getTokenFromCookie`, `useBrand`.
- Produces: UI de CRUD + import CSV para `/api/research-themes`, espelhando a seção de temas de cocriação existente.

- [ ] **Step 1: Adicionar estado da seção**

No componente da página de Memória, adicionar (perto do estado de `themes`/`newTheme` já existente):

```typescript
const [researchThemes, setResearchThemes] = useState<ResearchTheme[]>([])
const [newRTheme, setNewRTheme] = useState({ title: "", notes: "" })
const [rThemeBusy, setRThemeBusy] = useState(false)
const [rThemeMsg, setRThemeMsg] = useState<string | null>(null)
const [rThemeFilter, setRThemeFilter] = useState("")
```

> Importe `ResearchTheme` de `@/lib/api` no topo do arquivo (junto do import de `ContentTheme`).

- [ ] **Step 2: Adicionar funções de carga/CRUD/import**

```typescript
const loadResearchThemes = useCallback(async () => {
  const token = getTokenFromCookie()
  if (!token) return
  try {
    setResearchThemes(
      await apiFetch<ResearchTheme[]>(`/api/research-themes?limit=500${brand ? `&brand_slug=${brand}` : ""}`, token)
    )
  } catch { setResearchThemes([]) }
}, [brand])

useEffect(() => { loadResearchThemes() }, [loadResearchThemes])

async function createResearchTheme() {
  const token = getTokenFromCookie()
  if (!token || newRTheme.title.trim().length < 2) return
  setRThemeBusy(true); setRThemeMsg(null)
  try {
    await apiFetch("/api/research-themes", token, {
      method: "POST",
      body: JSON.stringify({
        title: newRTheme.title.trim(),
        notes: newRTheme.notes.trim() || undefined,
        brand_slug: brand || undefined,
      }),
    })
    setNewRTheme({ title: "", notes: "" })
    setRThemeMsg("Tema de pesquisa adicionado.")
    await loadResearchThemes()
  } catch (e: unknown) { setRThemeMsg(e instanceof Error ? e.message : "Falha ao adicionar.") }
  setRThemeBusy(false)
}

async function deleteResearchTheme(id: number) {
  const token = getTokenFromCookie()
  if (!token) return
  setResearchThemes((ts) => ts.filter((t) => t.id !== id))
  try { await apiFetch(`/api/research-themes/${id}`, token, { method: "DELETE" }) }
  catch { await loadResearchThemes() }
}

async function importResearchThemesCsv(file: File) {
  const token = getTokenFromCookie()
  if (!token) return
  setRThemeBusy(true); setRThemeMsg(null)
  try {
    const text = await file.text()
    const res = await apiFetch<{ parsed: number; inserted: number; skipped: number }>(
      `/api/research-themes/import${brand ? `?brand_slug=${brand}` : ""}`, token,
      { method: "POST", body: text, headers: { "Content-Type": "text/csv" } }
    )
    setRThemeMsg(`Importados ${res.inserted} novos (de ${res.parsed}; ${res.skipped} já existiam).`)
    await loadResearchThemes()
  } catch (e: unknown) { setRThemeMsg(e instanceof Error ? e.message : "Falha ao importar CSV.") }
  setRThemeBusy(false)
}

const visibleRThemes = useMemo(() => {
  const q = rThemeFilter.trim().toLowerCase()
  if (!q) return researchThemes
  return researchThemes.filter((t) =>
    t.title.toLowerCase().includes(q) || (t.notes || "").toLowerCase().includes(q))
}, [researchThemes, rThemeFilter])
```

- [ ] **Step 3: Adicionar o JSX da seção**

Logo abaixo da seção do banco de temas de cocriação existente, adicionar um bloco espelhado (título "Temas de pesquisa", form de `title`+`notes`, import CSV, filtro, lista com botão excluir). Reutilize as mesmas classes Tailwind da seção de cocriação. Estrutura mínima:

```tsx
<section className="duofy-card mt-6 rounded-2xl p-5">
  <div className="flex items-center justify-between gap-3">
    <h2 className="text-base font-bold text-ink">Temas de pesquisa</h2>
    <label className={`duofy-tap flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple ${rThemeBusy ? "opacity-50" : ""}`}>
      <DownloadIcon className="h-4 w-4" /> Importar CSV
      <input type="file" accept=".csv,text/csv" className="hidden" disabled={rThemeBusy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) importResearchThemesCsv(f); e.target.value = "" }} />
    </label>
  </div>

  <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
    <input value={newRTheme.title} onChange={(e) => setNewRTheme({ ...newRTheme, title: e.target.value })}
      onKeyDown={(e) => e.key === "Enter" && createResearchTheme()}
      placeholder="Título do tema de pesquisa"
      className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" />
    <button onClick={createResearchTheme} disabled={rThemeBusy || newRTheme.title.trim().length < 2}
      className="duofy-tap flex h-10 items-center justify-center gap-1.5 rounded-xl bg-purple px-4 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
      <PlusIcon className="h-4 w-4" /> Adicionar
    </button>
  </div>
  <input value={newRTheme.notes} onChange={(e) => setNewRTheme({ ...newRTheme, notes: e.target.value })}
    placeholder="Notas / direcionamento (opcional)"
    className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" />
  {rThemeMsg && <p className="mt-2 text-xs text-purple-deep">{rThemeMsg}</p>}

  <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-white px-3 text-muted">
    <SearchIcon className="h-4 w-4" />
    <input value={rThemeFilter} onChange={(e) => setRThemeFilter(e.target.value)}
      placeholder="Filtrar temas de pesquisa…"
      className="h-9 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted" />
  </div>
  <div className="mt-3 max-h-96 space-y-2 overflow-y-auto duofy-scroll pr-1">
    {visibleRThemes.map((t) => (
      <div key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-white p-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug text-ink">{t.title}</p>
          {t.notes && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.notes}</p>}
          {t.brand_slug && <div className="mt-1.5"><Badge tone="slate">{t.brand_slug}</Badge></div>}
        </div>
        <button onClick={() => deleteResearchTheme(t.id)} aria-label="Excluir tema de pesquisa"
          className="duofy-tap grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-muted hover:border-red/40 hover:text-red">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    ))}
  </div>
</section>
```

> Use os mesmos ícones (`DownloadIcon`, `PlusIcon`, `SearchIcon`, `CloseIcon`, `Badge`) já importados na página de cocriação. Se algum não estiver importado nesta página, importe-o da mesma origem usada na seção de temas de cocriação.

- [ ] **Step 4: Verificar build**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(app)/memory/page.tsx"
git commit -m "feat(briefing): gestao do banco de temas de pesquisa na Memoria"
```

---

## Task 9: Frontend — painel de briefing e picker de temas

**Files:**
- Create: `apps/web/app/(app)/operations/BriefingPanel.tsx`
- Create: `apps/web/app/(app)/operations/ThemePicker.tsx`

**Interfaces:**
- Consumes: `Briefing`, `ResearchModel`, `ResearchTheme`, `BriefingApproveResponse`, `apiFetch` (Task 7).
- Produces: componente `BriefingPanel` (props: `briefing`, `models`, `themes`, `token`, `brand`, `onApproved(answer)`, `onCancel()`); componente `ThemePicker` (props: `themes`, `onPick(theme)`, `onClose()`, `onQuickAdd?`). Consumidos pela Task 10.

- [ ] **Step 1: Criar `BriefingPanel.tsx`**

```tsx
"use client"

import { useState } from "react"
import { apiFetch, type Briefing, type BriefingApproveResponse, type ResearchModel, type ResearchTheme } from "@/lib/api"

export function BriefingPanel({
  briefing, models, themes, token, onApproved, onCancel,
}: {
  briefing: Briefing
  models: ResearchModel[]
  themes: ResearchTheme[]
  token: string
  onApproved: (answer: string) => void
  onCancel: () => void
}) {
  const isResearch = briefing.tipo === "pesquisa"
  const [modelId, setModelId] = useState(models[0]?.model_id ?? "")
  const [themeId, setThemeId] = useState<number | null>(briefing.research_theme_id)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function approve() {
    setBusy(true); setErr(null)
    try {
      const res = await apiFetch<BriefingApproveResponse>(
        `/api/orchestrator/briefings/${briefing.id}/approve`, token,
        {
          method: "POST",
          body: JSON.stringify({
            model_override: isResearch && modelId ? modelId : undefined,
            research_theme_id: isResearch ? themeId ?? undefined : undefined,
          }),
        }
      )
      onApproved(res.answer)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Falha ao aprovar.")
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={onCancel} aria-hidden="true" />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-white p-6 shadow-panel animate-slide-in-right">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-ink">Briefing do Orquestrador</h3>
          <span className="rounded-full bg-purple/10 px-2.5 py-1 text-xs font-semibold text-purple-deep">{briefing.tipo}</span>
        </div>

        <p className="text-xs font-semibold text-muted">Objetivo</p>
        <p className="mb-3 text-sm text-ink">{briefing.objetivo || "—"}</p>
        <p className="text-xs font-semibold text-muted">Plano</p>
        <p className="mb-3 text-sm text-ink">{briefing.resumo_plano || "—"}</p>
        {briefing.agente_alvo && (
          <p className="mb-3 text-xs text-muted">Agente: <span className="font-semibold text-ink">{briefing.agente_alvo}</span></p>
        )}

        {isResearch && (
          <div className="mt-2 space-y-3 rounded-xl border border-line bg-surface p-3">
            <label className="block text-xs font-semibold text-muted">Modelo LLM (pesquisa)
              <select value={modelId} onChange={(e) => setModelId(e.target.value)}
                className="mt-1 h-10 w-full appearance-none rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-purple focus:outline-none">
                {models.map((m) => <option key={m.model_id} value={m.model_id}>{m.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted">Tema de pesquisa (opcional)
              <select value={themeId ?? ""} onChange={(e) => setThemeId(e.target.value ? Number(e.target.value) : null)}
                className="mt-1 h-10 w-full appearance-none rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-purple focus:outline-none">
                <option value="">— sem tema —</option>
                {themes.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>
          </div>
        )}

        {err && <p className="mt-3 text-xs text-red">{err}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={approve} disabled={busy || (isResearch && !modelId)}
            className="duofy-tap flex-1 rounded-lg bg-purple py-2.5 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
            {busy ? "Executando…" : "Aprovar e executar"}
          </button>
          <button onClick={onCancel} disabled={busy}
            className="duofy-tap rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface">
            Ajustar
          </button>
        </div>
      </aside>
    </div>
  )
}
```

> Se as animações `animate-slide-in-right`/`shadow-panel` não existirem no Tailwind do projeto, troque por `animate-scale-in`/`shadow-lg` (verifique `apps/web/app/globals.css` ou o config do Tailwind). O comportamento independe da animação.

- [ ] **Step 2: Criar `ThemePicker.tsx`**

```tsx
"use client"

import { useMemo, useState } from "react"
import type { ResearchTheme } from "@/lib/api"

export function ThemePicker({
  themes, onPick, onClose,
}: {
  themes: ResearchTheme[]
  onPick: (theme: ResearchTheme) => void
  onClose: () => void
}) {
  const [q, setQ] = useState("")
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return themes
    return themes.filter((t) => t.title.toLowerCase().includes(term) || (t.notes || "").toLowerCase().includes(term))
  }, [themes, q])

  return (
    <div className="absolute bottom-14 left-0 z-40 w-80 rounded-xl border border-line bg-white p-3 shadow-panel">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted">Temas de pesquisa</p>
        <button onClick={onClose} className="text-xs text-muted hover:text-ink">Fechar</button>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Buscar tema…"
        className="mb-2 h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" />
      <div className="max-h-64 space-y-1 overflow-y-auto duofy-scroll pr-1">
        {visible.length === 0 && <p className="px-2 py-3 text-xs text-muted">Nenhum tema. Cadastre na Memória.</p>}
        {visible.map((t) => (
          <button key={t.id} onClick={() => onPick(t)}
            className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-surface">
            {t.title}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sem erros (componentes isolados; ainda não usados — o lint pode acusar "unused" só quando importados na Task 10, então esta verificação é só de tipos).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(app)/operations/BriefingPanel.tsx" "apps/web/app/(app)/operations/ThemePicker.tsx"
git commit -m "feat(briefing): componentes de painel de briefing e picker de temas"
```

---

## Task 10: Frontend — integrar plan→painel + botão Temas no chat

**Files:**
- Modify: `apps/web/app/(app)/operations/page.tsx`

**Interfaces:**
- Consumes: `BriefingPanel`, `ThemePicker` (Task 9), `Briefing`/`ResearchModel`/`ResearchTheme` (Task 7), `useBrand`, `getTokenFromCookie`, `apiFetch`.
- Produces: fluxo de chat que chama `/api/orchestrator/plan`, abre o painel para tarefas e responde direto em `conversa`; botão "Temas" que chama `/api/orchestrator/plan-from-theme`.

- [ ] **Step 1: Imports e estado novo**

No topo de `operations/page.tsx`, adicionar imports:

```typescript
import { BriefingPanel } from "./BriefingPanel"
import { ThemePicker } from "./ThemePicker"
import type { Briefing, ResearchModel, ResearchTheme } from "@/lib/api"
```

Adicionar estado (perto do estado de chat existente):

```typescript
const [activeBriefing, setActiveBriefing] = useState<Briefing | null>(null)
const [researchModels, setResearchModels] = useState<ResearchModel[]>([])
const [researchThemes, setResearchThemes] = useState<ResearchTheme[]>([])
const [themePickerOpen, setThemePickerOpen] = useState(false)
```

- [ ] **Step 2: Carregar modelos e temas de pesquisa**

Dentro do `loadData` existente (ou num `useEffect` próprio), acrescentar as duas cargas. Se estiver no `loadData`, junte ao `Promise.all`:

```typescript
const [rm, rth] = await Promise.all([
  apiFetch<ResearchModel[]>("/api/research-models", token).catch(() => []),
  apiFetch<ResearchTheme[]>(`/api/research-themes?limit=500${brand ? `&brand_slug=${brand}` : ""}`, token).catch(() => []),
])
setResearchModels(rm)
setResearchThemes(rth)
```

- [ ] **Step 3: Trocar `sendMessage` para o fluxo de plan**

Substituir a função `sendMessage` (que hoje chama `/api/agents/run`) por:

```typescript
async function sendMessage(prompt?: string) {
  const text = (prompt ?? input).trim()
  if (!text || sending) return
  const token = getTokenFromCookie()
  if (!token) return
  const u: ChatMsg = { id: `u${Date.now()}`, role: "user", text, time: now() }
  const p: ChatMsg = { id: `p${Date.now()}`, role: "assistant", text: "Preparando briefing…", time: now(), pending: true }
  setMessages((m) => [...m, u, p])
  setInput("")
  setSending(true)
  try {
    const briefing = await apiFetch<Briefing>("/api/orchestrator/plan", token, {
      method: "POST",
      body: JSON.stringify({ prompt: text, brand_slug: brand || undefined }),
    })
    if (briefing.tipo === "conversa") {
      setMessages((m) => m.map((x) => x.id === p.id
        ? { ...x, text: briefing.direct_answer || "(sem resposta)", time: now(), pending: false } : x))
    } else {
      setMessages((m) => m.map((x) => x.id === p.id
        ? { ...x, text: `Preparei um briefing de ${briefing.tipo}. Revise ao lado para eu executar.`, time: now(), pending: false } : x))
      setActiveBriefing(briefing)
    }
  } catch (e: unknown) {
    setMessages((m) => m.map((x) => x.id === p.id
      ? { ...x, text: e instanceof Error ? e.message : "Erro.", time: now(), pending: false, error: true } : x))
  }
  setSending(false)
}
```

- [ ] **Step 4: Handler do picker de temas (dispara plan-from-theme, sem LLM)**

```typescript
async function pickResearchTheme(theme: ResearchTheme) {
  setThemePickerOpen(false)
  const token = getTokenFromCookie()
  if (!token) return
  const u: ChatMsg = { id: `u${Date.now()}`, role: "user", text: `Pesquisar: ${theme.title}`, time: now() }
  setMessages((m) => [...m, u])
  try {
    const briefing = await apiFetch<Briefing>("/api/orchestrator/plan-from-theme", token, {
      method: "POST",
      body: JSON.stringify({ research_theme_id: theme.id, brand_slug: brand || undefined }),
    })
    setActiveBriefing(briefing)
  } catch (e: unknown) {
    setMessages((m) => [...m, { id: `e${Date.now()}`, role: "assistant", text: e instanceof Error ? e.message : "Erro.", time: now(), error: true }])
  }
}

function onBriefingApproved(answer: string) {
  setMessages((m) => [...m, { id: `a${Date.now()}`, role: "assistant", text: answer, time: now() }])
  setActiveBriefing(null)
  loadData()
}
```

- [ ] **Step 5: JSX — botão Temas junto ao input + montagem do painel**

No wrapper do input do chat, adicionar o botão Temas (relativo, para posicionar o popover) e, ao final do componente, o painel:

```tsx
{/* dentro/junto do container do input do chat */}
<div className="relative">
  <button onClick={() => setThemePickerOpen((v) => !v)}
    className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-purple/40 hover:text-purple"
    aria-label="Temas de pesquisa">
    <SearchIcon className="h-4 w-4" />
  </button>
  {themePickerOpen && (
    <ThemePicker themes={researchThemes} onPick={pickResearchTheme} onClose={() => setThemePickerOpen(false)} />
  )}
</div>

{/* ao final do return, fora do fluxo do chat */}
{activeBriefing && (
  <BriefingPanel
    briefing={activeBriefing}
    models={researchModels}
    themes={researchThemes}
    token={getTokenFromCookie() ?? ""}
    onApproved={onBriefingApproved}
    onCancel={() => setActiveBriefing(null)}
  />
)}
```

> Use o `SearchIcon` (ou um ícone de "coleção"/"lista" já disponível no arquivo). Posicione o botão no mesmo container flex do input, antes do botão de enviar.

- [ ] **Step 6: Verificar build e lint**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: sem erros. Remova qualquer import agora não usado (ex.: se `AgentRun` deixou de ser referenciado).

- [ ] **Step 7: Verificação visual no preview**

Subir o dev server (preview_start) e confirmar: enviar "oi" responde direto (sem painel); enviar "pesquise tendências de IA" abre o painel com seletor de modelo; o botão Temas abre o popover e escolher um tema abre o painel com o tema pré-selecionado. Capturar screenshot.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/app/(app)/operations/page.tsx"
git commit -m "feat(briefing): chat do orquestrador com briefing, seletor de modelo e botao de temas"
```

---

## Task 11: Regressão final + documentação de estado

**Files:**
- Modify: `docs/auditoria_tecnica_2026-07-01/` (nota curta de estado, se o padrão do sprint pedir) — opcional.

- [ ] **Step 1: Suíte backend completa**

Run: `cd apps/api && python -m pytest -q`
Expected: todos passam (baseline 90 passed, 2 skipped + os novos testes das Tasks 1–6).

- [ ] **Step 2: Lint backend**

Run: `cd apps/api && ruff check .`
Expected: limpo.

- [ ] **Step 3: Build + lint frontend**

Run: `cd apps/web && npx tsc --noEmit && npm run lint && npm run build`
Expected: build OK.

- [ ] **Step 4: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "chore(briefing): regressao verde (backend + frontend)"
```

---

## Self-Review (preenchido pelo autor do plano)

**Spec coverage:**
- Briefing duas fases (planejar→executar) → Tasks 4, 5. ✓
- Painel lateral/modal → Task 9 (`BriefingPanel`), integrado na Task 10. ✓
- Modelo escolhível só em pesquisa + whitelist → Task 2 (lista) + Task 5 (validação 422 + ignora fora de pesquisa, testado). ✓
- Banco de temas de pesquisa separado (tabela + CRUD + import) → Tasks 1, 3; gestão na Memória → Task 8. ✓
- Botão Temas no chat + campo tema no briefing → Tasks 9, 10 (`plan-from-theme` sem LLM). ✓
- `tipo=conversa` não abre painel → Task 5 (testado) + Task 10. ✓
- Skill do orquestrador (comportamento) → Task 6. ✓
- Migration única para as duas tabelas → Task 1. ✓
- Testes S0 (patch_ai, duofy_v1_test) → Tasks 1–6. ✓
- Erros: 422 modelo inválido, 409 briefing já processado, 400 LLMConfigurationError → Task 5. ✓

**Desvio consciente da spec (registrado):** a spec descrevia o fluxo via `POST /api/chat/sessions/{id}/messages` + Celery. O chat ao vivo, na prática, é síncrono (`/api/agents/run`). O plano implementa o briefing em endpoints síncronos novos (`/api/orchestrator/*`), sem Celery/checkpointer — mais fiel à regra "não reescrever arquitetura". O conceito de duas fases da spec é preservado.

**Placeholder scan:** sem TBD/TODO; todo passo de código traz o código real.

**Type consistency:** `Briefing`/`BriefingRead`/`BriefingApproveResponse` consistentes entre models (Task 1), schemas (Task 1), serviço (Task 5), router (Task 5) e TS (Task 7). `plan_task` retorna chave `resumo_do_plano` (com underscore) e é mapeada para a coluna `resumo_plano` em `create_briefing` — atenção mantida. `allowed_research_model_ids` usado só na validação da Task 5.
