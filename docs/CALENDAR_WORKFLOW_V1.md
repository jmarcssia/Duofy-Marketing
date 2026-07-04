# Calendário como Centro Operacional — V1

> Fase 0 (auditoria) + contrato do corte vertical. Fonte de verdade de arquitetura:
> [ESTADO_DO_SISTEMA_2026-07-02.md](ESTADO_DO_SISTEMA_2026-07-02.md). Branch `sprint/nucleo-agentes`.
> Princípio: **ampliar** `calendar_events` e **reusar** outputs/agent_tasks/briefings/audit_events —
> sem duplicar conteúdo, sem segundo sistema de aprovação, sem reescrever Pesquisa/Cocriação.

---

## 1. Estado atual (auditoria)

| Peça | Local | Observações |
|---|---|---|
| Model | `apps/api/app/models.py:327` `CalendarEvent` | brand_slug, category, title, description, event_type, status, channel, format, start_at, end_at, assigned_agent_slug, execution_payload(JSON), output_id→outputs, agent_run_id→agent_runs, last_error. `TimestampMixin`. |
| Migration | `alembic/versions/0008_calendar_events.py` | tabela + índices. |
| Schemas | `schemas.py:494+` | `CalendarEventCreate/Update/Read`, `CalendarGenerateRequest`. |
| Service | `calendar_service.py` | `create_calendar_event`, `generate_calendar_events` (lote editorial via LLM), `generate_press_output`, `execute_calendar_event` (despacha para press/content/research). `EVENT_STATUSES={planned,scheduled,in_progress,completed,cancelled,failed}`. |
| Router | `routers/calendar.py` | `GET /` (lista, brand opcional), `GET /export.ics`, `POST /`, `PATCH /{id}`, `DELETE /{id}` (cancela), `POST /generate`, `POST /{id}/run-now`. Grava `audit_events`. **Sem verificação de propriedade por marca nas rotas por id (IDOR).** |
| Scheduler | `calendar_scheduler.py` | loop 60s; pega `status=scheduled` + `assigned_agent` + `start_at<=now`; **lock Redis `NX` (idempotente)**; executa. Reutilizável para execução automática. |
| Frontend | `apps/web/app/(app)/calendar/page.tsx` | grade mensal, painel do dia, slide-over criar/editar, gerar com IA, export .ics. Marca via `useBrand()` (switcher global já existe). |

**Reuso confirmado (não duplicar):**
- Pesquisa: `research_service.run_market_research(db, ResearchRunRequest) -> Output` (Output `channel="Pesquisa"`).
- Aprovação: endpoint existente `POST /api/outputs/{id}/approve` (+ `index_output_if_research`). **Não** criar segundo sistema.
- Execução como unidade de trabalho: `AgentTask` (task_type, status, input, result, output_id, brand_slug, user_id, metadata_json).
- Auditoria: `audit_service.record_audit_event`.

**Achado de segurança (C1/IDOR do ESTADO):** `User` **não** tem vínculo com marca (só `role`). Logo, isolamento
por marca aqui = a API **exige** `brand_slug` explícito nas rotas sensíveis e **verifica** que o evento pertence
àquela marca (mismatch → 404, sem vazar existência). A visão consolidada (todas as marcas) é permitida na listagem
por ser requisito de produto e time interno único.

---

## 2. Modelo funcional (V1)

Todo evento pertence a **uma marca** e pode encadear agentes. Tipos iniciais: `research`, `content`, `task`,
`meeting`, `event`, `delivery`. O corte vertical entrega **research** ponta a ponta.

**Pipeline (derivado, não duplicado):** `Briefing → Pesquisa → Aprovação → Cocriação → Revisão → Publicação`.
A Cocriação fica **bloqueada** até a Pesquisa ser aprovada. Etapas futuras aparecem desabilitadas — nunca simuladas.

### Estados e transições (evento de pesquisa)
```
draft ─(briefing completo)→ ready ─(executar manual)────────────→ running
  │                           │                                     │
  │                           └─(modo auto + data)→ scheduled ──────┘
  │                                                                 │
(briefing incompleto)                                               ▼
briefing_incomplete                                          awaiting_approval
                                                                    │
                                          (Output aprovado na pág. Pesquisa)
                                                                    ▼
                                                                approved ──→ (cocriação liberada)
running ─(erro)→ failed        qualquer → cancelled
```
- `current_step`: `briefing → research → research_approval → cocreation → review → publish`.
- Aprovação **não** é um novo sistema: `research_approval` é concluída quando `research_output.status == "approved"`
  (lido do Output vinculado). O read do evento deriva `research_approved` e libera visualmente a cocriação.
- Compatibilidade: os estados legados (`planned/in_progress/completed`) do fluxo `generate/run-now` continuam válidos.

---

## 3. Entidades reutilizadas (sem duplicação)

| Necessidade | Reusa | Como |
|---|---|---|
| Conteúdo da pesquisa | `Output` + `OutputVersion` | evento guarda apenas `research_output_id` (referência). |
| Unidade de execução | `AgentTask` | criada ao executar; `metadata_json={calendar_event_id}`; `output_id` vinculado. |
| Briefing estruturado (opcional) | `Briefing` | `briefing_id` nullable (link, não cópia). |
| Aprovação | fluxo `outputs` | status derivado do Output; sem segundo sistema. |
| Trilha | `audit_events` | criar/editar/executar/gate. |
| Autoria | `users` | `created_by`. |

---

## 4. Mudanças de banco (migration `0020_calendar_workflow`)

**Amplia `calendar_events`** (nenhuma tabela nova em V1):

| Coluna | Tipo | Default | Uso |
|---|---|---|---|
| `execution_mode` | VARCHAR(20) NOT NULL | `'manual'` | `manual` \| `auto` |
| `auto_execute_at` | TIMESTAMPTZ NULL | — | quando `auto` |
| `requires_research_approval` | BOOLEAN NOT NULL | `true` | gate da cocriação |
| `current_step` | VARCHAR(40) NOT NULL | `'briefing'` | etapa do pipeline |
| `objective` | TEXT NOT NULL | `''` | objetivo (research) |
| `research_output_id` | INT NULL FK outputs.id | — | Output da pesquisa |
| `content_output_id` | INT NULL FK outputs.id | — | Output da cocriação (futuro) |
| `briefing_id` | INT NULL FK briefings.id | — | briefing estruturado |
| `agent_task_id` | INT NULL FK agent_tasks.id | — | unidade de execução |
| `created_by` | INT NULL FK users.id | — | autoria |

`output_id` legado é mantido (aponta para o mesmo Output da pesquisa, retrocompat). Nada de conteúdo de pesquisa
copiado para `calendar_events`.

---

## 5. Endpoints (criados/alterados)

| Método | Rota | Mudança | Segurança |
|---|---|---|---|
| POST | `/api/calendar` | aceita novos campos; define `created_by`; calcula status/step inicial | valida marca |
| PATCH | `/api/calendar/{id}` | aceita novos campos; recalcula step | `brand_slug` verificado quando enviado |
| GET | `/api/calendar/{id}` | **novo**: detalhe com `steps[]` + `research_approved` derivados | exige+verifica `brand_slug` |
| POST | `/api/calendar/{id}/execute-research` | **novo**: cria `AgentTask`, roda `run_market_research`, vincula `research_output_id`/`agent_task_id`, status→`awaiting_approval` | exige+verifica `brand_slug`; idempotente |
| GET | `/api/calendar` | lista (mantém brand opcional p/ consolidado) + filtros | — |
| POST | `/{id}/run-now`, DELETE, GET .ics | inalterados no contrato; `brand_slug` verificado quando enviado | — |

Aprovação permanece em `POST /api/outputs/{id}/approve` (página do Agente de Pesquisa). Revisão de conteúdo permanece
na página de Cocriação. `/approvals` segue como central de pendências.

---

## 6. Arquivos alterados/criados

**Backend:** `models.py` (colunas), `alembic/versions/0020_calendar_workflow.py` (novo),
`schemas.py` (campos + `CalendarEventDetail`/`CalendarStep`), `calendar_workflow.py` (**novo** — lógica do corte
vertical: criar evento de pesquisa, executar pesquisa, derivar steps, gate de aprovação), `routers/calendar.py`
(rotas novas + brand-scoping), `calendar_scheduler.py` (suporte a `execution_mode=auto`/`auto_execute_at`, mantendo lock).
**Frontend:** `app/(app)/calendar/page.tsx` (views mês/semana/lista, filtros, cards, criação de research, painel com
abas + pipeline + executar pesquisa), `lib/api.ts` (tipos+helpers), `components/app-shell.tsx` (Calendário como 1º item).
**Testes:** `tests/test_calendar_workflow.py` (novo).

---

## 7. Riscos

- **IDOR** (C1): mitigado exigindo+verificando `brand_slug` nas rotas por-id novas; rotas genéricas verificam quando
  enviado (frontend sempre envia). Sem modelo user→marca, é o teto de isolamento possível para time único.
- **Execução dupla**: idempotência via status (`running`/já com `research_output_id`) + lock Redis do scheduler.
- **Créditos/erros de LLM**: reusa `run_market_research` (porta de fontes mínimas → 422; nunca cria Output vazio);
  falha → `status=failed` + `last_error`, sem mascarar.
- **Compatibilidade**: estados/rotas legados preservados; migration aditiva com defaults.

---

## 8. Plano em fases

- **F1 — entregue** (ed1547c+ee2a985): banco + schemas + `calendar_workflow` + rotas + brand-scoping +
  criar/executar/aprovar pesquisa pelo calendário + UI (views, filtros, cards, pipeline, executar pesquisa) + testes.
- **F2 — entregue** (696ddf0): cocriação disparada do evento (reusa `cocreation_service`, consome a pesquisa
  aprovada), vínculo do conteúdo, avanço para Revisão + UI + testes.
- **F3 — entregue** (9aeab9b): automação plena — pausar/retomar (`is_paused`, migration 0021), histórico de
  tentativas (derivado dos `AgentTask`), auto-cocriação após aprovação humana da pesquisa + UI + testes.
- **F4 — entregue** (7b7351d): arquitetura de publicação (migration 0022) — `publishers.py` com `MetaPublisher`
  **stub** (sem integração real, nunca finge sucesso) + `ManualPublisher`; etapa Publicação real gated pela
  aprovação do conteúdo + UI + testes. A integração real com a **Meta** (Graph API + token/OAuth) é o próximo
  passo, plugável em `MetaPublisher.publish` sem tocar no resto do workflow.

---

## 9. Critérios de aceite (rastreamento)

Criar research no calendário • vínculo à marca • briefing persistido • executar pesquisa pelo calendário • agente real •
Output vinculado • status→aguardando aprovação • cocriação bloqueada antes da aprovação • abrir na página de Pesquisa •
UI nova visível • sem vazamento cross-brand • sem mocks • migration • este documento.
