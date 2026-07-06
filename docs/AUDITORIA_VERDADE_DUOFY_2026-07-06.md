# Auditoria Independente — Duofy V1 Marketing Intelligence Hub

> **Follow-up (2026-07-06, mesma data):** parte dos achados abaixo já foi corrigida na branch
> `feature/pre-demo-stabilization-2026-07-06`. Fechados: perímetro de brand_scope (memory, reports,
> metrics, press, agents/run, orchestrator/briefings, themes, research-themes, chat + agregados do
> operations/summary), 422 de fontes insuficientes, gate de evento de conteúdo, scheduler legado,
> polling 4xx, divergência de export peça↔pacote (mitigada) e validações de publicação. Ainda
> pendentes (ver `ROADMAP_POS_DEMO.md`): sanitização de prompt fora da pesquisa, sincronização total
> peça→pacote, `FERNET_SECRET_KEY` no deploy, worker de lembrete/recorrência. Detalhes em
> `PRE_DEMO_STABILIZATION_REPORT.md`.


> **Data: 2026-07-06.** Auditoria cética do working tree (`main` @ `07eab81` + alterações não
> commitadas), verificando as alegações de `ESTADO_DO_SISTEMA_2026-07-06.md` contra código,
> banco vivo, testes executados e API viva. Nenhum arquivo de código foi alterado nesta auditoria.
> Metodologia: 7 auditores de código por domínio + comandos reais (pytest, ruff, next build/lint/tsc,
> npm audit, alembic, docker compose) + consultas SQL somente-leitura no banco de dev + probes HTTP
> na API local (somente login e GETs). Nenhuma chamada de LLM foi disparada.

---

## 1. Resumo executivo honesto

O documento anterior é **majoritariamente verdadeiro no que afirma existir**, e o núcleo do produto
é real: os agentes chamam LLM de verdade, o calendário orquestra pesquisa→aprovação→cocriação com
gate server-side, as peças são persistidas e aprováveis, a publicação manual funciona, o stub Meta é
honesto, os 304 testes passam e o frontend builda limpo. Isso foi verificado, não presumido.

O problema do documento não é inventar features — é **superlativizar o acabamento e omitir o
perímetro**. Os três exageros estruturais:

1. **"brand_scope em todas as rotas" é falso.** O C1 é sólido no caminho feliz (outputs, documents,
   pieces, calendar, research, cocreation, content, publications, operations parcial), mas
   **9 superfícies inteiras ficaram sem isolamento**: `memory`, `reports`, `metrics`, `press`,
   `chat`, `agents/run` + `agents/runs`, `orchestrator/briefings` (IDOR puro que dispara pesquisa),
   `themes` e `research-themes`. Confirmado **ao vivo**: o usuário `manager.deathcare` leu conteúdo
   de pesquisa da marca Postos via `GET /api/memory` e viu o custo global via `GET /api/metrics/summary`.
2. **Vários recursos são armazenamento sem comportamento.** Datas avançadas/recorrência: nada
   dispara lembrete, nada materializa ocorrências, o `.ics` não exporta RRULE. `scheduled_at` de
   publicações: nada despacha. Status `error`/`connected` de canais: inalcançáveis. O tipo de evento
   "Pesquisa + Conteúdo" nem existe no backend (é `research` + flag decorativa no payload).
3. **Duas fontes de verdade divergentes no conteúdo.** O refino por peça não atualiza o pacote
   (`structured_json`/markdown) e o refino de pacote não atualiza as peças. Consequência concreta:
   **o PDF/export e a tela do pacote mostram texto diferente do que foi aprovado por peça** — cenário
   normal do fluxo, não caso raro.

Além disso, **nada da entrega V3 está commitado** (37 modificados + 25 novos em working tree sobre
`main`), a "prova de fogo 19/19" não é reprodutível (não há script no repo), o "validador de
taxonomia ~110 asserts" **não existe no repositório**, e o dataset de demo **não cumpre** a promessa
"cada marca com ≥1 conteúdo aprovado com peças" (só Postos cumpre).

**Veredito: demo com ajustes** (roteiro controlado, ver §12/§15). Não é produção. Uso interno
controlado é viável com os P1 fechados.

---

## 2. Estado real do repositório

Comandos: `git status`, `git branch --show-current`, `git log --oneline -5`, `git diff --stat/--name-status`, `git ls-files --others --exclude-standard`.

- Branch: **`main`**, sincronizada com `origin/main` @ `07eab81`. **Toda a entrega V3 + demo-ready
  está no working tree, não commitada**: 37 arquivos modificados (+2.470/−428 linhas) e 25 untracked.
- Classificação dos não commitados:
  - **Backend (modificados):** calendar_workflow, cocreation_service, content_pieces_service,
    models, operations_service, output_workflow, quality_guardian, research_service, schemas e
    8 routers (admin, calendar, cocreation, content, content_pieces, documents, operations, research).
  - **Backend (novos):** `app/briefing_filters.py`; **migrations** `0026_output_briefing_json.py`,
    `0027_calendar_event_dates.py`.
  - **Testes (novos):** test_briefing_filters, test_calendar_briefing_flow, test_cocreation_multichannel,
    test_demo_ready, test_filter_combinatorics, test_operations_scope, test_research_approval.
  - **Frontend (modificados):** calendar (page, EventDetailPanel, status), content, research,
    operations (CocreationPanel, PiecesReview), memory, relatorios, admin/acessos, lib/api.ts.
  - **Frontend (novos):** `lib/briefing/` (taxonomy, types, index), `components/briefing/` (6 arquivos).
  - **Config/seed:** brands.yaml + perfis de marca (nomes oficiais) — **em dois lugares** (`config/` e
    a cópia `DUOFY_V1_pacote_execucao_desenvolvimento/.../config/`, hoje idênticas, fonte dupla).
  - **Documentação (novos):** BRIEFING_FILTERS_V1, E2E_MARKETING_FLOW_CHECKLIST,
    ESTADO_DO_SISTEMA_2026-07-06, PRODUCT_UX_REFINEMENT_V3.
  - **Lixo gerado:** `.playwright-mcp/` (um PDF exportado e um snapshot `.yml`) — **não está no
    `.gitignore`** (`git check-ignore` falha) e entraria num `git add -A`.
- **Risco de perda/mistura: real.** 2.470 linhas + 2 migrations + 7 arquivos de teste vivem só no
  disco; um `git checkout`/`reset --hard` acidental destrói a entrega. Trabalhar direto na working
  tree de `main` também impede PR/review. Branches locais antigas (`feat/product-v2-hardening`,
  `hardening/tier0-foundation`) existem mas não contêm este trabalho; não há stash.

---

## 3. Tabela de alegações verificadas

| # | Alegação | Veredicto | Evidência-chave |
|---|---|---|---|
| 1 | 8 áreas fortes com página própria | **VERDADEIRO** | `components/app-shell.tsx:30-40` (8 itens); todas páginas reais (Cocriação = `/content` importando `CocreationPanel`; Revisão = `/approvals`). Ressalvas: tabela de papéis fictícia no Admin (`admin/page.tsx:84-89`), badge de notificações hardcoded "8" (`app-shell.tsx:142`) |
| 2 | BriefingBuilder reutilizado em calendário/pesquisa/cocriação | **VERDADEIRO** | Kit compartilhado `components/briefing/` + `lib/briefing` importado nas 3 telas (research:6-17, CocreationPanel:14-45, calendar:19-57). Ressalva: `allowedPiecesFor`/`PIECES_BY_CHANNEL` copiado-colado em 2 lugares |
| 3 | Taxonomia central suficiente | **VERDADEIRO** | `lib/briefing/taxonomy.ts` (638 linhas, ~304 opções). Excesso objetivo: Formatos (18) sobrepõe Canais/Peças; Personas (20) não filtra por segmento |
| 4 | Marcas oficiais na UI | **VERDADEIRO** | Banco vivo: `TOTVS Varejo Postos de Combustíveis`, `Gestão DeathCare by Duofy`, `Duofy Soluções`; UI 100% via `GET /api/brands` (`lib/brand-context.tsx:30`); 0 nomes hardcoded no front |
| 5 | Slugs técnicos preservados | **VERDADEIRO** | Banco vivo + `config/seeds/brands.yaml` + `taxonomy.ts:26-30` |
| 6 | Wizard em etapas | **VERDADEIRO** | `EventWizardPanel` (calendar/page.tsx:778-1202): 6 etapas (5 sem agente), navegação real, validação de gate, resumo |
| 7 | Evento "Pesquisa + Conteúdo" | **PARCIAL** | Existe só na UI. `page.tsx:448-449`: "research_content não existe no backend: vira research". Backend: `RESEARCH_EVENT_TYPES = {"research","pesquisa"}` (`calendar_workflow.py:48`); nada consome `execution_payload.pipeline` |
| 8 | Calendário salva briefing estruturado | **VERDADEIRO** | `execution_payload.briefing` → usado em execute-research (`calendar_workflow.py:229-233`) e execute-cocreation (`:348-349`); persistido em `outputs.briefing_json`; testado (`test_calendar_briefing_flow.py`) |
| 9 | Datas avançadas (entrega/revisão/aprovação/prazo/lembrete/recorrência) | **PARCIAL** | Modelo+migração 0027+schemas+UI: sim. **Nada as consome**: grep zero fora de models/schemas; sem worker de lembrete; sem materialização de recorrência; `.ics` sem RRULE/VALARM (`calendar_ics.py:56-84`); `recurrence_rule` aceita string livre |
| 10 | Pesquisa executa de verdade pelo calendário | **VERDADEIRO** | execute-research → `run_market_research` real (coleta externa + `call_llm` + Output/AgentRun/ResearchSource) |
| 11 | Pesquisa para em aprovação | **VERDADEIRO*** | `calendar_workflow.py:292-293` (`awaiting_approval`). *Exceção: o branch legado do scheduler (`calendar_scheduler.py:37-57`) executa e marca `completed` direto, sem gate e ignorando `is_paused` |
| 12 | Cocriação vinculada só após aprovação | **VERDADEIRO*** | Gate server-side `calendar_workflow.py:351-355` (+ scheduler `:130-131` + UI locked). *`requires_research_approval` é desligável por PATCH por qualquer usuário da marca, sem auditoria destacada; mesmo bypass do scheduler legado |
| 13 | Cocriação avulsa roda sem pesquisa | **VERDADEIRO** | `research_output_id` opcional em `CreationRequest`; fluxo testado |
| 14 | Cocriação multicanal | **VERDADEIRO** | `channels[]`/`pieces[]` mudam prompt e validação de verdade (`cocreation_service.py:177-206, 226-327, 389-435`) |
| 15 | IG+LinkedIn mesmo carrossel, legendas diferentes | **PARCIAL** | "Mesmo carrossel" garantido por estrutura (uma lista `slides`). "Legendas diferentes" é pedido no prompt + verificado a posteriori **só como warning por igualdade exata de string** (`cocreation_service.py:400-411`) — não bloqueia nem regenera |
| 16 | WhatsApp + prompt de imagem opcional | **VERDADEIRO** | Kinds ponta a ponta; opcionalidade real (só entra se marcado em `pieces[]`) |
| 17 | E-mail + WhatsApp juntos | **VERDADEIRO** | `_CHANNEL_TO_KIND` + teste e2e com os 4 canais |
| 18 | extra_pieces persistidas em content_pieces | **VERDADEIRO*** | `explode_package_into_pieces` cria registros; teste com SELECT. *Toda extra nasce `required=False` (o LLM nunca recebe o campo) → WhatsApp/e-mail **nunca gateiam** a aprovação do Output |
| 19 | Refino individual por peça | **VERDADEIRO** | `POST /api/pieces/{id}/refine` regenera via LLM só a peça, volta a `pending`, reverte Output a `review` |
| 20 | Refino por peça não atualiza structured_json/markdown | **VERDADEIRO (e é grave)** | `refine_content_piece` não toca `OutputVersion` (zero refs). PDF/export (`routers/outputs.py:591-602`), `GET /cocreation/{id}` e listagens usam o pacote **velho**. Direção inversa idem: refino de pacote não re-explode peças (`content_pieces_service.py:88-92`) |
| 21 | Publicações: canais, fila, upload, manual, Meta stub | **PARCIAL** | Existe e funciona, mas: canais são Create+List (sem update/delete; status `connected/expired/error` inalcançáveis); fila nunca seta `error`; `scheduled_at` é campo morto (nada despacha); upload valida só extensão e lê 25MB inteiros em RAM antes de rejeitar; Meta stub 400 honesto confirmado (`publications.py:250-255` + teste) |
| 22 | Meta real não existe | **VERDADEIRO** | Zero código Graph API/OAuth em `apps/` (grep); `MetaPublisher` só levanta exceção |
| 23 | brand_scope em TODAS as rotas sensíveis | **FALSO na abrangência** | Núcleo sim; **sem escopo**: memory (list+search), reports (todas), metrics, press/generate, chat (brand arbitrária), agents/run + agents/runs (RAG + prompts de todas as marcas), orchestrator/briefings (IDOR + dispara pesquisa), themes, research-themes. **Confirmado ao vivo** com o usuário restrito |
| 24 | scope nulo = acesso total | **VERDADEIRO** | `access.py:17-25` |
| 25 | operations/summary respeita restrito | **PARCIAL** | `model_calls`/`recent_errors`/custo: escopados (confirmado ao vivo: 39 calls vs 141 globais). **Vazam globais**: `total_agent_runs` (133 ao vivo p/ usuário restrito), `quality_reviews`, `total_decisions` (`operations_service.py:48,79-102`) |
| 26 | documents/upload bloqueia fora do escopo | **VERDADEIRO*** | `documents.py:111`, primeira linha. *Qualquer restrito pode **escrever** em `institucional` (RAG de todas as marcas) — `access.py:21` |
| 27 | research/run bloqueia antes de gastar tokens | **VERDADEIRO*** | `research.py:142` antes de `run_market_research`. *Bypass: `orchestrator/briefings/{id}/approve` executa a mesma pesquisa sem nenhum check |
| 28 | Admin brand-scope valida slug | **VERDADEIRO** | `admin.py:76-85` (400 com slugs desconhecidos) + auditoria |
| 29 | Auditoria admin em ações sensíveis | **VERDADEIRO** | quality/agent/providers/brand-scope + publications (4 eventos). Lacunas: PATCH publications, upload de mídia, PATCH pieces |
| 30 | Prompt injection mitigado | **PARCIAL** | Real **só** em pesquisa + briefing_filters (`research_service.py:851-861`). **Crus**: evidência web coletada (maior vetor, `_sources_block`), toda a cocriação, conteúdo clássico (briefing livre!), calendário/press, orquestrador, e o próprio Guardião (conteúdo revisado cru no prompt do revisor) |
| 31 | Web-search no tracking ModelCall | **VERDADEIRO** | `_record_web_search_call` → `record_model_call`, task_type `web_search`. Nota: modelo registrado é o default da credencial, não o escolhido |
| 32 | 304 passing / 2 skipped | **VERDADEIRO** | Executado: `304 passed, 2 skipped in 345.45s`. Skips = WeasyPrint (`test_export_pdf.py:15`, libs ausentes no host) |
| 33 | Testes não chamam IA real | **VERDADEIRO** | `patch_ai` mocka `call_llm` em todos os módulos + `embed_text` por namespace (conftest:195-255); suíte roda em 5m45 sem credencial real |
| 34 | Frontend passa build/lint/tsc | **VERDADEIRO** | Executados: `next lint` ✅, `tsc --noEmit` ✅, `next build` ✅ (24 rotas). Nota: **CI não roda tsc** (só lint+build, `ci.yml:83-89`) |
| 35 | npm audit aponta vulnerabilidades | **VERDADEIRO, subestimado** | Doc diz "2 vulns (1 alta)"; audit real: **5 vulnerabilidades (4 altas, 1 moderada)**, fix = `next@16` (breaking) |

**Alegações acessórias do documento:**

| Alegação | Veredicto |
|---|---|
| "brand_scope validado 19/19 (prova de fogo)" | **NÃO VERIFICÁVEL** — não há script/registro reprodutível no repo; e a cobertura por rota é ~60% das superfícies (item 23) |
| "Validador de taxonomia do frontend (Node, ~110 asserts)" | **NÃO ENCONTRADO** no repositório (busca em apps/web, scripts, CI) |
| "Dataset de demo: cada marca ≥1 conteúdo aprovado com peças" | **FALSO** — só 2 outputs têm peças no banco: #70 (postos, approved, 3 peças) e #59 (duofy_solucoes, **review**, 4); deathcare tem 0 peças |
| "Custo total acumulado ~US$ 0,036" | **ENGANOSO como está escrito** — o banco acumula **US$ 4,43 / 1,14M tokens** (141 calls); 0,036 seria só a prova de fogo, não reprodutível |
| "Sem mocks no caminho principal" | **PARCIAL** — caminho de geração é real, mas a UI carrega mocks visíveis: badge de notificações fixo "8", tabela de papéis fictícia, abas/status permanentemente vazios (Erros de publicação, "Conectado" de canal) |
| "27 migrações → 0027" | **VERDADEIRO** — 27 arquivos; dev e banco de teste em `0027 (head)` (alembic current executado nos dois) |
| DEPLOY.md: "primeiro boot semeia o admin" | **FALSO** — nenhum seed no boot (`main.py:47-60`, Dockerfile CMD só uvicorn, compose sem serviço seed); só `python -m app.seed` manual |

---

## 4. O que está realmente implementado (com evidência)

- **Autenticação**: cookie `duofy_token` HttpOnly + SameSite=Lax + Secure em prod (verificado ao vivo
  no header `Set-Cookie`); logout limpa; sem Bearer no front; middleware server-side.
- **Pipeline do calendário**: criar evento (wizard real) → executar pesquisa real → `awaiting_approval`
  → aprovar (Guardião como portão) → cocriação gated → peças → gate de peças obrigatórias → publish
  manual/stub. Testado (test_calendar_briefing_flow, test_research_approval, test_content_pieces).
- **Pesquisa**: coleta multi-fonte real, porta de fontes mínimas, anti-SSRF básico (C4), sanitização
  do briefing, `briefing_json` persistido, web-search rastreado em ModelCall.
- **Cocriação multicanal + explosão em peças + refino por peça** (com as ressalvas 15/18/20).
- **Publicações**: canais pending, fila draft/scheduled/published, upload ≤25MB, publicação manual
  auditada, Meta stub honesto (400).
- **brand_scope no núcleo**: outputs/documents/pieces/calendar/research/cocreation/content/publications
  — testado e confirmado ao vivo (lista filtrada, 404 cross-brand por id).
- **Hardening de produção**: app recusa boot em prod com secrets fracos (`settings.py:48-72`);
  compose prod exige segredos via `:?`; Postgres/Redis sem portas públicas; nenhum segredo no repo.
- **Suíte de testes**: 304 passed/2 skipped reais, mockada (custo zero), 64 arquivos, rodando também
  no CI contra Postgres+Redis reais com `alembic upgrade head`.

## 5. O que está parcial

- **brand_scope**: núcleo sim, periferia não (9 rotas/routers sem isolamento — §3 item 23).
- **operations/summary**: métricas de modelo escopadas; agregados de runs/reviews/decisions globais.
- **Datas avançadas/recorrência**: só armazenamento + exibição; zero comportamento.
- **Evento "Pesquisa + Conteúdo"**: rótulo de UI sobre `research`.
- **Publicações**: fila sem estado de erro alcançável, agendamento não dispara, canais sem ciclo de vida.
- **Prompt injection**: mitigado na pesquisa; aberto em todo o resto (inclusive Guardião).
- **Anti-SSRF**: bom para o caso comum; furos: validação de redirect pós-request, DNS rebinding
  (TOCTOU), Playwright (deep) sem validação além da URL inicial.
- **Guardião para pesquisa**: nota ≥80 governa; criticals do LLM (e até `status="blocked"` do LLM)
  são rebaixados quando a nota passa — o portão automático é mais fraco do que o discurso.
- **Refino por peça**: funciona, mas cria divergência permanente peças ↔ pacote/PDF/export.
- **Aprovação por peças**: seta `output.status="approved"` **sem passar pelo Guardião**
  (`content_pieces_service.py:151-163`) — dois regimes de qualidade para o mesmo status.

## 6. O que é stub / mock / só documentação / só UI

| Item | Classificação | Evidência |
|---|---|---|
| Publicação Meta | **Stub honesto** | `publishers.py:43-53` + stub inline `publications.py:250-255` (dois pontos a plugar) |
| Lembrete/recorrência | **Só armazenamento+UI** | grep zero consumo; `models.py:480` admite |
| Agendamento de publicação | **Só campo+UI** | nada consulta `Publication.scheduled_at` |
| Tipo research_content | **Só UI** | backend converte para `research` |
| Aba "Erros" de publicações; badge "Conectado" de canal | **UI morta** | estados nunca atribuídos pelo backend |
| Badge de notificações "8" | **Mock visual** | `app-shell.tsx:142` (useState(8), nunca zera) |
| Tabela de papéis (Admin > Permissões) | **Vitrine** | 4 papéis exibidos vs 2 reais (`lib/api.ts:5`) |
| "Ajuda e suporte" na nav | **Link enganoso** | aponta para `/admin` |
| Validador de taxonomia Node ~110 asserts | **Só documentação** | inexistente no repo |
| Seed automático no boot (DEPLOY.md) | **Só documentação** | não implementado |
| `/redes` | **Removido honestamente** | redirect server-side, fora da nav |
| `run-now` + branch 1 do scheduler | **Código legado ativo e perigoso** | executa sem gate de aprovação e ignora `is_paused` (`calendar_scheduler.py:37-57`) |

## 7. O que não foi verificado

- A "prova de fogo" E2E com IA real (19/19; pesquisa 80s/8 fontes; custo US$0,035) — sem script nem
  registro reprodutível; **não re-executada** nesta auditoria para não gastar tokens (o banco mostra
  141 model_calls/US$4,43 acumulados, consistentes com execuções reais anteriores terem acontecido).
- Comportamento real do polling anti-timeout sob proxy Next em execução longa (verificado só por código).
- Renderização visual das telas (auditoria por código; sem navegação Playwright nesta sessão).
- `docker-compose.prod.yml` em execução real (validado apenas por `config` + análise estática).
- Mock de rede da **coleta web** nos testes: `patch_ai` cobre LLM/embeddings; a coleta
  (DDG/RSS/httpx) é mockada por teste nos módulos de pesquisa — não exaustivamente auditada, mas a
  suíte roda offline-friendly em 5m45 sem falhas de rede.

## 8. Resultado dos comandos executados

| Comando | Resultado |
|---|---|
| `git status` / `git diff --stat` | main @ 07eab81; 37 M + 25 ?? ; +2.470/−428 |
| `ruff check app alembic` | **All checks passed** |
| `pytest -q` (venv raiz, banco duofy_v1_test) | **304 passed, 2 skipped, 345s** (skips: WeasyPrint) |
| `alembic current` (dev via container / teste via venv) | ambos **0027_calendar_event_dates (head)**; 27 migrations |
| `next lint` | ✅ sem erros |
| `npx tsc --noEmit` | ✅ sem erros |
| `next build` | ✅ 24 rotas |
| `npm audit --audit-level=moderate` | **5 vulns (4 high, 1 moderate)** — Next.js; fix = next@16 breaking |
| `docker compose config` (dev) | ✅ 6 serviços |
| `docker compose -f docker-compose.prod.yml config` | ✅ 7 serviços com env obrigatórios setados; fail-fast sem eles |
| SQL (dev): users/brands/outputs/pieces/publications/events | ver §3 e §12 |
| HTTP: login admin + manager; GETs escopados | cookies HttpOnly confirmados; C1 núcleo OK; furos memory/metrics confirmados |

## 9. Fluxos ponta a ponta verificados

| Fluxo | Status | Evidência / risco |
|---|---|---|
| **A — Pesquisa avulsa** (briefing→run→output→briefing_json→aprovar→usar na cocriação) | **Funciona** (por código+testes; execução LLM não redisparada) | `research.py:142-151` + `output_workflow.py:304-320` + deep-link `/content?research={id}`. Riscos: fontes insuficientes viram **502** (não 422) nessa rota; aprovação depende do Guardião relaxado por nota |
| **B — Evento Pesquisa+Conteúdo** completo | **Funciona com ressalvas** | Gate real (`calendar_workflow.py:351`); peças/aprovação/publish ok. Riscos: tipo é alias de research; scheduler legado fura gate; evento preso em `running` se a API cair no meio; re-execução via API duplica Outputs |
| **C — Cocriação avulsa multicanal** (briefing→canais→pacote→pieces→refinar→aprovar) | **Funciona com ressalva séria** | Testado e2e mockado + estrutura real. Risco: refino por peça diverge do pacote/PDF (§3 item 20); extras nunca obrigatórias |
| **D — Publicação manual** (selecionar aprovado→mídia→registrar→relatórios) | **Parcialmente funciona** | Publicar manual ok + auditado. "Conteúdo aprovado" é regra só de UI (backend aceita qualquer output_id); contagem em Relatórios é client-side, ignora o período selecionado e trava em 100 |
| **E — Brand scope** | **Parcialmente funciona** | Ao vivo: admin vê tudo; manager vê só deathcare em outputs (404 cross-brand). **Vaza**: memory, metrics, reports, agents/runs, press, orchestrator/briefings, themes; agregados globais no summary |

## 10. Riscos técnicos (não segurança)

1. **Divergência peças ↔ pacote** (refino nos dois sentidos sem reconciliação) — texto aprovado ≠
   texto exportado/exibido. O maior risco funcional do produto hoje.
2. **Execução síncrona no request** + evento `running` sem recuperação + scheduler no processo da
   API — restart no meio de uma execução trava o evento para sempre (só PATCH manual destrava).
3. **Dois caminhos de execução coexistem** — o legado (`run-now`, branch 1 do scheduler) ignora
   gate de aprovação e pausa; eventos do "Gerar com IA" nascem elegíveis para ele.
4. **Polling "adota qualquer item novo"** (research/content/CocreationPanel) — com 2 usuários ou
   scheduler ativo, a tela pode exibir resultado alheio como seu.
5. **RAG degradado silencioso** — fallback SHA256 mistura espaços vetoriais sem re-embedding nem
   piso de score; contexto irrelevante entra nos prompts sem sinal.
6. **Validação frouxa pós-reparo de JSON** — pacote quase vazio valida e persiste.
7. **Fonte dupla de seeds/config** (raiz vs `DUOFY_V1_pacote_execucao_desenvolvimento/`) sem guarda de drift.
8. **Relatórios**: contagem de publicações client-side enganosa (cap 100, ignora período).

## 11. Riscos de segurança (classificados)

**P0 (bloqueador para multi-tenant externo; P1 enquanto a equipe é interna única):**
- Isolamento de marca anulável por rotas periféricas: `memory` (leitura de conteúdo cross-brand,
  **confirmado ao vivo**), `agents/run`+`runs` (RAG + prompts/outputs de tudo), `press/generate`
  (RAG alheio), `orchestrator/briefings/{id}` (**IDOR que lê e dispara pesquisa** na marca alheia,
  gastando tokens), `reports`, `metrics` (custo global), `chat` (marca arbitrária), `themes`/`research-themes`
  (delete de qualquer marca). Escrita aberta em `institucional` (envenena o RAG de todas as marcas).

**P1:**
- Cadeia de prompt injection ponta a ponta: página web maliciosa → evidência crua no prompt →
  relatório contaminado → conteúdo cru no prompt do Guardião → nota inflada → gate relaxado aprova.
- Gate de aprovação desligável por PATCH sem trilha destacada; scheduler legado fura gate/pausa.
- Bypass do Guardião via aprovação por peças; peça manual/PATCH/DELETE não re-sincronizam o gate.
- Credenciais admin **pré-preenchidas no form de login** (`login-form.tsx:12-13`) — vai para bundle de prod.

**P2:**
- `FERNET_SECRET_KEY` é config morta no deploy (não repassada em nenhum compose nem no
  `.env.production.example`) → rotação de JWT continua destruindo credenciais de provedor.
- DEPLOY.md promete seed automático inexistente (deploy “pelo livro” termina sem admin).
- Sem rate-limit/lockout no login; JWT 12h sem revogação; `access_token` no corpo do login.
- npm audit: 4 altas (Next.js) sem cobertura de CI (`npm audit` não roda no CI; `tsc` também não).
- SSRF residual: redirect validado pós-request, DNS rebinding, Playwright deep sem checagem.
- Upload de mídia: valida só extensão, lê 25MB em RAM antes de rejeitar; `media_paths` aceita
  caminho arbitrário (mina para a integração Meta).
- `channel_id`/`output_id` de publicação sem validação de marca cruzada.

**P3:** CSRF residual (Lax-only, sem GET mutável — baixo), sem HSTS/CSP, modo `:80` documentado
quebra cookie Secure, chave Apify em query string, máscara de chave revela 8 chars, API dev
exposta na LAN (`0.0.0.0:8000`), validador de prod não checa força de `ADMIN_PASSWORD` custom.

## 12. Riscos de demo

- **Dados**: só Postos tem o pacote completo (conteúdo aprovado #70 com 3 peças + publicação).
  DeathCare não tem peças; o output com 4 peças de Duofy está em `review`. **Roteirizar em Postos.**
- **Não clicar ao vivo**: "Publicar na Meta" (400 esperado, mas quebra o clima); exportar PDF de um
  output **depois** de refinar peça (mostra texto velho); refino de pacote não-social (warnings
  espúrios "Legenda de Instagram ausente"); `/api/memory` ou Relatórios logado como usuário restrito
  (vaza dados de outras marcas — mina exatamente a mensagem de isolamento); aba "Erros" de
  publicações e badge de canal (sempre vazios); sino de notificações (número falso).
- **Usuários**: `admin@duofy.com.br/admin123456` e `manager.deathcare@duofy.com.br/manager123456`
  existem e **logam** (testado ao vivo). Nota: há um `admin@duofy.local` residual no banco.
- **Ações >30s / timeout**: pesquisa, cocriação e refino (1–2 min). O polling mitiga, mas: erros
  4xx imediatos viram spinner mudo de 210s no painel do evento; e o polling pode adotar execução
  alheia — **apenas 1 operador durante a demo**.
- **Como contornar sem gambiarra**: seguir o `E2E_MARKETING_FLOW_CHECKLIST.md` com Postos,
  profundidade "Rápida", verbalizar a espera ("a pesquisa real leva ~1 min"), aprovar pesquisa pela
  página de Pesquisa, publicar pelo caminho manual, e mostrar o isolamento com o manager **apenas**
  em Calendário/Conteúdo/Pesquisa (rotas escopadas de verdade).

## 13. Avaliação de UX / produto

- **Calendário**: utilizável e acima da média para V1 (wizard real, templates, resumo). Fricções:
  a etapa Briefing concentra ~94 chips; evento tipo "Conteúdo" criado pelo wizard nasce **travado**
  (gate ligado por default sem etapa de pesquisa e sem checkbox visível para desligar — beco sem
  saída até PATCH via API); datas avançadas criam expectativa de lembrete que não dispara.
- **Briefing**: o padrão clicável é bom e consistente; excesso pontual (Formatos×Canais×Peças se
  sobrepõem; Personas não filtra por segmento). Obrigatórios são poucos (4–5) — certo.
- **Jornada**: o maior atrito é **navegação cruzada sem deep-link** — Revisão/EventDetail/busca
  mandam para a raiz dos módulos e o usuário re-localiza o item na mão (único deep-link real é
  `/content?research={id}`). A jornada completa troca de página ≥4 vezes.
- **Status**: claros no painel do evento (pipeline com etapas locked/current/done). "O que fazer
  agora" é razoavelmente guiado; o silêncio em erro 4xx imediato (spinner sem mensagem) é a pior falha.
- **Meta stub**: bem comunicado (banner âmbar, botão "em breve", erro sem mascarar). Publicações é
  usável sem Meta.
- **Operações**: virou dashboard de verdade (resumo + saúde + chat do orquestrador); Cocriação tem
  página própria (`/content`) — separação lógica de Pesquisa ok.
- **Resíduos que minam confiança**: badge "8" falso, tabela de papéis fictícia, "Ajuda e suporte"→/admin,
  abas mortas de publicações, contagem de publicações em Relatórios que ignora o período.

## 14. Próximos passos priorizados

### P0 — antes de qualquer demo ou commit
1. **Commitar a entrega em branch + PR** (ex.: `feat/product-v3-briefing`) — 2.470 linhas + 2 migrations
   só no disco. Adicionar `.playwright-mcp/` ao `.gitignore` antes. *Esforço: pequeno.*
2. **Remover credenciais pré-preenchidas do login** (`login-form.tsx:12-13`) e o texto que anuncia o
   seed. *Pequeno.*
3. **Curar os dados de demo que faltam**: gerar/aprovar 1 conteúdo com peças para DeathCare e
   aprovar o #59 de Duofy (ou roteirizar a demo só em Postos). *Pequeno.*
4. **Silenciar becos de demo**: badge de notificações real ou removido; evento tipo "Conteúdo" do
   wizard destravável (expor o checkbox do gate quando não há pesquisa). *Pequeno.*

### P1 — antes de uso interno amplo
5. **Fechar o perímetro do brand_scope**: memory, reports, metrics, press, chat, agents/run+runs,
   orchestrator/briefings, themes, research-themes (+ agregados globais do summary; + decidir política
   de escrita em `institucional`). Arquivos: routers correspondentes + `operations_service.py` +
   `access.py`. *Médio. Sem dependência externa.*
6. **Desativar/gate-ar o caminho legado de execução** (`run-now`, branch 1 do scheduler): respeitar
   `is_paused` e o gate de aprovação, ou remover. `calendar_scheduler.py:37-57`. *Pequeno/médio.*
7. **Sincronizar refino por peça ↔ pacote** (regravar `structured_json`/content na versão corrente ou
   criar nova versão; e re-explodir peças no refino de pacote). `content_pieces_service.py`,
   `cocreation_service.py`. *Médio.*
8. **Recuperação de evento `running`** (sweep de órfãos no scheduler ou timeout de execução) +
   tratar 4xx imediato no polling do front. *Médio.*
9. **Padronizar 422 para fontes insuficientes** em `/api/research/run` (hoje 502). *Pequeno.*
10. **Sanitizar prompts fora da pesquisa** (cocriação, conteúdo, calendário, orquestrador, Guardião)
    e a evidência web (`_sources_block`). *Médio.*

### P2 — antes de produção real
11. **Meta real** (Graph API/OAuth) — unificar os 2 stubs antes; validar `channel_id`/`output_id`
    cross-brand; magic bytes no upload; exigir output `approved` no backend. *Grande; depende de app Meta.*
12. **Endpoints LLM assíncronos** (AgentTask + poll de status) eliminando o teto de proxy e o
    polling frágil. *Grande.*
13. **Worker de lembrete/recorrência** (ou remover os campos da UI até existir). *Médio.*
14. **npm audit / Next 16** em tarefa isolada com regressão; adicionar `tsc --noEmit` e `npm audit`
    ao CI. *Médio.*
15. **Plumbing do `FERNET_SECRET_KEY`** nos composes + `.env.production.example`; corrigir DEPLOY.md
    (seed manual); rate-limit no login; HSTS/CSP. *Pequeno/médio.*
16. **Hardening SSRF** (pin de IP resolvido, bloquear redirect pré-request, proxy/isolamento p/ Playwright). *Médio.*
17. **Contagem de publicações em Relatórios no backend** (com período). *Pequeno.*

### P3 — evolução
18. Biblioteca de templates de conteúdo + edição/exclusão pela UI; deep-links em Revisão/Evento/busca;
    testes frontend (Playwright/Vitest) e o validador de taxonomia prometido; monitoramento/alertas de
    custo de IA (o banco já tem ModelCall); re-embedding após outage de provedor; revogação de JWT.

## 15. Recomendação final

**Demo com ajustes** — viável hoje com o roteiro controlado (§12) e recomendável só após os P0
(1 dia de trabalho). **Uso interno controlado**: sim, com os P1 fechados (o furo de perímetro do
brand_scope é tolerável apenas enquanto todos os usuários são do mesmo time e sabem disso).
**Produção real / multi-tenant externo: não** — bloqueiam: perímetro C1, Meta real, execução
síncrona sem recuperação, prompt injection fora da pesquisa, npm audit (4 altas) e os itens P2.

O documento `ESTADO_DO_SISTEMA_2026-07-06.md` deve ser corrigido nos pontos: "C1 em todas as rotas"
(falso), "validado 19/19" (não reprodutível), dataset de demo (incompleto), npm audit (5, não 2),
validador de taxonomia (inexistente), e as notas 8,5/10 de segurança e 9,5/10 de funcionalidade
(superestimadas dado o acima; 7/10 e 8/10 seriam defensáveis).
