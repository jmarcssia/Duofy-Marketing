# Redesign Núcleo — Design System + Workspace Kanban — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar chat + pesquisa + cocriação numa página-workspace clara (nunca dark) com kanban de pesquisas/conteúdos, cards que abrem em pop-up grande (oficina), inspetor mínimo no rodapé, sobre uma fundação de design system refinada.

**Architecture:** Next.js 14 App Router. Reaproveita `document-workspace.tsx` (13 exports) como o pop-up. Casca clara em `app-shell.tsx`. Nova página `/workspace` com `ChatPanel` (esq.) + `KanbanBoard` (centro) + `InspectorBar` (rodapé). Todo dado vem de endpoints já existentes; mover card entre colunas chama transições de status reais.

**Tech Stack:** Next.js 14.2, React 18, TypeScript, Tailwind (config em `apps/web/tailwind.config.ts`), `lib/api.ts` (apiFetch + tipos), Tabler/ícones próprios em `components/icons.tsx`.

## Global Constraints

- **Tema claro sempre. NUNCA dark.** Nenhum fundo escuro em nenhuma tela (a sidebar `#080914` vira clara). Verificar visualmente em cada tarefa de UI.
- Identidade oficial (tokens em `tailwind.config.ts`): `ink #11131a`, `muted #6b7280`, `line #e9e8ef`, `panel #fbfbfd`, `purple #6d35ee`, `purple-soft #f4efff`. Fonte Inter. Refinar, não reinventar.
- Nada mockado: todo elemento liga a endpoint real ou mostra empty-state com CTA.
- Reusar `document-workspace.tsx`; não reinventar grids.
- Aprovação 100% humana; Guardião nunca pulado (o backend bloqueia via `ensure_quality_passed`).
- PT-BR, sentence case.
- **Verificação de frontend** (o projeto não tem harness de teste de UI): cada tarefa de UI roda `npm.cmd --prefix apps/web run lint` e `npm.cmd --prefix apps/web run build` (ambos devem passar) + checagens manuais no preview (`web` na porta 3001, já em `.claude/launch.json`). Partes não-visuais (extração de util) têm asserção objetiva (grep/ausência de duplicata).
- Páginas antigas (`/content`, `/research`, `/approvals`) permanecem funcionando até serem absorvidas; não quebrar.

---

### Task N0: Fundação de design system

**Files:**
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/components/page-primitives.tsx`
- Create: `apps/web/lib/ui.ts`
- Modify: `apps/web/app/(app)/admin/agents/page.tsx`, `apps/web/app/(app)/research/page.tsx`, `apps/web/app/(app)/calendar/page.tsx`, `apps/web/app/(app)/content/page.tsx` (importar `isLlmProvider` de `lib/ui`)

**Interfaces:**
- Produces: tokens `clay/linen/moss` válidos; `Skeleton` component; `EmptyState` com prop `action`; `isLlmProvider(provider: string): boolean` e `statusLabel(status: string): string` em `apps/web/lib/ui.ts`.

- [ ] **Step 1: Tornar válidos os tokens órfãos do login (sem quebrar o visual)**

O login usa `clay/linen/moss` que não existem → mapear para a paleta oficial em `apps/web/tailwind.config.ts` (dentro de `theme.extend.colors`), para nada renderizar sem cor. O redesign completo do login é Frente 1; aqui só se garante que ele renderize na identidade oficial:
```ts
        "purple-soft": "#f4efff",
        clay: "#6d35ee",
        linen: "#fbfbfd",
        moss: "#16a34a",
        orange: "#f97316",
```

- [ ] **Step 2: Adicionar utilitário de skeleton (claro)**

Em `apps/web/app/globals.css`, ao final:
```css
.duofy-skeleton {
  background: linear-gradient(90deg, #f1f0f6 25%, #e9e8ef 37%, #f1f0f6 63%);
  background-size: 400% 100%;
  animation: duofy-shimmer 1.4s ease infinite;
  border-radius: 10px;
}
@keyframes duofy-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}
```

- [ ] **Step 3: `Skeleton` + `EmptyState` com CTA em page-primitives**

Em `apps/web/components/page-primitives.tsx`, adicionar (mantendo os exports existentes):
```tsx
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`duofy-skeleton ${className}`} aria-hidden="true" />
}
```
E estender `EmptyState` para aceitar uma ação opcional (sem quebrar usos atuais): adicionar prop `action?: { label: string; onClick: () => void }`; quando presente, renderizar um `PurpleButton` com `label` abaixo do texto. Não remover props existentes.

- [ ] **Step 4: Extrair utilitários duplicados para `lib/ui.ts`**

Criar `apps/web/lib/ui.ts`:
```ts
const LLM_PROVIDERS = new Set(["openrouter", "anthropic", "openai"])

export function isLlmProvider(provider: string): boolean {
  return LLM_PROVIDERS.has(provider)
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Rascunho",
    review: "Em revisão",
    approved: "Aprovado",
    needs_adjustment: "Ajustes",
    rejected: "Rejeitado",
    archived: "Arquivado",
  }
  return map[status] ?? status
}
```
Nos 4 arquivos que definem `isLlmProvider` localmente (admin/agents, research, calendar, content), remover a definição local e `import { isLlmProvider } from "@/lib/ui"` (ou caminho relativo equivalente já usado no projeto). Confirmar com grep que não resta definição duplicada.

- [ ] **Step 5: Verificar**

Run:
```bash
grep -rn "const isLlmProvider\|function isLlmProvider" apps/web/app apps/web/components
npm.cmd --prefix apps/web run lint
npm.cmd --prefix apps/web run build
```
Expected: grep retorna 0 (só o de `lib/ui.ts`); lint sem erros; build com 17 rotas, sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add apps/web/tailwind.config.ts apps/web/app/globals.css apps/web/components/page-primitives.tsx apps/web/lib/ui.ts "apps/web/app/(app)/admin/agents/page.tsx" "apps/web/app/(app)/research/page.tsx" "apps/web/app/(app)/calendar/page.tsx" "apps/web/app/(app)/content/page.tsx"
git commit -m "feat(ui): fundação de design system (tokens, skeleton, EmptyState CTA, utils)"
```

---

### Task N1: Casca clara e ativa (app shell)

**Files:**
- Modify: `apps/web/components/app-shell.tsx`
- Create: `apps/web/lib/brand-context.tsx`
- Modify: `apps/web/middleware.ts`

**Interfaces:**
- Consumes: `isLlmProvider`/`statusLabel` (N0); endpoints `/api/brands`, `/api/auth/me`, `/api/outputs?query=`, `/api/memory/search`, `/api/operations/audit-events`, `/api/tasks/{id}`.
- Produces: `BrandProvider` + `useBrand()` (contexto global de marca) em `apps/web/lib/brand-context.tsx`.

- [ ] **Step 1: Casca clara**

Em `apps/web/components/app-shell.tsx`: substituir o fundo escuro da sidebar (`#080914`/`#080914`) e textos `text-white/78` por superfícies claras (fundo `panel`/branco, texto `ink`/`muted`, item ativo com `bg-purple-soft text-purple`). Manter a estrutura (rail + header). Garantir contraste AA. NENHUM fundo escuro.

- [ ] **Step 2: Contexto global de marca**

Criar `apps/web/lib/brand-context.tsx` com `BrandProvider` (carrega `/api/brands`, mantém `selectedBrand` em state + `localStorage 'duofy.brand'`) e hook `useBrand()` retornando `{ brands, selected, setSelected }`. Envolver o layout autenticado com `BrandProvider`. O seletor de marca do header passa a usar `useBrand()` (hoje cada página tem o seu).

- [ ] **Step 3: Busca global real**

No header, o input de busca passa a ser controlado; ao enviar (Enter), chama em paralelo `apiFetch('/api/outputs?query='+q, token)` e `apiFetch('/api/memory/search', token, {method:'POST', body: JSON.stringify({query:q, limit:8})})`, e mostra um dropdown de resultados (outputs + trechos de memória) com link para o artefato. Sem resultados → estado vazio com CTA "Abrir workspace".

- [ ] **Step 4: Sino de notificações real**

O sino abre um popover alimentado por `apiFetch('/api/operations/audit-events?limit=10', token)` (eventos recentes: aprovações, execuções, falhas), com indicador (ponto) quando houver itens não vistos (marcar visto em `localStorage 'duofy.notifs.seenAt'`).

- [ ] **Step 5: Middleware consistente**

Em `apps/web/middleware.ts`, adicionar `/chat`, `/calendar`, `/insights`, `/costs`, `/operations`, `/workspace` ao `protectedPrefixes` e ao `matcher`, alinhando com as rotas que hoje só checam auth no client.

- [ ] **Step 6: Verificar + commit**

Run: `npm.cmd --prefix apps/web run lint && npm.cmd --prefix apps/web run build`
Manual (preview :3001): nenhum fundo escuro; trocar a marca no header reflete nas páginas; busca retorna outputs/memória reais; sino lista eventos reais; rotas protegidas redirecionam sem token.
```bash
git add apps/web/components/app-shell.tsx apps/web/lib/brand-context.tsx apps/web/middleware.ts
git commit -m "feat(shell): casca clara com marca global, busca e notificações reais"
```

---

### Task N2: Board kanban (página workspace)

**Files:**
- Create: `apps/web/app/(app)/workspace/page.tsx`
- Create: `apps/web/components/kanban-board.tsx`
- Modify: `apps/web/lib/api.ts` (helper de listagem se necessário)

**Interfaces:**
- Consumes: `useBrand()` (N1); `statusLabel` (N0); endpoints `GET /api/outputs?status=&query=` (ContentOutput[]), `GET /api/research/reports` (ResearchReport[]), e transições `POST /api/content/outputs/{id}/submit-review`, `POST /api/outputs/{id}/approve`, `POST /api/outputs/{id}/request-adjustment`, `POST /api/outputs/{id}/reject`.
- Produces: `KanbanBoard` (props `{ onOpenCard: (id: number, type: string) => void }`); `WorkspacePage`.

- [ ] **Step 1: Página workspace (esqueleto de 1 página, claro)**

`apps/web/app/(app)/workspace/page.tsx`: layout de 3 zonas — slot esquerdo (placeholder para ChatPanel da N4), centro `<KanbanBoard onOpenCard=...>`, rodapé (placeholder para InspectorBar da N4). Por ora os slots esq./rodapé podem ser vazios; o foco da N2 é o board.

- [ ] **Step 2: KanbanBoard — carregar dados reais**

`apps/web/components/kanban-board.tsx`: ao montar (e ao trocar de marca via `useBrand`), carregar:
- conteúdos/press: `apiFetch('/api/outputs?status=', token)` (todos) — filtrar client-side por status nas colunas.
- pesquisas: `apiFetch('/api/research/reports', token)`.
Abas **Tudo / Pesquisas / Conteúdos** filtram quais cards aparecem. Enquanto carrega, mostrar `Skeleton` (N0). Sem itens → `EmptyState` com CTA "Pedir no chat".

- [ ] **Step 3: Colunas + cards**

Colunas por `Output.status`: `draft`→"Rascunho", `review`→"Em revisão", `approved`→"Aprovado" (usar `statusLabel`). Card mostra ícone do tipo (pesquisa=busca, conteúdo=arquivo, press=megafone), título, marca e badge de score do Guardião quando `latest_quality_review` existir. Pesquisas (sempre draft) ficam em Rascunho com ação "usar em conteúdo". Card clicável chama `onOpenCard(id, type)`.

- [ ] **Step 4: Mover card = transição de status real**

Mover um card entre colunas dispara a transição correspondente e recarrega o board:
- Rascunho→Em revisão: `POST /api/content/outputs/{id}/submit-review` (roda o Guardião; se falhar, volta para `needs_adjustment` e mostra a mensagem do backend, mantendo o card).
- Em revisão→Aprovado: `POST /api/outputs/{id}/approve` (o backend bloqueia se o Guardião não passou — mostrar a mensagem e manter o card na coluna).
- Em revisão→(ajuste): `POST /api/outputs/{id}/request-adjustment`.
V1: mover entre colunas (drag simples ou menu "mover para"); ordenação dentro da coluna fica fora de escopo.

- [ ] **Step 5: Verificar + commit**

Run: `npm.cmd --prefix apps/web run lint && npm.cmd --prefix apps/web run build`
Manual (:3001, com Docker rodando e dados reais): `/workspace` lista outputs e pesquisas reais nas colunas certas; abas filtram; mover um card de Em revisão→Aprovado chama o endpoint e o status muda (confirmar em `/operations` ou recarregando); skeleton e empty-state aparecem quando aplicável; nenhum fundo escuro.
```bash
git add "apps/web/app/(app)/workspace/page.tsx" apps/web/components/kanban-board.tsx apps/web/lib/api.ts
git commit -m "feat(workspace): board kanban de pesquisas e conteúdos com transição de status"
```

---

### Task N3: Pop-up oficina (card → modal grande)

**Files:**
- Create: `apps/web/components/card-popup.tsx`
- Modify: `apps/web/app/(app)/workspace/page.tsx` (abrir o popup via `onOpenCard`)

**Interfaces:**
- Consumes: exports de `apps/web/components/document-workspace.tsx` — `DocumentWorkspace, ModeToggle, ExportMenu, DocumentEditor, DocumentPreview, MetadataInspector, VersionTimeline, VersionCompareView, CommentPanel, InspectorStack`; endpoints `GET /api/content/outputs/{id}` ou `GET /api/research/reports/{id}`, `GET /api/outputs/{id}/quality-review`, `GET /api/outputs/{id}/comments`, `PATCH /api/content/outputs/{id}`, `GET /api/outputs/{id}/export`, `POST /api/outputs/{id}/approve|reject|request-adjustment`.
- Produces: `CardPopup` (props `{ outputId: number; type: string; onClose: () => void; onChanged: () => void }`).

- [ ] **Step 1: Modal claro reusando DocumentWorkspace**

`apps/web/components/card-popup.tsx`: um overlay (scrim translúcido leve, NÃO um fundo escuro de app — temporário), modal grande centralizado. Carregar o artefato real (`/api/content/outputs/{id}` para conteúdo/press; `/api/research/reports/{id}` para pesquisa). Cabeçalho: tipo + título + badge `statusLabel(status)` + `ModeToggle` (Prévia/Editar) + `ExportMenu` + fechar. Corpo esquerdo: `DocumentPreview` (prévia) / `DocumentEditor` (editar → `PATCH` cria versão). Não usar `position: fixed`; seguir o padrão de modal em fluxo normal.

- [ ] **Step 2: Inspetor do pop-up (Guardião / Versões / Comentários)**

À direita, `InspectorStack` com abas: Guardião (`/api/outputs/{id}/quality-review`: score, falhas críticas, correções, melhorias), Versões (`VersionTimeline` + `VersionCompareView` via `/api/outputs/{id}/versions/{from}/compare/{to}`), Comentários (`CommentPanel` via `/api/outputs/{id}/comments`).

- [ ] **Step 3: Ações de decisão**

Botões Aprovar / Solicitar ajuste / Rejeitar chamando os endpoints; ao concluir, `onChanged()` (recarrega o board) e fecha ou atualiza. Aprovar quando o Guardião não passou → o backend bloqueia; mostrar a mensagem retornada, não forçar.

- [ ] **Step 4: Ligar ao board**

Em `workspace/page.tsx`, `onOpenCard(id, type)` abre `<CardPopup outputId={id} type={type} onClose=... onChanged={reloadBoard} />`.

- [ ] **Step 5: Verificar + commit**

Run: `npm.cmd --prefix apps/web run lint && npm.cmd --prefix apps/web run build`
Manual: clicar num card abre o pop-up com o conteúdo real; abas Guardião/Versões/Comentários carregam dados reais; editar cria versão; aprovar/ajustar reflete no board; scrim leve, sem fundo escuro de app.
```bash
git add apps/web/components/card-popup.tsx "apps/web/app/(app)/workspace/page.tsx"
git commit -m "feat(workspace): pop-up oficina reusando DocumentWorkspace (Guardião/versões/comentários/ações)"
```

---

### Task N4: Chat-driver + inspetor no rodapé

**Files:**
- Create: `apps/web/components/chat-panel.tsx`
- Create: `apps/web/components/inspector-bar.tsx`
- Modify: `apps/web/app/(app)/workspace/page.tsx`

**Interfaces:**
- Consumes: endpoints `GET/POST /api/chat/sessions`, `GET /api/chat/sessions/{id}`, `POST /api/chat/sessions/{id}/messages`, `GET /api/tasks/{id}/stream` (SSE) + `GET /api/tasks/{id}`, `GET /api/documents`, `POST /api/memory/search`, `POST /api/research/reports/{id}/use-in-content`; `AgentTask.output_type`/`output_id`/`logs[]` (lib/api.ts).
- Produces: `ChatPanel` (props `{ onTaskActivity: (task: AgentTask) => void; onArtifact: (outputType: string, outputId: number) => void }`); `InspectorBar` (props `{ task: AgentTask | null }`).

- [ ] **Step 1: ChatPanel (extrair de chat/page.tsx)**

`apps/web/components/chat-panel.tsx`: sessões (`GET /api/chat/sessions`) + conversa + compositor. Enviar → `POST .../messages`; acompanhar a tarefa por `streamTask` (reaproveitar a lógica SSE existente de `chat/page.tsx`, com fallback polling). Quando uma tarefa concluir com `output_type`+`output_id`, chamar `onArtifact(output_type, output_id)` (o board destaca/abre o card) e renderizar um `WorkspaceListItem` clicável na conversa — sem string-matching de log. Compositor tem chip de **Memória** (dropdown de `GET /api/documents` + `POST /api/memory/search`) para injetar contexto.

- [ ] **Step 2: InspectorBar (rodapé mínimo)**

`apps/web/components/inspector-bar.tsx`: faixa fina no rodapé do workspace mostrando a tarefa ativa — fase atual derivada de `task.status`/`logs[]` (Pesquisando→Gerando→Revisando→Concluído), barra de progresso, e botão "Detalhes" que expande para os logs completos. Indicador de modo (SSE vs polling). Vazio quando não há tarefa ativa.

- [ ] **Step 3: Substituir o bridge localStorage por ação in-page**

Onde hoje a pesquisa manda para conteúdo via `localStorage 'duofy.content.prefill'`: no workspace, a ação "usar em conteúdo" de um card de pesquisa chama `POST /api/research/reports/{id}/use-in-content`, pega o briefing e preenche o compositor do ChatPanel da mesma sessão (com seletor de canal/formato), sem navegação nem localStorage.

- [ ] **Step 4: Montar a página completa**

Em `workspace/page.tsx`: esquerda `<ChatPanel onArtifact={...} onTaskActivity={setActiveTask} />`, centro `<KanbanBoard>`, rodapé `<InspectorBar task={activeTask} />`. `onArtifact` recarrega o board e pode abrir o `CardPopup`.

- [ ] **Step 5: Verificar + commit**

Run: `npm.cmd --prefix apps/web run lint && npm.cmd --prefix apps/web run build`
Manual e2e (:3001, Docker + provedor LLM configurado): pedir no chat "pesquise X e escreva um post" → InspectorBar mostra fases ao vivo → ao concluir, cards aparecem no board → abrir o post no pop-up → aprovar. Chip de memória injeta contexto. Nenhum fundo escuro em nenhuma etapa.
```bash
git add apps/web/components/chat-panel.tsx apps/web/components/inspector-bar.tsx "apps/web/app/(app)/workspace/page.tsx"
git commit -m "feat(workspace): chat-driver, inspetor no rodapé e fim do bridge localStorage"
```

---

## Self-Review (preenchido)

**Cobertura do spec:** design system/tokens/skeleton/EmptyState/utils → N0; casca clara + busca/sino/marca global + middleware → N1; kanban por status + transições → N2; pop-up oficina (Guardião/versões/comentários/ações) → N3; chat-driver + inspetor rodapé + fim do bridge + memória → N4; "nunca dark" → checagem manual em toda tarefa de UI; critérios de sucesso → N2/N3/N4.

**Desvio consciente de TDD:** o frontend do projeto não tem harness de teste de UI (confirmado — nenhum *.test.tsx, sem jest/vitest/playwright em apps/web). Por isso as tarefas de UI verificam por lint+build+preview manual com checagens objetivas, em vez de red/green. As partes não-visuais (N0 extração de util) têm asserção por grep. Esse desvio é sancionado pelo spec (seção 8).

**Pontos a confirmar na execução (não bloqueiam):**
- Caminho de import do projeto (`@/lib/...` vs relativo) — espelhar o que `lib/api.ts` já usa nos imports existentes.
- Mecanismo de drag: se uma lib de DnD não estiver presente, usar um menu "mover para" (sem nova dependência) — evita inflar deps; decidir na N2.
- O endpoint exato de aprovação para pesquisa vs conteúdo: pesquisas ficam em Rascunho (sem Guardião); só conteúdo/press transitam pelo pipeline. Confirmado no spec.
