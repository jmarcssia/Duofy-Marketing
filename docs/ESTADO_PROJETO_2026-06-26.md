# Estado do Projeto — DUOFY V1 Marketing AI

> Documento factual gerado em **2026-06-26** a partir de inspeção do código real, banco PostgreSQL local, migrations, testes e Docker. Substitui `ESTADO_ATUAL_DO_SISTEMA.md` (25/06, desatualizado em vários pontos — ver §11). Reflete as correções **Tier 0** aplicadas nesta data.

---

## 1. O que é

Aplicação **local-first** de operação de marketing com agentes de IA: memória/RAG, cocriação de conteúdo, pesquisa de mercado, aprovações com Guardião de Qualidade, calendário editorial, assessoria de imprensa, métricas/custos e auditoria. Uso-alvo: **equipe interna única** (não multi-tenant).

## 2. Stack e arquitetura

| Camada | Tecnologia | Onde |
|---|---|---|
| Backend | FastAPI (async, Python 3.11) | `apps/api/app` |
| Frontend | Next.js 14 (App Router) | `apps/web` |
| Banco | PostgreSQL 16 + pgvector 0.8 | container `postgres` (host :5433) |
| Fila/cache | Redis 7 + Celery (`--pool=solo`) | containers `redis`, `worker` |
| LLM | OpenRouter / OpenAI / Anthropic | `app/llm.py` |
| Config | Markdown/YAML versionados | `config/` |

**Serviços Docker** (`docker-compose.yml`): `postgres`, `redis`, **`migrate`** (one-shot `alembic upgrade head`, novo), `api` (:8000), `web` (:3000), `worker`. `api`/`worker` só sobem após `migrate` concluir (`service_completed_successfully`).

## 3. Backend — serviços e routers

**Routers** (`app/routers`): `auth`, `brands`, `admin`, `agents`, `chat`, `content`, `documents`, `memory`, `outputs`, `research`, `calendar`, `press`, `metrics`, `operations`, `reports`, `tasks`. `GET /health` checa postgres+redis.

**Serviços-chave**: `agent_config` (carrega prompts/templates), `llm` (chamada LLM **com retry/backoff**), `content_generation`, `research_service`, `quality_guardian`, `output_workflow`, `calendar_service`/`calendar_scheduler`, `rag`/`embeddings`/`document_processing`, `metrics`/`metrics_service`, `operations_service`/`audit_service`, `export_service`, `text_repair`, `orchestrator*` (LangGraph + tool-calling).

## 4. Os 7 agentes

| Agente | Slug | Implementação | Status |
|---|---|---|---|
| Orquestrador | `orchestrator` | **LangGraph + tool-calling** (`orchestrator_graph.py`, `orchestrator_tools.py`) — roteamento editável por prompt/descrição de ferramenta | Funcional |
| Pesquisa | `research_agent` | RSS Google News + URLs + Apify(opc) + trafilatura/BeautifulSoup + Playwright fallback; salva fontes | Funcional |
| Conteúdo | `content_agent` | prompt + template por canal + RAG + LLM; outputs versionados | Funcional |
| Calendário | `calendar_agent` | LLM gera JSON de eventos (**parse robusto**); scheduler interno com lock Redis | Parcial (sem integração externa) |
| Imprensa | `press_agent` | gera releases/pitches; não distribui | Parcial |
| Métricas | `metrics_agent` | agregação determinística de `model_calls`/reviews/audit (não LLM) | Funcional |
| Guardião | `quality_guardian` | rubrica local + LLM híbrido opcional; gate antes da aprovação | Funcional |

Prompts em `config/agents/*.md`; templates em `config/templates`; seeds em `config/seeds`.

## 5. Fluxos principais

- **Login**: `POST /api/auth/login` → JWT HS256 (PBKDF2, exp 12h) em cookie JS.
- **Conteúdo**: `/content` → `POST /api/content/generate` (prompt+template+RAG+LLM) → output versionado → enviar para revisão roda Guardião.
- **Aprovação**: `/approvals` → editar/comentar/Guardião/aprovar/rejeitar; aprovado vira `MemoryEntry` permanente; rejeitado vira feedback temporário (30 dias).
- **RAG**: upload `POST /api/documents/upload` → extrai/chunk/embeddings → `document_chunks` (vetor 1536, **índice HNSW**).
- **Pesquisa**: `POST /api/research/run` → coleta fontes → `research_agent` → output + `research_sources`.
- **Chat**: cria `AgentTask` → Celery → orquestrador → SSE `/api/tasks/{id}/stream` (fallback polling).

## 6. Banco de dados

- Head Alembic: **`0015_vector_indexes`** (15 migrations).
- ~23 tabelas: `users`, `brands`, `agents`, `settings`, `provider_credentials`, `agent_runs`, `chat_sessions`, `chat_messages`, `agent_tasks`, `agent_logs`, `outputs`, `output_versions`, `output_decisions`, `output_comments`, `quality_reviews`, `audit_events`, `research_sources`, `model_calls`, `reports`, `calendar_events`, `sources`, `documents`, `document_chunks`, `memory_entries`.
- pgvector: `embedding vector(1536)` com **índice HNSW `vector_cosine_ops`** em `document_chunks` e `memory_entries`.
- Sem RLS; sem coluna de tenant/owner (modelo mono-tenant consciente).

## 7. Segurança e config

- **Fail-fast de segredos**: `settings.py` recusa boot com JWT/admin default quando `app_env != development`.
- Credenciais de provedor cifradas (Fernet derivado do `JWT_SECRET_KEY` — acoplamento conhecido, Tier 1).
- Admin (`require_admin`) para `/api/admin/*`; demais rotas exigem só autenticação (sem escopo por marca — aceitável p/ equipe única).
- Cookie JWT **sem HttpOnly** (dívida consciente).

## 8. Correções Tier 0 aplicadas em 2026-06-26

Branch `hardening/tier0-foundation` — **60 testes passando** (container), ruff limpo, stack healthy:

1. **Encoding** — `text_repair.py` não apaga mais `Â` legítimo; `has_mojibake` usa bigramas → Guardião não reprova PT-BR válido.
2. **Fail-fast de segredos** (`settings.py`).
3. **Auto-migrate** no boot (serviço `migrate`).
4. **Resiliência LLM** — `_post_with_retry` (timeout/429/5xx).
5. **Parse robusto do calendar** — erro de domínio→400 / fallback, não 502.
6. **Índice vetorial HNSW** (migration `0015`).

## 9. Frontend — rotas

`/login`, `/dashboard`, `/chat`, `/research`, `/content`, `/approvals`, `/calendar`, `/memory`, `/costs`, `/insights`, `/operations`, `/admin/agents`, `/admin/config`. Shell com sidebar (`app-shell.tsx`), workspace editorial (`document-workspace.tsx`). Mockados: busca global, sino, "novidades".

## 10. Pendências (não bloqueiam ajustar skills/UI)

**Tier 1 — já aplicado (2026-06-26):** exception handler global (erros JSON consistentes), paginação em `memory`/`documents`, off-load do event loop em upload/export de documentos, pool de conexões parametrizado em `db.py`, `env.py compare_type/compare_server_default`.

**Tier 1 — restante:** off-load da pesquisa síncrona (research → Celery/threadpool), rate limiting + hard budget de custo, FK `ON DELETE` + índices `created_at` + FK do `current_version_id`, JSONB, **Dockerfile web de produção** (hoje roda `npm run dev`), containers non-root, backup do Postgres, logs estruturados/observabilidade.

**Tier 2 (decisão de produto — fora de escopo para equipe única):** tenancy/workspaces + RLS, cookie HttpOnly + revogação de JWT, object storage, fallback entre provedores LLM.

**Fora de escopo V1:** publicação em redes sociais, geração de imagens, billing oficial, mailing/PR real, integração de calendário externo.

## 11. Correções ao doc anterior (verificadas no código)

- **Orquestrador**: NÃO é roteamento por keyword — já é LangGraph + tool-calling.
- **Storage**: bind mount `./storage:/app/storage` (persiste); não há perda de dados.
- **Mojibake**: arquivos-fonte estão limpos (UTF-8); o problema real era o `text_repair` corromper texto bom — corrigido (§8.1).
- **Repo git**: é repositório git com commits (doc antigo dizia o contrário).

## 12. Como validar

```powershell
python -m ruff check apps/api/app apps/api/alembic apps/api/tests
$env:PYTHONPATH='apps/api'; python -m pytest          # ou no container:
docker compose run --rm api python -m pytest /app/tests
docker compose up -d                                   # migrate roda automaticamente
Invoke-RestMethod http://localhost:8000/health
```

## 13. Maturidade por módulo (estimativa)

| Módulo | % | Módulo | % |
|---|---:|---|---:|
| Fundação técnica | 92 | Aprovações/Guardião | 78 |
| Backend API | 82 | Calendário | 55 |
| Auth (equipe única) | 70 | Imprensa | 45 |
| RAG/documentos | 82 | Métricas/custos | 65 |
| Conteúdo | 78 | Operações/auditoria | 62 |
| Pesquisa | 72 | Frontend | 72 |
| Orquestrador | 70 | Produção/hardening | 35 |
