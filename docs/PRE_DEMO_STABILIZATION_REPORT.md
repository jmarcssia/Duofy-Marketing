# Relatório de Estabilização Pré-Demo — 2026-07-06

> Branch: **`feature/pre-demo-stabilization-2026-07-06`** (a partir de `main @ 07eab81` + working tree V3).
> Base: correções priorizadas a partir de `AUDITORIA_VERDADE_DUOFY_2026-07-06.md`.
> Objetivo: demo profissional, honesta e estável em 07/07 14h; **sem** Meta real, **sem** reescrita
> de arquitetura, **sem** IA em massa.

---

## 1. O que foi corrigido

### P0 (bloqueadores de demo)

| # | Correção | Arquivos |
|---|---|---|
| P0.0 | Branch de trabalho criada; `.playwright-mcp/` adicionado ao `.gitignore` | `.gitignore` |
| P0.1 | **Credenciais removidas do login** (e-mail/senha pré-preenchidos + texto do seed) | `apps/web/components/login-form.tsx` |
| P0.2 | **Badge de notificações** agora mostra contagem **real** (busca no mount, começa em 0) | `apps/web/components/app-shell.tsx` |
| P0.2 | **"Ajuda e suporte"** (apontava para `/admin`) removido da navegação | `apps/web/components/app-shell.tsx` |
| P0.2 | **Tabela de papéis** trocada pelos **2 papéis reais** (Administrador/Gerente de marca) + nota de roadmap | `apps/web/app/(app)/admin/page.tsx` |
| P0.3 | **Evento de conteúdo não nasce travado**: gate de pesquisa só se aplica a eventos com pesquisa (frontend força `requires_research_approval=false`; backend reforça no `create_calendar_event`) | `apps/web/app/(app)/calendar/page.tsx`, `apps/api/app/calendar_service.py` |
| P0.4 | **Dados de demo curados**: todas as 3 marcas com jornada completa (1 cocriação real barata p/ DeathCare; aprovação de peças p/ Duofy) | banco dev (documentado em §4) |
| P0.5 | **Roteiro seguro de demo** | `docs/DEMO_SEGURA_14H_2026-07-07.md` |

### P1 (fechados nesta rodada)

| # | Correção | Arquivos |
|---|---|---|
| P1.1 | **Perímetro de brand_scope fechado** em memory (lista+busca), reports, metrics, press/generate, agents/run, orchestrator (plan* + briefings get/approve), themes, research-themes, chat | `app/routers/{memory,reports,metrics,press,agents,orchestrator,themes,research_themes,chat}.py`, `app/rag.py`, `app/metrics_service.py` |
| P1.1 | **operations/summary**: `quality_reviews` e `total_decisions` agora escopados por marca (join com Output) | `app/operations_service.py` |
| P1.2 | **Scheduler legado gate-ado**: respeita `is_paused` e **não** executa eventos de pesquisa (que devem passar pelo gate de aprovação) | `app/calendar_scheduler.py` |
| P1.3 | **`/api/research/run`** devolve **422** (não 502) em fontes insuficientes, com mensagem acionável | `app/routers/research.py` |
| P1.4 | **Polling 4xx**: rejeição rápida do backend mostra a mensagem na hora (fim do spinner de 210s) | `apps/web/app/(app)/calendar/EventDetailPanel.tsx` |
| P1.5 | **Divergência peça↔pacote**: export/PDF agora **inclui as peças atuais** (fonte de verdade) e **avisa** quando o pacote está defasado por refino individual | `app/routers/outputs.py` |
| P1.6 | **Publicações**: recusa output **não aprovado**; valida **marca cruzada** de `channel_id`/`output_id`; valida **magic bytes** no upload; rejeita `media_paths` fora de `storage/media` | `app/routers/publications.py` |

### Testes adicionados
- `apps/api/tests/test_predemo_fixes.py` — **15 testes** cobrindo: gate de evento de conteúdo,
  perímetro brand_scope (memory/reports/metrics/themes/research-themes/orchestrator/press), 422 de
  fontes insuficientes, publicações (output aprovado, marca cruzada, media_path) e divergência de export.

---

## 2. Resultados dos comandos (preenchido em §6 após execução final)

- `ruff check app alembic` — ✅ limpo.
- `pytest` — ver §6 (esperado: 304 anteriores + 15 novos).
- `next lint` / `tsc --noEmit` / `next build` — ✅.
- `npm audit --audit-level=moderate` — **5 vulnerabilidades (4 altas, 1 moderada)** no Next.js;
  fix exige `next@16` (breaking) → **não aplicado** (débito consciente, tarefa isolada).
- `alembic current` — `0027_calendar_event_dates (head)`; **nenhuma migração nova** (correções não
  exigiram schema).

---

## 3. Chamadas reais de IA feitas nesta rodada

- **1 cocriação real** para DeathCare (curadoria de dados): `openai/gpt-4o-mini`, depth `quick`,
  ~63s, **11.986 tokens, ≈ US$ 0,0025**. Output #72 aprovado com peças.
- Nenhuma outra execução de IA real. Testes automatizados continuam 100% mockados (custo zero).

---

## 4. Estado real por área (honesto)

- **Meta:** stub honesto (400 "em breve"). **Não** integrada. Publicação manual funciona.
- **Segurança por marca:** núcleo **e** perímetro periférico agora escopados (validado ao vivo com
  o usuário `manager.deathcare`: memory/metrics/reports não vazam mais). Resíduos: `agents/runs`
  (lista sem coluna de marca — não filtrável sem migração; o `/run` já bloqueia exfiltração de RAG)
  e `operations.total_agent_runs` (contador global, sem conteúdo).
- **Publicação manual:** funcional e auditada; agora exige conteúdo **aprovado** e refs da **mesma marca**.
- **IA assíncrona:** ainda síncrona; mitigada por polling (agora com erro rápido tratado).
- **Divergência peça↔pacote:** mitigada no export (inclui peças + aviso). A sincronização total do
  `structured_json` continua roadmap (Opção A completa).

## 5. O que ficou pendente (não feito nesta rodada — ver ROADMAP_POS_DEMO.md)
- Sanitização de prompt fora do fluxo de pesquisa (cocriação/conteúdo/calendário/press/orquestrador/
  guardião/evidência web) — **Fase 3 do plano não executada** por priorização de tempo/risco.
- `FERNET_SECRET_KEY` no deploy; correção do DEPLOY.md (seed manual); rate-limit no login.
- Worker de lembrete/recorrência; publicação agendada automática.
- Sincronização completa peça→pacote (structured_json/markdown).
- Testes de frontend (Playwright/Vitest); upgrade Next 16.
- Auditoria em PATCH de publicação e upload de mídia (gaps menores).

## 6. Verificação final (executada 2026-07-06)

| Comando | Resultado |
|---|---|
| `ruff check app alembic` | ✅ **All checks passed** |
| `pytest -q` | ✅ **319 passed, 2 skipped** (386s) — 304 anteriores + 15 novos; skips = WeasyPrint |
| `next lint` | ✅ sem erros |
| `npx tsc --noEmit` | ✅ sem erros |
| `next build` | ✅ 24 rotas |
| `npm audit --audit-level=moderate` | ⚠️ **5 vulns (4 high, 1 moderate)** — Next.js; fix = next@16 (breaking); **não aplicado** |
| `alembic current` | `0027_calendar_event_dates (head)` — nenhuma migração nova |

**Verificação ao vivo (API dev, usuário `manager.deathcare`):** memory/metrics/reports não vazam mais
outras marcas; `memory?brand=postos` → 404; evento `content` nasce com gate OFF; publicação de output
não aprovado → 400; `media_paths` fora de storage → 400. Todos confirmados.

**Custo de IA real nesta rodada:** ≈ **US$ 0,0025** (1 cocriação `gpt-4o-mini` para curar DeathCare).
