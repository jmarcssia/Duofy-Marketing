# Estado do Sistema — Duofy V1 Marketing Intelligence Hub

> **Snapshot fiel ao código real. Data: 2026-07-06.** Working tree sobre `main` (base `@ 07eab81`),
> com a entrega **Product UX Refinement V3** + **Pacote pronto-para-demo** aplicada (ainda **não
> commitada** — 51 arquivos alterados/novos). Descreve o que **é**: mitigações reais, débitos reais,
> o que está pronto, dormente ou stub. **Supersede** o snapshot de `2026-07-04`.
>
> **O que mudou desde 2026-07-04:** briefing estruturado clicável compartilhado (pesquisa/cocriação/
> calendário) com taxonomia central; **marcas oficiais** na UI; **brand_scope (C1) reforçado e
> validado** em todas as rotas (furos fechados); cocriação **multicanal** com peças extras; wizard de
> evento em etapas; **aprovação de pesquisa confiável** (Guardião por nota); **refino individual por
> peça**; **templates de pesquisa persistidos**; **datas avançadas do evento**; e **dataset de
> demonstração curado**. Migrações `→ 0027`. Testes **304 passando / 2 skipped**.

---

## 1. Resumo executivo

O Duofy V1 é uma plataforma multi-marca de marketing assistido por LLM em três camadas limpas
(Next.js 14 → FastAPI → Postgres+pgvector), com orquestração de agentes, RAG, Guardião de Qualidade
híbrido e um **Calendário que é centro operacional** (evento = unidade de trabalho: briefing →
pesquisa → aprovação → cocriação → revisão → publicação). Núcleo real e funcional; **sem mocks no
caminho principal**. A camada de produto está completa: **8 áreas com páginas próprias fortes**
(Operações, Calendário, Agente de Pesquisa, Agente de Cocriação, Revisão, Publicações, Relatórios,
Administração) e um **padrão único de briefing clicável** compartilhado entre pesquisa, cocriação e
criação de evento.

**Marcas oficiais (nomes exibidos ↔ slug técnico):**
- **TOTVS Varejo Postos de Combustíveis** (`postos_combustiveis`)
- **Gestão DeathCare by Duofy** (`deathcare`)
- **Duofy Soluções** (`duofy_solucoes`)
- + sentinela `institucional` no RAG (documentos que valem para todas as marcas).

A UI é 100% orientada a dados (`GET /api/brands`); renomear a exibição não toca os slugs.

**Maturidade por dimensão (2026-07-06):**

| Dimensão | Estado | Nota |
|---|---|---|
| Arquitetura | Sólida, em camadas, config-as-code; produto coeso por página; taxonomia de filtros compartilhada | 9/10 |
| Funcionalidade do núcleo | Agentes reais + calendário F1–F4 + peças/subpeças + Publicações + briefing estruturado + refino por peça | 9.5/10 |
| Segurança | **C1 reforçado e validado (19/19)** em todas as rotas; V1/V4/V5 fechados; ativa ao atribuir escopo | 8.5/10 |
| Testes | **304 passando / 2 skipped**; combinatória de filtros + taxonomia + E2E real | 8/10 |
| Código morto | Mínimo | 9/10 |
| Prontidão de produção | Deploy self-contained (Caddy); pronto p/ demo; requer Meta real + async LLM p/ escala | 8/10 |

**Veredito senior:** pronto para **apresentação completa e uso interno controlado**. O fluxo ponta a
ponta foi validado com IA real barata (custo de centavos). Os débitos dominantes são de **integração
externa** (Meta real) e **escala** (endpoints LLM assíncronos), não de funcionalidade.

### 1.1 O que a entrega V3 + demo-ready adicionou (resumo)
- **Taxonomia de filtros central** (`apps/web/lib/briefing/`) + **BriefingBuilder** (chips, cards,
  multiselect, seções expansíveis, resumo lateral, indicador de completude) reusado em 3 telas.
- **Pesquisa/Cocriação/Evento** com briefing majoritariamente clicável; texto livre reduzido ao mínimo.
- **Cocriação multicanal**: canais multiselect, peças condicionais, mesmo carrossel IG+LinkedIn com
  legendas diferentes, WhatsApp + prompt de imagem opcional, e-mail; **`extra_pieces`** explodidas em
  `content_pieces`.
- **brand_scope (C1)** reforçado: content/outputs (legado), cocreation, research/run, documents/upload,
  operations (summary/agent-health/quality-reviews) passaram a respeitar o escopo; validado 19/19.
- **Aprovação de pesquisa confiável**: relatório de pesquisa aprovável direto do rascunho; Guardião
  passa a decidir por **nota (≥80)** para pesquisa (criticals viram ajustes), conteúdo segue estrito.
- **Refino individual por peça** (`POST /api/pieces/{id}/refine`).
- **Templates de pesquisa persistidos** (reusa `research_themes`; briefing como JSON em `notes`).
- **Datas avançadas do evento** (migração `0027`): entrega/revisão/aprovação/prazo/lembrete + recorrência.
- **Dataset de demonstração** curado por marca.

---

## 2. Stack completa (versões reais)

### Backend (`apps/api`) — Python 3.11-slim
FastAPI 0.115+ · Uvicorn 0.34+ [standard] · SQLAlchemy 2.0 async (asyncpg 0.30+, psycopg2) · Alembic
1.14+ (**27 migrações, → `0027_calendar_event_dates`**) · Pydantic v2.7+ / pydantic-settings 2.7+ ·
**LangGraph 0.2+** + langchain-core/openai 0.3+/0.2+ + langgraph-checkpoint-postgres 2.0+ (instalado,
**não ativado** — usa `MemorySaver`) · Celery 5.4+ + Redis 5.2+ · **Coleta web:** trafilatura 1.12+,
feedparser 6.0+, BeautifulSoup4, Playwright 1.49+ (Chromium) · httpx 0.28+ · **Docs:** WeasyPrint 63+
(Pango/Cairo), pypdf 5.1+ · **Cripto:** cryptography 44+ (Fernet), PyJWT 2.10+ · ruff 0.8+, pytest 8.3+.

### Frontend (`apps/web`)
Next.js **14.2.35** (App Router) · React 18.3.1 · TypeScript 5 · Tailwind 3.4.17 · ESLint 8.57.1.
Padrões: `apiFetch` mesma-origem (proxy `/api`), `useBrand`, middleware de sessão, renderizador Markdown,
**taxonomia de briefing compartilhada** (`lib/briefing`) + **componentes de briefing** (`components/
briefing`). **Sem runner JS** — o "teste de frontend" é `next build` + `next lint` (+ `tsc --noEmit`).
**Nota de proxy:** o rewrite `/api/*` (undici) encerra ~30s; endpoints LLM longos (pesquisa/cocriação/
refino, 1–2 min) são tratados por **polling** no frontend (§6).

### Banco / infra
PostgreSQL **16 + pgvector** (embeddings 1536d) · Redis 7-alpine (AOF). **Dev** `docker-compose.yml`
(postgres 127.0.0.1:5433, redis, api :8000 `--reload --reload-dir /app/app` com código montado, web :3000
hot-reload, worker, migrate one-shot). **Prod** `docker-compose.prod.yml` + **Caddy** (TLS + mesma-origem:
`/api/*`→api, resto→web); guia em `DEPLOY.md`. **CI** `.github/workflows/ci.yml` — `ruff check app alembic`
+ pytest + `next build`/`next lint` (testes não lintados).

---

## 3. Arquitetura e fluxos

### 3.1 Autenticação (C5)
Login (`routers/auth.py`) valida senha (bcrypt) e define **dois cookies**: `duofy_token` **HttpOnly**
(JWT — imune a XSS) e `duofy_auth` (flag não-secreta). `get_current_user` aceita token via **header
Authorization** (APIs/CLI) **OU** cookie HttpOnly (browser). O front chama `/api` **relativo**, com
`credentials: "include"`, sem Bearer — `SameSite=Lax` protege contra CSRF.

### 3.2 Briefing estruturado (padrão único de filtros) — **V3**
Taxonomia central em `apps/web/lib/briefing/taxonomy.ts` (segmento, subsegmentos, personas, decisores,
jornadas, objetivos, tipos de pesquisa, escopo, período, profundidade, fontes, entregáveis, canais,
formatos, peças, tom, CTA, restrições, nutrição, imprensa, publicação, dependências + templates de
evento/pesquisa/cocriação). `types.ts` traz `StructuredBriefing`, `cleanBriefing`, `briefingSummaryRows`,
`computeCompleteness`. Componentes clicáveis em `components/briefing/` (`MultiSelectChips`, `ChoiceChips`,
`FilterCardGroup`, `CollapsibleSection`, `BriefingSummary`, `BriefingCompleteness`, `TemplatePicker`,
`TextField`/`TextAreaField`). No backend, `app/briefing_filters.py` compõe o dict de filtros em texto de
prompt **determinístico e sanitizado (V4)** e normaliza para persistência. O briefing usado vive em
**`outputs.briefing_json`** (migração `0026`) e, no evento, em `calendar_events.execution_payload.briefing`.

### 3.3 Caminho canônico de uma chamada LLM
Router → Service → injeta config (`config/agents/<slug>.md` + voz de marca `config/brands/<slug>.md`) →
**sanitização anti-injection** (`prompt_safety`, V4) + **briefing estruturado** (`briefing_filters`) →
RAG (`rag.py` sobre pgvector, filtro `brand OR institucional`) → `llm.py:call_llm` (resolve provedor,
decripta credencial Fernet, retry/backoff 3× em 429/5xx, json_mode opcional) → **grava `ModelCall`**
(tokens/custo/latência, inclui web-search — V5) → `Output`/`OutputVersion` (versionado) → Guardião →
aprovação humana.

### 3.4 Agentes (5) + orquestrador — **default `openai/gpt-4o-mini`**
Orchestrator, research_agent, content_agent, press_agent, quality_guardian usam `openai/gpt-4o-mini`
por default; qualidade premium ajustável por agente em Admin > Modelos ou `model_override`. `metrics`
e `calendar` são **módulos internos** (o calendário usa o modelo do **orchestrator**, barato).
- **Pesquisa** (`research_service.py`): coleta multi-ângulo real (OpenRouter web-search + Google News
  RSS + DuckDuckGo + Apify opt-in), dedupe por domínio, porta de fontes mínimas
  (`InsufficientSourcesError`→422), anti-SSRF (C4), entradas sanitizadas (V4), web-search rastreado (V5),
  e agora **`briefing_filters`** no prompt + persistidos em `briefing_json`.
- **Cocriação** (`cocreation_service.py`): consome pesquisa por ID; gera `ContentPackage` (JSON, com
  reparo) e **explode em peças** (§3.6). Agora **multicanal**: `channels[]`, `pieces[]` (kinds extras:
  whatsapp, whatsapp_image_prompt, email, blog, release, pitch, landing_page) e `extra_pieces` no pacote;
  legendas por canal social (IG/LinkedIn/Facebook/TikTok), sempre diferentes entre si.
- **Guardião** (`quality_guardian.py`): regras determinísticas + LLM (score 0–100, modo `hybrid` default).
  Para **relatórios de pesquisa**, `_relax_research_gate` faz a **nota (≥80)** governar a aprovação —
  os *critical_failures* viram *ajustes recomendados* (o humano decide). Pesquisa fraca ainda reprova
  pela nota (penalidades de sensibilidade DeathCare/fonte/mojibake). **Conteúdo mantém o gate estrito**.

### 3.5 Calendário como centro operacional — **F1–F4 + wizard** (`calendar_workflow.py`)
Evento = unidade; pipeline **Briefing → Pesquisa → Aprovação → Cocriação → Revisão → Publicação**; reusa
Output/AgentTask/Briefing e o fluxo de aprovação existente. Isolamento por marca em rotas por-id
(`assert_brand_access`, C1). F1 execute-research (para em `awaiting_approval`); F2 execute-cocreation
(gated pela aprovação; usa canal/formato/canais/peças do **briefing do evento** quando não especificado);
F3 automação (`is_paused` + scheduler idempotente); F4 `publish?target=meta|manual` (**MetaPublisher STUB
honesto**, `ManualPublisher` registra). **UI (V3):** "Novo evento" abre um **wizard em 6 etapas** (Tipo →
Marca/template → Briefing → Datas e automação → Peças e aprovação → Resumo), com o tipo **Pesquisa +
Conteúdo** (`research_content`) e **Publicação**, e **datas avançadas** (entrega/revisão/aprovação/prazo/
lembrete + recorrência, migração `0027`). Painel do evento com 7 abas + resiliência ao timeout.

### 3.6 Peças/subpeças + refino por peça — **F2b + V3** (`content_pieces_service.py`)
A cocriação **explode** o `ContentPackage` em peças aprováveis (Carrossel, Legenda IG/LinkedIn/Facebook/
TikTok, Direção visual) + `extra_pieces` (WhatsApp, prompt de imagem WhatsApp, e-mail, blog, release,
pitch, landing_page). Quando as **obrigatórias** ficam aprovadas, o Output vira `approved`; rejeitar uma
reverte para `review`. **Novo:** `POST /api/pieces/{id}/refine` regenera **só aquela peça** via agente
(por tipo de peça) e a devolve a `pending` (força re-aprovação). UI `PiecesReview` (botão "Refinar" com
instrução inline) reusada em Cocriação, no painel do Calendário (aba Peças) e no foco de conteúdo.

### 3.7 Aprovação de conteúdo — **V3 (5a)**
Cocriação com peças aprova via `PiecesReview`. Conteúdo **avulso** (barra legada em `/content`, sem
peças) nasce `draft`; a UI encadeia **submit-review → approve** (o Guardião roda no meio) e mostra o
score; botão "Enviar para revisão" explícito. `approve_output` aceita **relatório de pesquisa** direto
do rascunho (a página de Pesquisa só oferece Aprovar/Solicitar ajustes).

### 3.8 RAG
Upload (PDF/DOCX/TXT/MD) → chunk → embedding (**fallback local SHA256**; OpenAI opt-in) →
`document_chunks.embedding` (pgvector). Busca cosseno com filtro `(brand OR institucional)`. Pesquisa
aprovada é auto-indexada. Upload agora aplica **C1** (não alimenta RAG de marca fora do escopo).

### 3.9 Publicações e Canais — **FASE 9** (`routers/publications.py`, migração `0025`)
Camada de entrega própria: **canais** (Meta/IG/FB — conexão real é fase futura, entram `pending`),
**fila** (draft/scheduled/published/error), **upload de mídia** (`storage/media`, ≤25MB) e **publicação**:
`manual` registra publicação externa; `meta` é **stub honesto** (400 claro, nunca finge sucesso). Consome
conteúdo aprovado via `output_id`. C1 + auditoria em todas as mutações.

### 3.10 Templates de pesquisa persistidos — **V3 (5c)**
"Salvar como template" grava um `ResearchTheme` com o briefing serializado em `notes` (JSON
`{pergunta, briefing}`); a página de Pesquisa carrega os salvos (via `GET /api/research-themes`) e os
mescla aos templates fixos da taxonomia. Sem migração (reusa `research_themes` + `notes`).

---

## 4. Modelo de dados — **30 tabelas, 27 migrações (→ `0027`)**

Todas com `TimestampMixin`. Grupos:
- **Identidade/config:** `users` (+ `brand_scope` JSON, C1), `brands`, `agents`, `settings`,
  `provider_credentials` (Fernet).
- **Produção de conteúdo:** `outputs` (+ **`briefing_json` JSON**, migração `0026`), `output_versions`
  (`structured_json`=ContentPackage), `output_decisions`, `output_comments`, `content_pieces`
  (kind/status/required/origin; kinds sociais + extras).
- **Publicações (F9):** `publication_channels` (platform/status), `publications` (channel_id/output_id/
  media_paths/post_type/status/mode/scheduled_at/published_at/publish_ref).
- **Pesquisa/RAG:** `research_sources`, `memory_entries`, `documents`, `document_chunks`, `sources`.
- **Orquestração/chat:** `chat_sessions`, `agent_tasks`, `chat_messages`, `agent_logs`, `briefings`,
  `research_themes` (usado também como **template de pesquisa**), `content_themes`.
- **Calendário (workflow V1 + V3):** `calendar_events` (campos F1–F4 + **datas avançadas**: `delivery_at`,
  `review_at`, `approval_at`, `due_at`, `reminder_at`, `recurrence_rule` — migração `0027`).
- **Qualidade/observabilidade:** `quality_reviews`, `model_calls`, `audit_events`, `reports`.

---

## 5. Endpoints (**23 routers em `main.py`**)

Principais: **auth** · **calendar** (CRUD + `{id}` + execute-research/execute-cocreation/publish/pause/
resume/run-now/generate/export.ics; datas avançadas nos schemas Create/Update/Read) · **cocreation**
(generate/refine/get — aceita `channels[]`/`pieces[]`/`briefing_filters`; C1) · **content** (generate/
outputs/refine/submit-review; **C1 nas listagens e por-id**) · **content_pieces** (`outputs/{id}/pieces`,
`pieces/{id}`, **`pieces/{id}/refine`** — novo, C1) · **outputs** (list/detalhe/versions/compare/restore/
approve/reject/move/archive/comments/quality-review/pdf/export) · **documents** (upload agora com C1) ·
**research** (run — aceita `briefing_filters`, C1; reports/save-memory/use-in-content) · **research-themes**
(list/create/delete/import — usado como templates) · **orchestrator** (plan/approve + research-models) ·
**publications** (channels, fila, media, publish) · **admin** (users + brand-scope **com validação de
slug**, agents, providers, quality/agent-settings — **todos auditados**, V1) · **operations** (summary/
agent-health/quality-reviews — **todos respeitam o escopo**, C1; audit-events) · **tasks** (SSE) · brands,
agents, chat, memory, press, metrics, reports, themes.

---

## 6. Segurança — status atualizado

**Os 5 críticos históricos permanecem corrigidos. C1 deixou de ser dormente: foi reforçado em todas as
rotas e validado na prática (19/19 checks contra a API real).**

| # | Item | Status | Evidência |
|---|---|---|---|
| **C1** | IDOR entre marcas | ✅ **Reforçado + validado** | `assert_brand_access`/`accessible_brands` em outputs/documents/pieces/calendar/research/**content(legado)**/**cocreation**/**publications**/**operations**. `research/run` e `documents/upload` bloqueiam marca fora do escopo (404, sem gastar tokens). `operations/summary` sem `brand_slug` agrega **só o escopo** (multi-marca) e `recent_errors` não vaza. `admin/.../brand-scope` **valida slug**. Testes: `test_access_control`, `test_c1_calendar_research`, `test_operations_scope`, + prova de fogo 19/19. `brand_scope` nulo = acesso total. |
| **V1** | Ações admin sem auditoria | ✅ Fechado | `record_audit_event` em quality/agent/providers/brand-scope; chave nunca vaza. Testes `test_admin_audit`. |
| **V4** | Prompt injection | ✅ Fechado | `prompt_safety` neutraliza instruções/delimitadores; aplicado a theme/period/brand.description/rag_context **e ao briefing estruturado** (`briefing_filters_to_prompt`). Testes `test_prompt_safety`, `test_briefing_filters`, `test_filter_combinatorics`. |
| **V5** | Web-search fora do tracking | ✅ Fechado | `_openrouter_web_search` grava `ModelCall`. Teste `test_web_search_tracking`. |
| **V2 (parcial)** | `GET /admin/providers` | Aceitável | retorna `has_api_key` + máscara (não a chave). |

**Aberto / débitos de segurança/robustez:**
- **Timeout do proxy em LLM longo:** rewrite `/api/*` (undici) encerra ~30s; pesquisa/cocriação/refino
  levam 1–2 min → **mitigado por polling** no frontend. Ideal: endpoints assíncronos.
- **JWT ↔ Fernet:** rotacionar `JWT_SECRET_KEY` derruba as credenciais de provedor cifradas — **não
  rotacionar** sem replanejar.
- **npm audit (Next.js):** 2 vulns (1 alta) que exigem `next@16` (breaking) → tarefa isolada com regressão.

---

## 7. Testes — **304 passing / 2 skipped** (suíte mockada, sem LLM real)

`patch_ai` mocka `call_llm`/`embed_text` → nenhum teste chama a OpenRouter (custo zero). 63 arquivos.
Cobertura: fluxos críticos, orquestrador, pesquisa, **calendário workflow** (F1–F4 + briefing +
datas), **peças + refino por peça**, **publicações**, **cocriação multicanal** (IG+LinkedIn mesmo
carrossel/legendas diferentes, WhatsApp+imagem, E-mail+WhatsApp), **combinatória de filtros**
(`test_filter_combinatorics`, 60 casos: canais×peças×validação×prompt), **aprovação de pesquisa**
(`test_research_approval` — draft→approved + gate por nota), **brand_scope/operations**
(`test_operations_scope`), **segurança** (access_control, c1_calendar_research, admin_audit,
prompt_safety, web_search_tracking, crypto, ssrf, settings, flow_auth). **Validador de taxonomia do
frontend** (Node, ~110 asserts) fora do pytest. **Frontend:** gate = `next build` + `next lint` +
`tsc --noEmit`.

**Verificação com IA real (prova de fogo, gpt-4o-mini quick):** fluxo ponta a ponta validado —
pesquisa (8 fontes, briefing_json), cocriação multicanal (extra_pieces), peças, publicação manual,
Meta stub 400, brand_scope 19/19. **Custo total acumulado: ~US$ 0,036.**

---

## 8. Código morto / higiene
Higiene **alta**. Redirects intencionais: `/redes` (mock desligado), `/costs`/`/insights`→`/relatorios`,
`/dashboard`→`/operations`. `/workspace` stub. Opt-in/diferido (não é morto): Apify, Embeddings OpenAI,
langgraph-checkpoint-postgres, **MetaPublisher** (stub explícito). `storage/media/` é runtime
(gitignored). A linha `calendar_agent` no banco existe para prompt/budget do módulo — seu `default_model`
não é chamado (o calendário usa o do orchestrator).

---

## 9. Débitos conscientes (transparência)

1. **Meta real:** publicação é stub honesto + caminho manual; Graph API/OAuth é a próxima fase
   (contrato em `PUBLICATIONS_META_PREP_V1.md`).
2. **Endpoints LLM assíncronos** (research/cocreation/refine): mitigado por polling; o ideal é
   AgentTask + poll de status para eliminar o teto de timeout.
3. **npm audit / Next 16** em tarefa isolada com regressão.
4. **Datas avançadas do evento** guardam metadados/regra — **sem worker** de disparo de lembrete nem
   materialização de ocorrências recorrentes.
5. **Refino por peça** atua só na peça (não reescreve o `structured_json`/markdown da versão do pacote).
6. **Templates:** pesquisa persiste (5c); falta biblioteca de templates de conteúdo e edição/exclusão pela UI.
7. **Seed não automático:** admin não é criado no boot; `python -m app.seed` (dev usa
   `admin@duofy.com.br` / `admin123456`).
8. **C5 em produção:** mudar `NEXT_PUBLIC_API_URL`/`API_PROXY_TARGET` exige rebuild/restart do web.
9. **Entrega não commitada:** V3 + demo-ready estão no working tree (`main` base `07eab81`), 51 arquivos.

---

## 10. Estado para demonstração

- **Login:** `admin@duofy.com.br` / `admin123456`. **brand_scope demo:**
  `manager.deathcare@duofy.com.br` / `manager123456` (escopo DeathCare) para mostrar o isolamento.
- **Dados curados:** cada marca tem ≥1 pesquisa aprovada, ≥1 conteúdo aprovado com peças, 1 publicação
  registrada e eventos em Julho/2026 (alguns com briefing estruturado + datas avançadas).
- **Riscos de demo já mitigados:** aprovação de pesquisa flui (Guardião por nota); mensagens de espera
  claras (1–2 min); calendário usa modelo barato. **Evitar clicar "Publicar na Meta"** ao vivo (stub 400
  honesto) — usar o caminho manual.

---

## 11. Conclusão e próximos passos

Sistema **coeso, real e completo como produto**, com um padrão único de briefing clicável, cocriação
multicanal, refino por peça, calendário com datas avançadas, brand_scope reforçado e validado, e uma
postura de segurança fechada nos gaps priorizados. Pronto para **apresentação completa** e uso interno.

Docs de apoio: `docs/BRIEFING_FILTERS_V1.md` (taxonomia), `docs/E2E_MARKETING_FLOW_CHECKLIST.md`
(fluxo ponta a ponta), `docs/PRODUCT_UX_REFINEMENT_V3.md` (entrega V3 + demo-ready + prova de fogo),
`docs/PUBLICATIONS_META_PREP_V1.md` (contrato Meta), `docs/ADMIN_SECURITY_HARDENING_V1.md` (C1/V1/V4/V5).

**Próximos passos recomendados (prioridade):**
1. **Commitar** a entrega V3 + demo-ready numa branch + PR.
2. **Meta real:** integração Graph API/OAuth em `MetaPublisher.publish` + scheduler de publicação.
3. **Endpoints LLM assíncronos** (research/cocreation/refine) para eliminar o polling e o teto de timeout.
4. **npm audit** do Next.js (upgrade `next@16`) em tarefa isolada com regressão.
5. **Worker de lembrete/recorrência** para as datas avançadas do evento.
6. **Testes de frontend** (Playwright/Vitest) além do `next build`.
