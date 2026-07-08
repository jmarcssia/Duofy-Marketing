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
