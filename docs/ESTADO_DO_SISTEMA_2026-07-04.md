# Estado do Sistema — Duofy V1 Marketing Intelligence Hub

> **Snapshot fiel ao código real. Data: 2026-07-04. Branch `main` @ `c172a27` (sincronizada, 120 commits).**
> Construído a partir de auditoria em 3 frentes (stack/dados/auth, postura de segurança, código
> morto/testes) lendo o código atual, cruzada com verificação direta. Descreve o que **é** — mitigações
> reais, débitos reais, o que está pronto, dormente ou stub. **Supersede** `ESTADO_DO_SISTEMA_2026-07-02.md`.

---

## 1. Resumo executivo

O Duofy V1 é uma plataforma multi-marca de marketing assistido por LLM em três camadas limpas
(Next.js 14 → FastAPI → Postgres+pgvector), com orquestração de agentes, RAG, Guardião de Qualidade
híbrido e um **Calendário que virou centro operacional** (evento = unidade de trabalho: pesquisa →
aprovação → cocriação → revisão → publicação). Núcleo real e funcional; sem mocks no caminho principal
(a única tela mock — `/redes`, Instagram/Meta Ads — está conscientemente desligada por redirect).

**Marcas ativas:** Duofy Soluções (`duofy_solucoes`), TOTVS Gestão DeathCare by Duofy (`deathcare`),
TOTVS Postos de Combustíveis by Duofy (`postos_combustiveis`) — + sentinela `institucional` no RAG.

**Maturidade por dimensão (2026-07-04):**

| Dimensão | Estado | Nota |
|---|---|---|
| Arquitetura | Sólida, em camadas, config-as-code | 8.5/10 |
| Funcionalidade do núcleo | Agentes reais + calendário workflow F1–F4 + peças/subpeças | 8.5/10 |
| Segurança | 4 de 5 críticos mitigados; C1 pronto porém **dormente**; algumas altas abertas | 6.5/10 |
| Testes | 185 passando / 2 skipped; cobertura desigual (utils sem teste direto) | 6.5/10 |
| Código morto | Mínimo (~120 linhas resgatáveis) | 9/10 |
| Prontidão de produção | Deploy self-contained (Caddy) pronto; requer atribuir escopos + fechar altas | 7/10 |

**Veredito senior:** pronto para uso interno controlado; os 5 críticos históricos foram **corrigidos**
(4 efetivos, C1 dormente por design de time único). Para exposição multi-tenant real, falta **atribuir
`brand_scope`** aos usuários (ativa o C1) e fechar as **altas abertas** (auditoria de ações admin,
sanitização anti-prompt-injection).

---

## 2. Stack completa (versões reais)

### Backend (`apps/api`) — Python 3.11-slim
FastAPI 0.115+ · Uvicorn 0.34+ [standard] · SQLAlchemy 2.0 async (asyncpg 0.30+, psycopg2) · Alembic
1.14+ (24 migrações, → `0024`) · Pydantic v2.7+ / pydantic-settings 2.7+ · **LangGraph 0.2+** +
langchain-core 0.3+ + langchain-openai 0.2+ + langgraph-checkpoint-postgres 2.0+ (instalado, **não
ativado** — usa `MemorySaver`) · Celery 5.4+ + Redis 5.2+ · **Coleta web:** trafilatura 1.12+,
feedparser 6.0+, BeautifulSoup4, Playwright 1.49+ (Chromium) · httpx 0.28+ · **Docs:** WeasyPrint 63+
(Pango/Cairo), pypdf 5.1+ · **Cripto:** cryptography 44+ (Fernet), PyJWT 2.10+ · ruff 0.8+, pytest 8.3+.

### Frontend (`apps/web`)
Next.js **14.2.35** (App Router) · React 18.3.1 · TypeScript 5 · Tailwind 3.4.17 · ESLint 8.57.1.
Padrões: `apiFetch` mesma-origem (proxy `/api`), `useBrand`, middleware de sessão, renderizador Markdown.

### Banco / infra
PostgreSQL **16 + pgvector** (embeddings 1536d) · Redis 7-alpine (AOF). **Dev** `docker-compose.yml`
(postgres 127.0.0.1:5433, redis 6379, api :8000 `--reload`, web :3000, worker, migrate one-shot). **Prod**
`docker-compose.prod.yml` + **Caddy** (TLS + mesma-origem: `/api/*`→api, resto→web); guia em `DEPLOY.md`.
**CI** `.github/workflows/ci.yml` — `ruff check app alembic` + pytest + `next build` (testes não lintados).

---

## 3. Arquitetura e fluxos

### 3.1 Autenticação (refeita — C5)
Login (`routers/auth.py`) valida senha (bcrypt) e define **dois cookies**: `duofy_token` **HttpOnly**
(carrega o JWT — invisível ao JS, imune a XSS) e `duofy_auth` (flag não-secreta, legível, só sinaliza
sessão). `get_current_user` (`dependencies.py`) aceita o token via **header Authorization** (APIs/CLI)
**OU** cookie HttpOnly (browser). O frontend chama `/api` **relativo** (mesma-origem), reescrito pelo
`next.config.mjs` rewrites para `API_PROXY_TARGET` (dev-docker `http://api:8000`), com
`credentials: "include"` e **sem Bearer** — logo `SameSite=Lax` protege contra CSRF. Middleware do Next
lê o cookie server-side para proteger rotas. Logout limpa ambos os cookies no backend.

### 3.2 Caminho canônico de uma chamada LLM
Router → Service → injeta config (`config/agents/<slug>.md` + voz de marca `config/brands/<slug>.md`) →
RAG (`rag.py` sobre pgvector, filtro `brand OR institucional`) → `llm.py:call_llm` (resolve provedor por
`provider_for_model`, decripta credencial Fernet, POST com retry/backoff 3× em 429/5xx, json_mode
opcional) → **grava `ModelCall`** (tokens/custo/latência) → `Output`/`OutputVersion` (versionado) →
Guardião → aprovação humana.

### 3.3 Agentes (5) + orquestrador — **default `openai/gpt-4o-mini`**
Todos os agentes (orchestrator, research_agent, content_agent, press_agent, quality_guardian) usam
`openai/gpt-4o-mini` por default (config/seeds/agents.yaml + seed.py + DB) — barato e com `json_object`
nativo. Qualidade premium é ajustável por agente em Admin > Modelos ou via `model_override`.
- **Orquestrador** (LangGraph, MemorySaver): monta **briefing** e pede aprovação síncrona (`/api/orchestrator/*`).
- **Pesquisa** (`research_service.py`): coleta multi-ângulo real (OpenRouter web-search + Google News RSS +
  DuckDuckGo scraping + Apify opt-in), dedupe por domínio, porta de fontes mínimas
  (`InsufficientSourcesError`→422), **guarda anti-SSRF** (§6 C4). Saída padrão DOCX de consultoria.
- **Cocriação** (`cocreation_service.py`): consome pesquisa por ID; gera `ContentPackage` em modo JSON com
  **fallback de reparo** (2 gerações + 1 reparo) para o JSON às vezes malformado do modelo; **explode em
  peças** (§3.5).
- **Guardião** (`quality_guardian.py`): regras de máquina + LLM (score 0–100, pesos por marca).
- **Métricas/Calendário:** módulos (não agentes conversacionais).

### 3.4 Calendário como centro operacional — **F1–F4 entregues** (`calendar_workflow.py`, migrações 0020–0022)
Evento = unidade de trabalho; pipeline derivado **Briefing → Pesquisa → Aprovação → Cocriação → Revisão →
Publicação**; reusa Output/AgentTask/Briefing (sem duplicar) e o fluxo de aprovação existente (sem 2º
sistema). Isolamento por marca em todas as rotas por-id (exige+verifica `brand_slug`; mismatch → 404).
- **F1 pesquisa:** `execute-research` roda o Agente de Pesquisa real, cria `AgentTask`, vincula Output,
  para em `awaiting_approval`; aprovação humana libera a cocriação.
- **F2 cocriação:** `execute-cocreation` (gated pela aprovação da pesquisa) reusa `cocreation_service`,
  vincula `content_output_id`, avança para `review`.
- **F3 automação:** `is_paused` (migração 0021) + `pause`/`resume`; scheduler
  (`calendar_scheduler.py`, lock Redis, idempotente) auto-executa pesquisa vencida e **auto-cocria após a
  aprovação humana da pesquisa**; histórico de tentativas derivado dos `AgentTask`.
- **F4 publicação:** `publish?target=meta|manual` (migração 0022). **`MetaPublisher` é STUB** — levanta
  `PublisherNotConfigured` (não finge sucesso); `ManualPublisher` registra publicação externa. Integração
  real Meta (Graph API/OAuth) é a próxima fase, plugável em `publishers.py` sem tocar no workflow.

### 3.5 Peças/subpeças — **F2b entregue** (`content_pieces_service.py`, migração 0024)
A cocriação **explode** o `ContentPackage` em peças aprováveis individualmente (Carrossel, Legenda IG,
Legenda LinkedIn, Direção visual) e permite **peças manuais** (WhatsApp, e-mail, blog, release, pitch…).
Quando as peças **obrigatórias** ficam aprovadas, o Output vira `approved` (mesmo status/decisão de sempre);
rejeitar uma obrigatória reverte para `review`. UI `PiecesReview` no CocreationPanel.

### 3.6 RAG
Upload (PDF/DOCX/TXT/MD) → chunk → embedding (**fallback local determinístico SHA256**; OpenAI opt-in) →
`document_chunks.embedding` (pgvector). Busca cosseno com filtro `(brand OR institucional)`. 2 PDIs base
(Brand Kit, Documento Mestre) institucionais; pesquisa aprovada é auto-indexada.

---

## 4. Modelo de dados — 28 tabelas, 24 migrações (→ `0024_content_pieces`)

Todas com `TimestampMixin`. Grupos:
- **Identidade/config:** `users` (**+ `brand_scope` JSON, C1**), `brands`, `agents`, `settings`,
  `provider_credentials` (chave cifrada Fernet).
- **Produção de conteúdo:** `outputs`, `output_versions` (`structured_json` = ContentPackage),
  `output_decisions`, `output_comments`, **`content_pieces`** (F2b: kind/status/required/origin).
- **Pesquisa/RAG:** `research_sources`, `memory_entries` (embedding), `documents`, `document_chunks`
  (embedding), `sources`.
- **Orquestração/chat:** `chat_sessions`, `agent_tasks`, `chat_messages`, `agent_logs`, `briefings`,
  `research_themes`, `content_themes`.
- **Calendário (workflow V1):** `calendar_events` — além do básico, os campos F1–F4: `execution_mode`,
  `auto_execute_at`, `requires_research_approval`, `current_step`, `objective`, `research_output_id`,
  `content_output_id`, `briefing_id`, `agent_task_id`, `created_by`, `is_paused`, `publish_status`,
  `published_at`, `publish_target`, `publish_ref`.
- **Qualidade/observabilidade:** `quality_reviews`, `model_calls` (tokens/custo/latência), `audit_events`,
  `reports`.

---

## 5. Endpoints (22 routers em `main.py`)

Principais: **auth** (login/logout/me — cookies HttpOnly) · **calendar** (CRUD + `{id}` detalhe +
`execute-research`/`execute-cocreation`/`publish`/`pause`/`resume`/`run-now` + `generate` + `export.ics`) ·
**cocreation** (generate/refine/get) · **content_pieces** (`outputs/{id}/pieces`, `pieces/{id}` PATCH/DELETE,
`pieces/{id}/status`) · **outputs** (list/detalhe/versions/compare/restore/approve/reject/move/archive/
comments/quality-review/pdf/export) · **documents** (upload/list/delete/download/export/chunks) ·
**research** (run/reports/save-memory/extract-briefing) · **orchestrator** (plan/approve + `research-models`) ·
**admin** (users + brand-scope, agents, providers, quality/agent-settings) · **tasks** (list/detalhe/stream SSE) ·
brands, agents, chat, content, memory, press, metrics, operations, reports, themes, research-themes.
Rotas sensíveis por-id de **outputs/documents/pieces** aplicam **isolamento por marca** (C1).

---

## 6. Segurança — os 5 críticos e o que segue aberto

**Os 5 críticos históricos foram corrigidos** (sprint de hardening, mesclada na main). Verificação fiel:

| # | Crítico | Status real | Evidência |
|---|---|---|---|
| **C2** | Fernet↔JWT acoplados | ✅ **Mitigado** | `crypto._fernet` usa `fernet_secret_key or jwt_secret_key` (fallback retrocompatível) |
| **C3** | Segredos default versionados | ✅ **Mitigado** | `settings._enforce_secret_hardening` barra JWT/admin/**DB** default em produção |
| **C4** | SSRF na coleta de URLs | ✅ **Mitigado** | `_ensure_public_url` bloqueia IP não-público + teto 8MB + valida redirects; aplicado em ambos fetchers |
| **C5** | JWT roubável por XSS | ✅ **Mitigado** | cookie **HttpOnly** + flag não-secreta + proxy mesma-origem (SameSite=Lax); **verificado ao vivo** (JS não lê o token) |
| **C1** | IDOR entre marcas | ⚠️ **Pronto, porém DORMENTE** | `brand_scope` + `assert_brand_access`/`accessible_brands` aplicados em outputs/documents/pieces + admin setter; **mas `brand_scope` nulo = acesso total**, então a proteção só ativa após atribuir escopos aos usuários (por design de time interno único) |

**Altas/médias AINDA ABERTAS (honestidade):**
- **V1 (ALTA):** ações admin **sem auditoria** — `PUT /admin/quality-settings`, `/admin/agent-settings`,
  `/admin/providers/{provider}` não gravam `audit_event` (só o brand-scope grava). Um admin altera modo de
  qualidade, orçamentos e **chaves de provedor** sem trilha.
- **V4 (MÉDIA):** **prompt injection** — `theme`/`period`/`brand.description` entram no prompt sem
  sanitização (`research_service._user_prompt`).
- **V5 (MÉDIA):** **web-search fora do tracking** — `_openrouter_web_search` usa httpx cru, não passa por
  `call_llm`/`ModelCall`; esse custo não aparece nos relatórios. As demais chamadas (cocriação, guardião,
  calendário) **são** rastreadas.
- **V2 (ALTA, parcial):** `GET /admin/providers` decripta a chave mas retorna **mascarada**
  (`mask_secret`) — ideal seria só `has_api_key: bool`.
- **npm audit (Next.js):** rodar `npm audit` no `apps/web` antes de produção (o DoS do Image Optimizer já
  está neutralizado via `images.unoptimized`).
- **V3 (log de headers):** **mitigado** — headers com Bearer não são logados.

---

## 7. Testes — **185 passing / 2 skipped** (suíte mockada, sem LLM real)

51 arquivos em `apps/api/tests/`; `patch_ai` mocka `call_llm` e `embed_text` em todos os módulos → **nenhum
teste chama a OpenRouter (custo zero)**. Boa cobertura: fluxos críticos (`flow_*`), orquestrador
(`orchestrator_*`), pesquisa (`research_*`), **calendário workflow** (`test_calendar_workflow` F1–F4),
**peças** (`test_content_pieces`), **segurança** (`test_access_control`, `test_crypto`, `test_ssrf`,
`test_settings`, `test_flow_auth` cookie). **Lacunas (funcional mas sem teste direto):** `rag.py`,
`embeddings.py`, `metrics_service.py`, `document_formatting.py`, `audit_service.py`, `calendar_scheduler.py`.
CI não linta nem cobre `tests/`.

---

## 8. Código morto / usado vs não-usado

Higiene **alta** — ~**120 linhas** resgatáveis (perto da estimativa anterior): ~97 realmente inativas +
~24 de duplicação.
- **Redirects intencionais** (frontend): `/redes` (mock Instagram/Ads desligado, documentado), `/costs` e
  `/insights` → `/relatorios`, `/workspace` → `/operations`. 14 páginas reais, sem componente órfão.
- **Opt-in/diferido (não é morto):** **Apify** (`_apify_candidates`, seed `is_enabled=False`), **Embeddings
  OpenAI** (fallback local ativo), **langgraph-checkpoint-postgres** (usa `MemorySaver`; helper de ativação
  documentado), **`MetaPublisher`** (stub explícito, 11 linhas).
- **Duplicação leve:** `_plain_text()` repetido em ~6 módulos (~24 linhas — candidato a util).
- **Nenhuma função privada órfã ou import morto** detectado; 20 routers registrados, todos com backend.

---

## 9. Débitos conscientes (transparência)

1. **C1 dormente:** o mecanismo de isolamento existe e é aplicado, mas **inativo até atribuir `brand_scope`**
   aos usuários (`PUT /api/admin/users/{id}/brand-scope`). Por design de time interno único.
2. **Meta real:** publicação é stub honesto + caminho manual; a integração Graph API/OAuth é a próxima fase.
3. **V1/V4/V5** (§6): auditoria de ações admin, sanitização anti-prompt-injection, tracking do web-search.
4. **Tracking do web-search:** httpx cru, fora do `ModelCall`.
5. **Seed não automático:** admin não é criado no boot; rodar `python -m app.seed`.
6. **Docker AI (dev):** `EnableDockerAI=false` no Docker Desktop local (recuperação de um travamento do host);
   reabilitar após reboot se desejado — não afeta o app.
7. **C5 em produção:** ao mudar `NEXT_PUBLIC_API_URL`/`API_PROXY_TARGET`, o container web precisa de
   rebuild/restart (já aplicado no dev).

---

## 10. Conclusão e próximos passos

Sistema **coeso, real e bem organizado**: três camadas claras, agentes que produzem saída verificável, o
Calendário como centro operacional (F1–F4) com peças/subpeças aprováveis, RAG institucional, rastreabilidade
de custo/qualidade, e uma **postura de segurança substancialmente melhor** — 4 dos 5 críticos efetivamente
mitigados e o 5º (C1) pronto para ativar. O gap dominante deixou de ser "criptografia/SSRF/XSS" e passou a
ser **operacional**: atribuir escopos de marca (ativa o C1) e fechar as altas abertas.

**Próximos passos recomendados (prioridade):**
1. **Ativar C1:** atribuir `brand_scope` aos usuários no onboarding.
2. **V1:** `record_audit_event` em todos os `PUT/DELETE` de admin (chaves de provedor incluídas).
3. **V4:** sanitizar/validar `theme`/`period`/`brand.description` antes do prompt.
4. **V5:** incluir o web-search no `ModelCall` (rastreabilidade de custo).
5. **npm audit** do Next.js em tarefa isolada com regressão.
6. **Feature:** integração real da **Meta** (Graph API/OAuth) em `MetaPublisher.publish`.
7. **Testes:** cobrir `rag`, `embeddings`, `metrics_service`, `calendar_scheduler`.
