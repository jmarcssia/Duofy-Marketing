# Design — Redesign Núcleo: Design System + Workspace Unificado

Data: 2026-06-26
Status: aprovado (mockup validado) para virar plano de implementação
Escopo: primeiro de vários sub-projetos do redesign. Este spec cobre **Frente 0 (design system)** + **Frente 4 (workspace unificado em kanban)**. As demais frentes (1 login, 2 app shell completo, 3 dashboard KPIs, 5 analíticas, 6 calendário, 7 aprovações avançadas, 8 segurança) seguem em specs próprios, herdando o design system desta.

## 1. Contexto (verificado por mapeamento multiagente do frontend)

- O frontend Next.js 14 já consome **dados reais** em quase todas as páginas (login, dashboard, chat, conteúdo, aprovações, pesquisa, memória, calendário, custos, insights, operações, admin). Não é um problema de "mocks"; é de **design/UX, integração e visualização**.
- O componente `apps/web/components/document-workspace.tsx` já é o padrão maduro (prévia/edição/versões/comentários/export) reusado por content/research/approvals/memory — é a espinha dorsal do redesign.
- O backend já modela o fluxo do workspace: `AgentTask` carrega `output_type`+`output_id`+`logs[]`+`status`; outputs têm `status` (draft/review/approved/needs_adjustment/rejected/archived); o handoff pesquisa→conteúdo já existe (hoje via localStorage, a substituir).
- Bug crítico de design: o login usa tokens `clay/linen/moss` inexistentes no `tailwind.config.ts` → está visualmente quebrado.

## 2. Objetivo

Unificar chat + pesquisa + cocriação numa **página-workspace** organizada como **quadro kanban** para controle de pesquisas e conteúdos, onde cada card abre num **pop-up grande** (a oficina de documento), com o **inspetor da tarefa como faixa mínima no rodapé** e o **chat (orquestrador) como painel à esquerda** que cria/dirige os cards. Aplicar uma identidade visual **única, clara e refinada** (a paleta roxa atual), de `/login` em diante.

## 3. Restrições duras (Global Constraints)

- **Tema claro sempre. Nunca dark.** Eliminar qualquer fundo escuro, incluindo a sidebar atual (`#080914`) — vira rail claro. Decisão explícita e repetida do usuário.
- Identidade oficial: paleta roxa existente (`purple #6d35ee`, `ink #11131a`, `panel #fbfbfd`, `line #e9e8ef`, `purple-soft #f4efff`), fonte Inter, cards arredondados, sombras suaves. **Refinar, não reinventar.**
- Corrigir/oficializar tokens: remover `clay/linen/moss` do login e usar a paleta oficial.
- **Nada mockado**: todo elemento deve ligar a um endpoint real existente. Onde faltar dado, usar empty-state com CTA (não placeholder estático).
- Reusar `document-workspace.tsx` em vez de reinventar grids.
- Sem migration Alembic (o redesign é frontend; usa endpoints existentes).
- PT-BR, sentence case, sem ALL CAPS gritado.

## 4. Arquitetura da interface

### 4.1 Casca (app shell) — clara e ativa
- Rail de navegação **claro** (substitui a sidebar escura), ícones + rótulos, contraste adequado.
- Header com: logo, **seletor de marca como contexto global** (propaga para todas as páginas), **busca global real** (une outputs `/api/outputs?query=` + memória `/api/memory/search`), **sino de notificações** alimentado por `/api/operations/audit-events` + status de `/api/tasks`.
- Skeletons de carregamento padronizados; `EmptyState` sempre com CTA acionável.

### 4.2 Página Workspace (a Frente 4)
Layout de uma página, tudo claro:
- **Esquerda — Chat (orquestrador):** lista de sessões (`GET /api/chat/sessions`) + conversa + compositor com chip de **Memória** (injeta contexto via `/api/documents`/`/api/memory/search`). Enviar mensagem dispara `POST /api/chat/sessions/{id}/messages` → `AgentTask`. As respostas com `output_type`+`output_id` viram **cards** no quadro (não links de texto).
- **Centro/direita — Quadro Kanban:** o controle de pesquisas e conteúdos.
  - Abas/filtro: **Tudo · Pesquisas · Conteúdos** (e press incluso em conteúdos).
  - Colunas = `Output.status`: **Rascunho** (draft) → **Em revisão** (review) → **Aprovado** (approved). (`needs_adjustment`/`rejected`/`archived` acessíveis por filtro; não como colunas fixas no V1.)
  - Cards: ícone do tipo (Pesquisa/Conteúdo/Press), título, marca, e badge de **score do Guardião** quando houver. Fonte: `GET /api/outputs` e `GET /api/research/reports`.
  - **Mover card entre colunas = transição de status real**, usando os endpoints existentes: Rascunho→Em revisão = `POST /api/content/outputs/{id}/submit-review` (roda o Guardião); Em revisão→Aprovado = `POST /api/outputs/{id}/approve`; ações de ajuste/rejeição = `request-adjustment`/`reject`. Pesquisas (status draft) não transitam pelo Guardião — têm ação "usar em conteúdo".
- **Rodapé — Inspetor mínimo:** faixa fina mostrando a **tarefa ativa** (orquestrador): fase atual (Pesquisando→Gerando→Revisando→Concluído lendo `logs[]`/status de `/api/tasks/{id}/stream`), barra de progresso, e "Detalhes" que expande. Substitui o painel lateral direito do conceito anterior.

### 4.3 Card → Pop-up grande (a oficina)
Clicar num card abre um **modal grande** reusando `document-workspace.tsx`:
- Cabeçalho: tipo + título + badge de status + toggle **Prévia/Editar** + **Export** (pdf/docx/md/html via `/api/outputs/{id}/export`) + fechar.
- Esquerda: **prévia/edição** do conteúdo (`DocumentPreview`/`DocumentEditor`), buscando o artefato real (`GET /api/content/outputs/{id}` ou `GET /api/research/reports/{id}`). Editar cria nova versão (`PATCH`).
- Direita: inspetor com abas **Guardião · Versões · Comentários** (reusa `MetadataInspector`/`VersionTimeline`/`CommentPanel`):
  - Guardião: score, falhas críticas, correções obrigatórias, melhorias (`GET /api/outputs/{id}/quality-review`).
  - Versões: `VersionTimeline` + comparação (`/api/outputs/{id}/versions/{from}/compare/{to}`).
  - Comentários: `/api/outputs/{id}/comments`.
- Ações: **Aprovar** / **Solicitar ajuste** / **Rejeitar** (endpoints de outputs). Aprovação 100% humana, Guardião nunca pulado (regra do projeto).

### 4.4 Substituir o bridge frágil
O handoff pesquisa→conteúdo (hoje via `localStorage 'duofy.content.prefill'`) vira **ação in-page**: "usar em conteúdo" pega o briefing (`POST /api/research/reports/{id}/use-in-content`) e alimenta o compositor da mesma sessão, com seletor de canal/formato (hoje hardcoded LinkedIn/Post).

## 5. Componentes (frontend)

| Componente | Responsabilidade | Origem |
|---|---|---|
| `AppShell` (refatorado) | Casca clara, busca/sino/marca funcionais | modifica `app-shell.tsx` |
| `WorkspacePage` | A página-workspace (chat + board + inspetor) | nova rota/página |
| `ChatPanel` | Sessões + conversa + compositor + memória | extrai de `chat/page.tsx` |
| `KanbanBoard` + `KanbanCard` | Colunas por status, cards por tipo, drag = transição | novo |
| `CardPopup` | Modal grande reusando `DocumentWorkspace` | reusa `document-workspace.tsx` |
| `InspectorBar` | Faixa de tarefa ativa no rodapé (fases/progresso) | novo |
| `useBrandContext` | Marca como contexto global compartilhado | novo (React context) |
| tokens/skeletons/EmptyState | Fundação de design system | modifica `tailwind.config.ts`, `page-primitives.tsx`, `globals.css` |
| `lib/api.ts` | extrair `isLlmProvider`/`statusLabel`/parsers duplicados | modifica |

## 6. Fluxo de dados (exemplo)
1. Usuário pede no chat: "pesquise X e escreva um post". → `POST .../messages` cria `AgentTask`.
2. Inspetor no rodapé mostra fases ao vivo (`/api/tasks/{id}/stream`).
3. Ao concluir, a tarefa traz `output_type`+`output_id` → aparecem **cards** no board (Pesquisa #50 em Rascunho; Post #51 em Em revisão com score do Guardião).
4. Clicar no Post #51 → pop-up grande com prévia + Guardião + versões + Aprovar/Ajustar.
5. Arrastar o card de "Em revisão" para "Aprovado" → `POST /api/outputs/51/approve`.

## 7. Tratamento de erros
- Falha ao carregar board/artefato → estado de erro claro (não tela branca), com retry.
- Transição de status inválida (ex: aprovar sem Guardião passar) → o backend bloqueia (`ensure_quality_passed`); a UI mostra a mensagem e mantém o card na coluna.
- Streaming do inspetor: indicador de modo SSE vs polling; reconexão; fallback claro.

## 8. Testes
- Frontend (sem harness de teste de UI no projeto): `npm run lint` + `npm run build` limpos; verificação manual no preview (board carrega outputs reais; mover card transita status; pop-up abre artefato real; inspetor reflete tarefa ao vivo; nenhum fundo escuro em nenhuma tela).
- Backend: o redesign usa endpoints existentes. Se algum endpoint de listagem unificada para o board for necessário (ex: `GET /api/outputs` já serve), preferir reusar; qualquer novo endpoint vem com teste no padrão do projeto (`@pytest.mark.anyio`, sem DB real).
- Regressão: as páginas antigas (/content, /research, /approvals) continuam funcionando até serem absorvidas; sem quebrar fluxos existentes.

## 9. Fora de escopo (deste spec)
- Frente 1 (login redesenhado), 2 (app shell completo além do necessário ao workspace), 3 (dashboard KPIs), 5 (analíticas com gráficos), 6 (calendário tempo-real), 7 (aprovações como página dedicada), 8 (segurança: cookie HttpOnly, rate limit, npm audit). Herdam o design system desta frente.
- Dark mode (proibido).
- Drag-and-drop avançado com reordenação dentro da coluna (V1: mover entre colunas = transição; ordenação livre fica para depois).

## 10. Decomposição recomendada (para o plano)
- **N0 — Fundação de design system:** tokens (resolver clay/linen/moss → paleta oficial), skeletons, EmptyState com CTA, extrair utils duplicados, rail claro. Pré-requisito.
- **N1 — Casca ativa:** busca global, sino, marca como contexto global; middleware (proteger /chat,/calendar,/insights,/costs,/operations).
- **N2 — Board kanban:** colunas por status, cards por tipo (outputs+research), abas Tudo/Pesquisas/Conteúdos, mover = transição de status.
- **N3 — Pop-up oficina:** modal reusando DocumentWorkspace (prévia/edição/export + Guardião + versões + comentários + aprovar/ajustar).
- **N4 — Chat-driver + inspetor no rodapé:** ChatPanel à esquerda, cards via output_type/output_id, InspectorBar com fases ao vivo, memória no compositor, fim do bridge localStorage.

## 11. Critérios de sucesso
1. Uma única página-workspace clara onde a conversa cria cards, o kanban controla pesquisas+conteúdos, cards abrem em pop-up grande e o inspetor vive no rodapé.
2. Mover um card de coluna transita o status real do output (verificável no banco/`/operations`).
3. O pop-up mostra o artefato real, o resultado do Guardião e permite aprovar/ajustar — tudo via endpoints existentes.
4. **Nenhuma tela tem fundo escuro.** Identidade roxa/clara consistente de `/login` ao workspace.
5. `npm lint` + `npm build` limpos; nenhum elemento mockado (todo dado vem de endpoint real ou empty-state com CTA).
