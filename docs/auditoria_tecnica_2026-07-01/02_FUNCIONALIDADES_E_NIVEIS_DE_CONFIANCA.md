# 02 · Funcionalidades e Níveis de Confiança

Inventário completo das funcionalidades, classificadas por maturidade:
**REAL** (completo e funcional) · **PARCIAL** (funciona com lacunas) · **FRÁGIL** (alto risco de quebrar) · **MOCK/STUB** (placeholder/dados fictícios).

---

## 1. Backend — funcionalidades

### 1.1 Autenticação — **REAL**
- **Endpoints:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- **Como funciona:** senha verificada com PBKDF2-HMAC-SHA256 (390k iterações, salt por senha, comparação em tempo constante — `security.py:15-34`). JWT HS256 assinado com `jwt_secret_key`, expiração 12h. `get_current_user` revalida `is_active` a cada request (`dependencies.py:34-36`).
- **Ressalvas:** logout é no-op (JWT stateless, sem revogação); token vive 12h sem denylist. Segurança do transporte do token é frágil (ver [03](03_SEGURANCA_E_VULNERABILIDADES.md), C-1/A-1).

### 1.2 Marcas — **REAL** (read-only)
- `GET /api/brands` lista marcas ativas do seed. **Não há CRUD de marca via API** — marcas vêm do seed/YAML.

### 1.3 Admin / Configuração de provedores — **REAL**
- **Endpoints:** `GET /api/admin/agents`, `GET/PUT /api/admin/providers/{provider}`, `GET/PUT /api/admin/quality-settings`, `GET/PUT /api/admin/agent-settings`.
- **Como funciona:** a chave de API do provedor é **cifrada** com Fernet ao salvar (`admin.py:216-217`) e **mascarada** na leitura (`abcd...wxyz`) — o segredo nunca é devolvido em claro. Configura orçamentos de token, profundidade de pesquisa e modo do Guardião (local/hybrid/llm_required).

### 1.4 Geração de conteúdo — **REAL**
- **Endpoints:** `POST /api/content/generate`, `GET /api/content/outputs`, `GET /outputs/{id}`, `PATCH /outputs/{id}`, `POST /outputs/{id}/submit-review`.
- **Como funciona:** seleciona template por canal/formato → monta contexto RAG → chama LLM → normaliza documento → grava `AgentRun` + `Output` + `OutputVersion` v1. Tratamento de erro robusto com rollback e registro de `AgentRun` falho (`content_generation.py:214-227`).

### 1.5 Workflow de outputs / versões / comentários — **REAL** (com código morto no router)
- **Como funciona:** máquina de estados dirigida por `config/rules/output_status.yaml` (com fallback embutido). `approve` exige `ensure_quality_passed` (gate do Guardião) e cria memória permanente; `reject` cria memória temporária (30 dias); há `request_adjustment`, `archive`, `move` (kanban), versões, diff (`difflib`), restore e comentários ancorados.
- **Dívida:** `routers/outputs.py` tem funções **redefinidas/sombreadas** (`_version_read`, `_output_read`, `_output_export_document` definidas duas vezes — a primeira definição é código morto). Ver [05](05_QUALIDADE_CODIGO_MORTO_E_TESTES.md).

### 1.6 Guardião de Qualidade — **REAL** (módulo mais sofisticado)
- **Como funciona:** avaliação em dois níveis. **Local determinístico** (`assess_output_quality`): rubrica com penalidades por mojibake, placeholder, tamanho, ausência de seções/CTA/fontes, e regras de segurança de marca hardcoded (ex.: não misturar DeathCare↔Postos, tom sensível). Score = 100 − penalidades; aprova ≥80 sem críticas. **Híbrido opcional por LLM** (3 modos): merge conservador (`score = min(local, llm)`, `passed` exige aprovação do LLM). Erro de LLM é capturado sem derrubar a revisão.

### 1.7 Pesquisa de mercado — **PARCIAL / FRÁGIL**
- **Endpoint:** `POST /api/research/run`.
- **Como funciona:** pipeline real de coleta — Google News RSS + fontes manuais + Apify opcional; extração via trafilatura/BeautifulSoup; fallback **Playwright/Chromium** para profundidade `deep`. Classifica confiabilidade A–D por domínio. Fontes que falham viram registros `status="failed"` (degradação graciosa).
- **Por que FRÁGIL:** depende de RSS externo do Google News (quebra fácil, sem contrato de API); Playwright exige o browser instalado no container; `_apify_candidates` **engole exceções silenciosamente** retornando `[]` (`research_service.py:204-205`). Ver também SSRF/no-sandbox em [03](03_SEGURANCA_E_VULNERABILIDADES.md).

### 1.8 Assessoria de imprensa — **REAL no back, sem UI**
- **Endpoint:** `POST /api/press/generate` (análogo a conteúdo; pode vincular a um `CalendarEvent`). **Nenhuma tela do frontend consome** este router — funcionalidade existe só no backend.

### 1.9 Calendário editorial — **REAL**
- **Endpoints:** `GET/POST /api/calendar`, `PATCH/DELETE /{id}`, `POST /generate`, `POST /{id}/run-now`, `GET /export.ics`.
- **Como funciona:** CRUD completo; `generate` pede ao LLM um JSON de 3–8 eventos com parse defensivo (`_extract_json_array`, `_parse_datetime` degrada data malformada). `execute_calendar_event` roteia por `assigned_agent_slug` para press/content/research (fallback genérico via `run_agent`), tratando falha com re-fetch pós-rollback. Geração de **iCal RFC 5545** sem dependências (line-folding + escaping corretos).

### 1.10 Scheduler de calendário — **FRÁGIL**
- **Como funciona:** loop `asyncio` no lifespan (`main.py:43`), poll 60s, lock Redis `SETNX` por evento, executa até 5 eventos vencidos por tick.
- **Por que FRÁGIL:** roda **no processo da API, não no worker**; múltiplas réplicas web rodariam o loop (mitigado pelo lock, mas ainda executa geração LLM pesada no processo web); execução síncrona dentro do tick. Deveria ser Celery beat.

### 1.11 Chat / Tarefas assíncronas — **REAL**
- **Endpoints:** `POST /api/chat/sessions/{id}/messages`, `GET /api/tasks`, `/{id}`, `/{id}/stream` (SSE por polling 1s, teto 180 iterações = 3 min).
- **Como funciona:** cria `AgentTask(queued)` e dispara Celery → orquestrador LangGraph. Sessões de chat são **escopadas por usuário** (`ChatSession.user_id == user.id`). Cada iteração do SSE abre nova sessão DB (custo de conexões).
- **Nota:** namespaces `task_type="orchestrate"` (chat) vs `"orchestrator"` (métricas) divergem, mas nada filtra por eles em V1.

### 1.12 RAG / Memória / Embeddings — **PARCIAL**
- **Endpoints:** `/api/memory`, `POST /api/memory/search`.
- **Como funciona:** `search_memory` faz SQL `UNION ALL` sobre `document_chunks` + `memory_entries` com similaridade cosseno pgvector (`<=>`), filtros por marca/categoria/fonte, respeitando `expires_at`.
- **Ponto crítico 1 (STUB silencioso):** sem provedor `openai_embeddings`/`openai` habilitado, `embed_text` cai para `_local_embedding` — **hashing SHA-256 por token** em vetor 1536-D (`embeddings.py:29-41`). Não é embedding semântico: o RAG funciona mecanicamente mas com qualidade de recuperação ruim, **sem avisar o usuário**. É o principal componente "mock-like" do sistema.
- **Ponto crítico 2 (performance):** a query de busca ordena por score sobre um `UNION ALL` externo (`rag.py:55-91`), padrão que **provavelmente impede o Postgres de usar o índice HNSW** criado na migration 0015 — a confirmar com `EXPLAIN ANALYZE`. Ver [04](04_MODELO_DE_DADOS.md).
- **Ponto crítico 3:** `embed_text` **não tem try/except nem retry** (`embeddings.py:68-77`) — se o provedor de embeddings estiver habilitado mas falhar/timeout, o erro propaga cru (500), diferente do resto que degrada.

### 1.13 Documentos — **REAL**
- **Endpoints:** `POST /upload` (PDF/DOCX/TXT/MD), `GET` lista/chunks/download/export.
- **Como funciona:** extrai texto (pypdf/python-docx), chunking (900/140), embedding por chunk, indexação. Processamento **síncrono dentro do request** via `run_in_threadpool` — lento para arquivos grandes (sem fila).
- **Falha de UI:** não há tela de **upload** no frontend (a `/memory` só lê/baixa) — lacuna funcional.
- **Falha de segurança:** rotas não escopam por marca/usuário (IDOR — ver [03](03_SEGURANCA_E_VULNERABILIDADES.md), A-2).

### 1.14 Métricas e Relatórios — **REAL**
- **Endpoints:** `GET /api/metrics/summary`, `/model-calls`; `POST /api/reports/generate`.
- **Como funciona:** `record_model_call` grava **toda** chamada LLM (sucesso e falha) numa sessão DB própria — desacoplada da transação do request, para não perder telemetria em rollback. Custo estimado por `config/rules/model_pricing.yaml` ou `raw_usage.cost` do OpenRouter. Relatórios internos com export PDF/DOCX/MD/HTML.

### 1.15 Operações / Auditoria — **REAL**
- **Endpoints:** summary agregado, `agent-health` (classifica ok/warning/critical por taxa de falha), listagem de audit events e quality reviews.
- **Como funciona:** `record_audit_event` compacta metadata grande; agrega model calls, agent runs, quality reviews e decisões.

### 1.16 Export / PDF — **REAL** (depende de libs nativas)
- **Como funciona:** gerador Markdown→HTML próprio (listas, tabelas, blockquote, inline) em 4 formatos; **PDF via WeasyPrint** (import tardio). Exige Pango/Cairo no container — **presentes** no `apps/api/Dockerfile:9-19` (confirmado). `pdf_service.py` é um wrapper fino redundante sobre `export_service` (candidato a remoção).

### 1.17 Integração com provedores de IA — **REAL / FRÁGIL**
- **Suportados:** `openrouter`, `openai`, `anthropic` (execução), `openai_embeddings` (RAG), `apify` (scraping).
- **Chaves:** cifradas em `provider_credentials.api_key_encrypted`, decifradas via Fernet derivado do `JWT_SECRET_KEY` (acoplamento crítico — ver [03](03_SEGURANCA_E_VULNERABILIDADES.md), C-3).
- **Sem chave:** levanta `LLMConfigurationError` → HTTP 400/422 com mensagem "Configure e habilite o provedor... em Admin > Configurações > Modelos LLM". **Nenhuma geração devolve dado falso.**
- **FRÁGIL — override de modelo:** todos os serviços chamam `call_llm(model=credential.default_model or model, ...)`. Ou seja, o `default_model` do provedor **sobrepõe** o modelo escolhido pelo usuário/agente sempre que estiver setado (o padrão pós-seed). O parâmetro `model` do usuário é efetivamente ignorado — comportamento de negócio não documentado.

---

## 2. Frontend — telas

Legenda de nav: os rótulos entre parênteses são os exibidos na navegação.

| Tela / Rota | Rótulo | Classificação | Confiança | Observações |
|---|---|:---:|:---:|---|
| `/login` | — | REAL | Alta | Remover credenciais default pré-preenchidas no form. |
| `/operations` | Operações | REAL | Alta | **Tela central** monolítica (527 linhas): chat + kanban drag-drop + cocriação + modal de edição. |
| `/approvals` | Revisão | REAL | Alta | Fila de revisão + painel do Guardião. UX de erro crua (`alert`/`prompt`). |
| `/calendar` | Calendário | REAL | Muito alta | CRUD + geração IA + `.ics` + deep-links Google/Outlook. |
| `/memory` | Memória | REAL | Alta | Busca RAG, coleções, chunks, download. **Falta upload.** |
| `/relatorios` | Relatórios | REAL | Muito alta | Custos/uso de IA com gráficos derivados de dados reais. |
| `/admin` | Administração | REAL* | Alta | 6 abas; *Permissões é mock, Integrações é parcial (só Apify real). |
| `/admin/agents` | — | REAL, **órfã** | Média | Funcional, mas **sem link na nav**; duplica `/admin`. Candidata a remoção. |
| `/admin/config` | — | REAL, **órfã** | Média | Idem acima. |
| `/redes` | Redes & Tráfego | **MOCK** | Baixa | 100% hardcoded (`ORGANIC_KPIS`, `ADS`…). Sem `apiFetch`/`useBrand`. Botões inertes. |
| `/dashboard` `/chat` `/content` `/research` `/workspace` | — | Redirect | N/A | Só `redirect("/operations")`. |
| `/costs` `/insights` | — | Redirect | N/A | Só `redirect("/relatorios")`. |

### Detalhamento das telas mock/parciais

- **`/redes` (MOCK):** dashboard de Instagram Insights + Meta Ads com dados fictícios definidos localmente. É a **única** tela puramente mock. Coerente com o escopo V1 (publicação em redes fora de escopo). Precisa de backend real (Meta/Instagram APIs) para sair de mock.
- **`/admin` › aba Permissões (MOCK):** `ROLE_TABLE` hardcoded; botão "Novo papel" desabilitado ("Em breve").
- **`/admin` › aba Integrações (PARCIAL):** Apify é real (deriva de providers); Meta Ads / Google Sheets / Tavily / SendGrid são placeholders "Em breve".
- **`/admin` › aba Automações (PARCIAL):** monitor de execuções é real; os "Fluxos" são rótulos hardcoded decorativos.

### Transversais do frontend
- **Autenticação:** token em cookie `duofy_token` **não-HttpOnly, sem Secure** (`lib/auth.ts:15-19`), enviado como `Bearer` manual em cada chamada. Sem tratamento **centralizado de 401** — telas com token expirado mostram "vazio" em vez de deslogar.
- **Multi-marca:** `brand-context.tsx` provê `{brands, selected, setSelected}`, persistido em `localStorage`. Propagação **mista**: algumas telas passam `?brand_slug=` (server-side), outras filtram no cliente (frágil se houver mais itens que o `limit`).
- **Resiliência de fetch inconsistente:** `Promise.allSettled` (resiliente) em memory/relatorios/admin vs `Promise.all` (falha tudo) em operations/admin-config. A versão resiliente deveria ser padrão.
- **Bug de estilo:** classe Tailwind `surface` usada 17× em 5 arquivos, **não existe** — silenciosamente ignorada (hovers/backgrounds não aparecem).

---

## 3. Resumo — o que é real vs. o que não é

**É real e funcional (ponta a ponta):** login, operações (chat + kanban + cocriação), revisão com Guardião, calendário editorial, memória/RAG (busca), relatórios de custo, administração de provedores/agentes/qualidade, geração de conteúdo, métricas, auditoria, export PDF/DOCX/MD/HTML.

**Funciona com ressalva (PARCIAL/FRÁGIL):** pesquisa de mercado (scraping externo), scheduler de calendário (in-process), RAG (índice possivelmente não usado + fallback de embedding degradado), override de modelo (ignora escolha do usuário), orquestrador (estado volátil).

**Não é real (MOCK/ausente):** tela `/redes` (100% mock), aba Permissões do admin (mock), integrações Meta/Sheets/Tavily/SendGrid (placeholders), assessoria de imprensa (existe no back, **sem UI**), upload de documentos (existe no back, **sem UI**).

**Ponto que merece destaque:** sem chave de provedor de LLM, **o sistema não finge** — ele levanta erro amigável em toda geração. O único comportamento "stub" silencioso é o fallback de embeddings local, que degrada o RAG sem avisar.

> Continue por **[03 · Segurança e Vulnerabilidades](03_SEGURANCA_E_VULNERABILIDADES.md)**.
