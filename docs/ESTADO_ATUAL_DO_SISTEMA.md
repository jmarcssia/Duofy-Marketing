# Estado Atual do Sistema DUOFY V1

Documento factual gerado em 2026-06-25 a partir de inspeção local do repositório `C:\DUOFY_V1_MARKETING_AI`, banco PostgreSQL local, migrations Alembic, testes, Docker Compose, arquivos de configuração e documentação existente.

Este documento não descreve intenção futura como implementação concluída. Quando uma funcionalidade existe apenas em prompt, README, checklist, UI ou texto de handoff, ela é classificada como parcial, mockada, não validada ou não implementada conforme a evidência real encontrada.

## 1. Identificação do projeto, finalidade e escopo atual

O projeto é a **DUOFY V1 Marketing AI**, uma aplicação local-first para apoiar operação de marketing com agentes de IA, memória/RAG, co-criação de conteúdo, pesquisa de mercado, aprovações, calendário editorial, assessoria de imprensa, métricas, custos e auditoria operacional.

Evidências principais:

- Monorepo definido em `package.json`, com workspace `apps/web`.
- Backend FastAPI em `apps/api/app/main.py`.
- Frontend Next.js 14 em `apps/web/package.json`.
- Docker Compose com PostgreSQL + pgvector, Redis, API, Web e Worker em `docker-compose.yml`.
- Prompts e templates em `config/agents` e `config/templates`.
- Migrations até `0014_audit_events` em `apps/api/alembic/versions`.
- Banco local confirmado com `alembic_version = 0014_audit_events`.
- Health local confirmado: `GET http://localhost:8000/health` retorna `status: ok` com `api`, `postgres` e `redis` ok.

Escopo real atual:

- Aplicação monolítica local com FastAPI + Next.js.
- Persistência em PostgreSQL com extensão `vector`.
- Redis usado como broker/backend Celery e lock do scheduler de calendário.
- Autenticação JWT simples por Bearer token.
- Admin local para provedores LLM, ferramentas e configuração do Guardião.
- Agentes com prompts em Markdown e execução via LLM quando provedor configurado.
- RAG com upload, chunking, embeddings e busca vetorial.
- Outputs versionados para conteúdo, pesquisa e press.
- Aprovação com Guardião de Qualidade.
- Observabilidade com métricas e eventos de auditoria.

Fora do escopo real atual:

- Publicação em redes sociais.
- Geração de imagens.
- Billing oficial dos provedores.
- Gestão real de usuários/workspaces/permissões granulares.
- Deploy de produção.
- WYSIWYG completo.
- Integrações externas de calendário, CRM, redes sociais ou e-mail.

## 2. Estrutura de diretórios

| Diretório/arquivo | Função real | Evidência no código | Observações |
|---|---|---|---|
| `apps/api` | Backend FastAPI, serviços, routers, models, migrations e testes. | `apps/api/app/main.py`, `apps/api/app/routers`, `apps/api/alembic/versions`, `apps/api/tests` | Núcleo funcional do sistema. |
| `apps/api/app/routers` | Endpoints REST por domínio. | Arquivos `admin.py`, `agents.py`, `auth.py`, `brands.py`, `calendar.py`, `chat.py`, `content.py`, `documents.py`, `memory.py`, `metrics.py`, `operations.py`, `outputs.py`, `press.py`, `reports.py`, `research.py`, `tasks.py` | Rotas protegidas por JWT na maioria dos módulos. |
| `apps/api/app` | Serviços e entidades de negócio. | `content_generation.py`, `research_service.py`, `quality_guardian.py`, `rag.py`, `output_workflow.py`, `export_service.py`, `operations_service.py` | Parte dos textos do código ainda mostra mojibake em strings literais. |
| `apps/api/alembic/versions` | Histórico de schema. | `0001_enable_pgvector.py` a `0014_audit_events.py` | Banco local no head `0014_audit_events`. |
| `apps/api/tests` | Testes backend. | `test_health.py`, `test_operations_audit.py`, `test_quality_guardian.py`, `test_security.py`, `test_settings.py` | 14 testes passaram; cobertura limitada. |
| `apps/web` | Frontend Next.js 14. | `apps/web/app`, `apps/web/components`, `apps/web/lib` | App Router com 17 rotas geradas no build. |
| `apps/web/app/(app)` | Páginas autenticadas com layout comum. | `dashboard`, `chat`, `content`, `approvals`, `memory`, `research`, `calendar`, `operations`, `costs`, `insights`, `admin` | Middleware protege apenas alguns prefixos; páginas também redirecionam client-side quando token ausente. |
| `apps/web/components` | Layout, logo, workspace editorial, UI primitives. | `app-shell.tsx`, `document-workspace.tsx`, `duofy-logo.tsx`, `icons.tsx` | `document-workspace.tsx` faz preview/editor/export UI. |
| `apps/web/lib` | Cliente API, auth cookie, download. | `api.ts`, `auth.ts`, `download.ts` | Token guardado em cookie JS sem `HttpOnly`. |
| `config/agents` | Prompts ativos dos 7 agentes. | `orchestrator.md`, `research_agent.md`, `content_agent.md`, `calendar_agent.md`, `press_agent.md`, `metrics_agent.md`, `quality_guardian.md` | Fonte real dos prompts via `app.agent_config`. |
| `config/templates` | Templates por formato e contrato do Guardião. | `linkedin.md`, `carrossel.md`, `quality_review_contract.md`, etc. | Usado por geração e revisão. |
| `config/seeds` | Seeds YAML de marcas e agentes. | `agents.yaml`, `brands.yaml` | Seed atualiza banco de forma idempotente. |
| `config/rules` | Regras de status e precificação estimada. | `output_status.yaml`, `model_pricing.yaml` | Custos são estimados, não billing oficial. |
| `infra/postgres/init` | Inicialização do Postgres. | `001_enable_pgvector.sql` | Ativa pgvector no container inicial. |
| `docs` | Documentação operacional existente. | `README.md`, `CHECKLIST_FINAL_V1.md`, `ROTEIRO_DEMO_V1.md` | Checklist está desatualizado em alguns pontos. |
| `DUOFY_V1_pacote_execucao_desenvolvimento` | Pacote de handoff, prompts de fase, wireframes, referência original. | `handoff/CODEX_PROMPT_MESTRE.md`, `prompts_codex`, `config` | Referência histórica; não é todo código ativo. |
| `scripts` | Scripts auxiliares. | `scripts/smoke-demo.ps1` | Smoke test operacional via API. |
| `.codex_validation` | Evidências geradas durante validações anteriores. | `.codex_validation/fase16` | Não é parte funcional do produto. |
| `.venv`, `node_modules`, `.next`, caches | Dependências e artefatos locais. | Diretórios locais | Não devem ser tratados como código fonte. |

## 3. Frontend: telas, rotas e módulos

Build atual do Next gerou 17 rotas:

- `/`
- `/_not-found`
- `/login`
- `/dashboard`
- `/chat`
- `/research`
- `/content`
- `/approvals`
- `/calendar`
- `/memory`
- `/costs`
- `/insights`
- `/operations`
- `/admin/agents`
- `/admin/config`

Evidência: saída de `npm.cmd --prefix apps/web run build`, arquivos em `apps/web/app`.

### Tabela de status do frontend

| Módulo | Status | Evidência no código | Problema ou pendência | Criticidade |
|---|---|---|---|---|
| Login | FUNCIONAL | `apps/web/components/login-form.tsx`, `apps/api/app/routers/auth.py` | Token fica em cookie acessível por JavaScript, sem HttpOnly/Secure. | Alta |
| Layout autenticado | PARCIAL | `apps/web/components/app-shell.tsx`, `apps/web/middleware.ts` | Menu existe, mas busca global e sino não têm ação real. Middleware não protege todos os prefixos. | Média |
| Dashboard | PARCIAL | `apps/web/app/(app)/dashboard/page.tsx` | Mostra marcas, agentes e sessão; não é dashboard operacional completo. | Média |
| Chat | FUNCIONAL | `apps/web/app/(app)/chat/page.tsx`, `apps/api/app/routers/chat.py`, `apps/api/app/worker.py` | Depende do worker Celery e LLM para tarefas que chamam agentes. | Alta |
| Admin Agentes | FUNCIONAL | `apps/web/app/(app)/admin/agents/page.tsx`, `apps/api/app/routers/agents.py` | Executa agente genérico; não faz edição de prompt/modelo por agente na UI. | Média |
| Admin Config | PARCIAL | `apps/web/app/(app)/admin/config/page.tsx`, `apps/api/app/routers/admin.py` | Provedores e Guardião funcionam; abas de usuários, regras de marca e limites de custo são exibição limitada, não CRUD completo. | Alta |
| Memória/Documentos | FUNCIONAL | `apps/web/app/(app)/memory/page.tsx`, `apps/api/app/routers/documents.py`, `apps/api/app/routers/memory.py` | Upload/indexação são síncronos; sem gestão avançada de permissões, versão ou remoção de documentos. | Alta |
| Pesquisa | FUNCIONAL | `apps/web/app/(app)/research/page.tsx`, `apps/api/app/routers/research.py` | Coleta externa pode falhar por fonte; Apify opcional; exporta via endpoint de outputs, não endpoint específico de reports de pesquisa. | Alta |
| Conteúdo | FUNCIONAL | `apps/web/app/(app)/content/page.tsx`, `apps/api/app/routers/content.py` | Geração depende de LLM; editor é Markdown simples. | Alta |
| Aprovações | FUNCIONAL | `apps/web/app/(app)/approvals/page.tsx`, `apps/api/app/routers/outputs.py`, `apps/api/app/quality_guardian.py` | Fluxo existe; somente uma revisão do Guardião no banco no momento da auditoria. | Alta |
| Calendário | PARCIAL | `apps/web/app/(app)/calendar/page.tsx`, `apps/api/app/routers/calendar.py` | CRUD e geração existem, mas banco atual tem 0 eventos; não integra calendário externo. | Média |
| Assessoria na UI | PARCIAL | Bloco em `apps/web/app/(app)/calendar/page.tsx`, API em `apps/api/app/routers/press.py` | Não há tela própria de press; geração fica acoplada ao calendário. | Média |
| Custos | FUNCIONAL | `apps/web/app/(app)/costs/page.tsx`, `apps/api/app/routers/metrics.py` | Custos estimados por tabela local, não billing real. | Média |
| Insights | FUNCIONAL | `apps/web/app/(app)/insights/page.tsx`, `apps/api/app/routers/reports.py` | Relatórios internos são gerados localmente por agregação, não análise LLM avançada. | Média |
| Operações | FUNCIONAL | `apps/web/app/(app)/operations/page.tsx`, `apps/api/app/routers/operations.py` | Auditoria não cobre histórico anterior à Fase 18 e não cobre todos os eventos possíveis. | Alta |
| Workspace editorial | FUNCIONAL | `apps/web/components/document-workspace.tsx` | Preview/renderização é própria e limitada; sem WYSIWYG. | Média |

### Observações de UI

- O menu lateral contém links para todas as rotas principais em `apps/web/components/app-shell.tsx`.
- A logo real está em `apps/web/public/brand/LOGO-SITE-2.svg` e é usada por `apps/web/components/duofy-logo.tsx`.
- Muitas strings visíveis no código aparecem como mojibake quando lidas do arquivo ou exibidas no terminal, por exemplo `VisÃ£o Geral`, `ConfiguraÃ§Ãµes`, `AprovaÃ§Ãµes`. Evidência: `apps/web/components/app-shell.tsx`, `apps/web/app/(app)/approvals/page.tsx`, `apps/web/app/(app)/operations/page.tsx`.
- A aplicação tenta redirecionar para `/login` em várias páginas quando não há token, mas o middleware só protege explicitamente `/dashboard`, `/admin`, `/approvals`, `/content`, `/memory` e `/research`. Evidência: `apps/web/middleware.ts`.

## 4. Backend: APIs, endpoints, serviços e processos

Backend FastAPI em `apps/api/app/main.py`, com routers:

- `auth`
- `brands`
- `admin`
- `agents`
- `chat`
- `content`
- `documents`
- `memory`
- `outputs`
- `research`
- `calendar`
- `press`
- `metrics`
- `operations`
- `reports`
- `tasks`

### Endpoints principais

| Domínio | Endpoints | Evidência |
|---|---|---|
| Health | `GET /health` | `apps/api/app/main.py` |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | `apps/api/app/routers/auth.py` |
| Brands | `GET /api/brands` | `apps/api/app/routers/brands.py` |
| Admin | `GET /api/admin/agents`, `GET /api/admin/providers`, `PUT /api/admin/providers/{provider}`, `GET/PUT /api/admin/quality-settings` | `apps/api/app/routers/admin.py` |
| Agents | `POST /api/agents/run`, `GET /api/agents/runs`, `PATCH /api/agents/runs/{run_id}/status` | `apps/api/app/routers/agents.py` |
| Chat | `GET/POST /api/chat/sessions`, `GET /api/chat/sessions/{id}`, `POST /api/chat/sessions/{id}/messages` | `apps/api/app/routers/chat.py` |
| Tasks | `GET /api/tasks`, `GET /api/tasks/{task_id}`, `GET /api/tasks/{task_id}/stream` | `apps/api/app/routers/tasks.py` |
| Content | `POST /api/content/generate`, `GET /api/content/outputs`, `GET/PATCH /api/content/outputs/{id}`, `POST /api/content/outputs/{id}/submit-review` | `apps/api/app/routers/content.py` |
| Outputs/workflow | `GET /api/outputs`, `GET/PATCH /api/outputs/{id}`, comments, versions, compare, restore, quality-review, approve, reject, request-adjustment, archive, export | `apps/api/app/routers/outputs.py` |
| Documents | `POST /api/documents/upload`, `GET /api/documents`, `GET /api/documents/{id}/chunks`, `GET /api/documents/{id}/download`, `GET /api/documents/{id}/export` | `apps/api/app/routers/documents.py` |
| Memory | `GET /api/memory`, `POST /api/memory/search` | `apps/api/app/routers/memory.py` |
| Research | `POST /api/research/run`, `GET /api/research/reports`, `GET /api/research/reports/{id}`, `POST /save-memory`, `POST /use-in-content` | `apps/api/app/routers/research.py` |
| Calendar | `GET/POST /api/calendar`, `PATCH/DELETE /api/calendar/{id}`, `POST /api/calendar/generate`, `POST /api/calendar/{id}/run-now` | `apps/api/app/routers/calendar.py` |
| Press | `POST /api/press/generate` | `apps/api/app/routers/press.py` |
| Metrics | `GET /api/metrics/summary`, `GET /api/metrics/model-calls` | `apps/api/app/routers/metrics.py` |
| Reports | `GET /api/reports`, `POST /api/reports/generate`, `GET /api/reports/{id}`, `GET /api/reports/{id}/pdf`, `GET /api/reports/{id}/export` | `apps/api/app/routers/reports.py` |
| Operations | `GET /api/operations/summary`, `GET /api/operations/agent-health`, `GET /api/operations/quality-reviews`, `GET /api/operations/audit-events` | `apps/api/app/routers/operations.py` |

### Serviços backend

| Serviço | Responsabilidade real | Evidência |
|---|---|---|
| `agent_config.py` | Localiza e carrega prompts/templates em `/config`, com fallback para pacote de handoff. | `apps/api/app/agent_config.py` |
| `llm.py` | Chama OpenRouter/OpenAI/Anthropic; registra `model_calls`; suporta web search OpenRouter. | `apps/api/app/llm.py` |
| `metrics.py` | Estima tokens/custo e registra chamadas LLM. | `apps/api/app/metrics.py` |
| `content_generation.py` | Gera output com `content_agent`, template e RAG; salva `outputs` e `output_versions`. | `apps/api/app/content_generation.py` |
| `research_service.py` | Coleta fontes, chama `research_agent`, salva relatório em outputs e fontes em `research_sources`. | `apps/api/app/research_service.py` |
| `document_processing.py` | Extrai texto de PDF/DOCX/TXT/MD, normaliza e chunkiza. | `apps/api/app/document_processing.py` |
| `embeddings.py` | Usa OpenAI embeddings quando configurado; fallback local determinístico. | `apps/api/app/embeddings.py` |
| `rag.py` | Busca vetorial em `document_chunks` e `memory_entries` com filtros. | `apps/api/app/rag.py` |
| `output_workflow.py` | Edita, restaura, aprova, rejeita, arquiva outputs e cria memória/aprendizado. | `apps/api/app/output_workflow.py` |
| `quality_guardian.py` | Revisão local + híbrida LLM opcional, score, falhas críticas e gate de aprovação. | `apps/api/app/quality_guardian.py` |
| `calendar_service.py` | CRUD lógico, geração de eventos, execução de eventos e press. | `apps/api/app/calendar_service.py` |
| `calendar_scheduler.py` | Loop assíncrono que executa eventos `scheduled` vencidos com lock Redis. | `apps/api/app/calendar_scheduler.py` |
| `worker.py` | Worker Celery para tarefas de chat. | `apps/api/app/worker.py` |
| `task_service.py` | Classifica prompt do chat e despacha para pesquisa, conteúdo, press, calendário, métricas ou orquestrador. | `apps/api/app/task_service.py` |
| `metrics_service.py` | Agrega chamadas e gera relatório interno. | `apps/api/app/metrics_service.py` |
| `operations_service.py` | Agrega observabilidade, saúde por agente e eventos. | `apps/api/app/operations_service.py` |
| `audit_service.py` | Cria `audit_events`. | `apps/api/app/audit_service.py` |
| `export_service.py` | Exporta PDF, DOCX, MD e HTML. | `apps/api/app/export_service.py` |
| `text_repair.py` | Reparo determinístico de mojibake em retornos/exports. | `apps/api/app/text_repair.py` |
| `security.py` | Hash PBKDF2 e JWT. | `apps/api/app/security.py` |

## 5. Fluxos completos do usuário

### Fluxo de login

1. Usuário acessa `/login`.
2. Front envia `POST /api/auth/login` com e-mail/senha.
3. Backend valida senha PBKDF2 em `apps/api/app/security.py`.
4. Backend retorna JWT com `sub`, `email`, `role`, `exp`.
5. Front grava token no cookie `duofy_token` via JavaScript.
6. Páginas usam `Authorization: Bearer <token>` em `apiFetch`.

Limitações:

- Logout apenas apaga cookie no cliente; `POST /api/auth/logout` retorna `ok`, sem blacklist/revogação.
- Cookie não é `HttpOnly`; risco XSS.
- Não há refresh token.

### Fluxo de configuração admin

1. Admin acessa `/admin/config`.
2. Front chama `/api/admin/providers`, `/api/admin/quality-settings`, `/api/admin/agents`, `/api/brands`.
3. Admin salva API keys em `PUT /api/admin/providers/{provider}`.
4. Backend criptografa segredo com Fernet derivado de `JWT_SECRET_KEY`.
5. Admin pode configurar Guardião em `PUT /api/admin/quality-settings`.

Evidências:

- `apps/web/app/(app)/admin/config/page.tsx`
- `apps/api/app/routers/admin.py`
- `apps/api/app/crypto.py`

### Fluxo de geração de conteúdo

1. Usuário abre `/content`.
2. Escolhe marca, categoria, canal, formato, provedor e briefing.
3. Front chama `POST /api/content/generate`.
4. Backend:
   - busca `content_agent`;
   - busca marca;
   - resolve provedor/modelo;
   - carrega prompt em `config/agents/content_agent.md`;
   - carrega template em `config/templates`;
   - chama RAG em `build_rag_context`;
   - chama LLM;
   - normaliza documento;
   - cria `agent_runs`, `outputs`, `output_versions`.
5. Front lista output e permite editar.
6. Edição cria nova versão.
7. Enviar para revisão chama Guardião; se passou, status `review`; se falhou, `needs_adjustment`.

Evidências:

- `apps/web/app/(app)/content/page.tsx`
- `apps/api/app/content_generation.py`
- `apps/api/app/routers/content.py`
- `apps/api/app/document_formatting.py`
- `apps/api/app/quality_guardian.py`

### Fluxo de aprovação

1. Usuário abre `/approvals`.
2. Front lista `/api/outputs?status=review` por padrão.
3. Usuário pode:
   - editar output;
   - comentar;
   - rodar Guardião;
   - aprovar;
   - rejeitar;
   - solicitar ajuste;
   - arquivar;
   - exportar.
4. Aprovação final chama `ensure_quality_passed`.
5. Se aprovado, cria `MemoryEntry` permanente `approved_output`.
6. Se rejeitado, cria aprendizado temporário `temporary_feedback` com expiração de 30 dias.

Evidências:

- `apps/web/app/(app)/approvals/page.tsx`
- `apps/api/app/routers/outputs.py`
- `apps/api/app/output_workflow.py`
- `apps/api/app/quality_guardian.py`

### Fluxo de documentos e RAG

1. Usuário abre `/memory`.
2. Upload envia multipart para `POST /api/documents/upload`.
3. Backend salva arquivo em `storage/documents`.
4. Extrai texto conforme extensão.
5. Cria chunks.
6. Cria embeddings por OpenAI se configurado, senão fallback local.
7. Salva `documents` e `document_chunks`.
8. Busca RAG chama `POST /api/memory/search`.

Evidências:

- `apps/web/app/(app)/memory/page.tsx`
- `apps/api/app/routers/documents.py`
- `apps/api/app/document_processing.py`
- `apps/api/app/embeddings.py`
- `apps/api/app/rag.py`

### Fluxo de pesquisa

1. Usuário abre `/research`.
2. Define marca, tema, período, profundidade, provedor, URLs opcionais e Apify opcional.
3. Front chama `POST /api/research/run`.
4. Backend coleta fontes de RSS Google News, URLs opcionais, Apify opcional, HTTP/trafilatura/BeautifulSoup e fallback Playwright.
5. Chama `research_agent` com fontes e contexto RAG.
6. Salva relatório como `Output` com `channel = Pesquisa`, `format = research_report`.
7. Salva fontes em `research_sources`.
8. Usuário pode salvar relatório como memória ou usar no conteúdo.

Evidências:

- `apps/web/app/(app)/research/page.tsx`
- `apps/api/app/research_service.py`
- `apps/api/app/routers/research.py`

### Fluxo de chat e worker

1. Usuário abre `/chat`.
2. Cria sessão ou envia mensagem.
3. Backend cria `ChatMessage` e `AgentTask`.
4. `classify_task` decide tipo por palavras-chave.
5. Celery executa `execute_agent_task`.
6. Resultado vira mensagem do assistente e pode gerar output/report/calendar.
7. Front acompanha via SSE em `/api/tasks/{id}/stream`, com fallback por polling.

Evidências:

- `apps/web/app/(app)/chat/page.tsx`
- `apps/api/app/routers/chat.py`
- `apps/api/app/task_service.py`
- `apps/api/app/worker.py`
- `apps/api/app/routers/tasks.py`

## 6. Agentes existentes

Banco atual contém 7 agentes ativos. Evidência: consulta ao banco `agents`, `config/seeds/agents.yaml` e `config/agents/*.md`.

### Status geral dos agentes

| Módulo | Status | Evidência no código | Problema ou pendência | Criticidade |
|---|---|---|---|---|
| Orquestrador | PARCIAL | `config/agents/orchestrator.md`, `apps/api/app/orchestrator.py`, `apps/api/app/task_service.py` | Prompt descreve handoffs multiagente, mas implementação genérica chama um agente selecionado e o chat classifica por keywords; não há plano multiagente robusto. | Alta |
| Pesquisa de Mercado | FUNCIONAL | `config/agents/research_agent.md`, `apps/api/app/research_service.py`, `apps/api/app/routers/research.py` | Coleta real depende de fontes externas e LLM; sem garantia de cobertura por tema. | Alta |
| Cocriação de Conteúdo | FUNCIONAL | `config/agents/content_agent.md`, `apps/api/app/content_generation.py`, `apps/api/app/routers/content.py` | Qualidade depende de LLM/RAG; editor é Markdown simples. | Alta |
| Calendário Editorial | PARCIAL | `config/agents/calendar_agent.md`, `apps/api/app/calendar_service.py`, `apps/api/app/calendar_scheduler.py` | Gera/eventos e scheduler existem, mas banco atual tem 0 eventos e não integra calendário externo. | Média |
| Assessoria de Imprensa | PARCIAL | `config/agents/press_agent.md`, `apps/api/app/calendar_service.py`, `apps/api/app/routers/press.py` | Gera rascunhos; não envia pitches, não cadastra jornalistas/veículos. | Média |
| Métricas Internas | FUNCIONAL | `config/agents/metrics_agent.md`, `apps/api/app/metrics_service.py`, `apps/api/app/routers/metrics.py`, `apps/api/app/routers/reports.py` | Relatório é agregação local determinística, não agente LLM analítico completo. | Média |
| Guardião de Qualidade | FUNCIONAL | `config/agents/quality_guardian.md`, `apps/api/app/quality_guardian.py`, `apps/api/app/routers/outputs.py` | Banco atual tem só 1 revisão registrada; strings internas ainda têm mojibake em mensagens. | Alta |

### Orquestrador

- Nome: Orquestrador.
- Slug: `orchestrator`.
- Responsabilidade pretendida: coordenar agentes, contexto e qualidade.
- Entrada: prompt livre via `/api/agents/run` ou fallback do chat.
- Processamento real: `run_agent` em `apps/api/app/orchestrator.py` busca agente, credencial, contexto RAG se aplicável, monta prompt e chama LLM.
- Ferramentas reais: LLM via OpenRouter/OpenAI/Anthropic; RAG se agente em `{content_agent, research_agent, orchestrator}`; web search OpenRouter quando há marcadores de atualidade.
- Prompt: `config/agents/orchestrator.md`.
- Modelo no banco: `~anthropic/claude-sonnet-latest`.
- Saída: registro `agent_runs.output`.
- Memória: usa `build_rag_context` quando chamado como `orchestrator`.
- Comunicação com outros agentes: não há comunicação multiagente real no `orchestrator.py`; o chat roteia diretamente por `task_service.classify_task`.
- Fallback: se provedor/credencial ausente ou erro LLM, cria `agent_runs` com `status="failed"`.
- Retries: não há retry explícito no serviço de agente.
- Limitações: implementação aquém do prompt; classificação por palavras-chave no chat.
- Status real: PARCIAL.

### Research Agent

- Nome: Pesquisa de Mercado.
- Slug: `research_agent`.
- Entrada: `ResearchRunRequest` com `brand_slug`, `theme`, `period`, `depth`, `provider`, `model`, `source_urls`, `use_apify`.
- Processamento:
  - Coleta RSS Google News;
  - coleta URLs opcionais;
  - coleta Apify opcional;
  - deduplica por URL;
  - limita a 8 fontes;
  - extrai texto via HTTP/trafilatura/BeautifulSoup;
  - fallback Playwright para páginas dinâmicas;
  - classifica confiabilidade A/B/C/D;
  - chama LLM;
  - salva relatório em `outputs` e versão em `output_versions`;
  - salva fontes em `research_sources`.
- Ferramentas: `feedparser`, `httpx`, `trafilatura`, `BeautifulSoup`, `Playwright`, Apify opcional, LLM, RAG.
- Prompt: `config/agents/research_agent.md`.
- Modelo no banco: `~anthropic/claude-sonnet-latest`.
- Saída: output `channel="Pesquisa"`, `format="research_report"`, fontes vinculadas.
- Memória: usa RAG antes da síntese e pode salvar relatório como `memory_entries`.
- Comunicação com outros agentes: `use-in-content` cria briefing para `/content`; não aciona content_agent automaticamente.
- Limitações: coleta externa é síncrona; sem cache/fila dedicada; fontes podem falhar; confiabilidade é heurística simples.
- Status real: FUNCIONAL.

### Content Agent

- Nome: Cocriação de Conteúdo.
- Slug: `content_agent`.
- Entrada: `ContentGenerateRequest` com marca, categoria, canal, formato, briefing, provedor/modelo opcional e status.
- Processamento:
  - carrega prompt;
  - escolhe template por canal/formato;
  - recupera RAG;
  - chama LLM;
  - normaliza documento;
  - grava `AgentRun`, `Output` e `OutputVersion`.
- Ferramentas: LLM, RAG, templates Markdown, normalizador documental.
- Prompt: `config/agents/content_agent.md`.
- Modelo no banco: `~anthropic/claude-sonnet-latest`.
- Saída: output versionado em status `draft` ou outro status recebido.
- Memória: RAG antes da geração; outputs aprovados viram memória depois da aprovação.
- Comunicação com outros agentes: pode receber briefing preparado por pesquisa; Guardião roda no envio para revisão.
- Limitações: não gera imagens, não publica, não valida factualidade além do prompt/Guardião.
- Status real: FUNCIONAL.

### Calendar Agent

- Nome: Calendário Editorial.
- Slug: `calendar_agent`.
- Entrada: `CalendarGenerateRequest` com marca, categoria, objetivo, período, canais, provider/model.
- Processamento: LLM deve retornar lista JSON de 3 a 8 eventos; backend parseia e salva `calendar_events`.
- Ferramentas: LLM, RAG, scheduler interno, Redis lock.
- Prompt: `config/agents/calendar_agent.md`.
- Modelo no banco: `~anthropic/claude-sonnet-latest`.
- Saída: `calendar_events` com `assigned_agent_slug` e `execution_payload`.
- Memória: usa RAG para gerar calendário.
- Comunicação com outros agentes: execução do evento pode acionar `content_agent`, `research_agent`, `press_agent` ou `orchestrator`.
- Limitações: banco atual tem 0 eventos; não há integração Google Calendar/Outlook; execução agendada depende do processo API vivo.
- Status real: PARCIAL.

### Press Agent

- Nome: Assessoria de Imprensa.
- Slug: `press_agent`.
- Entrada: `PressGenerateRequest` com marca, categoria, formato, briefing, evento opcional, provider/model.
- Processamento: usa prompt de press, RAG, chama LLM, normaliza, grava output.
- Ferramentas: LLM, RAG, outputs/versioning.
- Prompt: `config/agents/press_agent.md`.
- Modelo no banco: `~anthropic/claude-sonnet-latest`.
- Saída: output com `channel="Assessoria"`.
- Memória: usa RAG; output aprovado pode virar memória.
- Comunicação com outros agentes: acionado por calendário ou endpoint press.
- Limitações: não envia e-mail, não consulta mailing, não valida contatos jornalísticos.
- Status real: PARCIAL.

### Metrics Agent

- Nome: Métricas Internas.
- Slug: `metrics_agent`.
- Entrada: filtros de período/marca via reports/metrics.
- Processamento: agregação determinística de `model_calls`, `quality_reviews`, `audit_events`, `output_decisions`.
- Ferramentas: SQLAlchemy, regras de preço YAML, normalizador documental.
- Prompt: `config/agents/metrics_agent.md` usado como seção textual no relatório, não como LLM.
- Modelo no banco: `openai/gpt-4o-mini`, mas serviço não chama LLM para relatório interno.
- Saída: `reports` com conteúdo Markdown normalizado.
- Memória: não usa RAG.
- Comunicação com outros agentes: não aciona outros agentes.
- Limitações: custo estimado, não billing oficial; sem métricas externas de redes sociais.
- Status real: FUNCIONAL.

### Quality Guardian

- Nome: Guardião de Qualidade.
- Slug: `quality_guardian`.
- Entrada: output + versão atual; modo opcional `local_only`, `hybrid`, `llm_required`.
- Processamento:
  - valida localmente mojibake, placeholders, tamanho mínimo, seções Markdown, CTA, fontes em pesquisa, mistura de nichos e sensibilidade DeathCare;
  - opcionalmente chama LLM com contrato JSON;
  - local é soberano;
  - grava `quality_reviews`;
  - bloqueia aprovação final quando `passed=false`.
- Ferramentas: rubrica local, LLM opcional, contrato `config/templates/quality_review_contract.md`.
- Prompt: `config/agents/quality_guardian.md`.
- Modelo no banco: `~anthropic/claude-sonnet-latest`.
- Saída: score, status, falhas críticas, correções, melhorias, fontes verificadas, relatório bruto.
- Memória: não escreve memória diretamente.
- Comunicação com outros agentes: gate entre content/research/press outputs e aprovação humana.
- Limitações: revisão não reescreve conteúdo; apenas 1 revisão existe no banco no momento; mensagens internas possuem mojibake em código.
- Status real: FUNCIONAL.

## 7. Orquestrador: roteamento, intenção, contexto, fallback e erros

O sistema tem dois níveis de roteamento:

1. `task_service.classify_task` classifica mensagens do chat por palavras-chave.
2. `orchestrator.run_agent` executa um agente específico recebido por parâmetro.

Evidência:

- `apps/api/app/task_service.py`
- `apps/api/app/orchestrator.py`
- `apps/api/app/routers/chat.py`
- `apps/api/app/routers/agents.py`

### Classificação de intenção real

`classify_task(prompt)` normaliza texto e usa palavras-chave:

- Pesquisa: `pesquisa`, `mercado`, `concorrente`, `tendencia`.
- Calendário: `calendario`, `agenda`, `agendar`, `cronograma`.
- Press: `release`, `imprensa`, `pauta`, `comunicado`.
- Métricas: `custo`, `token`, `metrica`, `relatorio interno`.
- Conteúdo: `post`, `conteudo`, `carrossel`, `linkedin`, `instagram`.
- Caso contrário: `general`, que chama `orchestrator`.

Status: PARCIAL, porque não há classificador semântico robusto, score de confiança ou roteamento multiagente.

### Tratamento de contexto

- `orchestrator.py` usa RAG para `content_agent`, `research_agent` e `orchestrator`.
- `content_generation.py`, `research_service.py`, `calendar_service.py` e `press_agent` também usam RAG em seus fluxos específicos.
- Contexto é texto concatenado de hits, sem grafo de memória ou citações formais estruturadas.

### Comunicação entre agentes

Implementado:

- Calendário pode executar content, research e press via `execute_calendar_event`.
- Pesquisa pode preparar briefing para conteúdo via `/api/research/reports/{id}/use-in-content`.
- Guardião avalia outputs antes de revisão/aprovação.

Não implementado:

- Protocolo real de handoff multiagente com mensagens intermediárias registradas pelo orquestrador.
- Planejamento multi-step robusto.
- Consolidação automática de múltiplos agentes pelo orquestrador.

### Fallback, erros e retries

- Agente genérico grava `AgentRun(status="failed")` em erro.
- LLM registra `model_calls(status="failed")`.
- Research tenta fallback Playwright quando HTTP/trafilatura falha por fonte.
- Chat usa SSE e fallback de polling no frontend.
- Não há retry configurado para LLM.
- Não há circuit breaker por provedor.
- Não há fila dedicada para pesquisa/conteúdo, exceto chat via Celery.

## 8. Base de conhecimento e RAG

### Ingestão

- Endpoint: `POST /api/documents/upload`.
- Formatos aceitos por extensão: `.pdf`, `.docx`, `.txt`, `.md`.
- Armazenamento: `storage/documents/{uuid}.{ext}`.
- Banco: `sources`, `documents`, `document_chunks`.
- Status do documento: `processing`, `indexed`, `failed`.

Evidência: `apps/api/app/routers/documents.py`.

### Parsing e chunking

- PDF: `pypdf.PdfReader`.
- DOCX: `python-docx`.
- TXT/MD: decode em `utf-8`, `utf-8-sig`, `latin-1`, fallback `utf-8` com ignore.
- Normalização remove NUL, compacta espaços, limita quebras.
- Chunking por caracteres:
  - `CHUNK_SIZE = 900`
  - `CHUNK_OVERLAP = 140`

Evidência: `apps/api/app/document_processing.py`.

### Embeddings

- Dimensão: 1536.
- Provider preferencial: `openai_embeddings`.
- Fallback: `openai`.
- Se não houver provider habilitado/chave, usa embedding local determinístico por hash de tokens.
- Vetores gravados em `vector(1536)` via `pgvector`.

Evidência:

- `apps/api/app/embeddings.py`
- `apps/api/app/models.py`
- `apps/api/alembic/versions/0004_memory_rag.py`
- Extensão local confirmada: `vector 0.8.2`.

### Recuperação

- Busca combina `document_chunks` e `memory_entries`.
- Similaridade: `1 - (embedding <=> CAST(:embedding AS vector))`.
- Filtros: `brand_slug`, `category`, `source_type`, `limit`.
- Memórias expiradas são filtradas em busca: `(expires_at IS NULL OR expires_at > now())`.
- Retorno inclui `kind`, `document_id`, `brand_slug`, `category`, `source_type`, `title`, `content`, `score`.

Evidência: `apps/api/app/rag.py`.

### Citações e fontes

- RAG monta blocos `[Memoria N]` com título, marca, categoria e fonte.
- Não há sistema formal de citação com IDs, páginas ou offsets para cada afirmação gerada.
- Pesquisa salva fontes externas em `research_sources`, mas outputs de conteúdo não têm tabela de citações por trecho.

Status: PARCIAL.

### Documentos carregados no banco atual

| ID | Arquivo | Marca | Categoria | Status | Chunks | Evidência |
|---:|---|---|---|---|---:|---|
| 8 | `duofy-export-test.md` | `duofy_solucoes` | `brand` | `indexed` | 1 | Consulta banco `documents`, `document_chunks` |
| 9 | `duofy-fase13-validacao.txt` | `duofy_solucoes` | `test` | `indexed` | 1 | Consulta banco |
| 10 | `DUOFY_Brand_Kit_2026_TOTVS_AJUSTADO.pdf` | `duofy_solucoes` | `brand` | `indexed` | 28 | Consulta banco |
| 11 | `DUOFY_Documento_Mestre_Marketing_2026_AJUSTADO (1).pdf` | `duofy_solucoes` | `brand` | `indexed` | 80 | Consulta banco |

Total atual: 4 documentos, 110 chunks.

## 9. Memória

### Tipos de memória reais

- `document_chunks`: conhecimento extraído de documentos enviados.
- `memory_entries`: memórias persistidas de outputs aprovados, pesquisas salvas e feedback temporário.
- `chat_sessions` e `chat_messages`: histórico de conversa por usuário.
- `agent_tasks` e `agent_logs`: rastreio de tarefas de chat.
- `outputs` e `output_versions`: histórico editorial e versões.

### Persistência e expiração

- Memória permanente: `approved_output`.
- Memória de pesquisa: `research_report`.
- Aprendizado temporário de rejeição: `temporary_feedback` com `expires_at = now + 30 dias`.
- Busca RAG ignora `memory_entries` expiradas.

Evidência:

- `apps/api/app/output_workflow.py`
- `apps/api/app/research_service.py`
- `apps/api/app/rag.py`

### Estado atual da memória no banco

- `memory_entries`: 6.
- `approved_output`: 3.
- `research_report`: 2.
- `temporary_feedback`: 1.

### Isolamento entre usuários

- Chat é isolado por `user_id` em `chat_sessions` e `agent_tasks`.
- Outputs, documents, memory_entries, reports, metrics e audit são filtrados por marca/status/parâmetros, mas não por usuário/workspace.
- Não há tabela de workspace/tenant.
- Usuários autenticados podem listar recursos globais dos módulos, exceto rotas admin que exigem `role=admin`.

Status: PARCIAL.

## 10. Banco de dados

Tecnologia:

- PostgreSQL 16 com imagem `pgvector/pgvector:pg16`.
- Extensão `vector` instalada.
- ORM SQLAlchemy async.
- Migrations Alembic.

Estado confirmado:

- `alembic_version`: `0014_audit_events`.
- Serviços Docker: postgres healthy.
- Extensão: `vector 0.8.2`.

### Tabelas principais

| Tabela | Função | Colunas relevantes | Evidência |
|---|---|---|---|
| `users` | Usuários locais. | `email`, `name`, `password_hash`, `role`, `is_active` | `models.py`, `0002_auth_layout_seed_tables.py` |
| `brands` | Marcas/nichos. | `name`, `slug`, `niche`, `description`, `is_active` | `models.py`, `brands.yaml` |
| `agents` | Cadastro dos agentes. | `name`, `slug`, `default_model`, `is_active` | `models.py`, `agents.yaml` |
| `settings` | Configurações chave/valor. | `key`, `value` | `models.py`, `admin.py` |
| `provider_credentials` | Provedores LLM/ferramentas. | `provider`, `api_key_encrypted`, `base_url`, `default_model`, `is_enabled` | `models.py`, `admin.py` |
| `agent_runs` | Execuções diretas de agentes. | `agent_slug`, `provider`, `model`, `prompt`, `output`, `status`, `error` | `models.py`, `agents.py` |
| `chat_sessions` | Sessões de chat por usuário. | `user_id`, `title`, `brand_slug`, `status` | `0010_chat_tasks.py` |
| `chat_messages` | Mensagens do chat. | `session_id`, `role`, `content`, `agent_task_id` | `0010_chat_tasks.py` |
| `agent_tasks` | Tarefas Celery do chat. | `session_id`, `user_id`, `task_type`, `status`, `input`, `result`, `output_type`, `output_id` | `0010_chat_tasks.py` |
| `agent_logs` | Logs de tarefas. | `task_id`, `level`, `message`, `metadata_json` | `0010_chat_tasks.py` |
| `outputs` | Entregas editoriais/pesquisa/press. | `brand_slug`, `category`, `channel`, `format`, `title`, `briefing`, `status`, `provider`, `model`, `current_version_id` | `0005_content_outputs.py` |
| `output_versions` | Versões de outputs. | `output_id`, `version_number`, `content`, `editor_note` | `0005_content_outputs.py` |
| `output_decisions` | Decisões de aprovação/rejeição. | `output_id`, `user_id`, `action`, `feedback`, `memory_entry_id` | `0007_memory_output_learning.py` |
| `output_comments` | Comentários editoriais. | `output_id`, `version_id`, `user_id`, `comment`, `status` | `0011_output_comments.py` |
| `quality_reviews` | Revisões do Guardião. | `output_id`, `version_id`, `score`, `passed`, `critical_failures`, `review_mode`, `llm_*` | `0012_quality_reviews.py`, `0013_quality_review_hybrid_metadata.py` |
| `audit_events` | Auditoria operacional. | `user_id`, `entity_type`, `entity_id`, `action`, `status`, `brand_slug`, `agent_slug`, `metadata_json` | `0014_audit_events.py` |
| `research_sources` | Fontes de relatórios de pesquisa. | `output_id`, `title`, `url`, `publisher`, `reliability`, `status`, `evidence` | `0006_research_sources.py` |
| `model_calls` | Chamadas LLM e custo estimado. | `task_type`, `agent_slug`, `provider`, `model`, `tokens`, `estimated_cost_usd`, `latency_ms`, `status` | `0009_metrics_reports.py` |
| `reports` | Relatórios internos. | `title`, `report_type`, `brand_slug`, `content`, `summary` | `0009_metrics_reports.py` |
| `calendar_events` | Calendário editorial. | `brand_slug`, `event_type`, `status`, `start_at`, `assigned_agent_slug`, `output_id` | `0008_calendar_events.py` |
| `sources` | Fontes genéricas de documentos/memória. | `name`, `source_type`, `url` | `0004_memory_rag.py` |
| `documents` | Arquivos enviados. | `brand_slug`, `category`, `filename`, `stored_path`, `status`, `error` | `0004_memory_rag.py` |
| `document_chunks` | Chunks vetoriais. | `document_id`, `brand_slug`, `category`, `content`, `embedding` | `0004_memory_rag.py` |
| `memory_entries` | Memórias persistidas. | `brand_slug`, `category`, `source_type`, `title`, `content`, `expires_at`, `embedding` | `0004_memory_rag.py`, `0007_memory_output_learning.py` |

### Dados atuais do banco

| Tabela | Registros |
|---|---:|
| `users` | 2 |
| `brands` | 3 |
| `agents` | 7 |
| `settings` | 4 |
| `provider_credentials` | 5 |
| `agent_runs` | 42 |
| `chat_sessions` | 1 |
| `chat_messages` | 8 |
| `agent_tasks` | 5 |
| `agent_logs` | 14 |
| `outputs` | 13 |
| `output_versions` | 24 |
| `output_decisions` | 6 |
| `output_comments` | 1 |
| `quality_reviews` | 1 |
| `audit_events` | 6 |
| `research_sources` | 8 |
| `model_calls` | 13 |
| `reports` | 3 |
| `calendar_events` | 0 |
| `sources` | 10 |
| `documents` | 4 |
| `document_chunks` | 110 |
| `memory_entries` | 6 |

### Políticas e permissões

- Não há Row Level Security.
- Não há policies SQL.
- Permissão é feita na API por JWT e role simples.
- `require_admin` protege rotas admin.
- Várias rotas operacionais exigem apenas usuário autenticado, sem escopo por marca/workspace.

Status: PARCIAL.

## 11. Autenticação, autorização, workspaces, usuários e perfis

### Autenticação

- Login por e-mail/senha local.
- Hash: PBKDF2-SHA256 com 390.000 iterações.
- Token JWT HS256.
- Expiração padrão: 720 minutos.

Evidência:

- `apps/api/app/security.py`
- `apps/api/app/settings.py`
- `apps/api/app/routers/auth.py`

### Autorização

- Roles: `admin` e `manager`.
- `require_admin` exige `role == "admin"`.
- Admin usado para `/api/admin/*`.
- Reformat/repair de outputs checam `current_user.role != "admin"` dentro de endpoint.

Limitações:

- Não há tela funcional para criar/editar usuários.
- Não há permissões por marca.
- Não há workspaces/organizações.
- Não há gestão de perfis além de `role`.
- Não há revogação de JWT.

Status: PARCIAL.

## 12. Upload, armazenamento, leitura, exportação e download de arquivos

### Upload e armazenamento

- Local: `storage/documents`.
- Nome interno: UUID + extensão.
- Nome original preservado em `documents.filename`.
- Conteúdo original fica no filesystem do container/API.
- Não há volume Docker explícito para `storage/documents`; risco de perda em rebuild/recreate se não persistido.

Evidência:

- `apps/api/app/routers/documents.py`
- `docker-compose.yml`

### Download

- `GET /api/documents/{id}/download` retorna `FileResponse` do arquivo original.
- Se arquivo não existe, retorna 404.

### Exportação

Formatos suportados:

- PDF
- DOCX
- MD
- HTML

Endpoints:

- `GET /api/outputs/{id}/export?format=pdf|docx|md|html`
- `GET /api/outputs/{id}/pdf`
- `GET /api/reports/{id}/export?format=...`
- `GET /api/reports/{id}/pdf`
- `GET /api/documents/{id}/export?format=...`

Evidência: `apps/api/app/export_service.py`, routers `outputs.py`, `reports.py`, `documents.py`.

Limitações:

- Exportação é simples e própria, não usa motor paginado avançado.
- PDF usa ReportLab; bullets ainda têm caractere `â€¢` literal no código de export, possível risco de encoding se renderizado sem reparo.
- Exportação de documentos usa chunks extraídos, não o layout original.

## 13. Pesquisa web, fontes, relatórios, calendário, copys e assessoria de imprensa

### Pesquisa web

Implementado:

- RSS Google News.
- URLs opcionais.
- HTTP com user-agent.
- Extração com trafilatura/BeautifulSoup.
- Playwright Chromium como fallback.
- Apify opcional se provedor/chave estiver configurado.
- Classificação de confiabilidade A/B/C/D.
- Deduplicação por URL.
- Limite operacional de 8 fontes.

Evidência: `apps/api/app/research_service.py`, `apps/api/Dockerfile`.

Estado do banco:

- 6 outputs de pesquisa.
- 8 `research_sources`.

Limitações:

- Pesquisa é síncrona.
- Sem cache de fontes.
- Sem crawler profundo.
- Sem validação humana obrigatória antes de salvar como memória.

### Relatórios

- Pesquisa salva relatórios como outputs.
- Métricas geram `reports`.
- Exportação disponível.

### Calendário

- CRUD de eventos real.
- Geração via LLM.
- Scheduler interno roda no lifespan da API.
- Worker Celery separado existe, mas scheduler de calendário roda na API.
- Banco atual tem 0 eventos.

Status: PARCIAL.

### Copys/conteúdo

- Outputs versionados reais.
- Templates por formato.
- Envio para aprovação com Guardião.
- Não publica externamente.

Status: FUNCIONAL.

### Assessoria de imprensa

- Geração de output press real via `/api/press/generate`.
- Integrável a evento de calendário.
- Não envia e-mails, não cadastra veículos/jornalistas, não monitora imprensa.

Status: PARCIAL.

## 14. Histórico, logs, auditoria, métricas, limites de uso e custos

### Histórico

- `agent_runs`: histórico de execuções diretas de agentes.
- `chat_sessions` e `chat_messages`: conversa.
- `agent_tasks` e `agent_logs`: tarefas e logs.
- `outputs` e `output_versions`: histórico editorial.
- `output_decisions`: decisões.
- `output_comments`: comentários.
- `audit_events`: trilha operacional recente.

### Logs

- Logs de tarefas em `agent_logs`.
- Logs de aplicação via logging Python.
- Não há stack de logs externo.

### Auditoria

Implementado em ações como:

- `content.generated`
- `content.updated`
- `content.submitted_review`
- `output.comment_created`
- `output.comment_updated`
- `outputs.reformat_legacy`
- `outputs.repair_formatting`
- `quality_review.created`
- `output.version_restored`
- `output.updated`
- `output.approved`
- `output.rejected`
- `output.adjustment_requested`
- `output.archived`
- `research.report_created`
- `research.saved_memory`
- `research.used_in_content`
- `calendar.event_*`
- `press.output_created`
- `agent_run.created`
- `agent_run.status_updated`

Evidência: chamadas a `record_audit_event` em routers.

Estado atual:

- 6 eventos de auditoria.
- Auditoria não foi retroativa.

### Métricas e custos

- `model_calls` registra provider, model, tokens, latência, status, erro e custo estimado.
- Estado atual: 13 chamadas, todas `completed`, provider `openrouter`, modelo `~anthropic/claude-sonnet-latest`, 38.914 tokens, custo estimado USD 0,278598.
- Precificação por YAML local: `config/rules/model_pricing.yaml`.

Limitações:

- Custos são estimativas, não billing oficial.
- Sem hard limits reais de gasto.
- Sem rate limiting.
- Sem alertas.

Status: PARCIAL para limites de uso; FUNCIONAL para registro básico de métricas.

## 15. Configurações administrativas disponíveis

Disponível via `/admin/config` e `/api/admin`:

- Listagem de marcas.
- Listagem de agentes.
- Configuração de provedores:
  - OpenRouter;
  - Anthropic;
  - OpenAI;
  - OpenAI Embeddings;
  - Apify.
- API key criptografada.
- Base URL.
- Modelo padrão.
- Habilitar/desabilitar provedor.
- Configuração do Guardião:
  - `local_only`;
  - `hybrid`;
  - `llm_required`;
  - provedor preferencial;
  - modelo preferencial.

Estado atual do banco:

- OpenRouter habilitado e com chave salva.
- Anthropic desabilitado sem chave.
- OpenAI desabilitado sem chave.
- OpenAI Embeddings desabilitado sem chave.
- Apify desabilitado sem chave.
- Guardião em modo `hybrid`.

Limitações:

- Não há CRUD real de usuários.
- Não há CRUD real de marcas pela UI.
- Não há edição de prompts pela UI.
- Não há limite de custo efetivo.
- Não há gestão de regras de marca além de dados seed/config.

## 16. Funcionalidades que aparecem na interface, mas ainda não funcionam de verdade

| Módulo | Status | Evidência no código | Problema ou pendência | Criticidade |
|---|---|---|---|---|
| Busca global no topo | MOCKADO | `apps/web/components/app-shell.tsx` | Input não tem estado, submit ou chamada API. | Baixa |
| Sino/notificações | MOCKADO | `apps/web/components/app-shell.tsx` | Botão visual sem ação. | Baixa |
| Novidades | MOCKADO | `apps/web/components/app-shell.tsx` | Card visual sem rota/funcionalidade. | Baixa |
| Gerenciar marcas no dashboard | MOCKADO | `apps/web/app/(app)/dashboard/page.tsx` | Botão `Gerenciar` sem handler/rota específica. | Baixa |
| Abas Usuários/Regras de Marca/Limites de Custo | PARCIAL | `apps/web/app/(app)/admin/config/page.tsx` | UI não implementa CRUD completo ou enforcement real. | Alta |
| Limites de custo | NÃO IMPLEMENTADO | `config/rules/model_pricing.yaml`, `metrics.py` | Só há estimativa; não há bloqueio por orçamento. | Alta |
| Calendário externo | NÃO IMPLEMENTADO | `calendar_service.py` | Não há Google/Outlook/iCal. | Média |
| Publicação externa | NÃO IMPLEMENTADO | README fora de escopo | Nenhum endpoint publica em redes sociais. | Alta |
| Geração de imagens | NÃO IMPLEMENTADO | Prompts visuais apenas em templates | Sistema apenas gera prompt visual textual. | Média |
| Mailing/PR real | NÃO IMPLEMENTADO | `press_agent.md`, `press.py` | Não envia release/pitch nem gerencia contatos. | Média |

## 17. Funcionalidades implementadas no backend, mas não completamente conectadas à interface

| Módulo | Status | Evidência no código | Problema ou pendência | Criticidade |
|---|---|---|---|---|
| Reformat legacy outputs | PARCIAL | `POST /api/outputs/reformat-legacy` em `outputs.py` | Não há controle visível dedicado na UI admin. | Média |
| Repair formatting outputs | PARCIAL | `POST /api/outputs/repair-formatting` | Não há UI dedicada para manutenção. | Média |
| Compare versions | PARCIAL | `GET /api/outputs/{id}/versions/{from}/compare/{to}` e `VersionCompareView` | UI de comparação não aparece integrada de forma clara nas telas principais. | Média |
| Restore version | PARCIAL | `POST /api/outputs/{id}/versions/{version_id}/restore` | Timeline não expõe restore em todos os fluxos. | Média |
| Update agent run status | PARCIAL | `PATCH /api/agents/runs/{run_id}/status` | UI lista execuções, mas não há controle evidente para mudar status. | Baixa |
| Operations filters completos | PARCIAL | `operations.py` aceita filtros | UI usa marca e listas recentes; não expõe todos os filtros. | Baixa |
| Document export/download | FUNCIONAL | `documents.py`, `memory/page.tsx` | Conectado na UI de memory. | Média |

## 18. Dados mockados, placeholders, TODOs, stubs e simulações

### Dados mockados ou simulados reais

- Embedding local determinístico quando OpenAI Embeddings não está configurado. Evidência: `apps/api/app/embeddings.py`.
- Custo estimado por YAML local, não billing oficial. Evidência: `config/rules/model_pricing.yaml`, `apps/api/app/metrics.py`.
- Dashboard mostra apenas contagens simples de marcas/agentes e empty state. Evidência: `apps/web/app/(app)/dashboard/page.tsx`.
- Métricas internas são agregadas localmente, não análise LLM do `metrics_agent`. Evidência: `apps/api/app/metrics_service.py`.

### Placeholders de interface

- Inputs de busca globais.
- Abas administrativas sem CRUD completo.
- Novidades/sino.

### TODO/FIXME

Busca por `TODO|FIXME` não encontrou TODOs explícitos relevantes em código fonte principal. Foram encontrados placeholders de UI e menções a demo/checklist.

### Simulações/fallbacks

- RAG com fallback local de embeddings.
- Chat pode gerar relatório de métricas sem LLM.
- Apify simplesmente retorna lista vazia se não configurado.
- Research tenta fallback Playwright por fonte quando extração HTTP falha.

## 19. Bugs conhecidos, riscos e débitos técnicos

| Módulo | Status | Evidência no código | Problema ou pendência | Criticidade |
|---|---|---|---|---|
| Encoding/mojibake | QUEBRADO | Vários arquivos mostram `Ã`, `Â`, `â€`: `config/agents/*.md`, `apps/web/components/app-shell.tsx`, `IMPLEMENTATION_STATUS.md` | Strings de prompts/UI/documentos podem aparecer corrompidas; há reparo parcial em `text_repair.py`, mas fonte segue problemática. | Alta |
| Middleware de auth | PARCIAL | `apps/web/middleware.ts` | Rotas `/chat`, `/calendar`, `/costs`, `/insights`, `/operations` não estão no matcher/protectedPrefixes, apesar de páginas redirecionarem client-side. | Alta |
| Isolamento multiusuário | PARCIAL | Routers de outputs/documents/memory não filtram por user/workspace | Qualquer usuário autenticado pode ver dados globais por marca. | Alta |
| Workspaces | NÃO IMPLEMENTADO | Ausência de tabela workspace | Não há tenant/organização. | Alta |
| Segredos | PARCIAL | `crypto.py`, `settings.py` | Fernet deriva de JWT secret; sem rotação; cookie token sem HttpOnly. | Alta |
| Storage de documentos | PARCIAL | `documents.py`, `docker-compose.yml` | `storage/documents` não tem volume explícito no Compose. | Alta |
| Scheduler | PARCIAL | `calendar_scheduler.py` no lifespan da API | Rodar múltiplas réplicas da API exige cuidado; lock Redis ajuda, mas processo scheduler não é isolado. | Média |
| LLM retries | NÃO IMPLEMENTADO | `llm.py` | Sem retries/backoff/circuit breaker. | Média |
| Rate limit | NÃO IMPLEMENTADO | Ausência de middleware/serviço | Sem controle de abuso/custo. | Alta |
| Auditoria retroativa | PARCIAL | `audit_events` tem 6 registros enquanto há 13 outputs e 42 agent_runs | Eventos antigos não foram backfilled. | Média |
| Testes frontend/E2E | NÃO IMPLEMENTADO | Ausência de testes frontend | Build/lint passam, mas fluxos visuais não têm cobertura automatizada. | Alta |
| README/checklist desatualizados | PARCIAL | `docs/CHECKLIST_FINAL_V1.md` menciona Alembic `0010_chat_tasks`; banco está `0014_audit_events` | Documentos operacionais antigos podem induzir erro. | Média |

## 20. Testes existentes, cobertura real e comandos

### Testes existentes

| Arquivo | O que cobre | Limitação |
|---|---|---|
| `apps/api/tests/test_health.py` | Health com dependências mockadas. | Não testa conexão real. |
| `apps/api/tests/test_operations_audit.py` | Compactação de metadata e conteúdo de relatório com operações. | Não testa endpoints com banco real. |
| `apps/api/tests/test_quality_guardian.py` | Rubrica local, placeholders, mistura de marca, híbrido, fallback, llm_required. | Usa mocks; não testa persistência completa via endpoint. |
| `apps/api/tests/test_security.py` | Hash de senha e `/api/auth/me` sem token. | Não testa login completo com banco. |
| `apps/api/tests/test_settings.py` | Parsing de CORS. | Escopo pequeno. |

Resultado atual:

- `python -m ruff check apps/api/app apps/api/alembic apps/api/tests`: passou.
- `$env:PYTHONPATH='apps/api'; python -m pytest`: 14 passed.
- `npm.cmd --prefix apps/web run lint`: passou.
- `npm.cmd --prefix apps/web run build`: passou.
- `docker compose exec api alembic upgrade head`: passou.
- `docker compose exec api python -m app.seed`: passou.
- `GET /health`: ok.

### Comandos

```powershell
python -m ruff check apps/api/app apps/api/alembic apps/api/tests
$env:PYTHONPATH='apps/api'; python -m pytest
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run build
docker compose exec api alembic upgrade head
docker compose exec api python -m app.seed
docker compose ps
Invoke-RestMethod -Uri http://localhost:8000/health
```

## 21. Funcionalidades críticas sem teste

| Módulo | Status | Evidência no código | Problema ou pendência | Criticidade |
|---|---|---|---|---|
| Login com banco real | NÃO VALIDADO | `auth.py` | Não há teste de login end-to-end com seed/db. | Alta |
| Provider config/criptografia | NÃO VALIDADO | `admin.py`, `crypto.py` | Não há teste de salvar/ler provider via endpoint. | Alta |
| Content generation | NÃO VALIDADO | `content_generation.py` | Não há teste com LLM mockado e persistência de output/version. | Alta |
| Document upload/RAG | NÃO VALIDADO | `documents.py`, `rag.py` | Não há teste de upload, chunk, embedding e search. | Alta |
| Research service | NÃO VALIDADO | `research_service.py` | Não há teste de coleta/fallback/salvamento de fontes. | Alta |
| Approvals workflow | NÃO VALIDADO | `output_workflow.py`, `outputs.py` | Sem teste de approve/reject/request-adjustment completo. | Alta |
| Export PDF/DOCX/MD/HTML | NÃO VALIDADO | `export_service.py` | Sem teste automatizado de conteúdo e headers. | Média |
| Chat/Celery/SSE | NÃO VALIDADO | `chat.py`, `tasks.py`, `worker.py` | Sem teste integrado com Redis/worker. | Alta |
| Calendar scheduler | NÃO VALIDADO | `calendar_scheduler.py` | Sem teste de execução agendada e lock Redis. | Média |
| Frontend flows | NÃO VALIDADO | `apps/web/app` | Sem Playwright/Cypress/Jest. | Alta |

## 22. Estado de build, lint, typecheck, migrations e execução local

### Docker atual

| Serviço | Status |
|---|---|
| `duofy-api` | Up 33 hours, healthy |
| `duofy-postgres` | Up 8 days, healthy |
| `duofy-redis` | Up 8 days, healthy |
| `duofy-web` | Up 33 hours |
| `duofy-worker` | Up 33 hours |

Evidência: `docker compose ps`.

### Health

`GET http://localhost:8000/health`:

```json
{
  "status": "ok",
  "services": {
    "api": { "status": "ok" },
    "postgres": { "status": "ok" },
    "redis": { "status": "ok" }
  }
}
```

### Build/checks

- Ruff: passou.
- Pytest: 14 passed.
- Next lint: passou.
- Next build: passou.
- Alembic upgrade head: passou.
- Seed: passou.

### Git/commits

O diretório atual não é um repositório Git:

```text
fatal: not a git repository (or any of the parent directories): .git
```

Portanto, não há commits disponíveis para auditar neste workspace.

## 23. Estado por macroárea

| Módulo | Status | Evidência no código | Problema ou pendência | Criticidade |
|---|---|---|---|---|
| Fundação técnica | FUNCIONAL | `docker-compose.yml`, `apps/api/app/main.py`, `apps/web/package.json` | Ajustes de produção pendentes. | Alta |
| Auth básica | PARCIAL | `auth.py`, `security.py`, `middleware.ts` | Sem refresh/revogação/HttpOnly/workspaces. | Alta |
| Admin provedores | FUNCIONAL | `admin.py`, `admin/config/page.tsx` | Sem rotação/validação ativa de chave. | Alta |
| Admin usuários/workspaces | NÃO IMPLEMENTADO | Ausência de endpoints/tabelas | Apenas seeds e users existentes. | Alta |
| Agentes V1 | PARCIAL | `config/agents`, `orchestrator.py`, serviços específicos | Orquestração multiagente não é real. | Alta |
| RAG documentos | FUNCIONAL | `documents.py`, `rag.py`, banco com 110 chunks | Sem volume persistente e sem citações avançadas. | Alta |
| Memória/aprendizado | PARCIAL | `memory_entries`, `output_workflow.py` | Sem isolamento por usuário/workspace. | Alta |
| Conteúdo | FUNCIONAL | `content_generation.py`, `/content` | Dependente de LLM e qualidade de prompts. | Alta |
| Pesquisa | FUNCIONAL | `research_service.py`, `/research` | Síncrona, fontes externas instáveis. | Alta |
| Aprovações | FUNCIONAL | `outputs.py`, `quality_guardian.py`, `/approvals` | Poucos testes de fluxo completo. | Alta |
| Guardião híbrido | FUNCIONAL | `quality_guardian.py`, `test_quality_guardian.py` | Pouca validação real em banco; apenas 1 revisão existente. | Alta |
| Calendário | PARCIAL | `calendar_service.py`, `/calendar` | Sem eventos atuais e sem integração externa. | Média |
| Press | PARCIAL | `press.py`, `press_agent.md` | Gera texto, não opera distribuição. | Média |
| Métricas/custos | FUNCIONAL | `metrics.py`, `metrics_service.py`, `/costs` | Custo estimado, sem limites. | Média |
| Operações/auditoria | PARCIAL | `audit_events`, `/operations` | Não retroativo e não cobre tudo. | Alta |
| Exportação | FUNCIONAL | `export_service.py`, endpoints export | Layout simples; sem testes automatizados. | Média |
| UI visual | PARCIAL | `document-workspace.tsx`, páginas | Mojibake e alguns controles mockados. | Alta |
| Produção | NÃO IMPLEMENTADO | `.env.example`, Docker local | Sem hardening, deploy, backups, observabilidade externa. | Alta |

## 24. Checklist objetivo para produção

- Corrigir definitivamente encoding/mojibake em todos os arquivos fonte, prompts, templates, seeds e strings UI.
- Migrar autenticação para cookie HttpOnly/Secure ou estratégia equivalente.
- Implementar workspaces/organizações e escopo por usuário/marca.
- Persistir `storage/documents` em volume ou storage externo.
- Adicionar CRUD real de usuários, marcas, permissões e regras de marca.
- Cobrir endpoints críticos com testes integrados.
- Adicionar testes E2E frontend.
- Implementar rate limiting e limites reais de custo/uso.
- Implementar retries/backoff/circuit breaker para LLM e coleta externa.
- Criar auditoria retroativa ou aceitar formalmente que só vale para eventos novos.
- Validar exportações PDF/DOCX/MD/HTML com testes.
- Validar RAG com OpenAI embeddings real e com fallback local.
- Implementar limpeza/remoção de documentos e memórias.
- Criar política de backup do banco e arquivos.
- Separar scheduler de calendário em worker/processo próprio ou controlar multi-replica.
- Remover/implementar elementos mockados na UI.
- Atualizar README/checklists antigos para `0014_audit_events`.
- Implementar monitoramento de erros e logs persistentes.
- Definir política de segredo e rotação.
- Validar UX em navegador para todos os fluxos.

## 25. Ordem recomendada para concluir pendências

1. Corrigir encoding/mojibake no repositório e validar UI/prompts/exports.
2. Fechar segurança básica: cookie HttpOnly, middleware protegendo todas as rotas app, autorização por role e escopo por marca/workspace.
3. Implementar workspaces e isolamento multiusuário antes de expandir uso real.
4. Persistir arquivos em volume/storage e adicionar remoção/listagem administrativa segura.
5. Criar testes integrados para auth, provider config, content, RAG, research, approvals e exports.
6. Adicionar E2E com Playwright para login, upload, geração, aprovação e exportação.
7. Implementar limites reais de custo/rate limit e alerts de erro por provider.
8. Completar admin: usuários, marcas, regras, limites e prompts.
9. Fortalecer orquestrador real com planejamento, handoffs e rastreio multiagente.
10. Decidir deploy/produção: envs, secrets, backups, logs, workers, scheduler e storage.

## Resumo executivo do estado atual

O sistema está funcional como V1 local-first para demonstração e uso controlado: Docker sobe, API/Web/Worker/Postgres/Redis estão rodando, banco está no head `0014_audit_events`, login existe, provedores são configuráveis, OpenRouter está habilitado, agentes rodam, documentos são indexados em pgvector, outputs são versionados, pesquisa salva fontes, aprovação usa Guardião, exports existem e observabilidade operacional está disponível.

O sistema ainda não está pronto para produção. Os principais bloqueios são encoding/mojibake persistente em arquivos fonte e UI, ausência de workspaces/isolamento robusto, autenticação baseada em token acessível por JavaScript, storage local não persistido explicitamente, poucos testes integrados, ausência de limites reais de custo/uso e elementos de UI que parecem completos mas não têm implementação operacional.

## Percentual estimado de conclusão por módulo

| Módulo | Percentual estimado | Status |
|---|---:|---|
| Fundação técnica local | 90% | FUNCIONAL |
| Backend API | 78% | PARCIAL |
| Frontend app | 72% | PARCIAL |
| Auth/autorização | 45% | PARCIAL |
| Admin provedores | 70% | FUNCIONAL |
| Admin usuários/workspaces | 10% | NÃO IMPLEMENTADO |
| Agentes V1 | 68% | PARCIAL |
| Orquestrador | 35% | PARCIAL |
| RAG/documentos | 75% | FUNCIONAL |
| Memória/aprendizado | 60% | PARCIAL |
| Conteúdo | 75% | FUNCIONAL |
| Pesquisa | 70% | FUNCIONAL |
| Aprovações/versões | 78% | FUNCIONAL |
| Guardião de Qualidade | 75% | FUNCIONAL |
| Calendário | 55% | PARCIAL |
| Assessoria de imprensa | 45% | PARCIAL |
| Métricas/custos | 65% | PARCIAL |
| Operações/auditoria | 60% | PARCIAL |
| Exportação | 65% | FUNCIONAL |
| Testes/QA | 25% | PARCIAL |
| Produção/hardening | 20% | NÃO IMPLEMENTADO |

## Top 10 riscos para a entrega

1. Mojibake em arquivos fonte, prompts e UI pode degradar respostas, documentos e percepção profissional.
2. Ausência de isolamento por workspace/usuário pode expor dados entre usuários autenticados.
3. Cookie JWT acessível por JavaScript aumenta risco em caso de XSS.
4. Storage local de documentos sem volume explícito pode perder arquivos.
5. Baixa cobertura de testes integrados em fluxos críticos.
6. Custos LLM são estimados e não há limite real de gasto.
7. Orquestrador não implementa o fluxo multiagente prometido pelos prompts.
8. Pesquisa externa síncrona pode travar ou falhar por fonte/provedor.
9. Auditoria é recente e parcial, sem backfill e sem cobertura total.
10. UI contém controles sem função real, podendo confundir usuários.

## Top 10 ações prioritárias

1. Corrigir encoding em todo o repositório e rodar reparo/validação visual.
2. Proteger todas as rotas app no middleware e revisar estratégia de token.
3. Implementar workspaces/tenant e escopo por recurso.
4. Adicionar volume/storage persistente para documentos.
5. Criar testes integrados de content, RAG, research, approvals, exports e admin providers.
6. Criar E2E com Playwright para fluxos principais.
7. Implementar limites reais de custo/rate limit por usuário/workspace/provedor.
8. Completar admin de usuários, marcas, regras e limites.
9. Fortalecer o orquestrador com plano, handoffs, registro e retries.
10. Atualizar documentação operacional e remover docs antigas/desatualizadas.

## Dúvidas que o código não permite responder

- Qual é a política final de usuários, clientes, marcas e workspaces em produção?
- O sistema será usado por uma equipe interna única ou por múltiplos clientes/tenants?
- Onde os documentos devem ser armazenados em produção: volume, S3, Blob, OneDrive ou outro storage?
- Qual provedor/modelo será padrão em produção e quais limites de custo são aceitáveis?
- O fallback local de embeddings é aceitável apenas para demo ou também para operação real?
- Quais regras de marca/TOTVS devem ser hard-block e quais são apenas recomendação?
- Quem aprova conteúdos sensíveis de DeathCare e quais critérios jurídicos/compliance são obrigatórios?
- A auditoria precisa ser imutável/legalmente rastreável ou apenas operacional?
- O calendário deverá integrar com Google/Outlook ou permanecer interno?
- Publicação externa, mailing e redes sociais entram na V1 ou ficam fora definitivamente?
