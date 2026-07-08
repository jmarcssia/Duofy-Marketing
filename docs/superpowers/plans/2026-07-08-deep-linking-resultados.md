# Deep-linking de resultados e visão rica de conteúdo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer com que clicar em qualquer pesquisa/conteúdo específico (Operações, busca, Aprovações, Calendário) abra a tela de resultado direto (sem cliques extras), e que a tela de resultado do conteúdo mostre a visão rica gerada pela cocriação por padrão, com a edição de markdown numa aba separada.

**Architecture:** Feature 100% frontend (Next.js App Router) — todos os endpoints de backend necessários (`GET /api/research/reports/{id}`, `GET /api/outputs/{id}`, `GET /api/cocreation/{id}`) já existem. `/research` e `/content` passam a ler `?id=` via `useSearchParams()` e buscar o item direto no mount. A visão rica da cocriação é extraída de `CocreationPanel` para um componente reutilizável (`ContentPackageView`) usado tanto logo após gerar quanto ao reabrir um conteúdo existente.

**Tech Stack:** Next.js 14 (App Router), React, TypeScript, Tailwind, Playwright Test (E2E) — sem novo framework de teste de componente.

## Global Constraints

- Sem mudança de backend — reusar `GET /api/research/reports/{id}`, `GET /api/outputs/{id}`, `GET /api/cocreation/{id}` como já existem.
- Sem introduzir Vitest/RTL — cobertura de comportamento via Playwright E2E (`apps/web/tests-e2e/`), mesmo padrão já estabelecido no projeto.
- Ao abrir um item de outra marca por `?id=`, trocar a marca selecionada no topo automaticamente (`BrandContext.setSelected`) em vez de bloquear.
- ID inexistente/sem acesso → mensagem clara com botão de volta, nunca tela em branco ou spinner infinito.
- `PiecesReview` (aprovação por peça) visível nas duas abas do conteúdo (Visão geral/Editar), montado uma única vez (não remonta ao trocar de aba).
- Toda decisão pesquisa-vs-conteúdo usa o mesmo helper único (`isResearchOutput`), eliminando a lógica duplicada e ligeiramente divergente que hoje existe em `content/page.tsx`, `operations/page.tsx` e `approvals/page.tsx`.

---

### Task 1: Helper compartilhado de tipo de output

**Files:**
- Create: `apps/web/lib/output-kind.ts`

**Interfaces:**
- Produces: `isResearchOutput(o: { format?: string | null; channel?: string | null; category?: string | null }): boolean`, `resultHref(o: { id: number; format?: string | null; channel?: string | null; category?: string | null }): string` — usados pelas Tasks 4, 5 e 6.

- [ ] **Step 1: Criar o helper**

```ts
// apps/web/lib/output-kind.ts

/**
 * Fonte única de verdade para distinguir pesquisa de conteúdo a partir de um `ContentOutput`
 * (ou de qualquer objeto com os mesmos três campos). Antes desta função, a mesma lógica existia
 * duplicada — e levemente divergente — em content/page.tsx, operations/page.tsx e
 * approvals/page.tsx.
 */
export function isResearchOutput(o: {
  format?: string | null
  channel?: string | null
  category?: string | null
}): boolean {
  return o.format === "research_report" || o.channel === "Pesquisa" || o.category === "research"
}

/** URL da tela de resultado (pesquisa ou conteúdo) para um output — abre direto no item, sem
 * exigir que o usuário procure na lista depois. */
export function resultHref(o: {
  id: number
  format?: string | null
  channel?: string | null
  category?: string | null
}): string {
  return isResearchOutput(o) ? `/research?id=${o.id}` : `/content?id=${o.id}`
}
```

- [ ] **Step 2: Verificar tipos e lint**

Run: `cd apps/web && npx --no-install tsc --noEmit`
Expected: sem erros relacionados a `output-kind.ts`.

Run: `cd apps/web && npx --no-install next lint`
Expected: `✔ No ESLint warnings or errors`

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/output-kind.ts
git commit -m "feat(web): helper único isResearchOutput/resultHref para deep-linking"
```

---

### Task 2: Extrair ContentPackageView e refatorar CocreationPanel

**Files:**
- Create: `apps/web/app/(app)/operations/ContentPackageView.tsx`
- Modify: `apps/web/app/(app)/operations/CocreationPanel.tsx`

**Interfaces:**
- Consumes: `refineCocreationAsync`, `pollAgentTask`, `getCocreation`, `type CocreationRefineTarget`, `type ContentPackage`, `type ContentPackageResponse` (de `@/lib/api`), `getTokenFromCookie` (de `@/lib/auth`), `friendlyError` (de `@/lib/friendly-error`).
- Produces: `ContentPackageView({ outputId: number; package: ContentPackage; warnings: string[]; onRefined?: (response: ContentPackageResponse) => void })` — componente usado por esta task (dentro de `CocreationPanel`) e pela Task 4 (`content/page.tsx`).

Este refactor não muda nenhum comportamento visível — `CocreationPanel` continua igual pra quem usa. É pré-requisito da Task 4, que precisa do mesmo componente pra mostrar um pacote já existente (não só logo após gerar).

- [ ] **Step 1: Criar `ContentPackageView.tsx` com o conteúdo extraído**

```tsx
// apps/web/app/(app)/operations/ContentPackageView.tsx
"use client"

import { useState } from "react"

import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CopyIcon,
  RefreshIcon,
  SparklesIcon
} from "@/components/icons"
import { Badge, GhostButton } from "@/components/ui"
import {
  getCocreation,
  pollAgentTask,
  refineCocreationAsync,
  type CocreationRefineTarget,
  type ContentPackage,
  type ContentPackageResponse
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { friendlyError } from "@/lib/friendly-error"

function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard?.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable, no-op */
    }
  }
  return (
    <button
      onClick={copy}
      className="duofy-tap flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:border-purple/40 hover:text-purple"
    >
      <CopyIcon className="h-3.5 w-3.5" /> {copied ? "Copiado!" : label}
    </button>
  )
}

/**
 * Visão rica de um pacote de cocriação (legendas por canal, direção visual, CTA, slides,
 * peças extras, checklist) + ações de refino. Usado logo após gerar (CocreationPanel) e ao
 * reabrir um conteúdo já existente (/content?id=).
 */
export function ContentPackageView({
  outputId,
  package: pkg,
  warnings,
  onRefined
}: {
  outputId: number
  package: ContentPackage
  warnings: string[]
  onRefined?: (response: ContentPackageResponse) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [refineBusy, setRefineBusy] = useState<string | null>(null)
  const [showToneInput, setShowToneInput] = useState(false)
  const [showPersonaInput, setShowPersonaInput] = useState(false)
  const [toneInstr, setToneInstr] = useState("")
  const [personaInstr, setPersonaInstr] = useState("")
  const [guardianNote, setGuardianNote] = useState("")

  async function refine(
    target: CocreationRefineTarget,
    extra?: {
      slide_number?: number; instruction?: string; channel?: string
      use_guardian_feedback?: boolean; human_note?: string
    }
  ) {
    const token = getTokenFromCookie()
    if (!token) return
    const key = `${target}:${extra?.slide_number ?? ""}`
    setRefineBusy(key); setError(null)
    try {
      const task = await refineCocreationAsync(token, outputId, { target, ...extra })
      const finished = await pollAgentTask(task.id, token, { intervalMs: 3000, timeoutMs: 120_000 })
      if (finished.output_id) {
        const res = await getCocreation(token, finished.output_id)
        onRefined?.(res)
      }
      setShowToneInput(false); setShowPersonaInput(false); setToneInstr(""); setPersonaInstr(""); setGuardianNote("")
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AgentTaskTimeoutError") {
        setError("O ajuste está demorando; tente novamente em instantes.")
      } else {
        setError(friendlyError(e, "Falha ao ajustar conteúdo."))
      }
    }
    setRefineBusy(null)
  }

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber/40 bg-amber/10 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber"><AlertTriangleIcon className="h-4 w-4" /> Avisos</p>
          <ul className="space-y-1">{warnings.map((w, i) => <li key={i} className="text-xs text-ink/80">{w}</li>)}</ul>
        </div>
      )}

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}

      <div className="rounded-xl border border-purple/30 bg-purple-soft/40 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-purple">
          <SparklesIcon className="h-4 w-4" /> Solicitar ajuste com o Guardião
        </p>
        <p className="mb-2 text-xs text-ink/70">
          O Guardião encontrou pontos de melhoria antes da aprovação. Uma nova versão será criada
          sem apagar o histórico anterior.
        </p>
        <input
          value={guardianNote}
          onChange={(e) => setGuardianNote(e.target.value)}
          placeholder="Observação da gestora (opcional) — some às recomendações do Guardião"
          className="mb-2 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none"
        />
        <button
          onClick={() => refine("guardian", {
            instruction: undefined,
            use_guardian_feedback: true,
            human_note: guardianNote.trim() || undefined,
          })}
          disabled={refineBusy === "guardian:"}
          className="duofy-tap rounded-lg bg-purple px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50"
        >
          {refineBusy === "guardian:" ? "Ajustando…" : "Solicitar ajuste (recomendações do Guardião)"}
        </button>
      </div>

      <div className="rounded-xl border border-line bg-panel/50 p-3">
        <p className="mb-1 text-xs font-semibold text-ink">Análise estratégica</p>
        <p className="text-sm text-ink/90 whitespace-pre-wrap">{pkg.analise_estrategica}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line p-3">
          <p className="text-xs font-semibold text-muted">Persona</p>
          <p className="mt-1 text-sm text-ink">{pkg.persona || "—"}</p>
        </div>
        <div className="rounded-xl border border-line p-3">
          <p className="text-xs font-semibold text-muted">Objetivo</p>
          <p className="mt-1 text-sm text-ink">{pkg.objetivo || "—"}</p>
        </div>
        <div className="rounded-xl border border-line p-3">
          <p className="text-xs font-semibold text-muted">Etapa do funil</p>
          <p className="mt-1 text-sm text-ink">{pkg.etapa_funil || "—"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-panel/50 p-3">
        <p className="mb-1 text-xs font-semibold text-ink">Conceito</p>
        <p className="text-sm text-ink/90 whitespace-pre-wrap">{pkg.conceito}</p>
      </div>

      <div className="rounded-xl border border-line bg-panel/50 p-3">
        <p className="mb-1 text-xs font-semibold text-ink">Arco narrativo</p>
        <p className="text-sm text-ink/90 whitespace-pre-wrap">{pkg.arco_narrativo}</p>
      </div>

      {pkg.slides.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-ink">Carrossel</p>
          <div className="space-y-3">
            {pkg.slides.map((s) => {
              const key = `slide:${s.numero}`
              return (
                <div key={s.numero} className="rounded-xl border border-line p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge tone="purple">Slide {s.numero}</Badge>
                      <span className="text-xs font-semibold text-muted">{s.funcao}</span>
                    </div>
                    <button
                      onClick={() => refine("slide", { slide_number: s.numero })}
                      disabled={refineBusy === key}
                      className="duofy-tap flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:border-purple/40 hover:text-purple disabled:opacity-50"
                    >
                      <RefreshIcon className={`h-3.5 w-3.5 ${refineBusy === key ? "animate-spin" : ""}`} /> Regenerar slide
                    </button>
                  </div>
                  <p className="text-sm text-ink"><span className="font-semibold">Texto: </span>{s.texto}</p>
                  <p className="mt-1 text-sm text-ink"><span className="font-semibold">Texto da arte: </span>{s.texto_arte}</p>
                  <p className="mt-1 text-xs text-muted"><span className="font-semibold">Alt text: </span>{s.alt_text}</p>
                  <div className="mt-2 rounded-lg bg-panel/60 p-2.5">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted">Image prompt</span>
                      <CopyButton text={s.image_prompt} label="Copiar prompt" />
                    </div>
                    <p className="text-xs text-ink/80 whitespace-pre-wrap">{s.image_prompt}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {Object.keys(pkg.captions).length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-ink">Legendas por canal</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.entries(pkg.captions).map(([ch, text]) => (
              <div key={ch} className="rounded-xl border border-line p-3">
                <div className="mb-1 flex items-center justify-between">
                  <Badge tone="blue">{ch}</Badge>
                  <CopyButton text={text} />
                </div>
                <p className="text-sm text-ink/90 whitespace-pre-wrap">{text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {pkg.extra_pieces.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-ink">Peças extras</p>
          <div className="space-y-3">
            {pkg.extra_pieces.map((p, i) => (
              <div key={`${p.kind}-${i}`} className="rounded-xl border border-line p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {p.channel && <Badge tone="teal">{p.channel}</Badge>}
                    <span className="truncate text-xs font-semibold text-ink">{p.label}</span>
                  </div>
                  <CopyButton text={p.content} />
                </div>
                <p className="text-sm text-ink/90 whitespace-pre-wrap">{p.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-line p-3">
        <p className="mb-2 text-sm font-bold text-ink">Direção visual</p>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {([
            ["Conceito", pkg.visual_direction.conceito],
            ["Estilo", pkg.visual_direction.estilo],
            ["Cenário", pkg.visual_direction.cenario],
            ["Enquadramento", pkg.visual_direction.enquadramento],
            ["Composição", pkg.visual_direction.composicao],
            ["Iluminação", pkg.visual_direction.iluminacao],
            ["Paleta", pkg.visual_direction.paleta],
            ["Tipografia", pkg.visual_direction.tipografia],
            ["Restrições", pkg.visual_direction.restricoes]
          ] as [string, string][]).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold text-muted">{label}</dt>
              <dd className="text-sm text-ink/90">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-xl border border-line bg-panel/50 p-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold text-ink">CTA</p>
          <button
            onClick={() => refine("cta")}
            disabled={refineBusy === "cta:"}
            className="duofy-tap flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:border-purple/40 hover:text-purple disabled:opacity-50"
          >
            <RefreshIcon className={`h-3.5 w-3.5 ${refineBusy === "cta:" ? "animate-spin" : ""}`} /> Regenerar CTA
          </button>
        </div>
        <p className="text-sm text-ink/90 whitespace-pre-wrap">{pkg.cta}</p>
      </div>

      {pkg.factualidade.length > 0 && (
        <div className="rounded-xl border border-line p-3">
          <p className="mb-1 text-xs font-semibold text-ink">Factualidade</p>
          <ul className="space-y-1">{pkg.factualidade.map((f, i) => <li key={i} className="flex gap-2 text-xs text-muted"><span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" />{f}</li>)}</ul>
        </div>
      )}

      {pkg.checklist.length > 0 && (
        <div className="rounded-xl border border-line p-3">
          <p className="mb-1 text-xs font-semibold text-ink">Checklist</p>
          <ul className="space-y-1">{pkg.checklist.map((c, i) => <li key={i} className="flex gap-2 text-xs text-muted"><CheckCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green" />{c}</li>)}</ul>
        </div>
      )}

      <div className="space-y-2 border-t border-line pt-4">
        <div className="flex flex-wrap gap-2">
          <GhostButton className="text-xs" onClick={() => refine("shorten")}>
            {refineBusy === "shorten:" ? "Encurtando…" : "Encurtar"}
          </GhostButton>
          <GhostButton className="text-xs" onClick={() => setShowToneInput((v) => !v)}>Trocar tom</GhostButton>
          <GhostButton className="text-xs" onClick={() => setShowPersonaInput((v) => !v)}>Trocar persona</GhostButton>
        </div>

        {showToneInput && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={toneInstr} onChange={(e) => setToneInstr(e.target.value)} placeholder="Ex.: tom mais descontraído e próximo" className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
            <button onClick={() => refine("tone", { instruction: toneInstr.trim() || undefined })} disabled={refineBusy === "tone:"} className="duofy-tap shrink-0 rounded-lg bg-purple px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
              {refineBusy === "tone:" ? "Ajustando…" : "Aplicar"}
            </button>
          </div>
        )}
        {showPersonaInput && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={personaInstr} onChange={(e) => setPersonaInstr(e.target.value)} placeholder="Ex.: falar com gestores financeiros seniores" className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
            <button onClick={() => refine("persona", { instruction: personaInstr.trim() || undefined })} disabled={refineBusy === "persona:"} className="duofy-tap shrink-0 rounded-lg bg-purple px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
              {refineBusy === "persona:" ? "Ajustando…" : "Aplicar"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Remover de `CocreationPanel.tsx` o que foi extraído**

Em `apps/web/app/(app)/operations/CocreationPanel.tsx`:

1. Trocar o bloco de imports (linhas 1–68) por:

```tsx
"use client"

import { useEffect, useState } from "react"

import { Badge, FieldSelect } from "@/components/ui"
import { CloseIcon, SparklesIcon } from "@/components/icons"
import {
  BriefingCompleteness,
  BriefingSummary,
  ChoiceChips,
  CollapsibleSection,
  FieldGroup,
  MultiSelectChips,
  TemplatePicker,
  TextAreaField,
  TextField
} from "@/components/briefing"
import {
  briefingSummaryRows,
  CANAIS,
  cleanBriefing,
  computeCompleteness,
  CTAS,
  FINALIDADES,
  FORMATOS,
  labelOf,
  labelsOf,
  normalizeChannels,
  normalizeCocreationDepth,
  normalizePieces,
  type Option,
  PECAS,
  PECAS_EXTRAS_IDS,
  PERSONAS,
  RESTRICOES,
  RESTRICOES_DEFAULT,
  SEGMENTO_POR_MARCA,
  type StructuredBriefing,
  TOM_POR_SEGMENTO,
  TONS
} from "@/lib/briefing"
import {
  apiFetch,
  generateCocreationAsync,
  getCocreation,
  getResearchModels,
  pollAgentTask,
  type CocreationGenerateRequest,
  type ContentPackage,
  type ContentPackageResponse,
  type ResearchModel,
  type ResearchReport
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { friendlyError } from "@/lib/friendly-error"
import { allowedPiecesFor, PIECES_BY_CHANNEL } from "@/lib/pieces"
import { useBrand } from "@/lib/brand-context"

import { ContentPackageView } from "./ContentPackageView"
import { PiecesReview } from "./PiecesReview"
```

2. Remover inteiramente a função `CopyButton` (linhas 142–161 do arquivo original — o bloco `function CopyButton({ text, label = "Copiar" }: ...) { ... }`).

3. No bloco de estado (era linhas 199–207), remover as linhas de `refineBusy`, `toneInstr`, `personaInstr`, `showToneInput`, `showPersonaInput`, `guardianNote`, ficando:

```tsx
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ContentPackageResponse | null>(null)
```

4. Remover inteiramente a função `refine` (era linhas 359–387 — o bloco `async function refine(target, extra) { ... }`, entre o fim de `generate()` e a linha `const pkg: ContentPackage | null = ...`).

5. Trocar a linha `const extraPieces = pkg?.extra_pieces ?? []` (era linha 390) — remover essa linha inteira (não é mais usada nesta camada).

6. No JSX de render, trocar o bloco `{result && pkg && ( ... )}` inteiro (era linhas 554–787) por:

```tsx
      {result && pkg && (
        <div className="space-y-4">
          <PiecesReview outputId={result.output_id} />
          <ContentPackageView
            outputId={result.output_id}
            package={pkg}
            warnings={result.warnings}
            onRefined={setResult}
          />
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button onClick={() => setResult(null)} className="duofy-tap rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple">← Novo pacote</button>
          </div>
        </div>
      )}
```

- [ ] **Step 3: Verificar tipos, lint e build**

Run: `cd apps/web && npx --no-install tsc --noEmit`
Expected: sem erros (nenhuma referência pendente a `refine`, `refineBusy`, `CopyButton`, etc. dentro de `CocreationPanel.tsx`).

Run: `cd apps/web && npx --no-install next lint`
Expected: `✔ No ESLint warnings or errors` (confirma que não sobrou import não usado).

Run: `cd apps/web && npx --no-install next build`
Expected: build limpo, sem erros de tipo.

- [ ] **Step 4: Verificação manual (sem regressão de comportamento)**

Suba a stack (`docker compose up -d` se não estiver rodando), abra `/content`, aba "Pacote estruturado", gere um conteúdo (marca + tema + canal Instagram + formato Carrossel + "Gerar"). Confirme que o pacote aparece exatamente como antes (legendas, direção visual, CTA, slides) e que os botões de refino (Encurtar, Regenerar CTA, Regenerar slide, Solicitar ajuste do Guardião) continuam funcionando.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(app\)/operations/ContentPackageView.tsx apps/web/app/\(app\)/operations/CocreationPanel.tsx
git commit -m "refactor(web): extrai ContentPackageView de CocreationPanel (reuso p/ deep-link)"
```

---

### Task 3: `/research?id=` abre o relatório direto

**Files:**
- Modify: `apps/web/app/(app)/research/page.tsx`
- Test: `apps/web/tests-e2e/research-deep-link.spec.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (independente).

- [ ] **Step 1: Escrever o teste E2E (vai falhar até o Step 3)**

```ts
// apps/web/tests-e2e/research-deep-link.spec.ts
import { expect, test } from "@playwright/test"

import { login } from "./fixtures"

/**
 * Item de UX — /research?id=X deve abrir o relatório direto, sem exigir que o usuário
 * encontre o item na lista "Pesquisas recentes". Rede mockada: determinístico, sem custo de LLM.
 */
test.describe("Pesquisa — deep-link por ID", () => {
  test("abre o relatório direto quando a URL tem ?id=", async ({ page }) => {
    const REPORT_ID = 88001

    await page.route(`**/api/research/reports/${REPORT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: REPORT_ID,
          brand_slug: "duofy_solucoes",
          category: "general",
          channel: "Pesquisa",
          format: "research_report",
          title: "Relatório Deep-Link Mockado",
          briefing: "briefing de teste",
          briefing_json: null,
          status: "draft",
          provider: "openrouter",
          model: "openai/gpt-4o-mini",
          agent_run_id: null,
          current_version_id: 1,
          current_version_number: 1,
          current_content: "## Relatório\n\nConteúdo aberto direto por deep-link.",
          document_type: "research_report",
          document_sections: [],
          quality_notes: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          sources: []
        })
      })
    })

    await login(page)
    await page.goto(`/research?id=${REPORT_ID}`)

    // Deve mostrar o relatório direto — não o formulário de nova pesquisa nem a lista lateral.
    await expect(page.getByText("Relatório Deep-Link Mockado")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText("Conteúdo aberto direto por deep-link.")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Nova pesquisa" })).not.toBeVisible()
  })

  test("ID inexistente mostra mensagem de erro, não trava a tela", async ({ page }) => {
    await page.route("**/api/research/reports/99999999", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Relatorio de pesquisa nao encontrado." })
      })
    })

    await login(page)
    await page.goto("/research?id=99999999")

    await expect(page.getByText(/não foi encontrado|não tem acesso/i)).toBeVisible({ timeout: 15_000 })
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/web && npx --no-install playwright test tests-e2e/research-deep-link.spec.ts`
Expected: FAIL — `/research?id=88001` ainda mostra o formulário de nova pesquisa (comportamento atual), não o relatório.

- [ ] **Step 3: Implementar em `research/page.tsx`**

1. No topo, trocar o import de `next/navigation` (era `import { useRouter } from "next/navigation"`) por:

```tsx
import { useRouter, useSearchParams } from "next/navigation"
```

2. Adicionar `Suspense` ao import de `"react"` (era `import { useCallback, useEffect, useMemo, useRef, useState } from "react"`):

```tsx
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
```

3. Renomear `export default function ResearchPage()` para `function ResearchPageInner()` (só a linha da assinatura da função — o corpo inteiro continua igual).

4. Logo após a linha `const router = useRouter()`, adicionar:

```tsx
  const searchParams = useSearchParams()
  const idParam = searchParams.get("id")
  const [idNotFound, setIdNotFound] = useState(false)
```

5. Na desestruturação do brand context (era `const { brands, selected: brand } = useBrand()`), trocar para:

```tsx
  const { brands, selected: brand, setSelected: setBrand } = useBrand()
```

6. Adicionar, logo após a declaração de `openReport` (a função `async function openReport(id: number) { ... }`), um novo `useEffect`:

```tsx
  useEffect(() => {
    if (!idParam) return
    const id = Number(idParam)
    if (!Number.isFinite(id)) { setIdNotFound(true); return }
    const token = getTokenFromCookie()
    if (!token) return
    let cancelled = false
    setIdNotFound(false)
    apiFetch<ResearchReport>(`/api/research/reports/${id}`, token)
      .then((report) => {
        if (cancelled) return
        setBrand(report.brand_slug)
        setSelected(report)
      })
      .catch(() => { if (!cancelled) setIdNotFound(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam])
```

7. No JSX de retorno, logo depois da linha `const st = selected ? STATUS_TONE[...] ...` e antes do `return (`, não muda nada — mas dentro do `return`, ANTES do `<PageHeader ...>`, adicionar o estado de erro:

```tsx
  if (idNotFound) {
    return (
      <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-line py-20 text-center">
        <AlertTriangleIcon className="h-8 w-8 text-amber" />
        <p className="text-sm font-semibold text-ink">Pesquisa não encontrada</p>
        <p className="text-xs text-muted">Esta pesquisa não existe ou você não tem acesso a ela.</p>
        <button
          onClick={() => { setIdNotFound(false); router.push("/research") }}
          className="duofy-tap mt-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple"
        >
          ← Ver pesquisas recentes
        </button>
      </div>
    )
  }

  return (
```

8. No final do arquivo, trocar o fechamento da função (o `}` que fecha `ResearchPageInner`) e adicionar o wrapper com `Suspense`, igual ao padrão já usado em `content/page.tsx`:

```tsx
export default function ResearchPage() {
  return (
    <Suspense fallback={<div className="grid place-items-center py-20"><Spinner size={22} className="text-purple" /></div>}>
      <ResearchPageInner />
    </Suspense>
  )
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/web && npx --no-install playwright test tests-e2e/research-deep-link.spec.ts`
Expected: `2 passed`

- [ ] **Step 5: Verificar tipos, lint e build**

Run: `cd apps/web && npx --no-install tsc --noEmit && npx --no-install next lint && npx --no-install next build`
Expected: sem erros; `✔ No ESLint warnings or errors`; build limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(app\)/research/page.tsx apps/web/tests-e2e/research-deep-link.spec.ts
git commit -m "feat(web): /research?id= abre o relatório direto (deep-link)"
```

---

### Task 4: `/content?id=` com abas Visão geral / Editar

**Files:**
- Modify: `apps/web/app/(app)/content/page.tsx`
- Test: `apps/web/tests-e2e/content-deep-link.spec.ts`

**Interfaces:**
- Consumes: `ContentPackageView` (Task 2, `./ContentPackageView`).

- [ ] **Step 1: Escrever o teste E2E (vai falhar até o Step 3)**

```ts
// apps/web/tests-e2e/content-deep-link.spec.ts
import { expect, test } from "@playwright/test"

import { login } from "./fixtures"

const baseOutput = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  brand_slug: "duofy_solucoes",
  category: "content",
  channel: "Instagram",
  format: "Carrossel",
  title: "Conteúdo Deep-Link Mockado",
  briefing: "briefing de teste",
  briefing_json: null,
  status: "draft",
  provider: "openrouter",
  model: "openai/gpt-4o-mini",
  agent_run_id: null,
  current_version_id: 1,
  current_version_number: 1,
  current_content: "## Conteúdo\n\nMarkdown de fallback sem pacote estruturado.",
  document_type: "content",
  document_sections: [],
  quality_notes: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  versions: [],
  latest_quality_review: null,
  ...overrides
})

test.describe("Conteúdo — deep-link por ID", () => {
  test("com pacote estruturado: Visão geral mostra o pacote rico por padrão", async ({ page }) => {
    const OUTPUT_ID = 88101

    await page.route(`**/api/outputs/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(baseOutput(OUTPUT_ID)) })
    })
    await page.route(`**/api/pieces?output_id=${OUTPUT_ID}`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })
    await page.route(`**/api/outputs/${OUTPUT_ID}/pieces`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })
    await page.route(`**/api/cocreation/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          output_id: OUTPUT_ID,
          version_number: 1,
          status: "draft",
          package: {
            brand_slug: "duofy_solucoes", channel: "Instagram", format: "Carrossel",
            persona: "", objetivo: "", etapa_funil: "", analise_estrategica: "análise de teste",
            conceito: "", arco_narrativo: "", cta: "CTA de teste",
            captions: { Instagram: "Legenda rica de teste." },
            slides: [], visual_direction: {
              conceito: "", estilo: "", cenario: "", enquadramento: "", composicao: "",
              iluminacao: "", paleta: "", tipografia: "", restricoes: ""
            },
            extra_pieces: [], factualidade: [], checklist: []
          },
          content_markdown: "## Conteúdo\n\nMarkdown que não deveria aparecer na aba Visão geral.",
          warnings: []
        })
      })
    })

    await login(page)
    await page.goto(`/content?id=${OUTPUT_ID}`)

    await expect(page.getByText("Legenda rica de teste.")).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible()
  })

  test("sem pacote estruturado: Visão geral cai para o markdown renderizado", async ({ page }) => {
    const OUTPUT_ID = 88102

    await page.route(`**/api/outputs/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(baseOutput(OUTPUT_ID)) })
    })
    await page.route(`**/api/outputs/${OUTPUT_ID}/pieces`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })
    await page.route(`**/api/cocreation/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Este conteudo nao tem pacote estruturado." }) })
    })

    await login(page)
    await page.goto(`/content?id=${OUTPUT_ID}`)

    await expect(page.getByText("Markdown de fallback sem pacote estruturado.")).toBeVisible({ timeout: 15_000 })
  })

  test("aba Editar mostra o editor de markdown", async ({ page }) => {
    const OUTPUT_ID = 88103

    await page.route(`**/api/outputs/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(baseOutput(OUTPUT_ID)) })
    })
    await page.route(`**/api/outputs/${OUTPUT_ID}/pieces`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })
    await page.route(`**/api/cocreation/${OUTPUT_ID}`, async (route) => {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "sem pacote" }) })
    })

    await login(page)
    await page.goto(`/content?id=${OUTPUT_ID}`)
    await expect(page.getByText("Markdown de fallback sem pacote estruturado.")).toBeVisible({ timeout: 15_000 })

    await page.getByRole("button", { name: "Editar", exact: true }).click()
    await expect(page.getByLabel(/Conteúdo \(Markdown\)/)).toBeVisible()
  })

  test("ID inexistente mostra mensagem de erro", async ({ page }) => {
    await page.route("**/api/outputs/99999999", async (route) => {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Output nao encontrado." }) })
    })

    await login(page)
    await page.goto("/content?id=99999999")

    await expect(page.getByText(/não foi encontrado|não tem acesso/i)).toBeVisible({ timeout: 15_000 })
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/web && npx --no-install playwright test tests-e2e/content-deep-link.spec.ts`
Expected: FAIL — `/content?id=X` hoje ignora `?id=` e mostra a lista/criação.

- [ ] **Step 3: Implementar em `content/page.tsx`**

1. Trocar o import de tipos de `@/lib/api` (era `import { apiFetch, type ContentOutput, type ContentOutputDetail, type ContentTheme, type ResearchReport } from "@/lib/api"`) por:

```tsx
import {
  apiFetch,
  getCocreation,
  type ContentOutput,
  type ContentOutputDetail,
  type ContentPackageResponse,
  type ContentTheme,
  type ResearchReport
} from "@/lib/api"
```

2. Adicionar o import do helper (Task 1) e do componente extraído (Task 2), junto aos demais imports locais:

```tsx
import { isResearchOutput } from "@/lib/output-kind"

import { CocreationPanel } from "../operations/CocreationPanel"
import { ContentPackageView } from "../operations/ContentPackageView"
import { PiecesReview } from "../operations/PiecesReview"
```

3. Remover a função local `isResearch` (era `function isResearch(o: { format?: string; channel?: string; category?: string }) { return o.format === "research_report" || o.channel === "Pesquisa" || o.category === "research" }`) e trocar as duas chamadas a `isResearch(x)` no arquivo por `isResearchOutput(x)`.

4. Na função `CocreationInner`, trocar `const research = params.get("research") ?? undefined` por:

```tsx
  const research = params.get("research") ?? undefined
  const idParam = params.get("id")
```

5. Trocar a desestruturação do brand context (era `const { selected: brand } = useBrand()`) por:

```tsx
  const { selected: brand, setSelected: setBrand } = useBrand()
```

6. No bloco de estado "foco (editar um conteúdo)", logo abaixo da linha existente
   `const [detail, setDetail] = useState<ContentOutputDetail | null>(null)`, inserir três linhas
   novas (as linhas `focusId`, `detail`, `ef`, `busy`, `msg`, `refineInstr`, `refineBusy` que já
   existem no arquivo ficam exatamente como estão):

```tsx
  const [pkg, setPkg] = useState<ContentPackageResponse | null>(null)
  const [focusTab, setFocusTab] = useState<"visao" | "editar">("visao")
  const [idNotFound, setIdNotFound] = useState(false)
```

7. Trocar a função `openFocus` inteira (era `const openFocus = useCallback(async (id: number) => { ... }, [])`) por:

```tsx
  const openFocus = useCallback(async (id: number) => {
    setFocusId(id); setDetail(null); setPkg(null); setMsg(null); setRefineInstr(""); setIdNotFound(false)
    const token = getTokenFromCookie()
    if (!token) return
    try {
      const d = await apiFetch<ContentOutputDetail>(`/api/outputs/${id}`, token)
      setDetail(d)
      setEf({ title: d.title, content: d.current_content ?? "", status: d.status })
      setBrand(d.brand_slug)
      try {
        setPkg(await getCocreation(token, id))
      } catch {
        setPkg(null) // sem pacote estruturado nesta versão — comportamento esperado, não é erro
      }
    } catch {
      setIdNotFound(true)
    }
  }, [setBrand])
```

8. Adicionar, logo depois da declaração de `openFocus`, um `useEffect` que abre o item quando a URL tem `?id=`:

```tsx
  useEffect(() => {
    if (!idParam) return
    const id = Number(idParam)
    if (!Number.isFinite(id)) { setIdNotFound(true); return }
    void openFocus(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam])
```

9. Substituir o bloco `// ---- Foco (editar um conteúdo) ----` inteiro (o `if (focusId !== null) { return ( ... ) }`) por:

```tsx
  // ---- Foco (visualizar/editar um conteúdo) ----
  if (focusId !== null) {
    if (idNotFound) {
      return (
        <div className="space-y-4">
          <button onClick={() => { setFocusId(null); setIdNotFound(false) }} className="duofy-tap inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple">← Conteúdos</button>
          <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line py-16 text-center">
            <AlertTriangleIcon className="h-8 w-8 text-amber" />
            <p className="text-sm font-semibold text-ink">Conteúdo não encontrado</p>
            <p className="text-xs text-muted">Este conteúdo não existe ou você não tem acesso a ele.</p>
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => { setFocusId(null); setDetail(null); setPkg(null) }} className="duofy-tap inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple">← Conteúdos</button>
          {detail && <p className="truncate text-xs text-muted">{detail.channel} · {detail.provider}/{detail.model.replace("~", "")}</p>}
        </div>
        {!detail ? (
          <div className="grid place-items-center py-20"><Spinner size={22} className="text-purple" /></div>
        ) : (
          <>
            <Segmented
              options={[{ id: "visao", label: "Visão geral" }, { id: "editar", label: "Editar" }]}
              value={focusTab}
              onChange={setFocusTab}
            />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="duofy-card space-y-4 rounded-2xl p-5">
                {focusTab === "visao" ? (
                  pkg ? (
                    <ContentPackageView
                      outputId={focusId}
                      package={pkg.package}
                      warnings={pkg.warnings}
                      onRefined={() => { void openFocus(focusId) }}
                    />
                  ) : (
                    <Markdown content={ef.content || "_Sem conteúdo._"} />
                  )
                ) : (
                  <>
                    <label className="block text-xs font-semibold text-muted">Título
                      <input value={ef.title} onChange={(e) => setEf({ ...ef, title: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink focus:border-purple focus:outline-none" />
                    </label>
                    <label className="block text-xs font-semibold text-muted">Status
                      <select value={ef.status} onChange={(e) => setEf({ ...ef, status: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                        {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s].label}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-muted">Conteúdo (Markdown)
                      <textarea value={ef.content} onChange={(e) => setEf({ ...ef, content: e.target.value })} rows={16} className="mt-1 w-full resize-y rounded-lg border border-line px-3 py-2 font-mono text-xs leading-relaxed text-ink focus:border-purple focus:outline-none" />
                    </label>

                    <div className="rounded-xl border border-purple/30 bg-purple-soft/30 p-3">
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-purple-deep"><SparklesIcon className="h-4 w-4" /> Pedir ajuste ao agente</p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input value={refineInstr} onChange={(e) => setRefineInstr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && refineWithAgent()} placeholder="Ex.: encurte, CTA mais direto, tom mais formal…" className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
                        <button onClick={refineWithAgent} disabled={refineBusy || refineInstr.trim().length < 3} className="duofy-tap shrink-0 rounded-lg bg-purple px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">{refineBusy ? "Ajustando…" : "Ajustar"}</button>
                      </div>
                    </div>

                    {msg && <p className="text-xs font-medium text-purple-deep">{msg}</p>}
                    <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                      <button onClick={saveEdit} disabled={busy} className="duofy-tap inline-flex items-center gap-1.5 rounded-lg bg-purple px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50"><CheckCircleIcon className="h-4 w-4" /> Salvar</button>
                      {(detail.status === "draft" || detail.status === "needs_adjustment") && (
                        <GhostButton onClick={submitReview} disabled={busy}>Enviar para revisão</GhostButton>
                      )}
                      <button onClick={approveOutput} disabled={busy} className="duofy-tap rounded-lg border border-line px-3 py-2 text-sm font-medium text-green hover:border-green/40 disabled:opacity-50">Aprovar</button>
                      <button onClick={() => action("request-adjustment", "Ajuste solicitado.")} disabled={busy} className="duofy-tap inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple disabled:opacity-50"><SettingsIcon className="h-4 w-4" /> Ajuste</button>
                      <button onClick={exportPdf} className="duofy-tap inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple"><DownloadIcon className="h-4 w-4" /> PDF</button>
                      <button onClick={() => navigator.clipboard?.writeText(ef.content)} className="duofy-tap inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple"><CopyIcon className="h-4 w-4" /> Copiar</button>
                      <button onClick={() => action("archive", "Arquivado.")} disabled={busy} className="duofy-tap ml-auto inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted hover:border-red/40 hover:text-red disabled:opacity-50"><AlertTriangleIcon className="h-4 w-4" /> Arquivar</button>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-4">
                <PiecesReview outputId={focusId} onChanged={() => { void openFocus(focusId); void loadData() }} />
                {detail.quality_notes?.length > 0 && (
                  <div className="duofy-card rounded-2xl p-4">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink"><BookIcon className="h-4 w-4 text-purple" /> Notas de qualidade</p>
                    <ul className="space-y-1">{detail.quality_notes.map((n, i) => <li key={i} className="flex gap-2 text-xs text-muted"><span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />{n}</li>)}</ul>
                  </div>
                )}
                {focusTab === "editar" && (
                  <div className="duofy-card rounded-2xl p-4">
                    <p className="mb-1 text-xs font-semibold text-ink">Prévia</p>
                    <div className="max-h-80 overflow-y-auto duofy-scroll"><Markdown content={ef.content || "_Sem conteúdo._"} /></div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/web && npx --no-install playwright test tests-e2e/content-deep-link.spec.ts`
Expected: `4 passed`

- [ ] **Step 5: Verificar tipos, lint e build**

Run: `cd apps/web && npx --no-install tsc --noEmit && npx --no-install next lint && npx --no-install next build`
Expected: sem erros; `✔ No ESLint warnings or errors`; build limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(app\)/content/page.tsx apps/web/tests-e2e/content-deep-link.spec.ts
git commit -m "feat(web): /content?id= abre o conteúdo direto com abas Visão geral/Editar"
```

---

### Task 5: Corrigir todos os pontos de entrada restantes

**Files:**
- Modify: `apps/web/app/(app)/operations/page.tsx` (link em "Saídas recentes")
- Modify: `apps/web/components/app-shell.tsx` (resultados da busca global)
- Modify: `apps/web/app/(app)/approvals/page.tsx` (link "Abrir" da lista)
- Modify: `apps/web/app/(app)/calendar/EventDetailPanel.tsx` (abas Pesquisa/Peças)
- Test: `apps/web/tests-e2e/entry-points.spec.ts`

**Interfaces:**
- Consumes: `isResearchOutput`, `resultHref` (Task 1, `@/lib/output-kind`).

- [ ] **Step 1: Escrever o teste E2E (vai falhar até o Step 3)**

```ts
// apps/web/tests-e2e/entry-points.spec.ts
import { expect, test } from "@playwright/test"

import { login } from "./fixtures"

/**
 * Confirma que os pontos de entrada corrigidos (Operações, busca global, Aprovações) geram
 * links com ?id= — em vez de páginas genéricas que obrigam o usuário a procurar o item de novo.
 * Rede mockada: listas fixas e determinísticas.
 */
test.describe("Pontos de entrada — redirecionamento correto", () => {
  test("Operações → 'Saídas recentes' linka pesquisa e conteúdo com ?id=", async ({ page }) => {
    const researchItem = {
      id: 77201, brand_slug: "duofy_solucoes", category: "research", channel: "Pesquisa",
      format: "research_report", title: "Pesquisa recente de teste", briefing: "b", briefing_json: null,
      status: "draft", provider: "openrouter", model: "openai/gpt-4o-mini", agent_run_id: null,
      current_version_id: 1, current_version_number: 1, current_content: "conteúdo",
      document_type: "research_report", document_sections: [], quality_notes: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }
    const contentItem = {
      ...researchItem, id: 77202, category: "content", channel: "Instagram", format: "Carrossel",
      title: "Conteúdo recente de teste"
    }

    await page.route("**/api/research/reports?**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([researchItem]) })
    })
    await page.route("**/api/content/outputs?**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([contentItem]) })
    })

    await login(page)
    await page.goto("/operations")

    const researchLink = page.getByRole("link", { name: /Pesquisa recente de teste/ })
    const contentLink = page.getByRole("link", { name: /Conteúdo recente de teste/ })
    await expect(researchLink).toBeVisible({ timeout: 15_000 })
    await expect(researchLink).toHaveAttribute("href", "/research?id=77201")
    await expect(contentLink).toHaveAttribute("href", "/content?id=77202")
  })

  test("Busca global linka resultado com ?id=", async ({ page }) => {
    const item = {
      id: 77301, brand_slug: "duofy_solucoes", category: "content", channel: "Instagram",
      format: "Carrossel", title: "Resultado de busca de teste", briefing: "b", briefing_json: null,
      status: "draft", provider: "openrouter", model: "openai/gpt-4o-mini", agent_run_id: null,
      current_version_id: 1, current_version_number: 1, current_content: "conteúdo",
      document_type: "content", document_sections: [], quality_notes: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }
    await page.route("**/api/outputs?query=**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([item]) })
    })
    await page.route("**/api/memory/search", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })

    await login(page)
    await page.goto("/operations")
    await page.getByPlaceholder("Buscar pesquisas, conteúdos, marcas...").fill("teste")
    await page.getByPlaceholder("Buscar pesquisas, conteúdos, marcas...").press("Enter")

    const resultLink = page.getByRole("link", { name: /Resultado de busca de teste/ })
    await expect(resultLink).toBeVisible({ timeout: 15_000 })
    await expect(resultLink).toHaveAttribute("href", "/content?id=77301")
  })

  test("Aprovações → item da lista linka com ?id=", async ({ page }) => {
    const item = {
      id: 77401, brand_slug: "duofy_solucoes", category: "content", channel: "Instagram",
      format: "Carrossel", title: "Item de aprovação de teste", briefing: "b", briefing_json: null,
      status: "review", provider: "openrouter", model: "openai/gpt-4o-mini", agent_run_id: null,
      current_version_id: 1, current_version_number: 1, current_content: "conteúdo",
      document_type: "content", document_sections: [], quality_notes: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }
    await page.route("**/api/outputs?**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([item]) })
    })
    await page.route("**/api/calendar?**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })

    await login(page)
    await page.goto("/approvals")

    const openLink = page.getByRole("link", { name: /Abrir/ }).first()
    await expect(openLink).toBeVisible({ timeout: 15_000 })
    await expect(openLink).toHaveAttribute("href", "/content?id=77401")
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd apps/web && npx --no-install playwright test tests-e2e/entry-points.spec.ts`
Expected: FAIL nos três — hrefs hoje são `/research`, `/approvals` (sem ID) e `/approvals` (bare).

- [ ] **Step 3: Corrigir cada ponto de entrada**

**3a. `apps/web/app/(app)/operations/page.tsx`**

Trocar o import de `isResearch` local: remover a função `function isResearch(o: { format?: string; channel?: string; category?: string }) { ... }` (definida perto do topo do arquivo) e adicionar no bloco de imports:

```tsx
import { isResearchOutput, resultHref } from "@/lib/output-kind"
```

Trocar todas as chamadas a `isResearch(o)` no arquivo por `isResearchOutput(o)`.

Trocar a linha do link de "Saídas recentes" (era `<Link key={...} href={research ? "/research" : "/approvals"} ...>`):

```tsx
              {recentOutputs.map((o) => {
                const research = isResearchOutput(o)
                const st = STATUS_LABEL[o.status] ?? { label: o.status, tone: "slate" as Tone }
                return (
                  <Link key={`${research ? "r" : "c"}${o.id}`} href={resultHref(o)} className="duofy-card-hover flex flex-col rounded-xl border border-line bg-white p-3.5">
```

(o resto do bloco do card continua idêntico.)

**3b. `apps/web/components/app-shell.tsx`**

Adicionar o import:

```tsx
import { resultHref } from "@/lib/output-kind"
```

Trocar o link dos resultados de busca (era `<Link key={output.id} href={\`/approvals\`} onClick={() => setOpen(false)} ...>`):

```tsx
              {results.outputs.slice(0, 5).map((output) => (
                <Link key={output.id} href={resultHref(output)} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink hover:bg-purple-soft">
```

**3c. `apps/web/app/(app)/approvals/page.tsx`**

Trocar a função local `isResearch` (era `function isResearch(o: ContentOutput): boolean { return o.category === "research" || (o.format?.includes("research") ?? false) }`) — remover e adicionar ao bloco de imports:

```tsx
import { isResearchOutput } from "@/lib/output-kind"
```

Trocar a chamada `isResearch(o)` (dentro de `items = useMemo<Item[]>(...)`) por `isResearchOutput(o)`.

No item `Item`, adicionar um campo `href` calculado explicitamente por item (já que "evento"/"publicação" continuam usando `KIND_META[it.kind].href` bare — só pesquisa/conteúdo ganham `?id=`). Trocar o trecho que monta `list.push({ key: \`o${o.id}\`, ... })` (dentro do loop `for (const o of outputs)`):

```tsx
    for (const o of outputs) {
      if (brand && o.brand_slug !== brand) continue
      const kind: Kind = isResearchOutput(o) ? "pesquisa" : "conteudo"
      const bucket: Bucket =
        o.status === "needs_adjustment" ? "ajuste"
          : o.status === "approved" ? "aprovado"
            : o.status === "archived" ? "concluido"
              : "pendente"
      const priority: Priority =
        o.status === "review" || o.status === "awaiting_approval" ? "alta"
          : o.status === "needs_adjustment" ? "media" : "baixa"
      list.push({
        key: `o${o.id}`, kind, outputId: o.id, title: o.title, brand: o.brand_slug,
        status: o.status, priority, bucket, updatedAt: o.updated_at,
        href: kind === "pesquisa" ? `/research?id=${o.id}` : `/content?id=${o.id}`
      })
    }
```

E para o loop de eventos/publicações (`for (const e of events)`), no `list.push({ key: \`e${e.id}\`, ... })`, adicionar `href: KIND_META[kind].href` (mantém o comportamento atual — bare, sem ID — pois calendário/publicações ficam fora do escopo deste deep-linking):

```tsx
      list.push({
        key: `e${e.id}`, kind, outputId: null, title: e.title, brand: e.brand_slug,
        status: e.published_at ? "completed" : (e.status === "awaiting_approval" ? "awaiting_approval" : "review"),
        priority, bucket, updatedAt: e.updated_at,
        href: KIND_META[kind].href
      })
```

Adicionar `href: string` ao tipo `Item` (era `type Item = { key: string; kind: Kind; outputId: number | null; title: string; brand: string; status: string; priority: Priority; bucket: Bucket; updatedAt: string }`):

```tsx
type Item = {
  key: string
  kind: Kind
  outputId: number | null // aprovável em lote quando não-nulo
  title: string
  brand: string
  status: string
  priority: Priority
  bucket: Bucket
  updatedAt: string
  href: string
}
```

Por fim, trocar o `<Link href={km.href} ...>` (dentro do `.map((it) => { const km = KIND_META[it.kind]; ... })`) por `<Link href={it.href} ...>`:

```tsx
                    <Link href={it.href} className="duofy-tap inline-flex items-center gap-1 rounded-lg bg-purple/10 px-2.5 py-1.5 text-xs font-semibold text-purple hover:bg-purple/20">
                      Abrir <ArrowRightIcon className="h-3.5 w-3.5" />
                    </Link>
```

**3d. `apps/web/app/(app)/calendar/EventDetailPanel.tsx`**

Trocar as 3 ocorrências de link bare para pesquisa/conteúdo (a 4ª, "Abrir na Revisão" para `/approvals`, fica como está — fora do escopo):

- Linha com `<a href="/research" className="duofy-tap mt-2 ...">` (dentro da aba "Pesquisa"):

```tsx
                      <a href={`/research?id=${detail.research_output_id}`} className="duofy-tap mt-2 inline-flex items-center gap-1.5 rounded-lg bg-purple px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-deep">
```

- Linha com `<a href="/content" className="duofy-tap ...">` (dentro da aba "Peças"):

```tsx
                        <a href={`/content?id=${detail.content_output_id}`} className="duofy-tap inline-flex items-center gap-1.5 rounded-lg bg-purple px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-deep">
```

- Linha com `<a href="/research" className="duofy-tap ...">` (dentro de `ResearchActions`, ramo "Pesquisa concluída — aguardando aprovação"):

```tsx
          <a href={`/research?id=${detail.research_output_id}`} className="duofy-tap inline-flex items-center gap-1.5 rounded-lg bg-purple px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-deep">
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd apps/web && npx --no-install playwright test tests-e2e/entry-points.spec.ts`
Expected: `3 passed`

- [ ] **Step 5: Verificar tipos, lint e build**

Run: `cd apps/web && npx --no-install tsc --noEmit && npx --no-install next lint && npx --no-install next build`
Expected: sem erros; `✔ No ESLint warnings or errors`; build limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(app\)/operations/page.tsx apps/web/components/app-shell.tsx apps/web/app/\(app\)/approvals/page.tsx apps/web/app/\(app\)/calendar/EventDetailPanel.tsx apps/web/tests-e2e/entry-points.spec.ts
git commit -m "fix(web): corrige todos os pontos de entrada para linkar com ?id= (deep-link)"
```

---

### Task 6: Regressão completa

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Suíte completa do backend (garantir zero regressão — nada de backend mudou, mas confirma)**

```bash
cd C:\DUOFY_V1_MARKETING_AI
$env:PYTHONPATH='apps/api'; $env:APP_ENV='test'; $env:JWT_SECRET_KEY='test-secret-key-with-32-bytes-minimum-xyz'; $env:DATABASE_URL='postgresql+asyncpg://duofy:duofy@127.0.0.1:5433/duofy_v1_test'; $env:REDIS_URL='redis://127.0.0.1:6379/1'; $env:BACKEND_CORS_ORIGINS='http://localhost:3000'
.\.venv\Scripts\python.exe -m pytest apps/api/tests -q
```
Expected: mesmo total de antes (343 passed, 2 skipped) — nenhuma mudança de backend nesta feature.

- [ ] **Step 2: Lint + build do frontend**

```bash
cd apps/web
npx --no-install next lint
npx --no-install next build
```
Expected: `✔ No ESLint warnings or errors`; build limpo, 22+ páginas geradas (agora incluindo as novas rotas com query params, que não criam páginas novas — mesma contagem).

- [ ] **Step 3: Suíte completa de Playwright E2E**

```bash
cd apps/web
npx --no-install playwright test
```
Expected: todos os specs passam — os 14 existentes (auth, navigation, research-async, cocreation-async) + os novos desta feature (research-deep-link: 2, content-deep-link: 4, entry-points: 3), total 23 passed.

- [ ] **Step 4: Verificação manual no browser real (dados já seedados)**

Com a stack Docker rodando (`docker compose up -d`), logar como `admin@duofy.com.br` / `admin123456` e confirmar manualmente:
1. Central de Operações → clicar num card de "Saídas recentes" (pesquisa e conteúdo) → abre o resultado direto, sem passar pela lista/formulário.
2. Busca global (topo) → buscar um termo que bata num conteúdo existente → clicar no resultado → abre o conteúdo direto.
3. Aprovações → clicar em "Abrir" num item de pesquisa e num de conteúdo → cada um abre a tela de resultado certa.
4. Calendário → abrir um evento com pesquisa/conteúdo vinculados → clicar nos links das abas "Pesquisa"/"Peças" → abre o item certo.
5. Num conteúdo com pacote estruturado, alternar entre "Visão geral" e "Editar" e confirmar que os dois mostram dado consistente, e que editar o markdown manualmente faz a aba "Visão geral" cair para o markdown renderizado na próxima abertura (comportamento esperado, documentado no spec).
6. Testar um `?id=` inválido direto na URL (`/research?id=999999999`) e confirmar a mensagem de erro clara.

- [ ] **Step 5: Commit final (se sobrar algo do Step 4, ex.: ajuste fino)**

```bash
git status --short
# se houver mudanças da verificação manual, commitar; senão, task concluída sem commit adicional.
```

---

## Self-Review (executado antes de entregar este plano)

**Cobertura do spec:** URL scheme (Tasks 3, 4) ✓; tela de resultado com abas (Task 4) ✓; todos os pontos de entrada (Task 5) ✓; marca ativa auto-troca (Tasks 3, 4 — `setBrand` dentro de `openReport`/`openFocus`) ✓; estados de erro (Tasks 3, 4 — `idNotFound`) ✓; testes E2E (todas as tasks) ✓; fora de escopo respeitado (sem view dedicada em Aprovações, sem embutir no modal do Calendário, sem framework de teste novo, sem tela de imprensa dedicada) ✓.

**Placeholders:** nenhum "TBD"/"implementar depois" — todo código é completo e literal.

**Consistência de tipos:** `resultHref`/`isResearchOutput` (Task 1) usados com a mesma assinatura em todas as tasks que os consomem (3 não usa, já que pesquisa não precisa distinguir tipo). `ContentPackageView` (Task 2) usado com o mesmo shape de props (`outputId`, `package`, `warnings`, `onRefined`) em `CocreationPanel` (Task 2) e `content/page.tsx` (Task 4). `openFocus`/`openReport` mantêm as mesmas assinaturas já usadas pelo resto de cada arquivo (chamadas existentes por clique na lista continuam funcionando sem mudança).
