# Estado do Sistema — Duofy V1 Marketing Intelligence Hub

> **Snapshot fiel ao código real. Data: 2026-07-04. Branch `main` @ `76ef968` (sincronizada com
> `origin`, 132 commits).** Atualizado após a entrega **Product V2** (acabamento de produto + hardening
> de segurança): páginas próprias, Publicações, e o fechamento dos gaps V1/V4/V5 + ativação do C1 na UI.
> Descreve o que **é** — mitigações reais, débitos reais, o que está pronto, dormente ou stub.
> **Supersede** o snapshot anterior de `2026-07-02` e as versões intra-dia anteriores.

---

## 1. Resumo executivo

O Duofy V1 é uma plataforma multi-marca de marketing assistido por LLM em três camadas limpas
(Next.js 14 → FastAPI → Postgres+pgvector), com orquestração de agentes, RAG, Guardião de Qualidade
híbrido e um **Calendário que é centro operacional** (evento = unidade de trabalho: pesquisa →
aprovação → cocriação → revisão → publicação). Núcleo real e funcional; **sem mocks no caminho
principal**. A camada de produto agora está completa: **8 áreas com páginas próprias fortes** (Operações,
Calendário, Agente de Pesquisa, Agente de Cocriação, Revisão, Publicações, Relatórios, Administração).

**Marcas ativas:** Duofy Soluções (`duofy_solucoes`), TOTVS Gestão DeathCare by Duofy (`deathcare`),
TOTVS Postos de Combustíveis by Duofy (`postos_combustiveis`) — + sentinela `institucional` no RAG.

**Maturidade por dimensão (2026-07-04, pós-V2):**

| Dimensão | Estado | Nota |
|---|---|---|
| Arquitetura | Sólida, em camadas, config-as-code; produto coeso por página | 8.5/10 |
| Funcionalidade do núcleo | Agentes reais + calendário F1–F4 + peças/subpeças + **Publicações** | 9/10 |
| Segurança | **V1/V4/V5 fechados**; C1 pronto + **UI de escopo**; dormente até atribuir escopos | 7.5/10 |
| Testes | **211 passando / 2 skipped**; cobertura desigual (utils sem teste direto) | 7/10 |
| Código morto | Mínimo | 9/10 |
| Prontidão de produção | Deploy self-contained (Caddy) pronto; requer atribuir escopos + Meta real | 7.5/10 |

**Veredito senior:** pronto para uso interno controlado e demo. Os 5 críticos históricos foram corrigidos
e os gaps altos/médios priorizados (V1 auditoria admin, V4 anti-injection, V5 tracking de web-search)
foram **fechados com testes**. O gap dominante agora é **operacional/produto**: (a) atribuir `brand_scope`
aos usuários pela nova UI para ativar o C1; (b) integração real da **Meta** (hoje stub honesto).

### 1.1 O que mudou na entrega Product V2 (resumo)
- **Navegação V2**: 8 itens; Memória vira item secundário. Páginas antes redirecionadas (`/research`,
  `/content`) viraram **páginas próprias completas**; `/publicacoes` criada.
- **Operações V2**: virou **dashboard + orquestrador** (cards, pipeline, pendências, saídas recentes,
  alertas, sugestões, auditoria, atalhos). Cocriação inline/kanban/drag&drop migraram para páginas próprias.
- **Calendário V2**: painel do evento com **7 abas** (Visão geral/Briefing/Fluxo/Pesquisa/**Peças**/
  Automação/Histórico); a aba Peças lista `content_pieces`.
- **Agente de Pesquisa** e **Agente de Cocriação**: páginas próprias (nova pesquisa + resultado; lista de
  conteúdos + editor inline + refino + peças + pacote estruturado).
- **Central de Revisão**: `/approvals` virou visão **consolidada** de pendências (pesquisa/conteúdo/
  evento/publicação) com filtros, ações em lote e "abrir no local certo".
- **Publicações e Canais (FASE 9)**: backend novo (canais, fila, upload de mídia, publish) + UI; Meta stub.
- **Administração V2**: `/admin/acessos` (escopo de marca por usuário + logs de auditoria).
- **Relatórios V2**: publicações reais, insights automáticos, métricas de mídia como "config pendente".
- **Hardening (FASE 12)**: V1, V4, V5 fechados; C1 aplicado em calendar/research/operations + UI de escopo.

---

## 2. Stack completa (versões reais)

### Backend (`apps/api`) — Python 3.11-slim
FastAPI 0.115+ · Uvicorn 0.34+ [standard] · SQLAlchemy 2.0 async (asyncpg 0.30+, psycopg2) · Alembic
1.14+ (**25 migrações, → `0025_publications`**) · Pydantic v2.7+ / pydantic-settings 2.7+ · **LangGraph
0.2+** + langchain-core 0.3+ + langchain-openai 0.2+ + langgraph-checkpoint-postgres 2.0+ (instalado,
**não ativado** — usa `MemorySaver`) · Celery 5.4+ + Redis 5.2+ · **Coleta web:** trafilatura 1.12+,
feedparser 6.0+, BeautifulSoup4, Playwright 1.49+ (Chromium) · httpx 0.28+ · **Docs:** WeasyPrint 63+
(Pango/Cairo), pypdf 5.1+ · **Cripto:** cryptography 44+ (Fernet), PyJWT 2.10+ · ruff 0.8+, pytest 8.3+.

### Frontend (`apps/web`)
Next.js **14.2.35** (App Router) · React 18.3.1 · TypeScript 5 · Tailwind 3.4.17 · ESLint 8.57.1.
Padrões: `apiFetch` mesma-origem (proxy `/api`), `useBrand`, middleware de sessão, renderizador Markdown.
**Sem runner JS** — o "teste de frontend" é `next build` (tipos + lint). **Nota de proxy:** o rewrite
`/api/*` (undici) encerra em ~30s; endpoints LLM longos (pesquisa/cocriação, 1–2 min) são tratados por
**polling** no frontend (§6).

### Banco / infra
PostgreSQL **16 + pgvector** (embeddings 1536d) · Redis 7-alpine (AOF). **Dev** `docker-compose.yml`
(postgres 127.0.0.1:5433, redis 6379, api :8000 `--reload` com código montado, web :3000 hot-reload,
worker, migrate one-shot com alembic montado). **Prod** `docker-compose.prod.yml` + **Caddy** (TLS +
mesma-origem: `/api/*`→api, resto→web); guia em `DEPLOY.md`. **CI** `.github/workflows/ci.yml` —
`ruff check app alembic` + pytest + `next build` (testes não lintados).

---

## 3. Arquitetura e fluxos

### 3.1 Autenticação (C5)
Login (`routers/auth.py`) valida senha (bcrypt) e define **dois cookies**: `duofy_token` **HttpOnly**
(carrega o JWT — invisível ao JS, imune a XSS) e `duofy_auth` (flag não-secreta). `get_current_user`
(`dependencies.py`) aceita token via **header Authorization** (APIs/CLI) **OU** cookie HttpOnly (browser).
O frontend chama `/api` **relativo** (mesma-origem), reescrito pelo `next.config.mjs` para
`API_PROXY_TARGET`, com `credentials: "include"` e **sem Bearer** — `SameSite=Lax` protege contra CSRF.

### 3.2 Caminho canônico de uma chamada LLM
Router → Service → injeta config (`config/agents/<slug>.md` + voz de marca `config/brands/<slug>.md`) →
**sanitização anti-injection** (`prompt_safety.sanitize_prompt_input`, V4) → RAG (`rag.py` sobre pgvector,
filtro `brand OR institucional`) → `llm.py:call_llm` (resolve provedor, decripta credencial Fernet, POST
com retry/backoff 3× em 429/5xx, json_mode opcional) → **grava `ModelCall`** (tokens/custo/latência;
inclui agora o **web-search**, V5) → `Output`/`OutputVersion` (versionado) → Guardião → aprovação humana.

### 3.3 Agentes (5) + orquestrador — **default `openai/gpt-4o-mini`**
Orchestrator, research_agent, content_agent, press_agent, quality_guardian usam `openai/gpt-4o-mini` por
default; qualidade premium ajustável por agente em Admin > Modelos ou `model_override`.
- **Orquestrador** (LangGraph, MemorySaver): monta **briefing** e pede aprovação síncrona.
- **Pesquisa** (`research_service.py`): coleta multi-ângulo real (OpenRouter web-search + Google News RSS +
  DuckDuckGo + Apify opt-in), dedupe por domínio, porta de fontes mínimas (`InsufficientSourcesError`→422),
  guarda anti-SSRF (C4), **entradas sanitizadas** (V4) e **web-search rastreado** (V5).
- **Cocriação** (`cocreation_service.py`): consome pesquisa por ID; gera `ContentPackage` (JSON, com reparo)
  e **explode em peças** (§3.5).
- **Guardião** (`quality_guardian.py`): regras de máquina + LLM (score 0–100, pesos por marca).

### 3.4 Calendário como centro operacional — **F1–F4 entregues** (`calendar_workflow.py`)
Evento = unidade; pipeline **Briefing → Pesquisa → Aprovação → Cocriação → Revisão → Publicação**; reusa
Output/AgentTask/Briefing e o fluxo de aprovação existente. Isolamento por marca em rotas por-id (agora
via `assert_brand_access`, C1). F1 execute-research (para em `awaiting_approval`); F2 execute-cocreation
(gated pela aprovação); F3 automação (`is_paused` + scheduler idempotente); F4 `publish?target=meta|manual`
(**MetaPublisher STUB honesto**, `ManualPublisher` registra). **UI (V2):** painel do evento com 7 abas +
resiliência ao timeout (POST + polling do detalhe até vincular pesquisa/conteúdo).

### 3.5 Peças/subpeças — **F2b** (`content_pieces_service.py`)
A cocriação **explode** o `ContentPackage` em peças aprováveis (Carrossel, Legenda IG/LinkedIn, Direção
visual) + peças **manuais** (WhatsApp, e-mail, blog, release…). Quando as **obrigatórias** ficam aprovadas,
o Output vira `approved`; rejeitar uma reverte para `review`. UI `PiecesReview` reusada em Cocriação
(`/content`), no painel do Calendário (aba Peças) e no foco de conteúdo.

### 3.6 RAG
Upload (PDF/DOCX/TXT/MD) → chunk → embedding (**fallback local SHA256**; OpenAI opt-in) →
`document_chunks.embedding` (pgvector). Busca cosseno com filtro `(brand OR institucional)`. Pesquisa
aprovada é auto-indexada.

### 3.7 Publicações e Canais — **FASE 9** (`routers/publications.py`, migração 0025)
Camada de entrega própria (não sobrecarrega `calendar_events`). Gerencia **canais** (Meta/IG/FB —
conexão real é fase futura, entram `pending`), **fila** de publicações (draft/scheduled/published/error),
**upload de mídia** (`storage/media`, ≤25MB) e **publicação**: `manual` registra publicação externa;
`meta` é **stub honesto** (400 claro, nunca finge sucesso). Consome conteúdo aprovado via `output_id`.
Contrato de integração Meta futura em `docs/PUBLICATIONS_META_PREP_V1.md`. C1 + auditoria em todas as
mutações.

---

## 4. Modelo de dados — **30 tabelas, 25 migrações (→ `0025_publications`)**

Todas com `TimestampMixin`. Grupos:
- **Identidade/config:** `users` (+ `brand_scope` JSON, C1), `brands`, `agents`, `settings`,
  `provider_credentials` (Fernet).
- **Produção de conteúdo:** `outputs`, `output_versions` (`structured_json`=ContentPackage),
  `output_decisions`, `output_comments`, `content_pieces` (kind/status/required/origin).
- **Publicações (F9, novas):** `publication_channels` (platform/status), `publications`
  (channel_id/output_id/media_paths/post_type/status/mode/scheduled_at/published_at/publish_ref).
- **Pesquisa/RAG:** `research_sources`, `memory_entries`, `documents`, `document_chunks`, `sources`.
- **Orquestração/chat:** `chat_sessions`, `agent_tasks`, `chat_messages`, `agent_logs`, `briefings`,
  `research_themes`, `content_themes`.
- **Calendário (workflow V1):** `calendar_events` (campos F1–F4).
- **Qualidade/observabilidade:** `quality_reviews`, `model_calls`, `audit_events`, `reports`.

---

## 5. Endpoints (**23 routers em `main.py`**)

Principais: **auth** · **calendar** (CRUD + `{id}` + execute-research/execute-cocreation/publish/pause/
resume/run-now/generate/export.ics) · **cocreation** (generate/refine/get) · **content** (generate/outputs/
refine/submit-review) · **content_pieces** (`outputs/{id}/pieces`, `pieces/{id}`) · **outputs** (list/detalhe/
versions/compare/restore/approve/reject/move/archive/comments/quality-review/pdf/export) · **documents** ·
**research** (run/reports/save-memory/use-in-content) · **orchestrator** (plan/approve + research-models) ·
**publications** (**novo** — channels, fila, media, publish) · **admin** (users + brand-scope, agents,
providers, quality/agent-settings — **todos auditados**, V1) · **tasks** (SSE) · brands, agents, chat,
memory, press, metrics, operations, reports, themes, research-themes.
Rotas sensíveis por-id de **outputs/documents/pieces/calendar/research/publications** aplicam **isolamento
por marca (C1)**.

---

## 6. Segurança — status atualizado

**Os 5 críticos históricos permanecem corrigidos.** Os altos/médios priorizados foram **fechados**:

| # | Item | Status | Evidência |
|---|---|---|---|
| **V1** | Ações admin sem auditoria | ✅ **Fechado** | `record_audit_event` em `PUT /admin/quality-settings`, `/agent-settings`, `/providers/{provider}` (chave **nunca** vaza — só `api_key_changed: bool`). Testes: `test_admin_audit.py`. |
| **V4** | Prompt injection | ✅ **Fechado** | `app/prompt_safety.py` neutraliza instruções (PT/EN)/delimitadores e limita tamanho, aplicado a theme/period/brand.description/rag_context. Testes: `test_prompt_safety.py` (9). |
| **V5** | Web-search fora do tracking | ✅ **Fechado** | `_openrouter_web_search` grava `ModelCall` (tokens/custo/latência/status), best-effort. Testes: `test_web_search_tracking.py`. |
| **C1** | IDOR entre marcas | ⚠️ **Aplicado + UI; dormente** | `assert_brand_access`/`accessible_brands` em outputs/documents/pieces **+ calendar/research/operations**; **UI `/admin/acessos`** atribui escopos (auditado). `brand_scope` nulo = acesso total → ativa ao atribuir escopos. Testes: `test_access_control.py`, `test_c1_calendar_research.py`. |
| **V2 (parcial)** | `GET /admin/providers` | Aceitável | retorna `has_api_key` + máscara (não a chave). |

**Correção pontual:** `AdminUserRead.email` era `EmailStr` (rejeitava `admin@duofy.local`) e derrubava
`GET /api/admin/users` com 500 — corrigido para `str` (modelo de saída).

**Aberto / débitos de segurança/robustez:**
- **Timeout do proxy em LLM longo:** o rewrite `/api/*` (undici) encerra ~30s; pesquisa/cocriação levam
  1–2 min → o front recebia 500 mesmo com o backend concluindo. **Mitigado por polling** no frontend
  (research/content/CocreationPanel/EventDetailPanel: POST + polling do item criado). O fix sistêmico via
  `instrumentation.ts` (undici) **não é viável** (`MODULE_NOT_FOUND`). Ideal: endpoints assíncronos.
- **`operations/summary` sem `brand_slug`** para usuário restrito ainda agrega o escopo de forma simples
  (função single-brand) — vetor por-id já fechado; agregado multi-marca é follow-up.
- **npm audit (Next.js):** 5 vulns; fix exige `next@16` (breaking) → tarefa isolada com regressão do build
  (DoS do Image Optimizer já neutralizado via `images.unoptimized`).

---

## 7. Testes — **211 passing / 2 skipped** (suíte mockada, sem LLM real)

`patch_ai` mocka `call_llm`/`embed_text` → nenhum teste chama a OpenRouter (custo zero). Cobertura:
fluxos críticos, orquestrador, pesquisa, **calendário workflow** (F1–F4), **peças**, **publicações**
(`test_publications.py`), **segurança** (`test_access_control`, `test_c1_calendar_research`,
`test_admin_audit`, `test_prompt_safety`, `test_web_search_tracking`, `test_crypto`, `test_ssrf`,
`test_settings`, `test_flow_auth`). Lacunas (funcional, sem teste direto): `rag.py`, `embeddings.py`,
`metrics_service.py`, `document_formatting.py`, `audit_service.py`, `calendar_scheduler.py`.
**Frontend:** gate = `next build` + `next lint` (sem runner JS). CI não linta/cobre `tests/`.

---

## 8. Código morto / higiene
Higiene **alta**. Redirects intencionais: `/redes` (mock desligado), `/costs`/`/insights`→`/relatorios`,
`/dashboard`→`/operations`. `/workspace` stub. Opt-in/diferido (não é morto): Apify, Embeddings OpenAI,
langgraph-checkpoint-postgres, **MetaPublisher** (stub explícito). `storage/media/` é runtime (gitignored).

---

## 9. Débitos conscientes (transparência)

1. **C1 dormente:** o mecanismo está aplicado e há **UI** (`/admin/acessos`), mas inativo até atribuir
   `brand_scope` aos usuários. Por design de time interno único.
2. **Meta real:** publicação é stub honesto + caminho manual; Graph API/OAuth é a próxima fase
   (contrato em `PUBLICATIONS_META_PREP_V1.md`).
3. **Timeout de LLM longo:** mitigado por polling no frontend; o ideal é tornar research/cocreation
   assíncronos (AgentTask + poll de status), como o calendário já faz em parte.
4. **`operations/summary` multi-marca** para usuário restrito (§6).
5. **npm audit / Next.js:** upgrade `next@16` em tarefa isolada.
6. **Seed não automático:** admin não é criado no boot; rodar `python -m app.seed` (dev usa
   `admin@duofy.com.br` / `admin123456`, defaults do compose).
7. **C5 em produção:** mudar `NEXT_PUBLIC_API_URL`/`API_PROXY_TARGET` exige rebuild/restart do web.

---

## 10. Conclusão e próximos passos

Sistema **coeso, real e agora completo como produto**: três camadas claras, 8 áreas com páginas próprias,
Calendário como centro operacional (F1–F4) com peças aprováveis, RAG institucional, camada de Publicações,
rastreabilidade de custo/qualidade, e uma **postura de segurança fechada** nos gaps priorizados (V1/V4/V5)
com o C1 aplicado e com UI de escopo. O gap dominante é **operacional**: atribuir escopos (ativa o C1) e
integrar a **Meta** de verdade.

Docs de apoio: `docs/FRONTEND_PRODUCT_V2_PLAN.md` (auditoria + plano), `docs/PUBLICATIONS_META_PREP_V1.md`
(modelagem + contrato Meta), `docs/ADMIN_SECURITY_HARDENING_V1.md` (C1/V1/V4/V5 + fix email).

**Próximos passos recomendados (prioridade):**
1. **Ativar C1:** atribuir `brand_scope` aos usuários em `/admin/acessos` (onboarding).
2. **Meta real:** integração Graph API/OAuth em `MetaPublisher.publish` + scheduler de publicação.
3. **Endpoints LLM assíncronos** (research/cocreation) para eliminar o polling e o teto de timeout.
4. **`operations_summary`** multi-marca para usuário restrito.
5. **npm audit** do Next.js em tarefa isolada com regressão.
6. **Testes:** cobrir `rag`, `embeddings`, `metrics_service`, `calendar_scheduler`, e o frontend (adotar
   um runner, ex.: Playwright/Vitest, se desejado).
