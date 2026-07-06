"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  BriefingCompleteness,
  BriefingSummary,
  ChoiceChips,
  CollapsibleSection,
  FieldGroup,
  FilterCardGroup,
  MultiSelectChips,
  TemplatePicker,
  TextAreaField,
  TextField
} from "@/components/briefing"
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BookmarkIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  ExternalLinkIcon,
  RefreshIcon,
  SearchIcon,
  SparklesIcon
} from "@/components/icons"
import { Markdown } from "@/components/markdown"
import {
  Badge,
  FieldSelect,
  GhostButton,
  PageHeader,
  SectionHeader,
  Spinner,
  type Tone
} from "@/components/ui"
import {
  apiFetch,
  createResearchTheme,
  getResearchModels,
  getResearchThemes,
  type ResearchModel,
  type ResearchReport,
  type ResearchTheme
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { friendlyError } from "@/lib/friendly-error"
import { useBrand } from "@/lib/brand-context"
import { downloadFile, type ExportFormat, exportPath } from "@/lib/download"
import {
  briefingSummaryRows,
  cleanBriefing,
  computeCompleteness,
  DECISORES,
  ENTREGAVEIS,
  ESCOPOS_GEO,
  FONTES,
  JORNADAS_MARKETING,
  jornadasPara,
  labelOf,
  normalizeDepth,
  OBJETIVOS,
  PERIODOS,
  PERSONAS,
  PROFUNDIDADES,
  type ResearchTemplate,
  SEGMENTO_POR_MARCA,
  type StructuredBriefing,
  subsegmentosPara,
  TEMPLATES_PESQUISA,
  TIPOS_PESQUISA
} from "@/lib/briefing"

const FONTES_DEFAULT = ["web_aberta", "noticias", "google_news", "duckduckgo"]
const ENTREGAVEIS_DEFAULT = ["resumo_executivo", "insights", "recomendacoes", "fontes_citadas"]

const STATUS_TONE: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "slate" },
  review: { label: "Em revisão", tone: "blue" },
  approved: { label: "Aprovada", tone: "green" },
  needs_adjustment: { label: "Ajustes pedidos", tone: "amber" },
  rejected: { label: "Rejeitada", tone: "red" },
  archived: { label: "Arquivada", tone: "slate" }
}

const RELIABILITY_TONE: Record<string, Tone> = { A: "green", B: "teal", C: "amber", D: "slate" }

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit"
  })
}

export default function ResearchPage() {
  const router = useRouter()
  const { brands, selected: brand } = useBrand()
  const brandName = brands.find((b) => b.slug === brand)?.name ?? brand
  const [models, setModels] = useState<ResearchModel[]>([])
  const [reports, setReports] = useState<ResearchReport[]>([])
  const [loadingReports, setLoadingReports] = useState(true)

  // formulário de nova pesquisa (briefing estruturado — FASE 5)
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null)
  const [savedTemplates, setSavedTemplates] = useState<ResearchTemplate[]>([])
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateMsg, setTemplateMsg] = useState<string | null>(null)
  const [pergunta, setPergunta] = useState("")
  const [segmento, setSegmento] = useState("")
  const [subsegmentos, setSubsegmentos] = useState<string[]>([])
  const [tiposPesquisa, setTiposPesquisa] = useState<string[]>([])
  const [objetivos, setObjetivos] = useState<string[]>([])
  const [objetivosOutro, setObjetivosOutro] = useState("")
  const [profundidade, setProfundidade] = useState("padrao")
  const [periodo, setPeriodo] = useState("ultimos 30 dias")
  const [periodoCustom, setPeriodoCustom] = useState("")
  const [escopoGeo, setEscopoGeo] = useState("")
  const [escopoDetalhe, setEscopoDetalhe] = useState("")
  const [personas, setPersonas] = useState<string[]>([])
  const [personasOutro, setPersonasOutro] = useState("")
  const [decisores, setDecisores] = useState<string[]>([])
  const [decisoresOutro, setDecisoresOutro] = useState("")
  const [jornadas, setJornadas] = useState<string[]>([])
  const [fontes, setFontes] = useState<string[]>(FONTES_DEFAULT)
  const [entregaveis, setEntregaveis] = useState<string[]>(ENTREGAVEIS_DEFAULT)
  const [concorrentes, setConcorrentes] = useState("")
  const [contexto, setContexto] = useState("")
  const [observacoes, setObservacoes] = useState("")
  const [model, setModel] = useState("")
  const [sourceUrls, setSourceUrls] = useState("")

  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // resultado
  const [selected, setSelected] = useState<ResearchReport | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [exporting, setExporting] = useState<ExportFormat | null>(null)

  // Segmento default por marca — sem sobrescrever escolha manual do usuário.
  const segTouchedRef = useRef(false)

  const applySegmento = useCallback((next: string) => {
    setSegmento(next)
    const validSubs = new Set(subsegmentosPara(next).map((o) => o.id))
    setSubsegmentos((cur) => cur.filter((id) => validSubs.has(id)))
    const validJornadas = new Set(
      [...jornadasPara(next), ...JORNADAS_MARKETING].map((o) => o.id)
    )
    setJornadas((cur) => cur.filter((id) => validJornadas.has(id)))
  }, [])

  useEffect(() => {
    if (!brand || segTouchedRef.current) return
    applySegmento(SEGMENTO_POR_MARCA[brand] ?? "")
  }, [brand, applySegmento])

  const loadReports = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) return
    setLoadingReports(true)
    try {
      const qs = brand ? `?brand_slug=${encodeURIComponent(brand)}&limit=12` : "?limit=12"
      setReports(await apiFetch<ResearchReport[]>(`/api/research/reports${qs}`, token))
    } catch {
      setReports([])
    } finally {
      setLoadingReports(false)
    }
  }, [brand])

  // 5c: templates salvos pelo usuário (persistidos como ResearchTheme). O envelope
  // fica em notes como JSON { pergunta, briefing }; temas antigos (só-pergunta/CSV)
  // caem no fallback protegido por try/catch.
  const loadSavedTemplates = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) return
    try {
      const themes = await getResearchThemes(token, brand || undefined)
      setSavedTemplates(
        themes.map((t: ResearchTheme): ResearchTemplate => {
          let pergunta = t.notes ?? t.title
          let briefing: Partial<Record<string, unknown>> = {}
          try {
            const parsed = JSON.parse(t.notes ?? "")
            if (parsed && typeof parsed === "object") {
              if (typeof parsed.pergunta === "string" && parsed.pergunta.trim()) {
                pergunta = parsed.pergunta
              }
              if (parsed.briefing && typeof parsed.briefing === "object") {
                briefing = parsed.briefing as Partial<Record<string, unknown>>
              }
            }
          } catch {
            // tema antigo (só-pergunta / CSV): usa notes ou o título como pergunta
          }
          return { id: `saved-${t.id}`, label: t.title, pergunta, briefing }
        })
      )
    } catch {
      setSavedTemplates([])
    }
  }, [brand])

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) return
    getResearchModels(token).then(setModels).catch(() => setModels([]))
  }, [])

  useEffect(() => {
    void loadSavedTemplates()
  }, [loadSavedTemplates])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  function applyTemplate(template: ResearchTemplate) {
    setActiveTemplate(template.id)
    setPergunta(template.pergunta)
    const b = (template.briefing ?? {}) as Partial<StructuredBriefing>
    if (Array.isArray(b.tipos_pesquisa)) setTiposPesquisa(b.tipos_pesquisa)
    if (Array.isArray(b.objetivos)) setObjetivos(b.objetivos)
    if (Array.isArray(b.entregaveis)) setEntregaveis(b.entregaveis)
    if (Array.isArray(b.personas)) setPersonas(b.personas)
    if (Array.isArray(b.fontes)) setFontes(b.fontes)
    if (typeof b.profundidade === "string") setProfundidade(b.profundidade)
    if (typeof b.periodo === "string") setPeriodo(b.periodo)
    if (typeof b.segmento === "string") {
      segTouchedRef.current = true
      applySegmento(b.segmento)
    }
  }

  const periodValue = periodo === "personalizado" ? periodoCustom.trim() : periodo

  const builtBriefing = useMemo<StructuredBriefing>(() => {
    const withOther = (ids: string[], other: string) =>
      other.trim() ? [...ids, other.trim()] : ids
    const escopo = escopoGeo
      ? escopoDetalhe.trim()
        ? `${labelOf(ESCOPOS_GEO, escopoGeo)}: ${escopoDetalhe.trim()}`
        : escopoGeo
      : undefined
    // segmento não é mais um filtro visível — vem implícito da marca e serve apenas para
    // popular Subsegmentos/Jornadas; não entra no briefing (a marca/nicho já vão no prompt).
    return {
      subsegmentos,
      personas: withOther(personas, personasOutro),
      decisores: withOther(decisores, decisoresOutro),
      jornadas,
      objetivos: withOther(objetivos, objetivosOutro),
      tipos_pesquisa: tiposPesquisa,
      escopo_geografico: escopo,
      periodo: periodValue || undefined,
      profundidade: profundidade || undefined,
      fontes,
      entregaveis,
      concorrentes: concorrentes.trim() || undefined,
      contexto: contexto.trim() || undefined,
      observacoes: observacoes.trim() || undefined
    }
  }, [
    subsegmentos, personas, personasOutro, decisores, decisoresOutro,
    jornadas, objetivos, objetivosOutro, tiposPesquisa, escopoGeo, escopoDetalhe,
    periodValue, profundidade, fontes, entregaveis, concorrentes, contexto, observacoes
  ])

  const summaryRows = useMemo(() => briefingSummaryRows(builtBriefing), [builtBriefing])

  const completeness = useMemo(
    () =>
      computeCompleteness([
        { key: "marca", label: "Marca", required: true, filled: Boolean(brand) },
        { key: "pergunta", label: "Pergunta principal", required: true, filled: pergunta.trim().length >= 3 },
        { key: "tipos_pesquisa", label: "Tipo de pesquisa", required: true, filled: tiposPesquisa.length > 0 },
        { key: "profundidade", label: "Profundidade", required: true, filled: Boolean(profundidade) },
        { key: "periodo", label: "Período", required: true, filled: Boolean(periodValue) },
        { key: "objetivos", label: "Objetivos", required: false, filled: objetivos.length > 0 || objetivosOutro.trim().length > 0 },
        { key: "personas", label: "Personas", required: false, filled: personas.length > 0 || personasOutro.trim().length > 0 },
        { key: "entregaveis", label: "Entregáveis", required: false, filled: entregaveis.length > 0 },
        { key: "escopo", label: "Escopo geográfico", required: false, filled: Boolean(escopoGeo) }
      ]),
    [brand, pergunta, tiposPesquisa, profundidade, periodValue, objetivos, objetivosOutro, personas, personasOutro, entregaveis, escopoGeo]
  )

  const selectedBriefingRows = useMemo(
    () =>
      selected?.briefing_json
        ? briefingSummaryRows(selected.briefing_json as StructuredBriefing)
        : [],
    [selected]
  )

  const subsegOptions = subsegmentosPara(segmento)
  const jornadaOptions = [...jornadasPara(segmento), ...JORNADAS_MARKETING]
  const publicoCount =
    personas.length + decisores.length + jornadas.length +
    (personasOutro.trim() ? 1 : 0) + (decisoresOutro.trim() ? 1 : 0)
  const fontesCount = fontes.length + entregaveis.length
  const contextoCount = [concorrentes, contexto, observacoes].filter((t) => t.trim()).length

  async function runResearch() {
    const token = getTokenFromCookie()
    if (!token) return
    if (!brand) {
      setError("Selecione uma marca no topo.")
      return
    }
    if (pergunta.trim().length < 3) {
      setError("Descreva a pergunta principal da pesquisa.")
      return
    }
    setRunning(true)
    setError(null)

    const reqBody = JSON.stringify({
      brand_slug: brand,
      theme: pergunta.trim().slice(0, 255),
      period: periodValue || "ultimos 30 dias",
      depth: normalizeDepth(profundidade),
      model: model || undefined,
      source_urls: sourceUrls
        .split(/\n+/)
        .map((u) => u.trim())
        .filter((u) => u.startsWith("http"))
        .slice(0, 8),
      briefing_filters: cleanBriefing(builtBriefing)
    })
    const listQs = brand ? `?brand_slug=${encodeURIComponent(brand)}&limit=20` : "?limit=20"

    // A pesquisa REAL leva 1–2 min. O proxy da API estoura antes (~30s → 500) mesmo com o
    // backend criando o relatório. Então: dispara o POST E faz polling do relatório novo — o que
    // resolver primeiro vence. Robusto ao timeout, sem depender de uma única requisição longa.
    let knownIds = new Set(reports.map((r) => r.id))
    try {
      const cur = await apiFetch<ResearchReport[]>(`/api/research/reports${listQs}`, token)
      knownIds = new Set(cur.map((r) => r.id))
    } catch { /* usa o estado atual */ }

    let done = false
    let postError: string | null = null
    const post = apiFetch<ResearchReport>("/api/research/run", token, { method: "POST", body: reqBody })
      .then((rep) => {
        if (!done) { done = true; setSelected(rep); setActionMsg(null); void loadReports() }
      })
      .catch((e: unknown) => { postError = friendlyError(e, "Não foi possível executar a pesquisa. Revise os filtros e tente novamente.") })

    const start = Date.now()
    while (!done && Date.now() - start < 210_000) {
      await new Promise((r) => setTimeout(r, 5000))
      if (done) break
      try {
        const latest = await apiFetch<ResearchReport[]>(`/api/research/reports${listQs}`, token)
        const fresh = latest.find((r) => !knownIds.has(r.id))
        if (fresh) { done = true; setSelected(fresh); setReports(latest); setActionMsg(null); break }
      } catch { /* segue tentando */ }
    }
    await post.catch(() => {})

    if (!done) {
      setError(
        "A pesquisa está demorando mais que o normal. Se um relatório aparecer em “Pesquisas recentes”, ela concluiu — abra por lá."
      )
      void loadReports()
    }
    setRunning(false)
  }

  async function saveTemplate() {
    const token = getTokenFromCookie()
    if (!token) return
    const trimmed = pergunta.trim()
    if (trimmed.length < 3) return
    const nome = window.prompt("Nome do template:", trimmed.slice(0, 80))
    if (nome == null) return
    const title = nome.trim()
    if (!title) return
    setSavingTemplate(true)
    setTemplateMsg(null)
    try {
      await createResearchTheme(
        {
          title,
          notes: JSON.stringify({
            pergunta: trimmed,
            briefing: cleanBriefing(builtBriefing) ?? {}
          }),
          brand_slug: brand || null
        },
        token
      )
      await loadSavedTemplates()
      setTemplateMsg("Template salvo.")
    } catch (e: unknown) {
      setTemplateMsg(e instanceof Error ? e.message : "Falha ao salvar o template.")
    }
    setSavingTemplate(false)
  }

  async function openReport(id: number) {
    const token = getTokenFromCookie()
    if (!token) return
    try {
      setSelected(await apiFetch<ResearchReport>(`/api/research/reports/${id}`, token))
      setActionMsg(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao abrir a pesquisa.")
    }
  }

  async function act(kind: "approve" | "request-adjustment") {
    if (!selected) return
    const token = getTokenFromCookie()
    if (!token) return
    let body = "{}"
    if (kind === "request-adjustment") {
      const feedback = window.prompt("O que precisa ser ajustado na pesquisa?")
      if (feedback == null) return
      body = JSON.stringify({ feedback })
    }
    setActing(kind)
    setActionMsg(null)
    try {
      await apiFetch(`/api/outputs/${selected.id}/${kind}`, token, { method: "POST", body })
      setSelected(await apiFetch<ResearchReport>(`/api/research/reports/${selected.id}`, token))
      setActionMsg(kind === "approve" ? "Pesquisa aprovada — etapa de cocriação liberada quando vinculada a evento." : "Ajustes solicitados.")
      void loadReports()
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : "Falha na ação.")
    }
    setActing(null)
  }

  async function saveMemory() {
    if (!selected) return
    const token = getTokenFromCookie()
    if (!token) return
    setActing("memory")
    setActionMsg(null)
    try {
      await apiFetch(`/api/research/reports/${selected.id}/save-memory`, token, { method: "POST", body: "{}" })
      setActionMsg("Pesquisa salva na memória (RAG).")
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : "Falha ao salvar na memória.")
    }
    setActing(null)
  }

  // Export robusto (mesmo padrão de Conteúdo/Relatórios): fetch com cookie HttpOnly → blob →
  // âncora. Substitui o window.open (que abria aba em branco para um attachment).
  async function exportReport(format: ExportFormat) {
    if (!selected) return
    const token = getTokenFromCookie()
    if (!token) return
    setExporting(format)
    setActionMsg(null)
    try {
      const safe = (selected.title || "pesquisa").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
      await downloadFile(
        exportPath(`/api/outputs/${selected.id}`, format),
        token,
        `duofy-${safe || selected.id}.${format}`
      )
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : "Falha ao exportar a pesquisa.")
    }
    setExporting(null)
  }

  const st = selected ? STATUS_TONE[selected.status] ?? { label: selected.status, tone: "slate" as Tone } : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agente de Pesquisa"
        subtitle="Pesquisa de mercado de consultoria: coleta real de fontes, evidências e recomendações."
        icon={<SearchIcon className="h-5 w-5" />}
        right={
          selected ? (
            <GhostButton onClick={() => { setSelected(null); setActionMsg(null) }}>
              <SearchIcon className="h-4 w-4" /> Nova pesquisa
            </GhostButton>
          ) : undefined
        }
      />

      {!selected && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* A) Nova pesquisa */}
          <div className="space-y-5">
            <div className="duofy-card rounded-2xl p-5">
              <SectionHeader title="Templates" subtitle="Comece a partir de um objetivo comum" />
              <div className="mt-3">
                <TemplatePicker
                  templates={[...TEMPLATES_PESQUISA, ...savedTemplates]}
                  activeId={activeTemplate}
                  onPick={applyTemplate}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <GhostButton
                  onClick={saveTemplate}
                  disabled={savingTemplate || pergunta.trim().length < 3}
                >
                  <BookmarkIcon className="h-4 w-4" />
                  {savingTemplate ? "Salvando…" : "Salvar como template"}
                </GhostButton>
                {templateMsg && (
                  <span className="text-xs font-medium text-purple">{templateMsg}</span>
                )}
              </div>
            </div>

            <div className="duofy-card space-y-4 rounded-2xl p-5">
              <SectionHeader
                title="Nova pesquisa"
                subtitle={`Marca: ${brandName || "—"} · foco Brasil · usa a memória (RAG) da marca`}
              />

              <TextAreaField
                label="Pergunta principal"
                value={pergunta}
                onChange={setPergunta}
                rows={2}
                placeholder="O que você precisa descobrir? Ex.: Tamanho e concorrência do mercado de gestão para postos no Brasil."
              />

              {subsegOptions.length > 0 && (
                <FieldGroup label="Subsegmentos">
                  <MultiSelectChips
                    options={subsegOptions}
                    value={subsegmentos}
                    onChange={setSubsegmentos}
                  />
                </FieldGroup>
              )}

              <FieldGroup label="Tipo de pesquisa" hint="obrigatório, escolha 1 ou mais">
                <MultiSelectChips
                  options={TIPOS_PESQUISA}
                  value={tiposPesquisa}
                  onChange={setTiposPesquisa}
                />
              </FieldGroup>

              <FieldGroup label="Objetivos">
                <MultiSelectChips
                  options={OBJETIVOS}
                  value={objetivos}
                  onChange={setObjetivos}
                  allowOther
                  otherValue={objetivosOutro}
                  onOtherChange={setObjetivosOutro}
                />
              </FieldGroup>

              <FieldGroup label="Profundidade" hint="obrigatório">
                <FilterCardGroup
                  options={PROFUNDIDADES}
                  value={profundidade}
                  onChange={setProfundidade}
                  columns={3}
                />
              </FieldGroup>

              <FieldGroup label="Período" hint="obrigatório">
                <ChoiceChips options={PERIODOS} value={periodo} onChange={setPeriodo} />
              </FieldGroup>
              {periodo === "personalizado" && (
                <TextField
                  label="Período personalizado"
                  value={periodoCustom}
                  onChange={setPeriodoCustom}
                  placeholder="Ex.: 1º semestre de 2026"
                />
              )}

              <FieldGroup label="Escopo geográfico">
                <ChoiceChips options={ESCOPOS_GEO} value={escopoGeo} onChange={setEscopoGeo} />
              </FieldGroup>
              {(escopoGeo === "estado_especifico" || escopoGeo === "cidade_especifica") && (
                <TextField
                  label={escopoGeo === "estado_especifico" ? "Qual estado?" : "Qual cidade?"}
                  value={escopoDetalhe}
                  onChange={setEscopoDetalhe}
                  placeholder={escopoGeo === "estado_especifico" ? "Ex.: São Paulo" : "Ex.: Curitiba"}
                />
              )}

              <CollapsibleSection title="Público e jornada" subtitle="personas, decisores e etapas" count={publicoCount}>
                <FieldGroup label="Personas" hint="quem sente a dor">
                  <MultiSelectChips
                    options={PERSONAS}
                    value={personas}
                    onChange={setPersonas}
                    allowOther
                    otherValue={personasOutro}
                    onOtherChange={setPersonasOutro}
                  />
                </FieldGroup>
                <FieldGroup label="Decisores">
                  <MultiSelectChips
                    options={DECISORES}
                    value={decisores}
                    onChange={setDecisores}
                    allowOther
                    otherValue={decisoresOutro}
                    onOtherChange={setDecisoresOutro}
                  />
                </FieldGroup>
                <FieldGroup label="Jornadas">
                  <MultiSelectChips options={jornadaOptions} value={jornadas} onChange={setJornadas} />
                </FieldGroup>
              </CollapsibleSection>

              <CollapsibleSection title="Fontes e entregáveis" subtitle="de onde coletar e o que entregar" count={fontesCount}>
                <FieldGroup label="Fontes">
                  <MultiSelectChips options={FONTES} value={fontes} onChange={setFontes} />
                </FieldGroup>
                <FieldGroup label="Entregáveis">
                  <MultiSelectChips options={ENTREGAVEIS} value={entregaveis} onChange={setEntregaveis} />
                </FieldGroup>
                <FieldSelect
                  label="Modelo de pesquisa"
                  value={model}
                  onChange={setModel}
                  options={[{ value: "", label: "Padrão do agente" }, ...models.map((m) => ({ value: m.model_id, label: m.label }))]}
                />
                <TextAreaField
                  label="Fontes informadas"
                  hint="opcional, 1 URL por linha"
                  value={sourceUrls}
                  onChange={setSourceUrls}
                  rows={2}
                  placeholder="https://..."
                />
              </CollapsibleSection>

              <CollapsibleSection title="Contexto adicional" subtitle="concorrentes e observações" count={contextoCount}>
                <TextField
                  label="Concorrentes específicos"
                  value={concorrentes}
                  onChange={setConcorrentes}
                  placeholder="Ex.: Empresa A, Empresa B"
                />
                <TextAreaField
                  label="Contexto"
                  value={contexto}
                  onChange={setContexto}
                  placeholder="Contexto de negócio que o agente deve considerar."
                />
                <TextAreaField
                  label="Observações"
                  value={observacoes}
                  onChange={setObservacoes}
                  placeholder="Instruções extras para esta pesquisa."
                />
              </CollapsibleSection>

              {error && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-red">
                  <AlertTriangleIcon className="h-4 w-4" /> {error}
                </p>
              )}

              <button
                onClick={runResearch}
                disabled={running || !completeness.ready}
                className="duofy-tap flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-purple px-5 text-sm font-bold text-white hover:bg-purple-deep disabled:opacity-50"
              >
                {running ? (
                  <><Spinner size={16} /> Pesquisando… (pode levar 1–2 min)</>
                ) : (
                  <><SearchIcon className="h-4 w-4" /> Iniciar pesquisa</>
                )}
              </button>
              <p className="text-center text-xs text-muted">
                A pesquisa consulta fontes reais — costuma levar 1 a 2 min. Pode deixar esta
                aba aberta; se demorar, o relatório aparece em “Pesquisas recentes”.
              </p>
            </div>
          </div>

          {/* Coluna direita: resumo + completude + recentes */}
          <div className="space-y-5">
            <BriefingSummary rows={summaryRows} />
            <BriefingCompleteness completeness={completeness} />

            <div className="duofy-card h-fit rounded-2xl p-5">
              <SectionHeader title="Pesquisas recentes" subtitle={brand ? `Marca ${brandName}` : "Todas as marcas"} />
              <div className="mt-3 space-y-2">
                {loadingReports && <p className="text-sm text-muted">Carregando…</p>}
                {!loadingReports && reports.length === 0 && (
                  <p className="text-sm text-muted">Nenhuma pesquisa ainda.</p>
                )}
                {reports.map((r) => {
                  const rst = STATUS_TONE[r.status] ?? { label: r.status, tone: "slate" as Tone }
                  return (
                    <button
                      key={r.id}
                      onClick={() => openReport(r.id)}
                      className="group flex w-full items-start gap-2 rounded-xl border border-line bg-white p-3 text-left hover:border-purple/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{r.title}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                          <ClockIcon className="h-3.5 w-3.5" /> {fmtDate(r.updated_at)}
                          <Badge tone={rst.tone} className="ml-1">{rst.label}</Badge>
                        </p>
                      </div>
                      <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-muted group-hover:text-purple" />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* B) Resultado da pesquisa */}
      {selected && st && (
        <div className="space-y-5">
          <div className="duofy-card rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">{selected.title}</h2>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {selected.provider} · {selected.model} · {selected.sources.length} fontes · atualizada {fmtDate(selected.updated_at)}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => act("approve")}
                disabled={acting != null || selected.status === "approved"}
                className="duofy-tap inline-flex items-center gap-2 rounded-xl bg-purple px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50"
              >
                <CheckCircleIcon className="h-4 w-4" />
                {acting === "approve" ? "Aprovando…" : selected.status === "approved" ? "Aprovada" : "Aprovar pesquisa"}
              </button>
              <GhostButton onClick={() => act("request-adjustment")} disabled={acting != null}>
                <RefreshIcon className="h-4 w-4" /> Solicitar ajustes
              </GhostButton>
              <GhostButton onClick={saveMemory} disabled={acting != null}>
                <BookmarkIcon className="h-4 w-4" /> {acting === "memory" ? "Salvando…" : "Salvar na memória"}
              </GhostButton>
              <GhostButton onClick={() => router.push(`/content?research=${selected.id}`)} disabled={acting != null}>
                <SparklesIcon className="h-4 w-4" /> Enviar para cocriação
              </GhostButton>
              <GhostButton onClick={() => exportReport("pdf")} disabled={exporting != null}>
                <DownloadIcon className="h-4 w-4" /> {exporting === "pdf" ? "Exportando…" : "Exportar PDF"}
              </GhostButton>
              <GhostButton onClick={() => exportReport("docx")} disabled={exporting != null}>
                <DownloadIcon className="h-4 w-4" /> {exporting === "docx" ? "Exportando…" : "DOCX"}
              </GhostButton>
              <GhostButton onClick={() => exportReport("md")} disabled={exporting != null}>
                <DownloadIcon className="h-4 w-4" /> {exporting === "md" ? "Exportando…" : "Markdown"}
              </GhostButton>
            </div>
            {actionMsg && <p className="mt-3 text-xs font-medium text-purple">{actionMsg}</p>}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
            <div className="duofy-card rounded-2xl p-6">
              <Markdown content={selected.current_content || "_Pesquisa sem conteúdo._"} />
            </div>

            <div className="h-fit space-y-5">
              {selectedBriefingRows.length > 0 && (
                <BriefingSummary rows={selectedBriefingRows} title="Briefing da pesquisa" />
              )}

              <div className="duofy-card rounded-2xl p-5">
                <SectionHeader title="Fontes e evidências" subtitle={`${selected.sources.length} fontes coletadas`} />
                <div className="mt-3 space-y-2.5">
                  {selected.sources.length === 0 && <p className="text-sm text-muted">Sem fontes registradas.</p>}
                  {selected.sources.map((s, i) => (
                    <div key={s.id} className="rounded-xl border border-line p-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={RELIABILITY_TONE[s.reliability] ?? "slate"}>{s.reliability}</Badge>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{s.source_kind}</span>
                      </div>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 flex items-start gap-1 text-sm font-medium text-ink hover:text-purple"
                      >
                        <span className="min-w-0 flex-1">[{i + 1}] {s.title}</span>
                        <ExternalLinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                      </a>
                      {s.publisher && <p className="mt-0.5 text-[11px] text-muted">{s.publisher}</p>}
                      {s.evidence && <p className="mt-1 line-clamp-3 text-xs text-ink/70">{s.evidence}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
