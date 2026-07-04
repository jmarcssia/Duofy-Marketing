"use client"

import { useEffect, useState } from "react"

import { Badge, GhostButton } from "@/components/ui"
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  CopyIcon,
  RefreshIcon,
  SparklesIcon
} from "@/components/icons"
import {
  generateCocreation,
  getResearchModels,
  refineCocreation,
  type ContentPackage,
  type ContentPackageResponse,
  type ResearchModel
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"

import { PiecesReview } from "./PiecesReview"

const CHANNELS = ["Instagram", "LinkedIn", "Blog", "E-mail", "TikTok", "Facebook"]
const FORMATS = ["Carrossel", "Reels", "Post LinkedIn", "Blog", "E-mail", "Stories"]
const DEPTHS = [
  { id: "rapida", label: "Rápida" },
  { id: "profunda", label: "Profunda" }
]

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

export function CocreationPanel({ onClose }: { onClose: () => void }) {
  const { selected: brand } = useBrand()
  const [models, setModels] = useState<ResearchModel[]>([])

  // form
  const [theme, setTheme] = useState("")
  const [channel, setChannel] = useState(CHANNELS[0])
  const [format, setFormat] = useState(FORMATS[0])
  const [slides, setSlides] = useState(6)
  const [persona, setPersona] = useState("")
  const [cta, setCta] = useState("")
  const [depth, setDepth] = useState("rapida")
  const [observacoes, setObservacoes] = useState("")
  const [model, setModel] = useState("")
  const [researchId, setResearchId] = useState<string>("")

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ContentPackageResponse | null>(null)
  const [refineBusy, setRefineBusy] = useState<string | null>(null)
  const [toneInstr, setToneInstr] = useState("")
  const [personaInstr, setPersonaInstr] = useState("")
  const [showToneInput, setShowToneInput] = useState(false)
  const [showPersonaInput, setShowPersonaInput] = useState(false)

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) return
    getResearchModels(token).then(setModels).catch(() => setModels([]))
  }, [])

  async function generate() {
    const token = getTokenFromCookie()
    if (!token || !brand) { setError("Selecione uma marca."); return }
    if (!theme.trim()) { setError("Informe o tema."); return }
    setBusy(true); setError(null)
    try {
      const res = await generateCocreation(token, {
        brand_slug: brand,
        theme: theme.trim(),
        channel,
        format,
        slides,
        persona: persona.trim() || undefined,
        cta: cta.trim() || undefined,
        depth,
        observacoes: observacoes.trim() || undefined,
        model: model || undefined,
        research_output_id: researchId ? Number(researchId) : undefined
      })
      setResult(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao gerar conteúdo.")
    }
    setBusy(false)
  }

  async function refine(
    target: "caption" | "slide" | "cta" | "visual" | "tone" | "shorten" | "persona",
    extra?: { slide_number?: number; instruction?: string; channel?: string }
  ) {
    if (!result) return
    const token = getTokenFromCookie()
    if (!token) return
    const key = `${target}:${extra?.slide_number ?? ""}`
    setRefineBusy(key); setError(null)
    try {
      const res = await refineCocreation(token, result.output_id, { target, ...extra })
      setResult(res)
      setShowToneInput(false); setShowPersonaInput(false); setToneInstr(""); setPersonaInstr("")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao ajustar conteúdo.")
    }
    setRefineBusy(null)
  }

  const pkg: ContentPackage | null = result?.package ?? null

  return (
    <div className="rounded-2xl border border-purple/30 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-5 w-5 text-purple" />
          <h2 className="text-base font-bold tracking-[-0.02em] text-ink">Cocriação estruturada</h2>
          {result && <Badge tone="purple">v{result.version_number}</Badge>}
        </div>
        <button onClick={onClose} className="duofy-tap grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-purple/40 hover:text-purple" aria-label="Fechar">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {!result && (
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-muted">Tema
            <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Ex.: Lançamento da coleção de inverno" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <label className="block text-xs font-semibold text-muted">Canal
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted">Formato
              <select value={format} onChange={(e) => setFormat(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted">Nº de slides
              <input type="number" min={3} max={12} value={slides} onChange={(e) => setSlides(Math.min(12, Math.max(3, Number(e.target.value) || 3)))} className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
            </label>
            <label className="block text-xs font-semibold text-muted">Profundidade
              <select value={depth} onChange={(e) => setDepth(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                {DEPTHS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-muted">Persona (opcional)
              <input value={persona} onChange={(e) => setPersona(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
            </label>
            <label className="block text-xs font-semibold text-muted">CTA (opcional)
              <input value={cta} onChange={(e) => setCta(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-muted">Modelo
              <select value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-2 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                <option value="">Padrão</option>
                {models.map((m) => <option key={m.model_id} value={m.model_id}>{m.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted">Pesquisa associada (ID, opcional)
              <input value={researchId} onChange={(e) => setResearchId(e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 42" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
            </label>
          </div>

          <label className="block text-xs font-semibold text-muted">Observações
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} className="mt-1 w-full resize-none rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
          </label>

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
          {!brand && <p className="text-xs text-red-600">Selecione uma marca no topo.</p>}

          <button onClick={generate} disabled={busy || !brand} className="duofy-tap flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-purple px-5 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
            {busy ? <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Gerando pacote…</> : <><SparklesIcon className="h-4 w-4" /> Gerar</>}
          </button>
        </div>
      )}

      {result && pkg && (
        <div className="space-y-4">
          <PiecesReview outputId={result.output_id} />

          {result.warnings.length > 0 && (
            <div className="rounded-xl border border-amber/40 bg-amber/10 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber"><AlertTriangleIcon className="h-4 w-4" /> Avisos</p>
              <ul className="space-y-1">{result.warnings.map((w, i) => <li key={i} className="text-xs text-ink/80">{w}</li>)}</ul>
            </div>
          )}

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}

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

          {/* Carrossel / slides */}
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

          {/* Legendas por canal */}
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

          {/* Direção visual */}
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

          {/* CTA */}
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

          {/* Ações globais de refino */}
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

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button onClick={() => setResult(null)} className="duofy-tap rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple">← Novo pacote</button>
          </div>
        </div>
      )}
    </div>
  )
}
