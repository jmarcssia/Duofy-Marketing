"use client"

import { useEffect, useState } from "react"

import { Badge, FieldSelect, GhostButton } from "@/components/ui"
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CloseIcon,
  CopyIcon,
  RefreshIcon,
  SparklesIcon
} from "@/components/icons"
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
  generateCocreation,
  getCocreation,
  getResearchModels,
  refineCocreation,
  type CocreationGenerateRequest,
  type CocreationRefineTarget,
  type ContentOutput,
  type ContentPackage,
  type ContentPackageResponse,
  type ResearchModel,
  type ResearchReport
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { friendlyError } from "@/lib/friendly-error"
import { allowedPiecesFor, PIECES_BY_CHANNEL } from "@/lib/pieces"
import { useBrand } from "@/lib/brand-context"

import { PiecesReview } from "./PiecesReview"

const START_OPTIONS: Option[] = [
  { id: "manual", label: "Briefing manual" },
  { id: "pesquisa", label: "Pesquisa aprovada" },
  { id: "template", label: "Template" }
]

const DEPTHS: Option[] = [
  { id: "rapida", label: "Rápida" },
  { id: "profunda", label: "Profunda" }
]

const SOCIAL_CHANNELS = ["Instagram", "LinkedIn", "Facebook"]

type CocreationTemplate = {
  id: string
  label: string
  hint: string
  channels: string[]
  formats: string[]
  pieces: string[]
  finalidade: string
}

/** Templates locais de cocriação, construídos da taxonomia (FASE 6). */
const COCREATION_TEMPLATES: CocreationTemplate[] = [
  {
    id: "carrossel_ig_li",
    label: "Carrossel Instagram + LinkedIn",
    hint: "mesmo carrossel, legendas diferentes",
    channels: ["Instagram", "LinkedIn"],
    formats: ["Carrossel"],
    pieces: ["carousel", "caption_instagram", "caption_linkedin", "visual_direction"],
    finalidade: "redes_sociais"
  },
  {
    id: "nutricao_wa_email",
    label: "Nutrição WhatsApp + E-mail",
    hint: "mensagens curtas + e-mail",
    channels: ["WhatsApp", "E-mail"],
    formats: ["Mensagem curta WhatsApp", "E-mail marketing"],
    pieces: ["whatsapp", "whatsapp_image_prompt", "email"],
    finalidade: "nutricao_leads"
  },
  {
    id: "release_pitch",
    label: "Release + Pitch imprensa",
    hint: "release + pitch para jornalistas",
    channels: ["Release", "Pitch"],
    formats: ["Release", "Pitch"],
    pieces: ["release", "pitch"],
    finalidade: "imprensa"
  },
  {
    id: "conteudo_multicanal",
    label: "Conteúdo multicanal",
    hint: "IG + LinkedIn + WhatsApp + E-mail",
    channels: ["Instagram", "LinkedIn", "WhatsApp", "E-mail"],
    formats: ["Carrossel"],
    pieces: ["carousel", "caption_instagram", "caption_linkedin", "whatsapp", "email", "visual_direction"],
    finalidade: "campanha"
  },
  {
    id: "blog_educativo",
    label: "Blog educativo",
    hint: "artigo aprofundado para o blog",
    channels: ["Blog"],
    formats: ["Blog post"],
    pieces: ["blog"],
    finalidade: "institucional"
  }
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

export function CocreationPanel({
  onClose,
  initialResearchId
}: {
  onClose?: () => void
  initialResearchId?: string
}) {
  const { brands, selected: brand } = useBrand()
  const brandName = brands.find((b) => b.slug === brand)?.name ?? brand
  const [models, setModels] = useState<ResearchModel[]>([])

  // form — começar de
  const [startFrom, setStartFrom] = useState<string>(initialResearchId ? "pesquisa" : "manual")
  const [approved, setApproved] = useState<{ id: number; title: string }[]>([])
  const [researchId, setResearchId] = useState<string>(initialResearchId ?? "")
  const [templateId, setTemplateId] = useState<string | null>(null)

  // form — briefing
  const [theme, setTheme] = useState("")
  const [canais, setCanais] = useState<string[]>([])
  const [formatos, setFormatos] = useState<string[]>([])
  const [finalidade, setFinalidade] = useState("")
  const [pecas, setPecas] = useState<string[]>([])

  // form — direção
  const [personaSel, setPersonaSel] = useState<string[]>([])
  const [personaOther, setPersonaOther] = useState("")
  const [tom, setTom] = useState("")
  const [ctaId, setCtaId] = useState("")
  const [ctaCustom, setCtaCustom] = useState("")
  const [restricoes, setRestricoes] = useState<string[]>(RESTRICOES_DEFAULT)
  const [slides, setSlides] = useState(6)
  const [depth, setDepth] = useState("rapida")
  const [model, setModel] = useState("")
  const [observacoes, setObservacoes] = useState("")

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ContentPackageResponse | null>(null)
  const [refineBusy, setRefineBusy] = useState<string | null>(null)
  const [toneInstr, setToneInstr] = useState("")
  const [personaInstr, setPersonaInstr] = useState("")
  const [showToneInput, setShowToneInput] = useState(false)
  const [showPersonaInput, setShowPersonaInput] = useState(false)
  const [guardianNote, setGuardianNote] = useState("")

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) return
    getResearchModels(token).then(setModels).catch(() => setModels([]))
  }, [])

  // Tom default pelo segmento da marca (DeathCare → sensível; Postos → objetivo).
  useEffect(() => {
    const seg = SEGMENTO_POR_MARCA[brand]
    setTom(seg ? TOM_POR_SEGMENTO[seg] ?? "" : "")
  }, [brand])

  // Pesquisas aprovadas da marca (modo "pesquisa").
  useEffect(() => {
    if (startFrom !== "pesquisa" || !brand) return
    const token = getTokenFromCookie()
    if (!token) return
    apiFetch<ResearchReport[]>(
      `/api/research/reports?brand_slug=${encodeURIComponent(brand)}&status=approved&limit=40`,
      token
    )
      .then((list) => setApproved(list.map((r) => ({ id: r.id, title: r.title }))))
      .catch(() => setApproved([]))
  }, [brand, startFrom])

  const allowedPieces = allowedPiecesFor(canais)
  const pieceOptions = PECAS.filter((p) => allowedPieces.has(p.id))
  const isCarousel = formatos.includes("Carrossel")

  function onChannelsChange(next: string[]) {
    const added = next.filter((c) => !canais.includes(c))
    const allowed = allowedPiecesFor(next)
    setPecas((prev) => {
      const kept = prev.filter((p) => allowed.has(p))
      const defaults = added.flatMap((c) => PIECES_BY_CHANNEL[c] ?? []).filter((p) => allowed.has(p))
      return Array.from(new Set([...kept, ...defaults]))
    })
    setCanais(next)
  }

  function applyTemplate(t: CocreationTemplate) {
    setTemplateId(t.id)
    setCanais(t.channels)
    setFormatos(t.formats)
    setPecas(t.pieces)
    setFinalidade(t.finalidade)
  }

  // Resumo + completude (obrigatórios: marca, tema, canais, formato).
  const briefingDraft: StructuredBriefing = {
    segmento: SEGMENTO_POR_MARCA[brand],
    finalidade: finalidade || undefined,
    canais,
    formatos,
    pecas,
    personas: [...personaSel, ...(personaOther.trim() ? [personaOther.trim()] : [])],
    tom: tom || undefined,
    cta: ctaId === "personalizado" ? ctaCustom.trim() || undefined : ctaId || undefined,
    restricoes,
    observacoes: observacoes.trim() || undefined
  }
  const summaryRows = [
    ...(brand ? [{ label: "Marca", values: [brandName] }] : []),
    ...(theme.trim() ? [{ label: "Tema", values: [theme.trim()] }] : []),
    ...briefingSummaryRows(briefingDraft)
  ]
  const completeness = computeCompleteness([
    { key: "marca", label: "Marca", required: true, filled: Boolean(brand) },
    { key: "tema", label: "Tema", required: true, filled: theme.trim().length > 0 },
    { key: "canais", label: "Canais", required: true, filled: canais.length > 0 },
    { key: "formato", label: "Formato", required: true, filled: formatos.length > 0 },
    { key: "finalidade", label: "Finalidade", required: false, filled: Boolean(finalidade) },
    { key: "pecas", label: "Peças", required: false, filled: pecas.length > 0 },
    {
      key: "persona",
      label: "Persona",
      required: false,
      filled: personaSel.length > 0 || personaOther.trim().length > 0
    },
    { key: "tom", label: "Tom", required: false, filled: Boolean(tom) },
    {
      key: "cta",
      label: "CTA",
      required: false,
      filled: Boolean(ctaId) && (ctaId !== "personalizado" || ctaCustom.trim().length > 0)
    }
  ])
  const ready = completeness.ready

  async function generate() {
    const token = getTokenFromCookie()
    if (!token || !brand) { setError("Selecione uma marca."); return }
    if (!theme.trim()) { setError("Informe o tema."); return }
    if (canais.length === 0) { setError("Selecione ao menos um canal."); return }
    setBusy(true); setError(null)

    const mainChannel = canais.find((c) => SOCIAL_CHANNELS.includes(c)) ?? canais[0]
    const mainFormat = isCarousel ? "Carrossel" : formatos[0] ?? "Post único"
    const personaText = [...labelsOf(PERSONAS, personaSel), personaOther.trim()]
      .filter(Boolean)
      .join(", ")
    const ctaValue =
      ctaId === "personalizado"
        ? ctaCustom.trim() || undefined
        : ctaId
          ? labelOf(CTAS, ctaId)
          : undefined

    const reqBody: CocreationGenerateRequest = {
      brand_slug: brand,
      theme: theme.trim(),
      channel: mainChannel,
      format: mainFormat,
      slides: isCarousel ? slides : undefined,
      persona: personaText || undefined,
      cta: ctaValue,
      tone: tom ? labelOf(TONS, tom) : undefined,
      // Normalização UI→API: envia o enum canônico (nunca o rótulo/id em pt).
      depth: normalizeCocreationDepth(depth),
      observacoes: observacoes.trim() || undefined,
      model: model || undefined,
      research_output_id:
        startFrom === "pesquisa" && researchId ? Number(researchId) : undefined,
      channels: normalizeChannels(canais),
      pieces: normalizePieces(pecas.filter((p) => (PECAS_EXTRAS_IDS as readonly string[]).includes(p))),
      briefing_filters: cleanBriefing(briefingDraft) as Record<string, unknown> | undefined
    }

    // Em desenvolvimento, registra o payload enviado para depuração (não vaza em produção).
    if (process.env.NODE_ENV !== "production") console.debug("[cocriação] payload →", reqBody)

    // Resiliência ao timeout do proxy (~30s): a cocriação pode demorar e o backend cria o output
    // mesmo se a requisição estourar. Então: dispara o POST E faz polling do output novo.
    const bq = `?limit=40&brand_slug=${encodeURIComponent(brand)}`
    let known = new Set<number>()
    try {
      const cur = await apiFetch<ContentOutput[]>(`/api/content/outputs${bq}`, token)
      known = new Set(cur.map((o) => o.id))
    } catch { /* usa vazio */ }

    let done = false
    let postError: string | null = null
    const post = generateCocreation(token, reqBody)
      .then((res) => { if (!done) { done = true; setResult(res) } })
      .catch((e: unknown) => {
        postError = friendlyError(e, "Não foi possível gerar o conteúdo. Revise os filtros e tente novamente.")
      })

    const start = Date.now()
    while (!done && Date.now() - start < 150_000) {
      await new Promise((r) => setTimeout(r, 4000))
      if (done) break
      try {
        const latest = await apiFetch<ContentOutput[]>(`/api/content/outputs${bq}`, token)
        const fresh = latest.find((o) => !known.has(o.id))
        if (fresh) {
          try { const pkg = await getCocreation(token, fresh.id); done = true; setResult(pkg); break } catch { /* ainda não pronto */ }
        }
      } catch { /* segue */ }
    }
    await post.catch(() => {})
    if (!done) setError(postError ?? "A geração está demorando; tente novamente ou veja na lista de conteúdos.")
    setBusy(false)
  }

  async function refine(
    target: CocreationRefineTarget,
    extra?: {
      slide_number?: number; instruction?: string; channel?: string
      use_guardian_feedback?: boolean; human_note?: string
    }
  ) {
    if (!result) return
    const token = getTokenFromCookie()
    if (!token) return
    const key = `${target}:${extra?.slide_number ?? ""}`
    setRefineBusy(key); setError(null)
    try {
      const res = await refineCocreation(token, result.output_id, { target, ...extra })
      setResult(res)
      setShowToneInput(false); setShowPersonaInput(false); setToneInstr(""); setPersonaInstr(""); setGuardianNote("")
    } catch (e: unknown) {
      setError(friendlyError(e, "Falha ao ajustar conteúdo."))
    }
    setRefineBusy(null)
  }

  const pkg: ContentPackage | null = result?.package ?? null
  const extraPieces = pkg?.extra_pieces ?? []
  const direcaoCount =
    personaSel.length +
    (personaOther.trim() ? 1 : 0) +
    (tom ? 1 : 0) +
    (ctaId ? 1 : 0) +
    restricoes.length

  const researchOptions = [
    { value: "", label: "Selecione a pesquisa aprovada…" },
    ...(researchId && !approved.some((r) => String(r.id) === researchId)
      ? [{ value: researchId, label: `#${researchId} · pesquisa vinculada` }]
      : []),
    ...approved.map((r) => ({ value: String(r.id), label: `#${r.id} · ${r.title}` }))
  ]

  return (
    <div className="rounded-2xl border border-purple/30 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-5 w-5 text-purple" />
          <h2 className="text-base font-bold tracking-[-0.02em] text-ink">Cocriação estruturada</h2>
          {result && <Badge tone="purple">v{result.version_number}</Badge>}
        </div>
        {onClose && (
          <button onClick={onClose} className="duofy-tap grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-purple/40 hover:text-purple" aria-label="Fechar">
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {!result && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <p className="text-xs text-muted">
              Gera roteiro, legendas e prompts visuais — a imagem final não é gerada pelo sistema.
            </p>

            <FieldGroup label="Começar de">
              <ChoiceChips options={START_OPTIONS} value={startFrom} onChange={(v) => setStartFrom(v)} allowEmpty={false} />
            </FieldGroup>

            {startFrom === "pesquisa" && (
              <FieldSelect
                label="Pesquisa aprovada da marca"
                value={researchId}
                onChange={setResearchId}
                options={researchOptions}
              />
            )}

            {startFrom === "template" && (
              <FieldGroup label="Template" hint="um clique pré-preenche canais, formatos e peças">
                <TemplatePicker templates={COCREATION_TEMPLATES} activeId={templateId} onPick={applyTemplate} />
              </FieldGroup>
            )}

            <TextField
              label="Tema"
              hint="obrigatório"
              value={theme}
              onChange={setTheme}
              placeholder="Ex.: Gestão de contratos e faturamento sem retrabalho"
            />

            <FieldGroup label="Canais" hint="selecione ao menos um">
              <MultiSelectChips options={CANAIS} value={canais} onChange={onChannelsChange} />
            </FieldGroup>

            <FieldGroup label="Formatos" hint="Carrossel vira o formato principal quando selecionado">
              <MultiSelectChips options={FORMATOS} value={formatos} onChange={setFormatos} size="sm" />
            </FieldGroup>

            <FieldGroup label="Finalidade">
              <ChoiceChips options={FINALIDADES} value={finalidade} onChange={setFinalidade} />
            </FieldGroup>

            {pieceOptions.length > 0 && (
              <FieldGroup label="Peças" hint="condicionais aos canais selecionados">
                <MultiSelectChips options={pieceOptions} value={pecas} onChange={setPecas} size="sm" />
              </FieldGroup>
            )}

            <CollapsibleSection title="Direção" subtitle="persona, tom, CTA, restrições e execução" count={direcaoCount}>
              <FieldGroup label="Persona">
                <MultiSelectChips
                  options={PERSONAS}
                  value={personaSel}
                  onChange={setPersonaSel}
                  allowOther
                  otherValue={personaOther}
                  onOtherChange={setPersonaOther}
                  size="sm"
                />
              </FieldGroup>

              <FieldGroup label="Tom">
                <ChoiceChips options={TONS} value={tom} onChange={setTom} size="sm" />
              </FieldGroup>

              <FieldGroup label="CTA">
                <ChoiceChips options={CTAS} value={ctaId} onChange={setCtaId} size="sm" />
              </FieldGroup>
              {ctaId === "personalizado" && (
                <TextField
                  label="CTA personalizado"
                  value={ctaCustom}
                  onChange={setCtaCustom}
                  placeholder="Ex.: Garanta sua vaga na demonstração ao vivo"
                />
              )}

              <FieldGroup label="Restrições">
                <MultiSelectChips options={RESTRICOES} value={restricoes} onChange={setRestricoes} size="sm" />
              </FieldGroup>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {isCarousel && (
                  <label className="block text-xs font-semibold text-muted">Nº de slides
                    <input
                      type="number"
                      min={3}
                      max={12}
                      value={slides}
                      onChange={(e) => setSlides(Math.min(12, Math.max(3, Number(e.target.value) || 3)))}
                      className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm font-normal text-ink focus:border-purple focus:outline-none"
                    />
                  </label>
                )}
                <FieldSelect
                  label="Modelo"
                  value={model}
                  onChange={setModel}
                  options={[{ value: "", label: "Padrão" }, ...models.map((m) => ({ value: m.model_id, label: m.label }))]}
                />
              </div>

              <FieldGroup label="Profundidade">
                <ChoiceChips options={DEPTHS} value={depth} onChange={setDepth} allowEmpty={false} />
              </FieldGroup>

              <TextAreaField label="Observações" value={observacoes} onChange={setObservacoes} rows={2} />
            </CollapsibleSection>

            {error && <p className="text-xs font-medium text-red-600">{error}</p>}
            {!brand && <p className="text-xs text-red-600">Selecione uma marca no topo.</p>}

            <button
              onClick={generate}
              disabled={busy || !ready}
              className="duofy-tap flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-purple px-5 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50"
            >
              {busy ? <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Gerando o pacote — costuma levar 1 a 2 min…</> : <><SparklesIcon className="h-4 w-4" /> Gerar</>}
            </button>
            {busy && <p className="text-center text-[11px] text-muted">Pode deixar aberto — o pacote aparece aqui assim que ficar pronto.</p>}
          </div>

          <div className="space-y-4">
            <BriefingCompleteness completeness={completeness} />
            <BriefingSummary rows={summaryRows} />
          </div>
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

          {/* Ajuste orientado pelo Guardião (F2): recomendações + observação humana opcional. */}
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

          {/* Peças extras (multicanal: WhatsApp, e-mail, blog, release, pitch, landing page) */}
          {extraPieces.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold text-ink">Peças extras</p>
              <div className="space-y-3">
                {extraPieces.map((p, i) => (
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
