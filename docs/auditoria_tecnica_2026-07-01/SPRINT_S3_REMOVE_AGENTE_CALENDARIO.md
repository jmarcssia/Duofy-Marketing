# Sprint Núcleo de Agentes — S3: Remoção do Agente Calendário (concluído)

**Objetivo:** remover o Calendário do roster de agentes, mantendo-o como **módulo controlado pelo usuário** (CRUD) e **ferramenta do Orquestrador** (`create_calendar`).

## Mudanças
- **`config/seeds/agents.yaml`** — removida a entrada `calendar_agent`. Roster em direção à consolidação (metrics será rebaixado na etapa de Admin).
- **`calendar_service.py`**
  - `generate_calendar_events` agora usa o agente **`orchestrator`** para resolver provider/modelo (o calendário é módulo do Orquestrador). O prompt e o limite continuam vindo das chaves de config `calendar_agent` (agora só config de módulo, não um agente do roster). A atividade é registrada com `agent_slug="calendar"`.
  - `AGENT_SLUGS` (executores de evento) = `{content_agent, press_agent, research_agent}` (sem `calendar_agent`).
- **`routers/calendar.py`** — rótulo de auditoria de evento gerado passa a `"calendar"` quando não há agente atribuído.
- **`apps/web/.../calendar/page.tsx`** — lista de agentes atribuíveis alinhada aos executores: `["", content_agent, research_agent, press_agent]`.

O que **permanece**: CRUD de eventos, execução por conteúdo/pesquisa/imprensa, export `.ics`, e a tool `create_calendar` do grafo do Orquestrador.

## Teste
- `test_flow_calendar.py::test_calendar_generate_runs_via_orchestrator_module` — sem `calendar_agent`, a geração usa o Orquestrador, produz eventos e é rotulada `calendar` (provider `openrouter`).
- `test_calendar_crud_roundtrip` (do S0) continua verde — protege o módulo do usuário.

## Estado
```
87 passed, 2 skipped   ·   ruff check app → All checks passed!
```
Refs a `calendar_agent` remanescentes são intencionais: `read_agent_prompt("calendar_agent")` e `get_token_budget(db, "calendar_agent")` — chaves de **config do módulo**, não um agente do roster.
