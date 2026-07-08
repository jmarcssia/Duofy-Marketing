# Deep-linking de resultados e visão rica de conteúdo — Design

**Data:** 2026-07-08 · **Telas:** `apps/web/app/(app)/research/page.tsx`,
`apps/web/app/(app)/content/page.tsx`, `apps/web/app/(app)/approvals/page.tsx`,
`apps/web/app/(app)/operations/page.tsx`, `apps/web/components/app-shell.tsx`,
`apps/web/app/(app)/calendar/EventDetailPanel.tsx` · **Status:** aprovado

## Objetivo

Hoje, clicar em qualquer referência a uma pesquisa ou conteúdo específico (painel de Operações,
busca global, Aprovações, Calendário) sempre leva a uma página genérica (`/research`, `/content`,
`/approvals`) sem nenhum ID — o usuário precisa procurar o item de novo manualmente. E quando
encontra, o conteúdo gerado pela cocriação perde toda a riqueza (legendas por canal, direção
visual, CTA, slides) e vira um editor de markdown cru com uma prévia pequena.

Este design resolve os dois problemas: (1) toda navegação para um item específico leva direto à
tela de resultado daquele item, sem cliques extras; (2) a tela de resultado do conteúdo mostra a
visão rica por padrão, mantendo a edição de markdown disponível numa aba separada.

## Escopo

Incluído agora:
- Parâmetro `?id={outputId}` em `/research` e `/content` que abre a tela de resultado direto,
  pulando formulário/lista.
- Tela de resultado do conteúdo com duas abas: **Visão geral** (pacote rico ou markdown
  renderizado) e **Editar** (editor atual, inalterado).
- Correção de todos os pontos de entrada que hoje linkam sem ID: painel de Operações, busca
  global, Aprovações, Calendário.
- Troca automática da marca selecionada ao abrir um item de outra marca por link direto.
- Estados de erro claros para ID inexistente/sem acesso.
- Testes E2E (Playwright) cobrindo os novos fluxos.

Fora de escopo:
- Visualizador de detalhe dedicado dentro da própria página de Aprovações (decidido: reaproveitar
  `/research?id=` e `/content?id=` em vez de duplicar a UI de resultado).
- Embutir o resultado dentro do painel modal do Calendário (decidido: o painel continua linkando
  para fora, só com o ID certo agora).
- Framework de teste de componente novo (Vitest/RTL) — a cobertura de comportamento continua via
  Playwright E2E, mesmo padrão já estabelecido no projeto.
- Tela dedicada de imprensa/assessoria — outputs de imprensa já passam pela mesma lista/tela de
  conteúdo (`ContentOutput`), então já ficam cobertos.

## Esquema de URL

**`/research`:**
- `?id={reportId}` → busca `GET /api/research/reports/{id}` no mount e mostra a visão de detalhe
  existente (markdown + fontes + ações) direto, pulando formulário de nova pesquisa e a lista
  lateral.
- Sem parâmetro → comportamento atual (formulário + "Pesquisas recentes").

**`/content`:**
- `?id={outputId}` → busca `GET /api/outputs/{id}` (dados base) e tenta
  `GET /api/cocreation/{outputId}` (pacote estruturado, 404 silencioso se não existir) no mount;
  mostra a tela de resultado com abas, pulando as abas de criação ("Conteúdos & rascunhos" /
  "Pacote estruturado").
- `?research={id}` → comportamento atual, inalterado (pré-preenche uma cocriação **nova** a partir
  de uma pesquisa aprovada).
- Sem parâmetro → comportamento atual (lista + criação).

Ambos os parâmetros dirigem o estado inicial via `useSearchParams()` (já usado em `/content`;
adicionar em `/research`), mantendo a URL como fonte de verdade — navegável, atualizável e
compartilhável.

## Tela de resultado do conteúdo (`/content?id=`)

Duas abas mutuamente exclusivas, com `PiecesReview` e os botões de ação (Salvar, Enviar para
revisão, Aprovar, Ajuste, PDF, Copiar, Arquivar) visíveis em ambas:

**Visão geral (padrão):**
- Se a versão atual do output tem `structured_json` (pacote da cocriação): mostra a visão rica —
  legendas por canal, direção visual, CTA, slides, análise estratégica, peças extras, checklist.
  Extraída do `CocreationPanel` atual para um componente reutilizável (`ContentPackageView` ou
  similar), evitando duplicar a renderização.
- Se não tem `structured_json` (conteúdo simples, imprensa, ou versão criada por edição manual):
  mostra o markdown renderizado em largura cheia — substitui a "Prévia" pequena de hoje.

**Editar:**
- O editor atual (título, status, textarea de markdown), sem mudança funcional. Salvar aqui cria
  uma nova `OutputVersion` **sem** `structured_json` (comportamento já existente do backend,
  `edit_content_output`) — então, após uma edição manual, a aba "Visão geral" passa a mostrar o
  markdown renderizado (a versão nova genuinamente não tem pacote estruturado; não é dado
  desatualizado, é a versão real).

Aba padrão ao abrir: "Visão geral" se houver pacote estruturado, senão cai para o conteúdo
renderizado ainda dentro de "Visão geral" (não pula direto para "Editar" — editar é sempre uma
ação explícita do usuário).

## Pontos de entrada corrigidos

Todos passam a incluir o ID do item, usando o mesmo helper `isResearch()` (já existe em
`content/page.tsx`) para decidir entre `/research?id=` e `/content?id=`:

| Origem | Arquivo | Hoje | Depois |
|---|---|---|---|
| Operações → "Saídas recentes" | `operations/page.tsx` | `/research` ou `/approvals` | `/research?id=X` ou `/content?id=X` |
| Busca global (topo) | `app-shell.tsx` | `/approvals` | `/research?id=X` ou `/content?id=X` |
| Aprovações → item da lista | `approvals/page.tsx` | `km.href` (sem ID) | `/research?id=X` ou `/content?id=X` |
| Calendário → aba Pesquisa | `EventDetailPanel.tsx` | `/research` | `/research?id={research_output_id}` |
| Calendário → aba Peças | `EventDetailPanel.tsx` | `/content`, `/approvals` | `/content?id={content_output_id}` |

## Marca ativa

Ao abrir um item por `?id=` de uma marca diferente da selecionada no topo, a página ajusta
`BrandContext.setSelected()` automaticamente para a marca do item (a API já valida acesso via
`assert_brand_access`; se o usuário não tem acesso, cai no estado de erro abaixo). Isso evita que
o usuário precise trocar a marca manualmente para ver o que acabou de clicar.

## Estados de erro

- ID inexistente ou sem acesso à marca → mensagem clara ("Este conteúdo/pesquisa não foi
  encontrado ou você não tem acesso.") com botão para voltar à lista. Nunca tela em branco ou
  spinner infinito.
- Carregando → skeleton consistente com o padrão já usado em outras listas do app.

## Testes

Segue o padrão já estabelecido no projeto (Playwright E2E, `apps/web/tests-e2e/`), sem introduzir
novo framework de teste de componente:

1. `/research?id=X` e `/content?id=X` abrem a visão de detalhe direto (rede mockada,
   determinístico, sem custo de LLM).
2. Troca de abas "Visão geral"/"Editar" no conteúdo, incluindo o caso sem pacote estruturado
   (cai para markdown renderizado).
3. ID inválido/sem acesso mostra a mensagem de erro, não trava.
4. Verificação manual (browser real, dados já seedados) dos pontos de entrada corrigidos —
   Operações, Aprovações, Calendário, busca.
5. Suíte completa (pytest backend + Playwright E2E) roda limpa ao final.
