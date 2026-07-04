# Frontend Product V2 — Auditoria e Plano de Acabamento

> **FASE 1 (auditoria) do acabamento de produto.** Data: 2026-07-04. Branch `main` @ `401d7f7`.
> Fonte de verdade de arquitetura: [ESTADO_DO_SISTEMA_2026-07-04.md](ESTADO_DO_SISTEMA_2026-07-04.md).
> Princípio: **reusar** o que existe (calendário workflow F1–F4, outputs/approvals, content_pieces,
> cocreation_service, brand_scope) e **fechar gaps** — sem reescrever agentes, sem 2º sistema de aprovação,
> sem mocks no caminho principal, sem duplicar conteúdo de Output em `calendar_events`.

---

## 0. Objetivo desta etapa

Transformar o sistema numa experiência de produto coerente para o gestor de marketing, com o **Calendário
no centro**, mas com **páginas próprias fortes** para: Operações, Calendário, Agente de Pesquisa, Agente de
Cocriação, Revisão, Publicações, Relatórios e Administração. Em paralelo, fechar os gaps técnicos prioritários
(brand_scope operacional, auditoria admin, sanitização anti-prompt-injection, tracking de web-search,
preparação de Publicações para futura Meta Graph API/OAuth).

---

## 1. Estado atual — Navegação

Definida em [`apps/web/components/app-shell.tsx`](../apps/web/components/app-shell.tsx) (linhas ~26–34),
consumida no layout autenticado [`apps/web/app/(app)/layout.tsx`](../apps/web/app/(app)/layout.tsx)
(que injeta `BrandProvider` + `AppShell`).

| # | Label atual | Rota | Observação |
|---|---|---|---|
| 1 | Calendário | `/calendar` | Centro operacional (workflow F1–F4). |
| 2 | Operações | `/operations` | Hoje concentra Orquestrador + Kanban de pesquisa + **Cocriação inline**. |
| 3 | Memória | `/memory` | Documentos + temas + RAG. |
| 4 | Revisão | `/approvals` | Aprovação de conteúdos/pesquisas. |
| 5 | Relatórios | `/relatorios` | Métricas/custos (gráficos SVG). |
| 6 | Administração | `/admin` | Agentes, modelos, skills, automações, permissões. |

Seletor de marca no header (linhas ~333–348), via `useBrand()` + `localStorage("duofy.brand")`.
Header também tem: `GlobalSearch` (busca outputs+memória), `BellPopover` (`/api/operations/audit-events`),
`UserMenu`.

**Navegação-alvo V2 (8 itens):** Operações · Calendário · Agente de Pesquisa · Agente de Cocriação ·
Revisão · Publicações · Relatórios · Administração.

**Decisão sobre "Memória":** não está na lista-alvo de 8 itens. É uma página real e valiosa (RAG). Plano:
**rebaixar para item secundário** (link no rodapé da sidebar e/ou dentro de Administração), sem removê-la.
Não perder a rota `/memory`.

---

## 2. Estado atual — Páginas

`apps/web/app/(app)/**/page.tsx`. Nenhum framework de teste JS (sem jest/vitest/playwright) →
"testes de frontend" = `next build` + `next lint`.

| Rota | Arquivo | Estado | O que é hoje |
|---|---|---|---|
| `/operations` | `operations/page.tsx` (638) | **Completa** | Orquestrador (chat) + Kanban de pesquisas + **Cocriação unificada** (Lista/Foco) + `PiecesReview`. |
| `/calendar` | `calendar/page.tsx` (637) | **Completa** | Mês/semana/lista, filtros, `EventDetailPanel` (564) com pipeline F1–F4. |
| `/approvals` | `approvals/page.tsx` (328) | **Completa** | Tabs Todos/Pesquisas/Conteúdos; aprovar/ajustar/arquivar/PDF. |
| `/memory` | `memory/page.tsx` (816) | **Completa** | Docs + temas + busca RAG. |
| `/admin` | `admin/page.tsx` (1124) | **Completa** (parcial mock) | Agentes/skills/modelos/automações/permissões/integrações. |
| `/admin/agents` | `admin/agents/page.tsx` | Completa | Gestão de agentes. |
| `/admin/config` | `admin/config/page.tsx` | Completa | Provedores/credenciais. |
| `/relatorios` | `relatorios/page.tsx` (283) | **Completa** | KPIs + gráficos (dados reais de `/api/metrics`). |
| `/research` | `research/page.tsx` | **Redirect → /operations** | **Sem página própria** (a criar — FASE 5). |
| `/content` | `content/page.tsx` | **Redirect → /operations** | **Sem página própria** (Cocriação — FASE 6). |
| `/chat` | `chat/page.tsx` | Redirect → /operations | Chat = orquestrador. |
| `/dashboard` | `dashboard/page.tsx` | Redirect → /operations | — |
| `/costs`,`/insights` | — | Redirect → /relatorios | — |
| `/redes` | `redes/page.tsx` | Redirect (oculto) | Mock Meta/Ads desligado. |
| `/workspace` | `workspace/page.tsx` | Stub vazio | — |
| **Publicações** | — | **Não existe** | A criar (FASE 9). |

---

## 3. Componentes reutilizáveis (base para V2)

| Componente | Arquivo | Reuso em V2 |
|---|---|---|
| `Badge`,`Dot`,`StatCard`,`Tabs`,`Segmented`,`Avatar`,`GhostButton` | `components/ui.tsx` | **Todas** as telas (cards de resumo, abas, filtros segmentados). |
| `Markdown` (zero-dep, XSS-safe) | `components/markdown.tsx` | Prévia de conteúdo/pesquisa em toda parte. |
| `DonutChart`,`AreaLineChart`,`HBarChart`,`Legend` | `components/charts.tsx` | Relatórios V2. |
| ícones (30+) | `components/icons.tsx` | Nav + botões. |
| `EventDetailPanel` (564) | `calendar/EventDetailPanel.tsx` | Painel lateral do Calendário V2 (abas + pipeline). |
| `CocreationPanel` (394) | `operations/CocreationPanel.tsx` | Base da **página Cocriação V2** (extrair de operations). |
| `PiecesReview` (159) | `operations/PiecesReview.tsx` | Revisão de peças (FASE 7) + painel do evento. |
| `BriefingPanel` (139) | `operations/BriefingPanel.tsx` | Briefing do Orquestrador (Operações V2) + Cocriação. |
| `ThemePicker` (39) | `operations/ThemePicker.tsx` | Nova pesquisa (FASE 5). |
| `page-primitives.tsx` (`.duofy-card`,`.duofy-scroll`) | `components/page-primitives.tsx` | Layout consistente. |

**Camada de dados:** `lib/api.ts` (`apiFetch` mesma-origem, `credentials:"include"`, sem Bearer; ~100 tipos
+ helpers de calendar/cocreation/pieces) · `lib/brand-context.tsx` (`useBrand`) · `lib/auth.ts` (cookie flag)
· `middleware.ts` (proteção de rotas — **atualizar allowlist** com novas rotas).

---

## 4. Endpoints existentes que já atendem as novas telas

| Tela V2 | Endpoints reais disponíveis |
|---|---|
| **Operações** | `/api/operations/summary`,`/agent-health`,`/quality-reviews`,`/audit-events`; `/api/orchestrator/plan`,`/plan-research`,`/plan-from-theme`,`/briefings/{id}`,`/approve`; `/api/metrics/summary`. |
| **Calendário** | `/api/calendar` (CRUD, `{id}`, `execute-research`,`execute-cocreation`,`publish`,`pause`,`resume`,`run-now`,`generate`,`export.ics`) — todos com isolamento por-id. |
| **Agente de Pesquisa** | `/api/research/run`,`/reports`,`/reports/{id}`,`/save-memory`,`/use-in-content`; `/api/orchestrator/research-models`; `/api/outputs/{id}` (+approve/reject/request-adjustment/pdf/export). |
| **Agente de Cocriação** | `/api/cocreation/generate`,`/{id}/refine`,`/{id}`; `/api/content/generate`,`/outputs`,`/{id}/refine`,`submit-review`; `/api/outputs/{id}/pieces` (+ `pieces/{id}` PATCH/DELETE/status). |
| **Revisão (peças)** | `/api/outputs/{id}/pieces`,`pieces/{id}/status`; `/api/outputs/{id}` (versions/compare/comments/quality-review). |
| **Central de Revisão** | `/api/outputs` (list, `accessible_brands`), `/api/research/reports`, `/api/calendar`, `/api/operations/quality-reviews`. |
| **Publicações** | `/api/calendar/{id}/publish?target=meta|manual` (Meta=stub honesto; manual=registra). |
| **Relatórios** | `/api/metrics/summary`,`/model-calls`; `/api/reports` (+ generate/pdf/export). |
| **Administração** | `/api/admin/users`,`/users/{id}/brand-scope` (PUT, **auditado**), `/agents`,`/providers`,`/quality-settings`,`/agent-settings`. |

---

## 5. Endpoints que faltam (a criar)

| Área | Falta | Prioridade |
|---|---|---|
| **Publicações — canais** | Cadastro/estado de canais Meta (IG/FB): `GET/POST /api/publications/channels`, status connected/pending/expired/error. | Alta (FASE 9). |
| **Publicações — mídia** | Upload de mídia (imagem/vídeo/carrossel) gerada fora do sistema: `POST /api/publications/media`. | Alta (FASE 9). |
| **Publicações — fila** | Fila/montagem de publicação (rascunho/agendada/publicada/erro): `GET/POST /api/publications`, agendamento (data/hora/fuso), tipo (Feed/Stories/Reels), 1º comentário, hashtags. | Alta (FASE 9). |
| **Publicações — Meta real** | OAuth/Graph API em `MetaPublisher.publish` (plugável, sem tocar no workflow). | **Futuro** (stub honesto agora). |
| **Admin — auditoria** | `record_audit_event` em `PUT /quality-settings`,`/agent-settings`,`/providers/{provider}`. | Alta (FASE 12/V1). |
| **Admin — limites** | Persistir rate-limits/orçamentos + alertas (hoje `agent-settings` cobre budgets/depth; falta alertas). | Média (FASE 11). |
| **Relatórios** | Tempo médio de aprovação (não há timestamp de decisão consultável de forma agregada); custo por modelo/provedor já existe. | Média (FASE 10). |

> **Nota de escopo Publicações:** a decisão de modelagem (novo router `publications` + tabelas `channels`,
> `publications`, `publication_media` **vs.** ampliar `calendar_events`) está detalhada em
> `docs/PUBLICATIONS_META_PREP_V1.md` (a criar). Preferência: **router próprio**, reusando `content_pieces`
> como fonte de conteúdo aprovado e mantendo `MetaPublisher` como o único ponto de integração real futura.

---

## 6. Dados reais vs stub

**Reais (caminho principal):** login/me (cookie HttpOnly) · brands · orchestrator (briefing síncrono) ·
research `run`/reports (coleta web multi-ângulo real + fontes) · outputs/versions/approvals/comments/quality ·
content_pieces · cocreation generate/refine · calendar workflow F1–F4 (execução real de pesquisa/cocriação) ·
documents/RAG · metrics (`ModelCall`: tokens/custo/latência real) · audit-events.

**Stub / dormente / ausente (honesto):**
- **`MetaPublisher`** — `publishers.py:43–53` levanta `PublisherNotConfigured` (nunca finge sucesso). `ManualPublisher` registra publicação externa. **Manter stub**; construir a UI/arquitetura ao redor.
- **`brand_scope`** — pronto porém **dormente** (nulo = acesso total). Falta atribuir escopos + aplicar em calendar/research/operations.
- **Web-search** (`_openrouter_web_search`, research_service ~532) — httpx cru, **fora de `ModelCall`** (custo invisível).
- **Métricas sociais** (tráfego pago/alcance orgânico/impressões) — inexistentes (dependem da Meta real).
- **Admin (frontend)** — abas de **automações/integrações/permissões** são majoritariamente visuais/mock (sem persistência real).
- **`/redes`, `/workspace`** — redirect/stub.

---

## 7. Gaps técnicos de segurança (mapeamento fiel ao código)

| ID (ESTADO) | Gap | Arquivo:local | Ação |
|---|---|---|---|
| **C1** | brand_scope não aplicado em **calendar / research / operations** (só outputs/documents/pieces usam `assert_brand_access`/`accessible_brands`) | `access.py`; `routers/calendar.py`,`research.py`,`operations.py` | Aplicar `assert_brand_access`/`accessible_brands` + testes cross-brand. Setter admin já existe e é auditado. |
| **V1** | `PUT /admin/quality-settings`,`/agent-settings`,`/providers/{provider}` **não auditam** | `routers/admin.py:156–169, 215–227, 231–263` | `record_audit_event` em cada (chaves de provedor incluídas, sem vazar segredo). |
| **V4** | prompt injection: `theme`/`period`/`brand.description`/`rag_context` sem sanitização | `research_service.py:_user_prompt (~718–781)` | `sanitize_prompt_input()` (remove instruções suspeitas, limita tamanho, preserva conteúdo útil) + testes. |
| **V5** | web-search fora do tracking | `research_service.py:_openrouter_web_search (~532)`; `llm.py:call_llm (~160)` / `record_model_call (~232)` | Registrar `ModelCall` (tokens/custo/latência/status) para as chamadas de web-search. |
| **V2 (parcial)** | `GET /admin/providers` já retorna `has_api_key` + `masked_api_key` (não a chave) | `routers/admin.py` | Aceitável; opcional remover a máscara e deixar só `has_api_key`. |
| **npm audit** | vulns Next.js | `apps/web` | Rodar em tarefa isolada; sem upgrade arriscado sem `next build` verde. |

---

## 8. Regra crítica da Cocriação (preservar)

A Cocriação **não** é sempre travada. Confirmado no código (`calendar_workflow.py:execute_cocreation` ~303–402):
o gate `research_status == APPROVED or not event.requires_research_approval` é uma propriedade **do evento**.

- **Cocriação avulsa** (`/api/cocreation/generate` / `/api/content/generate` com briefing manual ou
  `research_output_id`, **sem evento**): roda normalmente — **comportamento desejado** (não é bug).
- **Cocriação vinculada a evento** com `requires_research_approval=true`: só libera após a pesquisa vinculada
  ficar `approved`. Bloqueio **apenas nesse evento**.

→ **Não** adicionar gate à página geral de Cocriação nem ao endpoint avulso. O "V5/gating" que a auditoria
automática sugeriu **contraria a especificação de produto** e não deve ser implementado.

---

## 9. Plano de alteração por página

- **FASE 2 — Navegação:** `app-shell.tsx` → 8 itens na ordem-alvo; Memória vira secundária; atualizar
  `middleware.ts` (novas rotas protegidas). Calendário permanece central; Operações deixa de ser o local de cocriação pesada.
- **FASE 3 — Operações V2 (`operations/page.tsx`):** virar **dashboard + orquestrador**. Cards de resumo
  (pesquisas ativas, conteúdos em produção, aprovações pendentes, agendadas, concluídas), bloco do
  Orquestrador (chat + atalhos: criar evento / abrir pesquisa / abrir cocriação / ver revisão), atividades
  recentes, pendências, pipeline, saídas recentes, alertas, sugestões IA. **Remover** a cocriação inline
  (migra para FASE 6).
- **FASE 4 — Calendário V2 (`calendar/page.tsx` + `EventDetailPanel.tsx`):** consolidar mês/semana/lista +
  filtros (marca/tipo/status/canal/modo/período) + cards; painel lateral com abas (Visão geral, Briefing,
  Fluxo, Pesquisa, Peças, Automação, Histórico); botões por status; peças/subpeças no painel. Reusar workflow — **não** reimplementar.
- **FASE 5 — Agente de Pesquisa (`research/page.tsx` — deixar de ser redirect):** (A) Nova pesquisa
  (templates + formulário completo + contexto + recentes) e (B) Resultado (resumo/insights/concorrentes/
  objeções/ideias/fontes/evidências/recomendações + botões aprovar/ajustes/memória/enviar p/ cocriação/
  abrir evento/PDF). Reusa `/api/research/*` + `/api/outputs/*`.
- **FASE 6 — Agente de Cocriação (`content/page.tsx` — deixar de ser redirect):** extrair `CocreationPanel`
  para página própria. Briefing manual **ou** pesquisa aprovada vinculada; abas por canal; preview/roteiro/
  prompts visuais/direção de arte/A-B; botões gerar/pacote/rascunho/enviar revisão. **Aviso** de que pode
  começar avulsa. Sistema **não** gera imagem final (só prompts visuais/direção).
- **FASE 7 — Revisão de peças:** aprimorar `PiecesReview` (aprovar/ajustar/regenerar peça individual;
  bloquear avanço sem obrigatórias; comentários/versões/Guardião/alertas). Reusar outputs/decisions/comments/pieces.
- **FASE 8 — Central de Revisão (`approvals/page.tsx`):** visão consolidada de pendências (pesquisas/
  conteúdos/publicações/eventos) + filtros + ações em lote + **abrir no local certo** (pesquisa→Pesquisa,
  conteúdo→Cocriação, publicação→Publicações, evento→Calendário).
- **FASE 9 — Publicações (nova):** canais conectados + estado; fila; seleção de conteúdo aprovado; **upload
  de mídia**; montagem (mídia/legenda/1º comentário/hashtags/tipo Feed·Stories·Reels); agendamento; modo
  manual/automático; preview; logs. Meta sem config → "Integração Meta pendente". Backend novo (§5).
- **FASE 10 — Relatórios V2 (`relatorios/page.tsx`):** filtros + cards + gráficos + insights + export;
  **estados vazios** onde não há dado real (nada inventado no caminho principal).
- **FASE 11 — Administração V2 (`admin/page.tsx`):** **brand_scope por usuário** (selecionar usuário →
  marcas permitidas → salvar → audit_event), provedores (só `has_api_key`/máscara), limites/alertas,
  integração Meta (stub honesto), **logs de auditoria** (listar/filtrar).
- **FASE 12 — Segurança:** itens da §7 (C1 em calendar/research/operations, V1 auditoria, V4 sanitização,
  V5 tracking) + testes.

---

## 10. Riscos de regressão

- **Nav/rotas:** trocar redirects (`/research`,`/content`) por páginas reais pode quebrar links/middleware — atualizar `middleware.ts` e `app-shell` juntos; manter `/operations` como home.
- **Extrair cocriação de Operações:** `operations/page.tsx` é grande e acopla Kanban+Cocriação+Orquestrador — extrair com cuidado para não perder `PiecesReview`/refino. Preservar `/api/cocreation` e `/api/content`.
- **brand_scope em calendar/research:** aplicar `assert_brand_access` pode transformar respostas antes-permissivas em 404 — cobrir com testes e manter "todas as marcas" para escopo nulo (time interno).
- **Auditoria admin:** garantir que `record_audit_event` não quebre o fluxo em erro (best-effort, não bloquear a ação).
- **Sanitização de prompt:** não descartar conteúdo legítimo (temas com "ignore" etc.) — limitar/neutralizar, não remover agressivamente; testes com casos benignos.
- **Publicações backend:** migrações novas — aditivas, com defaults; não tocar em `outputs`/`calendar_events` além do necessário.
- **185 testes atuais:** cada slice roda `ruff` + `pytest` + `next build`/`lint` antes de commit.

---

## 11. Ordem de implementação (recomendada)

Sequência por dependência e menor risco de regressão, entregue em **fatias commitáveis**:

1. **Hardening backend + ativação C1** (FASE 12 parcial): V1 (auditoria admin), V4 (sanitização), V5
   (tracking web-search), C1 em calendar/research/operations. Testável, baixo risco, requisito dos aceites 16/17. → doc `ADMIN_SECURITY_HARDENING_V1.md`.
2. **Navegação V2** (FASE 2): shell + middleware. Fundação de todo o frontend.
3. **Operações V2** (FASE 3): dashboard + orquestrador (remove cocriação inline).
4. **Agente de Pesquisa** (FASE 5) e **Agente de Cocriação** (FASE 6): páginas próprias.
5. **Calendário V2** (FASE 4) + **Revisão de peças** (FASE 7) + **Central de Revisão** (FASE 8).
6. **Publicações** (FASE 9: backend canais/mídia/fila + UI) → doc `PUBLICATIONS_META_PREP_V1.md`.
7. **Administração V2** (FASE 11: brand_scope UI + auditoria + limites) e **Relatórios V2** (FASE 10).
8. **Testes finais** + `npm audit` (relatório) + verificação (`ruff`/`pytest`/`next build`).

---

## 12. Plano de testes (por fatia)

Backend (`apps/api`, pytest — harness S0, `patch_ai`): brand_scope via admin; bloqueio cross-brand em
calendar/research/operations; audit_event em quality-settings/agent-settings/providers/brand-scope;
sanitização de prompt injection (benigno preservado, malicioso neutralizado); tracking de web-search em
`ModelCall`; cocriação avulsa liberada; cocriação vinculada bloqueada→liberada pós-aprovação; peças
obrigatórias aprovadas → pacote; publicação manual registrada; Meta stub não finge sucesso.
Frontend: `next build` + `next lint` (sem runner JS). Comando geral: `ruff check app alembic` + `pytest` + `next build`.

---

## 13. Documentos a criar (aceite 20)

- `docs/FRONTEND_PRODUCT_V2_PLAN.md` — **este** (auditoria + plano).
- `docs/PUBLICATIONS_META_PREP_V1.md` — modelagem de Publicações/Canais + contrato de integração Meta futura.
- `docs/ADMIN_SECURITY_HARDENING_V1.md` — C1 operacional, auditoria admin, sanitização, tracking web-search.
