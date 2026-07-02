# 01 · Arquitetura e Estado Atual

## 1. Visão de sistema

O Duofy V1 é uma aplicação **full-stack local-first / single-tenant** (uma equipe interna, múltiplas marcas), organizada como monorepo:

```
DUOFY_V1_MARKETING_AI/
├── apps/
│   ├── api/           FastAPI (Python 3.11) — ~10.446 linhas
│   │   ├── app/
│   │   │   ├── routers/        16 routers HTTP
│   │   │   ├── orchestrator*   grafo LangGraph + single-agent + tools + llm
│   │   │   ├── *_service.py    serviços de domínio (content, research, calendar, metrics, operations…)
│   │   │   ├── quality_guardian.py, rag.py, embeddings.py, llm.py, crypto.py …
│   │   │   ├── models.py, schemas.py, db.py, settings.py, seed.py
│   │   │   └── worker.py        Celery
│   │   └── alembic/versions/   15 migrations (0001–0015)
│   └── web/           Next.js 14 App Router (TypeScript) — ~10.195 linhas
│       ├── app/(app)/*/page.tsx   17 rotas (7 reais, 1 mock, 9 redirect/órfãs)
│       ├── components/            UI + cluster órfão
│       ├── lib/                   api.ts, auth.ts, brand-context.tsx, mock.ts…
│       └── middleware.ts          proteção de rotas
├── config/            prompts de agentes, marcas, templates, regras (Markdown/YAML)
├── infra/             postgres init (pgvector), Caddy
├── docker-compose.yml (dev)  ·  docker-compose.prod.yml (prod)
└── docs/              documentação (parcialmente desatualizada)
```

### Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14.2.35 (App Router), React 18.3, TypeScript 5, Tailwind 3.4 |
| Backend | FastAPI, SQLAlchemy 2 (async / asyncpg), Pydantic v2, Uvicorn |
| IA / Orquestração | LangGraph + LangChain `ChatOpenAI` (grafo); `httpx` direto (serviços) |
| Provedores LLM | OpenRouter, OpenAI, Anthropic; OpenAI embeddings; Apify (scraping) |
| Banco | PostgreSQL 16 + extensão **pgvector** (embeddings 1536-D, índices HNSW) |
| Fila / Cache | Redis 7 (broker + backend Celery; lock do scheduler) |
| Assíncrono | Celery (`--pool=solo`) |
| Export/PDF | WeasyPrint (Pango/Cairo) + gerador Markdown→HTML próprio |
| Scraping | Google News RSS + trafilatura/BeautifulSoup + Playwright (Chromium) |
| Reverse proxy / TLS | Caddy 2 (Let's Encrypt automático) — só em produção |
| Empacotamento | Docker Compose (stacks separadas dev e prod) |

---

## 2. Topologia de serviços

### Desenvolvimento (`docker-compose.yml`)

```
[host:5433]→postgres(pgvector)   [host:6379]→redis
        │            │
      migrate (alembic upgrade head, one-shot)
        │
   ┌────┴─────┐
  api(:8000)  worker(celery solo)
        │
   web(:3000, next dev, hot-reload)
```
- postgres e redis fazem bind apenas em `127.0.0.1` (não expostos na LAN).
- Ordem de boot determinística: `postgres/redis healthy` → `migrate completed` → `api/worker` → `web` (espera `api healthy`).
- `web` monta o código-fonte do host por volume (hot-reload); `node_modules`/`.next` em volumes nomeados.

### Produção (`docker-compose.prod.yml`)

```
            Internet
               │  443/80
            ┌──┴───┐
            │ Caddy │  (TLS automático, same-origin)
            └──┬───┘
      /api/* /health │ resto
        ┌──────────┐ └────────┐
       api(:8000)            web(:3000, next standalone non-root)
        │      │
  postgres   redis        worker(celery solo)
  (rede interna — nenhuma porta publicada)
```
- **Só o Caddy publica portas.** Postgres, Redis, API, worker e web ficam exclusivamente na rede interna do Docker.
- Frontend chama `/api` relativo → roteado pelo Caddy para `api:8000` → **same-origin, sem CORS**.
- Segredos são **obrigatórios** (`${VAR:?}`) e validados pela API no boot.

Detalhes completos, healthchecks e checklist de produção em **[06 · Infraestrutura e Deploy](06_INFRAESTRUTURA_E_DEPLOY.md)**.

---

## 3. Os dois "cérebros" de IA (ponto arquitetural central)

O sistema tem **dois caminhos de execução de IA distintos e coexistentes** — não é duplicação, são propósitos diferentes:

### (A) Orquestrador multiagente — LangGraph (assíncrono, via chat)
- **Arquivos:** `orchestrator_graph.py` (grafo `run_orchestrator`), `orchestrator_llm.py` (fábrica `ChatOpenAI` + callback de métricas), `orchestrator_tools.py` (5 ferramentas).
- **Fluxo:** `routers/chat.py` cria um `AgentTask` e dispara Celery (`.delay`) → `worker.py` → `task_service.py` → `run_orchestrator`. Loop `agent → tools → final` com `MAX_STEPS=5`. As tools chamam os serviços de domínio (research/content/press/calendar/memory), cada uma protegida por `_with_rollback` para não envenenar a sessão async compartilhada.
- **Este é o único fluxo verdadeiramente offloaded para o worker.**
- **Fragilidades:** o checkpointer é `MemorySaver` (estado em memória do worker, perdido no restart — migração para `AsyncPostgresSaver` está documentada mas não implementada); o `ChatOpenAI` assume base OpenAI-compatible (OpenRouter por default), então provider `anthropic` nativo não funcionaria como esperado — mascarado pelo default do seed (`~anthropic/claude-sonnet-latest` via OpenRouter).

### (B) Serviços de geração diretos — `httpx` (síncrono, via REST)
- **Arquivos:** `content_generation.py`, `research_service.py`, `calendar_service.py`, `quality_guardian.py`, chamando `llm.py::call_llm`.
- **Fluxo:** os routers REST (`/api/content/generate`, `/api/research/run`, `/api/calendar/generate`, `/api/press/generate`, revisão de qualidade) chamam esses serviços **sincronamente dentro do request HTTP**. As mesmas funções também são as ferramentas do grafo (A).
- **Também roda em `orchestrator.py::run_agent`** (single-agent, sem tools), usado por `POST /api/agents/run` e como fallback do calendário.

### Implicação de desempenho
**Apenas o chat é assíncrono.** Toda geração de conteúdo, pesquisa, imprensa, calendário, revisão de qualidade, upload/indexação de documento e geração de relatório **bloqueia o request HTTP** (com `run_in_threadpool` apenas para trechos CPU-bound como export e extração de texto). Uma geração pode segurar a conexão por dezenas de segundos.

### O scheduler de calendário (terceiro caminho, frágil)
`calendar_scheduler.py` roda um loop `asyncio` iniciado no **lifespan do processo web/API** (`main.py:43`) — **não é Celery**. Poll de 60s, lock Redis `SETNX` por evento, executa até 5 eventos vencidos por tick, chamando `execute_calendar_event` **sincronamente** no processo da API. Deveria idealmente ser uma Celery beat task. Ver [02 · Funcionalidades](02_FUNCIONALIDADES_E_NIVEIS_DE_CONFIANCA.md).

---

## 4. Fluxos de dados principais

### Login
```
login-form.tsx → POST /api/auth/login → security.py (PBKDF2 verify)
 → JWT HS256 (12h) → cookie duofy_token (client-side, NÃO HttpOnly)
 → middleware.ts protege rotas checando presença do cookie
```

### Geração de conteúdo (síncrona)
```
/operations → POST /api/content/generate → content_generation.generate_content_output
 → seleciona template (canal/formato) → build_rag_context (pgvector) → call_llm (httpx)
 → normaliza documento → grava AgentRun + Output + OutputVersion(v1) → registra ModelCall (custo)
```

### Chat com orquestrador (assíncrona)
```
/operations (chat) → POST /api/chat/.../messages → cria AgentTask(queued) → Celery .delay
 → worker → run_orchestrator (LangGraph) → tools (research/content/…) → resposta
 → /api/tasks/{id}/stream (SSE por polling 1s, teto 3 min)
```

### RAG / memória
```
upload → /api/documents/upload → extrai texto (pypdf/python-docx) → chunk (900/140)
 → embed_text por chunk (OpenAI ou fallback local) → grava document_chunks(embedding vector 1536)
busca → /api/memory/search → embed da query → SQL UNION ALL (chunks + memory_entries)
 → similaridade cosseno pgvector (<=>) → filtros marca/categoria → top-k
```

### Aprovação de output (workflow)
```
gerar → submit-review → Guardião de Qualidade (gate: score ≥ 80, sem falhas críticas)
 → /approvals → approve (exige revisão aprovada; cria memória permanente)
              | reject (cria memória temporária, expira 30 dias)
              | request-adjustment | archive | move (kanban)
```

---

## 5. Configuração externa (Markdown/YAML)

Um diferencial de design: prompts de agentes, perfis de marca, templates de conteúdo e regras vivem em `config/` como arquivos versionados, carregados em runtime:

- `config/agents/*.md` — prompts dos 7 agentes (orquestrador, pesquisa, conteúdo, calendário, imprensa, métricas, guardião).
- `config/brands/*.md` + `config/seeds/brands.yaml` — voz de marca por marca, injetada nas skills.
- `config/templates/*.md` — templates por canal (instagram, linkedin, carousel, press release, research report).
- `config/rules/*.yaml` — `output_status.yaml` (máquina de estados), taxonomia RAG, matriz de personas/objeções, pricing de modelos.

Há **3 implementações independentes de descoberta desse diretório** (`agent_config.read_config_text`, `metrics._pricing_config`, `output_workflow._load_status_rules`), todas com o mesmo fallback para `DUOFY_V1_pacote_execucao_desenvolvimento/` — candidato a consolidação (ver [05](05_QUALIDADE_CODIGO_MORTO_E_TESTES.md)).

---

## 6. Os 7 agentes

| Agente | Slug | Papel | Estado |
|---|---|---|---|
| Orquestrador | `orchestrator` | Roteia intenção do chat para ferramentas | REAL (grafo) |
| Pesquisa & Inteligência | `research_agent` | Coleta e classifica fontes de mercado | PARCIAL/FRÁGIL (depende de RSS/Playwright externos) |
| Cocriação & Conteúdo | `content_agent` | Gera conteúdo versionado por canal | REAL |
| Calendário & Campanhas | `calendar_agent` | Planeja e executa eventos editoriais | REAL |
| Assessoria de Imprensa | `press_agent` | Gera releases/materiais de imprensa | REAL no back, **sem UI** |
| Métricas & Análise Interna | `metrics_agent` | Relatórios internos de custo/uso | REAL |
| Guardião de Qualidade | `quality_guardian` | Gate de qualidade antes da aprovação | REAL (o módulo mais sofisticado) |

---

## 7. Estado por camada (resumo)

| Camada | Maturidade | Observação |
|---|:---:|---|
| Backend / API | **REAL** | 16 routers, orquestração real, sem dados falsos (erro amigável sem chave). |
| Modelo de dados | **REAL** | 24 tabelas coesas; dívidas de integridade (sem cascades, `brand_slug` sem FK). |
| Frontend | **REAL (7 telas)** | 1 tela mock (`/redes`); ~2.850 linhas de código morto. |
| Orquestração de IA | **REAL / PARCIAL** | Grafo funcional; estado volátil (`MemorySaver`); só chat é assíncrono. |
| RAG / embeddings | **PARCIAL** | Infra vetorial correta; query pode não usar o índice HNSW; fallback local degrada. |
| Infraestrutura | **PARCIAL** | Borda sólida; bootstrap do admin não automatizado; sem backup/limites. |
| Segurança | **FRÁGIL** | Auth é o calcanhar (ver [03](03_SEGURANCA_E_VULNERABILIDADES.md)). |
| Testes / CI | **FRÁGIL** | ~20% de confiança; nenhum E2E; nenhuma CI. |

> Continue por **[02 · Funcionalidades e Níveis de Confiança](02_FUNCIONALIDADES_E_NIVEIS_DE_CONFIANCA.md)** para o inventário detalhado feature a feature.
