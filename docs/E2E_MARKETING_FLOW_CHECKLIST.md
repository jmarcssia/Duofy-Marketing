# Checklist de validação ponta a ponta — Fluxo de Marketing

> Roteiro manual para validar o fluxo completo do produto **com custo de IA mínimo**. Use o modelo
> barato default (`openai/gpt-4o-mini`) e faça no máximo **1–2 execuções reais pequenas**
> (profundidade "Rápida", poucas fontes). O restante é clique de UI, sem LLM.

**Ambiente dev:** `docker compose up -d` · web em `http://localhost:3000` · login
`admin@duofy.com.br` / `admin123456` (rode `docker exec duofy-api python -m app.seed` se o admin
não existir). As três marcas devem aparecer no seletor do topo com os nomes oficiais.

---

## Parte A — Brand scope (FASE 1)

- [ ] **A1.** Em `/admin/acessos`, selecione um usuário e atribua **apenas Gestão DeathCare by Duofy**.
      Salve; o chip deve mostrar "1 marca" e o log de auditoria registrar `admin.user_brand_scope_set`.
- [ ] **A2.** Teste **combinação**: atribua DeathCare **+** Duofy Soluções; salve; confirme "2 marcas".
- [ ] **A3.** Volte para **todas as marcas** (checkbox "Acesso a todas as marcas") e salve.
- [ ] **A4.** (API) Com um usuário restrito a `duofy`, confirme que:
      - `GET /api/calendar` não traz eventos de `postos`/`deathcare`;
      - `GET /api/content/outputs` e `GET /api/research/reports` idem;
      - `GET /api/outputs/{id}` de outra marca → **404** (não vaza existência);
      - `GET /api/operations/summary` **sem** `brand_slug` agrega **só** as marcas do escopo;
      - `POST /api/research/run` e `POST /api/documents/upload` para marca fora do escopo → **404**.
      *(Coberto por `test_operations_scope.py`, `test_access_control.py`, `test_c1_calendar_research.py`.)*

## Parte B — Evento com briefing completo (FASE 4)

- [ ] **B1.** Selecione **TOTVS Varejo Postos de Combustíveis** no topo. Em `/calendar`, clique **Novo evento**.
- [ ] **B2.** Etapa **Tipo**: escolha **Pesquisa + Conteúdo**.
- [ ] **B3.** Etapa **Marca e template**: confirme a marca; aplique o template **Conteúdo multicanal**
      (deve pré-selecionar canais e peças).
- [ ] **B4.** Etapa **Briefing**: dê um tema; selecione tipo de pesquisa, profundidade **Rápida**,
      período; canais **Instagram + LinkedIn + WhatsApp**; tom; CTA. Note que as peças coerentes já
      vêm marcadas.
- [ ] **B5.** Etapa **Datas e automação**: data de hoje, execução **Manual**.
- [ ] **B6.** Etapa **Peças e aprovação**: confirme peças e deixe **"Exigir aprovação da pesquisa"** ligado.
- [ ] **B7.** Etapa **Resumo**: confira o resumo em chips (tipo, marca por nome, canais, peças) e clique
      **Criar evento**. O `BriefingCompleteness` deve estar "Pronto para executar".

## Parte C — Pesquisa → aprovação (FASE 5) — *execução real barata*

- [ ] **C1.** Abra o evento criado → aba **Visão geral** → **Executar pesquisa** (ou faça uma pesquisa
      avulsa em `/research` com profundidade **Rápida**). ⚠️ **1 chamada real** — anote o custo em `/relatorios`.
- [ ] **C2.** A pesquisa deve parar em **"aguardando aprovação"** (o gate). Abra em `/research`.
- [ ] **C3.** Confirme que o **briefing estruturado** aparece em chips acima das fontes.
- [ ] **C4.** Clique **Aprovar pesquisa**. A pesquisa é aprovável **direto do rascunho** (não há estado
      "review" para pesquisa), mas o **Guardião de Qualidade** é o portão: `passed = score ≥ 80 E sem
      falha crítica`. Como `research_agent` exige **citação [n] em toda afirmação factual**, uma pesquisa
      de modelo barato que não cita tudo é **bloqueada** (comportamento correto). Se bloquear, clique
      **Solicitar ajustes** e reexecute, ou use profundidade maior. *(Fix: `approve_output` passou a
      aceitar relatório de pesquisa em draft — antes dava 400; teste `test_research_approval.py`.)*

## Parte D — Cocriação → peças (FASE 6) — *execução real barata*

- [ ] **D1.** No evento, com a pesquisa aprovada, a **cocriação** fica liberada. Deixe **"Padrão do
      briefing"** em canal/formato para usar o multicanal do evento e clique **Cocriar conteúdo**.
      ⚠️ **1 chamada real** — anote o custo.
- [ ] **D2.** Verifique o pacote: **mesmo carrossel** para Instagram e LinkedIn com **legendas diferentes**;
      seção **Peças extras** com **mensagem de WhatsApp**, **prompt de imagem opcional do WhatsApp** e **e-mail**.
- [ ] **D3.** Confirme que os `image_prompt` **não pedem logo/@/#** e que não há geração de imagem final
      (só prompts e direção visual).

## Parte E — Revisão e aprovação de peças

- [ ] **E1.** Em `/content` (foco do conteúdo) ou na aba **Peças** do evento, revise as peças.
- [ ] **E2.** Aprove todas as peças **obrigatórias**. O Output deve virar **aprovado** automaticamente.
- [ ] **E3.** Rejeite e reaprove uma peça obrigatória para confirmar que o status oscila review ↔ approved.
- [ ] **E4.** Confira a visão consolidada em `/approvals`.

## Parte F — Publicações (manual)

- [ ] **F1.** Em `/publicacoes`, conecte um canal (entra como `pending`).
- [ ] **F2.** No compositor, selecione o **conteúdo aprovado**, **suba uma imagem** manualmente.
- [ ] **F3.** Salve a publicação e clique **Marcar como publicada** (modo `manual`).
- [ ] **F4.** Tente **Publicar na Meta** → deve retornar **erro claro** ("em breve"), **sem fingir sucesso**.

## Parte G — Relatório

- [ ] **G1.** Em `/relatorios`, confira: **publicação registrada**, **custo real** das 2 chamadas de IA,
      tokens por modelo/agente. A marca aparece com o **nome oficial**.
- [ ] **G2.** Em `/admin/acessos`, confira que a **trilha de auditoria** registrou criação de evento,
      execução de pesquisa/cocriação e publicação.

---

## Registro de execuções reais (preencher ao rodar)

| # | Onde | Modelo | Profundidade | Tokens aprox. | Custo aprox. (US$) |
|---|---|---|---|---|---|
| 1 | Pesquisa (C1) | gpt-4o-mini | Rápida | — | — |
| 2 | Cocriação (D1) | gpt-4o-mini | Rápida | — | — |

> **Meta de custo:** duas execuções "Rápidas" com gpt-4o-mini custam poucos centavos de dólar.
> Não rodar pesquisa "Profunda" nem loops de geração em massa durante a validação.
