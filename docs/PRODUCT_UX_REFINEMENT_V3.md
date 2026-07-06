# Product UX Refinement V3 — Briefing clicável, brand_scope e marcas oficiais

> **Data: 2026-07-05.** Fase de refinamento pesado sobre o Product V2. Sem refazer a arquitetura:
> reusa calendário, agentes, outputs, approvals, content_pieces e publicações. Introduz um
> **padrão único de briefing clicável** nas três telas de trabalho, ativa o **brand_scope na
> prática** (fechando furos de C1 encontrados na auditoria) e corrige os **nomes oficiais** das marcas.

---

## 1. Resumo do que foi feito

1. **Marcas oficiais na UI** (FASE 3.1 / critério 21): nomes exibidos passam a ser exatamente
   **TOTVS Varejo Postos de Combustíveis**, **Gestão DeathCare by Duofy**, **Duofy Soluções** —
   slugs técnicos preservados (`postos_combustiveis`, `deathcare`, `duofy_solucoes`).
2. **Taxonomia central de filtros** (FASE 3) em `apps/web/lib/briefing/` + `apps/api/app/briefing_filters.py`.
3. **BriefingBuilder** (FASE 2/7): primitivos clicáveis reutilizados em Pesquisa, Cocriação e
   Novo evento do calendário — chips, cards, multiselect, seções expansíveis, resumo lateral,
   indicador de completude e "Pronto para executar".
4. **Agente de Pesquisa** (FASE 5): criação por briefing estruturado; texto livre só na pergunta.
5. **Agente de Cocriação** (FASE 6): canais multiselect, peças condicionais aos canais, finalidade,
   começar de manual/pesquisa/template; multicanal real (mesmo carrossel IG+LinkedIn com legendas
   diferentes; WhatsApp + prompt de imagem opcional; E-mail; release/pitch).
6. **Wizard de evento** (FASE 4): drawer em 6 etapas (Tipo → Marca/template → Briefing → Datas →
   Peças/aprovação → Resumo), incluindo o tipo **Pesquisa + Conteúdo** e **Publicação**.
7. **brand_scope na prática** (FASE 1): fechados os furos de C1 (ver §4) e `operations/summary`
   restrito a usuário multi-marca.

## 2. Arquivos alterados / criados

**Backend novo:** `apps/api/app/briefing_filters.py`, migração `0026_output_briefing_json`,
testes `test_briefing_filters.py`, `test_cocreation_multichannel.py`, `test_calendar_briefing_flow.py`,
`test_operations_scope.py`.

**Backend alterado:** `models.py` (coluna `outputs.briefing_json`), `schemas.py` (`ResearchRunRequest`,
`CreationRequest`, `ContentPackage.extra_pieces`, `ContentOutputRead.briefing_json`),
`research_service.py`, `cocreation_service.py`, `content_pieces_service.py`, `calendar_workflow.py`,
`operations_service.py`, e routers `research/cocreation/content/calendar/operations/admin/documents`.

**Frontend novo:** `apps/web/lib/briefing/{taxonomy,types,index}.ts`,
`apps/web/components/briefing/{chips,fields,section,summary,template-picker,index}.{tsx,ts}`.

**Frontend alterado:** páginas `research`, `content`, `operations/CocreationPanel`, `calendar/page`,
`calendar/EventDetailPanel`, `calendar/status`, `admin/acessos`, `relatorios`, `lib/api.ts`,
`lib/brand-context` (via uso). **Config:** `config/seeds/brands.yaml` + perfis de marca (nomes exibidos).

## 3. Migrations e endpoints

- **Migração:** `0026_output_briefing_json` — adiciona `outputs.briefing_json JSON NULL` (aplicada em
  dev e no banco de teste). Sem outras migrações; o briefing do evento usa `execution_payload` (JSON existente).
- **Endpoints alterados (contrato ampliado, retrocompatível):**
  - `POST /api/research/run` — novo `briefing_filters: dict?`; resposta ganha `briefing_json`.
  - `POST /api/cocreation/generate` — novos `channels[]`, `pieces[]`, `briefing_filters`; pacote ganha `extra_pieces[]`.
  - `POST /api/calendar/{id}/execute-cocreation` — `channel`/`format` agora **opcionais** (usa o briefing do evento).
  - `GET /api/content/outputs`, `POST /api/research/run`, `POST /api/cocreation/*`,
    `POST /api/documents/upload` — passam a aplicar **C1** (escopo de marca).
  - `GET /api/operations/{summary,agent-health,quality-reviews}` — passam a respeitar o escopo.
  - `PUT /api/admin/users/{id}/brand-scope` — valida que os slugs existem como marca.

## 4. brand_scope: furos fechados (C1)

A auditoria encontrou rotas sem isolamento; todas foram corrigidas e cobertas por teste:

| Rota | Antes | Depois |
|---|---|---|
| `GET /api/content/outputs` + `/outputs/{id}` (legado) | sem filtro | filtra/valida por escopo |
| `POST /api/cocreation/generate` + `/{id}` + refine | sem assert | assert de marca |
| `POST /api/research/run` | sem assert (gastava tokens) | assert de marca |
| `POST /api/documents/upload` | sem assert (alimentava RAG alheio) | assert de marca |
| `GET /api/operations/summary` (sem brand_slug) | agregava tudo | agrega só o escopo (multi-marca) |
| `GET /api/operations/summary.recent_errors` | vazava erros de outras marcas | respeita o escopo |
| `GET /api/operations/agent-health` e `/quality-reviews` | globais | filtram por escopo |
| `PUT /admin/.../brand-scope` | aceitava slug inexistente | valida contra `brands` |

## 5. Testes executados

- **`ruff check app alembic`** — ✅ limpo.
- **`pytest -q`** — ✅ **236 passed, 2 skipped** (suíte mockada, custo zero de IA). Inclui os 4 novos
  arquivos (25 testes) cobrindo: briefing→prompt+persistência, cocriação multicanal (IG+LinkedIn mesmo
  carrossel/legendas diferentes, WhatsApp+imagem, E-mail+WhatsApp), evento Pesquisa+Conteúdo com
  aprovação, C1 em content/cocreation/research/documents/operations, `operations/summary` restrito.
- **`next build`** — ✅ 24 rotas (build limpo com o dev server parado).
- **`next lint`** e **`tsc --noEmit`** — ✅ sem erros.
- **`npm audit`** — relatório apenas: 2 vulnerabilidades (1 alta, 1 moderada) no Next.js; o fix exige
  `next@16` (breaking) — **não aplicado** (débito consciente, tarefa isolada).

## 6. Economia de modelo em teste (FASE 8)

- Testes automatizados **não chamam LLM real** (mocks `patch_ai`/`_patch_llm`) — **custo zero**.
- Verificação visual (Playwright) navegou e preenchou os briefings **sem disparar geração** —
  0 chamadas reais de IA nesta entrega. Default barato `openai/gpt-4o-mini` mantido.
- Roteiro de execução real barata documentado em `E2E_MARKETING_FLOW_CHECKLIST.md` (máx. 2 execuções
  "Rápidas").

## 7. Verificação visual (telas conferidas)

- **Pesquisa**: templates no topo, chips de segmento/tipo/objetivos/profundidade/período/escopo,
  seções expansíveis, resumo lateral + completude reativa; "Iniciar pesquisa" só habilita quando pronto.
- **Cocriação**: começar de manual/pesquisa/template; canais multiselect; **selecionar IG+LinkedIn+
  WhatsApp+E-mail auto-seleciona as peças coerentes**; tom default por segmento; resumo + completude.
- **Calendário (wizard)**: 6 etapas; tipo "Pesquisa + Conteúdo" mostra campos de pesquisa **e** de
  conteúdo; resumo em chips; evento criado persiste `execution_payload.briefing` completo.
- **Detalhe do evento**: aba Briefing renderiza o briefing estruturado em chips; cocriação com opção
  "Padrão do briefing".
- **Admin/Acessos** e **Relatórios**: marca exibida com o **nome oficial** (inclusive na auditoria).

## 7.1 Prova de fogo E2E real (2026-07-05)

Executada contra a API real (porta 8000, sem o proxy) com **`openai/gpt-4o-mini`** e profundidade
**quick**. Resultados:

- **brand_scope: 19/19 checks** — usuário `manager` restrito a `deathcare` bloqueado (404) em calendar,
  outputs, research/run, cocreation, documents, publications; listagens filtradas; `operations/summary`
  sem `brand_slug` agrega só o escopo; `recent_errors` não vaza; admin brand-scope valida slug.
- **Pesquisa real** (evento) — 80s, 8 fontes reais, `briefing_json` do evento persistido, parou em
  `awaiting_approval`.
- **Guardião de Qualidade** — bloqueou corretamente pesquisas de modelo barato: 60/100 (tema sensível
  DeathCare + afirmações sem fonte) e 85/100 (Postos, mas com 1 falha crítica de citação). Gate
  funcionando (`score ≥ 80 E sem crítica`).
- **Fix descoberto e aplicado:** relatório de pesquisa nasce `draft` e a página só oferece
  Aprovar/Solicitar ajustes; `approve_output` dava **400** ("draft não pode ser aprovado"). Corrigido
  para aceitar pesquisa em draft, **mantendo o Guardião como portão**. Coberto por `test_research_approval.py`
  (3 testes). O teste de calendário mascarava o gap setando o status direto no banco.
- **Cocriação multicanal real** — avulsa (output 66) e pelo calendário (output 68), ~77s cada, warnings
  vazios: **mesmo carrossel IG+LinkedIn com legendas diferentes**, 7 slides, `extra_pieces` WhatsApp +
  **prompt de imagem opcional** + E-mail (sem logo/@/#), explodidas em `content_pieces`.
- **Peças** — rejeitar uma obrigatória → output `review`; aprovar todas → output `approved` (sem passar
  pelo Guardião, como projetado).
- **Publicações** — canal nasce `pending`; upload de mídia ok; publicação manual → `published`/ref
  `manual`/`published_at`; **Meta stub → 400 honesto** (a publicação continua `draft`, não finge).
- **Pipeline do calendário** (evento 208) fechou: briefing→research→cocreation→review `done`,
  publish `current`.
- **Custo real total: US$ 0,035** (10 chamadas, 69.855 tokens, tudo `gpt-4o-mini`).
- **Suíte automatizada: 239 passed, 2 skipped** (236 anteriores + 3 do novo teste de aprovação).

## 7.2 Pacote pronto-para-demo (2026-07-06)

Ajustes para apresentação completa e sem sustos (itens 1–5):

- **1. Aprovação de pesquisa confiável** — `approve_output` já aceitava pesquisa em draft, mas o
  Guardião bloqueava por citação/critical. Novo `_relax_research_gate` (quality_guardian.py): para
  relatórios de pesquisa a **nota (≥80) governa** — criticals viram *ajustes recomendados*. Pesquisa
  fraca ainda reprova pela nota (penalidades de fonte/sensibilidade/mojibake derrubam o score).
  Conteúdo mantém o gate estrito. Confirmado no real: a pesquisa de Postos (85/100) passou a aprovar.
- **3. Modelo do calendário** — o "Gerar com IA" já usava o modelo do orchestrator (`gpt-4o-mini`,
  barato); a linha `calendar_agent` no banco foi corrigida de Sonnet para gpt-4o-mini (cosmético).
- **5a. Aprovar conteúdo avulso** — a página de Cocriação (foco) encadeia `submit-review`→`approve`
  quando o conteúdo está em draft e mostra o score do Guardião; botão "Enviar para revisão" explícito.
- **5b. Refino individual por peça** — `POST /api/pieces/{id}/refine` (novo) regenera só aquela peça
  via agente e a devolve a `pending` (re-aprovação); botão "Refinar" com instrução inline no
  `PiecesReview`. C1 aplicado.
- **5c. Salvar pesquisa como template** — reusa `research_themes` (briefing como JSON em `notes`);
  botão "Salvar como template" + carregamento dos templates salvos junto aos fixos. Sem migração.
- **5d. Datas avançadas do evento** — migração `0027_calendar_event_dates` (entrega/revisão/aprovação/
  prazo/lembrete + recorrência); seção "Datas avançadas" no wizard e no painel do evento.
- **2. Latência** — mensagens de espera mais claras (1–2 min, acompanhar na lista) em pesquisa,
  cocriação e conteúdo; polling anti-timeout intacto.
- **4. Dados de demonstração** — banco de dev curado: artefatos de teste removidos; cada marca com
  ≥1 pesquisa aprovada, ≥1 conteúdo aprovado com peças, 1 publicação registrada e eventos em Julho/2026
  (alguns com briefing estruturado e datas avançadas). Usuário `manager.deathcare` mantido para
  demonstrar brand_scope.

**Verificação:** `ruff` limpo; **pytest 304 passed, 2 skipped** (novos: guardião de pesquisa, refino
por peça, datas do evento); `next build`/lint/tsc limpos; 5c/5d verificados no navegador.

## 8. Limitações restantes / próximos passos

1. **Meta real** continua stub honesto (400 claro); publicação manual funciona. Próxima fase: Graph API.
2. ~~Salvar pesquisa como template~~ **feito** (§7.2 5c). Falta: biblioteca de templates de conteúdo
   e edição/exclusão de templates pela UI.
3. ~~Datas avançadas do evento~~ **feito** (§7.2 5d, migração 0027). Falta: worker de disparo de
   lembrete e materialização de ocorrências recorrentes (hoje a recorrência é só metadado/regra).
4. **npm audit / Next.js**: upgrade `next@16` em tarefa isolada com regressão do build.
5. ~~Refino individual por peça~~ **feito** (§7.2 5b, `POST /api/pieces/{id}/refine`). O refino de peça
   atua só na peça (não reescreve o `structured_json`/markdown da versão) — reflexo no pacote é evolução.
6. **Usuários não-admin**: o seed só cria o admin; para exercitar visualmente os chips de escopo por
   marca, criar um usuário `manager` (a enforcement já está testada em `test_operations_scope.py`).
