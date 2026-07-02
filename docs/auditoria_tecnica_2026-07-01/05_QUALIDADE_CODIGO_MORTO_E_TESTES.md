# 05 · Qualidade, Código Morto e Testes

Foco: alinhamento front↔back, código morto/desnecessário, cobertura de testes, consistência e estado da documentação.

**Notas de síntese:**
- **Alinhamento do código: 8,0 / 10** — contrato front↔back sólido, nenhuma chamada quebrada.
- **Confiança na base de testes: 2,0 / 10 (~20%)** — boa cobertura unitária de lógica isolada, **nenhum teste E2E/integração/DB/frontend, nenhuma CI**.

---

## 1. Alinhamento Frontend ↔ Backend

Todas as chamadas `apiFetch`/`downloadFile` do frontend foram mapeadas contra as ~78 rotas do backend.

✅ **Nenhum endpoint chamado pelo front que não exista no back.** Todos os paths (`/api/auth/*`, `/api/outputs/*`, `/api/content/*`, `/api/research/*`, `/api/calendar/*`, `/api/memory/*`, `/api/documents/*`, `/api/metrics/*`, `/api/reports/*`, `/api/operations/*`, `/api/admin/*`, `/api/agents/*`, `/api/chat/*`, `/api/tasks/*`, `/api/brands`) têm rota correspondente. A tipagem em `lib/api.ts` casa com os `response_model`.

### Rotas do backend que NINGUÉM consome (código órfão de servidor)

| Rota | Local | Situação | Severidade |
|---|---|---|---|
| `POST /api/press/generate` (router inteiro) | `routers/press.py:57` | Assessoria de imprensa só existe no back; nenhuma tela chama | Dívida |
| `PATCH /api/agents/runs/{id}/status` | `routers/agents.py:95` | Nunca chamado (aprovação real via `/api/outputs/*`) | Dívida |
| `GET /api/outputs/{id}/pdf` | `routers/outputs.py:642` | Órfã: front usa `/export?format=pdf` | Limpeza |
| `GET /api/reports/{id}/pdf` | `routers/reports.py:104` | Órfã: front usa `.../export` | Limpeza |
| `POST /api/outputs/reformat-legacy` | `routers/outputs.py:464` | Manutenção; já roda no boot | Limpeza |
| `POST /api/outputs/repair-formatting` | `routers/outputs.py:495` | Manutenção; sem UI | Limpeza |

**Inconsistência de UX de erro:** o handler global devolve JSON `{"error","detail"}` (`error_handlers.py:21-26`), mas `apiFetch` lê o corpo via `response.text()` e joga a string crua no `Error` (`api.ts:428-431`) — em 500 o usuário vê o JSON literal, não a mensagem.

---

## 2. Código morto / desnecessário

### 2.1 Frontend — 5 componentes órfãos (~2.368 linhas) — **o achado mais grave**

O último commit (`9dfa586`) reescreveu `/operations` com kanban, drag-drop, chat e modal **inline próprios** (tudo self-contained). Com isso, os componentes do commit anterior (`3bcac4f`) ficaram **sem nenhum consumidor**:

| Componente | Linhas | Importado por |
|---|---:|---|
| `components/kanban-board.tsx` | 437 | ninguém |
| `components/card-popup.tsx` | 546 | ninguém |
| `components/chat-panel.tsx` | 549 | ninguém |
| `components/inspector-bar.tsx` | 195 | ninguém |
| `components/document-workspace.tsx` | 641 | só o **tipo** `ExportFormat` (usado por `lib/download.ts:1`) — morto por transitividade quanto ao componente |
| `components/logout-button.tsx` | 24 | ninguém (logout real está inline no `app-shell`) |

`operations/page.tsx` importa apenas `ui`, `markdown`, `icons`, `auth`, `brand-context`, `download`. Confirmação extra de que são resquícios: `chat-panel.tsx:103-108` e `inspector-bar.tsx:140-145` referenciam rotas que **não existem mais** (`/content/:id`, `/research/:id`, `/reports/:id`).

> **Reconciliação de divergência entre auditorias:** uma frente inicialmente marcou esses componentes como "possivelmente órfãos, verificar" e afirmou que `/operations` usava `chat-panel`. A verificação direta por grep refuta isso — **são código morto**. Prevalece a leitura verificada.

### 2.2 Frontend — `lib/mock.ts` (489 linhas): 100% morto
Zero importadores (`grep "@/lib/mock"` em todo `apps/web` = 0). A única tela mock (`/redes`) define seus próprios dados hardcoded localmente, nem importa de `mock.ts`. **Deletar sem risco.**

### 2.3 Frontend — 7 páginas viraram stubs de `redirect`
`dashboard`, `insights`, `workspace`, `costs`, `content`, `research`, `chat` (cada uma 4 linhas → `/operations` ou `/relatorios`). Inofensivas, mas o `middleware.ts:3-18` e `config.matcher:39-55` ainda protegem essas 9 rotas mortas.

### 2.4 Frontend — páginas admin órfãs
`/admin/agents` (290 linhas) e `/admin/config` (417 linhas) são **totalmente funcionais** mas **sem link na navegação** (o sidebar vai só para `/admin`). Duplicam funcionalmente as abas de `/admin`. Decidir: remover ou re-linkar.

### 2.5 Backend — `pdf_service.py` órfão
22 linhas, wrapper fino de `export_service.build_duofy_pdf`, **zero importadores**. Deletar.

### 2.6 Backend — funções redefinidas/sombreadas em `routers/outputs.py`
`_version_read` (L60 e L256), `_output_read` (L100 e L267), `_output_export_document` (L190 e L301) são **definidas duas vezes** — a segunda (com `repair_text`) sobrescreve a primeira em runtime; a primeira é **código morto**. Além disso, `_quality_review_read` usa `repair_text` em `outputs.py` mas **não** em `content.py` — mesma entidade renderizada diferente conforme o endpoint.

### 2.7 Backend — duplicação de helpers
| Função | Cópias | Locais | Recomendação |
|---|---:|---|---|
| `_provider_for_model` | 5 | calendar_service, content_generation, orchestrator, orchestrator_graph, quality_guardian | Consolidar em `llm.py`. **Divergência real:** só a de `orchestrator.py` trata prefixo `~anthropic/`; as outras 4 não → risco de drift. |
| `_plain_text`/`_plain` | 4–6 | calendar_service, content_generation, orchestrator, quality_guardian | Mover para `text_repair.py`. |
| `_system_prompt` | 3–4 variações | orchestrator, content_generation, calendar_service, research_service | Assinaturas divergem; avaliar unificação. |
| descoberta de `config/` | 3 | agent_config, metrics, output_workflow | Um único loader. |

**~250 linhas duplicadas** no back; principal risco é corrigir num lugar e esquecer nos outros.

### 2.8 O que NÃO é duplicação (esclarecimentos)
- `metrics.py` (instrumentação) vs `metrics_service.py` (agregação/consulta) — camadas complementares corretas.
- `content_generation.py` (serviço) vs `routers/content.py` (router) — separação serviço/router correta.
- Os **4 orquestradores** estão todos ativos e encadeados (nenhum órfão): `orchestrator.py`←agents/calendar; `orchestrator_graph.py`←worker; `orchestrator_llm.py`/`orchestrator_tools.py`←grafo.
- `seed.py` **não é morto** — é script de CLI documentado (`python -m app.seed`); correto não ser importado.

### 2.9 Arquivos versionados — situação limpa
`.env` (raiz) só tem `BACKEND_CORS_ORIGINS` (sem chaves) e está gitignorado. `tmp/`, `.superpowers/`, caches e `tsbuildinfo` **não** estão tracked. Sem segredos vazados no git.

### 2.10 Bug de estilo — classe Tailwind `surface` inexistente
`bg-surface`/`hover:bg-surface` usada **17× em 5 arquivos** (`admin/page.tsx` ×11, `redes`, `operations`, `calendar`, `markdown`), mas `surface` **não está definida** em `tailwind.config.ts` (que define `panel`/`linen`/`ink`) nem em `globals.css`. As classes são **silenciosamente ignoradas** — o hover/background pretendido não aparece. Corrigir: definir `surface` ou trocar por `panel`.

### Total removível/limpável
**~2.850 linhas de código morto no frontend** (`mock.ts` 489 + cluster órfão ~2.360) + `pdf_service.py` + funções sombreadas no back + ~250 linhas de helpers duplicados. Remoção de baixo risco, alto ganho de legibilidade.

---

## 3. Testes

**78 funções de teste em 22 arquivos** (`apps/api/tests/*`), todos backend, quase todos unitários com fakes/mocks.

### Bem coberto
`test_settings` (fail-fast de segredos), `test_quality_guardian` (rubrica local + híbrido + fallback), `test_agent_limits`/`test_agent_budgets_applied` (budgets/depth), `test_llm_retry`/`test_llm_max_tokens` (retry 429/5xx, max_tokens), `test_calendar_ics`/`test_calendar_parse` (ICS + parse robusto), `test_text_repair` (mojibake PT-BR), `test_export_pdf` (PDF/markdown/XSS), `test_brand_profile` (voz de marca), `test_orchestrator_*` (graph/tools/prompt/llm/integration).

### Não coberto (áreas críticas)
- ❌ **Zero testes de HTTP/integração de negócio autenticado.** Só 4 arquivos usam `TestClient` e nenhum exercita fluxo real.
- ❌ **Zero DB real** — tudo é `_FakeSession`; **não há `conftest.py`**.
- ❌ **Fluxo de aprovação de output** (`outputs.py:695-804`, `output_workflow.py`) — núcleo do produto — **0 testes**.
- ❌ **Auth/JWT completo** (login → token → rota protegida) — só há teste de "faltou token".
- ❌ **Worker Celery / `task_service` / chat sessions** — 0.
- ❌ **RAG/embeddings/`rag.py`/`document_processing.py`** (upload + chunking + busca) — 0.
- ❌ **`crypto.py`** (Fernet das credenciais) — 0.
- ❌ **`calendar_scheduler.py`** — 0.
- ❌ **Frontend: 0 testes** (nenhuma dep de vitest/jest/playwright; nenhum `*.test.*`).
- ❌ **CI: inexistente** — sem `.github/workflows`, sem pipeline. Nada roda testes em push/PR.

### Confiança estimada: ~20%
Valida bem lógica pura isolada; **não valida nenhum caminho ponta-a-ponta**, persistência, worker nem UI. Qualquer regressão em routers, `output_workflow` ou worker passa despercebida.

---

## 4. Consistência e convenções

- **Padrão serviço/router** bem aplicado no back (routers finos delegando a serviços). Positivo.
- **Tratamento de erro variável:** handler global consistente, mas `raise HTTPException`/`except` espalhados com granularidade desigual (`outputs.py` tem 14; `auth.py`/`chat.py` têm 1). No front, tratamento de erro divergente (`window.alert`/`window.prompt` em approvals vs modais em operations vs estado silencioso em memory).
- **Resiliência de fetch inconsistente:** `Promise.allSettled` vs `Promise.all` (padronizar no primeiro).
- **`API_URL` duplicado** em 4 arquivos (`api.ts`, `download.ts`, `memory/page.tsx`, `chat-panel.tsx`) — centralizar.
- **Tipos redefinidos:** `admin/page.tsx:13-60` redefine localmente `Agent`/`Provider`/`AgentRun`/etc. que já existem em `lib/api.ts` — importar de lá.
- **Casts frouxos:** `as unknown as ResearchReport` (`operations/page.tsx:493,497`) — usar type guard.
- **Nomenclatura PT/EN misturada** nas rotas (`/operations`, `/relatorios`, `/redes`, `/approvals`) — cosmético.

## 5. TODO/FIXME/HACK/XXX
**Nenhum marcador real** no código-fonte (matches de grep foram falsos positivos por substring, ex.: "todos", "metodologia"). Código limpo nesse aspecto.

---

## 6. Documentação vs Código

| Documento | Estado | Ação |
|---|---|---|
| `docs/ESTADO_PROJETO_2026-06-26.md` | **Preciso e atual** — melhor referência (LangGraph, HNSW, Tier 0, mono-tenant) | Manter como fonte de verdade |
| `docs/ESTADO_ATUAL_DO_SISTEMA.md` (65 KB) | **Desatualizado** — diz migrations até 0014 (repo está em 0015) | Arquivar/remover |
| `docs/MAPA_TECNICO_E_OPERACIONAL.md` (51 KB) | Sobreposto ao anterior, parcialmente estale | Consolidar |
| `docs/SPRINT_FINAL_STATUS.md` | Números estale ("14 passed", "17 rotas"; hoje 78 testes) | Atualizar/arquivar |
| `README.md` (raiz) | **Desatualizado** — lista `/dashboard`,`/costs`,`/insights` como telas (hoje redirects); descreve "Fase 1/2" | Reescrever seção de rotas |
| `IMPLEMENTATION_STATUS.md` | Coerente em alto nível, mas não reflete o `/operations` unificado | Atualização leve |
| `DEPLOY.md` | Recente e alinhado com a stack prod — **exceto** a afirmação de seed automático (ver [06](06_INFRAESTRUTURA_E_DEPLOY.md)) | Corrigir passo de seed |

Nenhum doc menciona o `press_agent` sem UI nem os 5 componentes órfãos — a documentação não acompanhou os 2 últimos commits de redesign.

> Nota: a memória do projeto já registra "Doc ESTADO_ATUAL desatualizado" — verificar sempre no código antes de agir sobre o que os docs afirmam.

---

## 7. Top 5 ações de limpeza (ordem de impacto)

1. Remover os 5 componentes órfãos + `lib/mock.ts` (~2.850 linhas) — ou re-cablá-los se o redesign os previa.
2. Adicionar **CI mínima** (ruff + pytest + `next lint`/`build`) — hoje nada roda automaticamente.
3. Criar `conftest.py` com DB de teste + ~5 testes de integração (login JWT e fluxo de aprovação).
4. Consolidar `_provider_for_model` (5×) e `_plain_text` (4×) em módulos únicos.
5. Deletar `pdf_service.py`; remover funções sombreadas de `outputs.py`; corrigir a classe `surface`; arquivar docs estale; corrigir seção de rotas do `README.md`.

> Continue por **[06 · Infraestrutura e Deploy](06_INFRAESTRUTURA_E_DEPLOY.md)**.
