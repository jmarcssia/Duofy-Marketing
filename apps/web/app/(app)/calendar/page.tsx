"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge, FieldSelect, GhostButton, StatCard } from "@/components/ui"
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  DownloadIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon
} from "@/components/icons"
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
  briefingSummaryRows,
  CANAIS,
  cleanBriefing,
  computeCompleteness,
  CTAS,
  DEPENDENCIAS,
  type EventTemplate,
  FORMATOS,
  labelOf,
  normalizeChannels,
  normalizeDepth,
  normalizePieces,
  PECAS,
  PERIODOS,
  PERSONAS,
  PROFUNDIDADES,
  PUBLICACAO_MODOS,
  PUBLICACAO_REQUISITOS,
  SEGMENTO_POR_MARCA,
  SEGMENTOS,
  type StructuredBriefing,
  subsegmentosPara,
  type SummaryRow,
  TEMPLATES_EVENTO,
  TIPOS_EVENTO,
  TIPOS_PESQUISA,
  TOM_POR_SEGMENTO,
  TONS
} from "@/lib/briefing"
import { apiFetch, type Brand, type CalendarEvent } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"
import { downloadFile } from "@/lib/download"

import { EventDetailPanel } from "./EventDetailPanel"
import {
  CREATE_EVENT_TYPES,
  eventTypeLabel,
  GENERIC_STATUSES,
  statusMeta,
  WORKFLOW_STATUSES
} from "./status"

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` }
function hm(d: Date) { return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` }

type View = "month" | "week" | "list"
type Scope = "brand" | "all"

/* ---------------- Wizard de evento (FASE 4) ---------------- */

const SOCIAL_CHANNELS = ["Instagram", "LinkedIn", "Facebook", "TikTok"]

/** Opções de recorrência do evento (rótulos pt-BR) — 5d. */
const RECURRENCE_OPTIONS: [string, string][] = [
  ["none", "Sem recorrência"],
  ["daily", "Diária"],
  ["weekly", "Semanal"],
  ["biweekly", "Quinzenal"],
  ["monthly", "Mensal"]
]
const RECURRENCE_LABELS: Record<string, string> = Object.fromEntries(RECURRENCE_OPTIONS)

/** Peças pré-selecionadas quando o canal entra na seleção (mesma lógica da cocriação). */
const PIECES_BY_CHANNEL: Record<string, string[]> = {
  Instagram: ["carousel", "caption_instagram", "visual_direction"],
  LinkedIn: ["carousel", "caption_linkedin", "visual_direction"],
  WhatsApp: ["whatsapp"],
  "E-mail": ["email"],
  Blog: ["blog"],
  Release: ["release"],
  Pitch: ["pitch"],
  "Landing page": ["landing_page"]
}

/** Peças visíveis/coerentes com os canais selecionados (mesma lógica da cocriação). */
function allowedPiecesFor(channels: string[]): Set<string> {
  const set = new Set<string>()
  if (channels.includes("Instagram") || channels.includes("LinkedIn")) {
    for (const p of ["carousel", "caption_instagram", "caption_linkedin", "visual_direction"]) set.add(p)
  }
  if (channels.includes("WhatsApp")) {
    set.add("whatsapp")
    set.add("whatsapp_image_prompt")
  }
  if (channels.includes("E-mail")) set.add("email")
  if (channels.includes("Blog")) set.add("blog")
  if (channels.includes("Release")) set.add("release")
  if (channels.includes("Pitch")) set.add("pitch")
  if (channels.includes("Landing page")) set.add("landing_page")
  return set
}

/** Chaves do briefing controladas pelos campos do wizard (o resto vira "extra"). */
const UI_BRIEFING_KEYS = new Set([
  "segmento", "subsegmentos", "personas", "tipos_pesquisa", "profundidade", "periodo",
  "canais", "formatos", "pecas", "tom", "cta", "publicacao"
])

function extraOnly(b: StructuredBriefing): StructuredBriefing {
  return Object.fromEntries(Object.entries(b).filter(([k]) => !UI_BRIEFING_KEYS.has(k))) as StructuredBriefing
}

function strArr(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined
}

type WizardForm = {
  id?: number
  /** Marca original do evento (query do PATCH); a marca do form vai no body. */
  originalBrand?: string
  // Etapa 1 — tipo (ids de TIPOS_EVENTO; "research_content" vira research + pipeline)
  tipo: string
  // Etapa 2 — marca e template
  brandSlug: string
  templateId: string | null
  // Etapa 3 — briefing
  title: string
  objective: string
  description: string
  segmento: string
  subsegmentos: string[]
  tiposPesquisa: string[]
  profundidade: string
  periodo: string
  canais: string[]
  formatos: string[]
  tom: string
  cta: string
  personas: string[]
  pubModo: string
  pubRequisitos: string[]
  /** Chaves do briefing vindas de template/edição que não têm campo próprio no wizard. */
  extraBriefing: StructuredBriefing
  // Etapa 4 — datas e automação
  date: string
  startTime: string
  endTime: string
  status: string
  category: string
  assigned_agent_slug: string
  execution_mode: string
  autoDate: string
  autoTime: string
  // Datas avançadas do ciclo editorial (5d) — todas opcionais ("" = vazio)
  deliveryDate: string
  reviewDate: string
  approvalDate: string
  dueDate: string
  reminderDate: string
  reminderTime: string
  recurrence: string
  // Etapa 5 — peças e aprovação
  pecas: string[]
  requires_research_approval: boolean
  /** Apenas informativo — não entra no payload (sem contrato no backend). */
  dependencias: string[]
}

function blankForm(date: string, brandSlug: string): WizardForm {
  const segmento = SEGMENTO_POR_MARCA[brandSlug] ?? ""
  return {
    tipo: "research", brandSlug, templateId: null,
    title: "", objective: "", description: "",
    segmento, subsegmentos: [], tiposPesquisa: [], profundidade: "", periodo: "",
    canais: [], formatos: [], tom: TOM_POR_SEGMENTO[segmento] ?? "", cta: "",
    personas: [], pubModo: "", pubRequisitos: [], extraBriefing: {},
    date, startTime: "09:00", endTime: "10:00",
    status: "draft", category: "general", assigned_agent_slug: "",
    execution_mode: "manual", autoDate: date, autoTime: "09:00",
    deliveryDate: "", reviewDate: "", approvalDate: "", dueDate: "",
    reminderDate: "", reminderTime: "", recurrence: "none",
    pecas: [], requires_research_approval: true, dependencias: []
  }
}

function formFromEvent(e: CalendarEvent): WizardForm {
  const start = new Date(e.start_at)
  const end = e.end_at ? new Date(e.end_at) : new Date(start.getTime() + 3600000)
  const auto = e.auto_execute_at ? new Date(e.auto_execute_at) : start
  const payload = (e.execution_payload ?? {}) as Record<string, unknown>
  const briefing = (
    typeof payload.briefing === "object" && payload.briefing !== null ? payload.briefing : {}
  ) as StructuredBriefing
  const tipo = payload.pipeline === "research_content" ? "research_content" : (e.event_type || "content")
  const canais = strArr(payload.channels) ?? briefing.canais ?? (e.channel ? [e.channel] : [])
  const formatos = strArr(payload.formats) ?? briefing.formatos ?? (e.format ? [e.format] : [])
  const pecas = strArr(payload.pieces) ?? briefing.pecas ?? []
  const prof =
    PROFUNDIDADES.find((p) => p.id === briefing.profundidade || p.label === briefing.profundidade) ??
    (typeof payload.depth === "string" ? PROFUNDIDADES.find((p) => p.depth === payload.depth) : undefined)
  const periodo = briefing.periodo ?? (typeof payload.period === "string" ? payload.period : "")
  const ymdOrEmpty = (iso: string | null) => (iso ? ymd(new Date(iso)) : "")
  const reminder = e.reminder_at ? new Date(e.reminder_at) : null
  return {
    id: e.id,
    originalBrand: e.brand_slug,
    tipo,
    brandSlug: e.brand_slug,
    templateId: null,
    title: e.title,
    objective: e.objective ?? "",
    description: e.description ?? "",
    segmento: briefing.segmento ?? SEGMENTO_POR_MARCA[e.brand_slug] ?? "",
    subsegmentos: briefing.subsegmentos ?? [],
    tiposPesquisa: briefing.tipos_pesquisa ?? [],
    profundidade: prof?.id ?? "",
    periodo,
    canais, formatos, pecas,
    tom: briefing.tom ?? "",
    cta: briefing.cta ?? "",
    personas: briefing.personas ?? [],
    pubModo: briefing.publicacao?.modo ?? "",
    pubRequisitos: briefing.publicacao?.requisitos ?? [],
    extraBriefing: extraOnly(briefing),
    date: ymd(start), startTime: hm(start), endTime: hm(end),
    status: e.status,
    category: e.category ?? "general",
    assigned_agent_slug: e.assigned_agent_slug ?? "",
    execution_mode: e.execution_mode ?? "manual",
    autoDate: ymd(auto), autoTime: hm(auto),
    deliveryDate: ymdOrEmpty(e.delivery_at),
    reviewDate: ymdOrEmpty(e.review_at),
    approvalDate: ymdOrEmpty(e.approval_at),
    dueDate: ymdOrEmpty(e.due_at),
    reminderDate: reminder ? ymd(reminder) : "",
    reminderTime: reminder ? hm(reminder) : "",
    recurrence: e.recurrence_rule ?? "none",
    requires_research_approval: e.requires_research_approval ?? true,
    dependencias: []
  }
}

/** Briefing estruturado final do evento (só o que faz sentido para o tipo). */
function buildBriefing(form: WizardForm): StructuredBriefing | undefined {
  const hasResearch = form.tipo === "research" || form.tipo === "research_content"
  const hasContent = form.tipo === "content" || form.tipo === "research_content"
  const hasAgent = hasResearch || hasContent
  const prof = PROFUNDIDADES.find((p) => p.id === form.profundidade)
  const b: StructuredBriefing = { ...form.extraBriefing }
  if (hasAgent) {
    b.segmento = form.segmento || undefined
    b.personas = form.personas
    b.canais = form.canais
    b.formatos = form.formatos
    b.pecas = form.pecas
  }
  if (hasResearch) {
    b.subsegmentos = form.subsegmentos
    b.tipos_pesquisa = form.tiposPesquisa
    b.profundidade = prof?.label
    b.periodo = form.periodo || undefined
  }
  if (hasContent) {
    b.tom = form.tom || undefined
    b.cta = form.cta || undefined
  }
  if (form.tipo === "publication") {
    b.publicacao = form.pubModo || form.pubRequisitos.length > 0
      ? { modo: form.pubModo || undefined, requisitos: form.pubRequisitos }
      : undefined
  }
  return cleanBriefing(b)
}

export default function CalendarPage() {
  const { brands, selected: brand } = useBrand()
  const brandName = brands.find((b) => b.slug === brand)?.name ?? brand
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(() => ymd(new Date()))

  const [view, setView] = useState<View>("month")
  const [scope, setScope] = useState<Scope>("brand")
  const [fType, setFType] = useState("")
  const [fStatus, setFStatus] = useState("")
  const [fChannel, setFChannel] = useState("")
  const [fExec, setFExec] = useState("")

  const [objective, setObjective] = useState("")
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const [form, setForm] = useState<WizardForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    setLoading(true)
    try {
      const qs = scope === "brand" && brand ? `?brand_slug=${brand}&limit=300` : "?limit=300"
      const data = await apiFetch<CalendarEvent[]>(`/api/calendar${qs}`, token)
      setEvents(data)
    } catch { setEvents([]) }
    setLoading(false)
  }, [brand, scope])

  useEffect(() => { load() }, [load])

  const channels = useMemo(
    () => Array.from(new Set(events.map((e) => e.channel).filter(Boolean))) as string[],
    [events]
  )

  const filtered = useMemo(() => events.filter((e) => {
    if (fType && e.event_type !== fType) return false
    if (fStatus && e.status !== fStatus) return false
    if (fChannel && e.channel !== fChannel) return false
    if (fExec && e.execution_mode !== fExec) return false
    return true
  }), [events, fType, fStatus, fChannel, fExec])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of filtered) {
      const key = e.start_at.slice(0, 10)
      const arr = map.get(key) ?? []
      arr.push(e)
      map.set(key, arr)
    }
    return map
  }, [filtered])

  const grid = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: { date: Date; current: boolean }[] = []
    for (let i = firstWeekday - 1; i >= 0; i--) cells.push({ date: new Date(year, month, -i), current: false })
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d), current: true })
    while (cells.length % 7 !== 0) cells.push({ date: new Date(year, month, daysInMonth + (cells.length % 7)), current: false })
    return cells
  }, [cursor])

  const weekDays = useMemo(() => {
    const ref = selectedDay ? new Date(selectedDay + "T12:00:00") : new Date()
    const sunday = new Date(ref)
    sunday.setDate(ref.getDate() - ref.getDay())
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(sunday); d.setDate(sunday.getDate() + i); return d })
  }, [selectedDay])

  const stats = [
    { icon: <SearchIcon className="h-5 w-5" />, tone: "purple" as const, label: "Pesquisas", value: String(filtered.filter((e) => e.event_type === "research").length) },
    { icon: <SparklesIcon className="h-5 w-5" />, tone: "blue" as const, label: "Conteúdos", value: String(filtered.filter((e) => e.event_type === "content").length) },
    { icon: <ShieldCheckIcon className="h-5 w-5" />, tone: "amber" as const, label: "Aguardando aprovação", value: String(filtered.filter((e) => e.status === "awaiting_approval").length) },
    { icon: <ClockIcon className="h-5 w-5" />, tone: "blue" as const, label: "Agendados", value: String(filtered.filter((e) => e.status === "scheduled").length) },
    { icon: <CalendarIcon className="h-5 w-5" />, tone: "green" as const, label: "Concluídos", value: String(filtered.filter((e) => ["completed", "approved"].includes(e.status)).length) }
  ]

  function openCreate(day?: string) {
    const d = day ?? selectedDay ?? ymd(today)
    setForm(blankForm(d, brand))
    setFormError(null)
  }
  function openEdit(e: CalendarEvent) {
    setForm(formFromEvent(e))
    setFormError(null)
  }

  const updateForm = useCallback((patch: Partial<WizardForm>) => {
    setForm((f) => (f ? { ...f, ...patch } : f))
  }, [])

  async function saveForm() {
    if (!form) return
    if (form.title.trim().length < 2) { setFormError("Informe um título/tema (mín. 2 caracteres)."); return }
    const token = getTokenFromCookie()
    const brandSlug = form.brandSlug || brand
    if (!token || !brandSlug) { setFormError("Selecione uma marca."); return }
    const startISO = new Date(`${form.date}T${form.startTime || "09:00"}:00`).toISOString()
    const endISO = form.endTime ? new Date(`${form.date}T${form.endTime}:00`).toISOString() : null
    const autoISO = form.execution_mode === "auto"
      ? new Date(`${form.autoDate || form.date}T${form.autoTime || "09:00"}:00`).toISOString()
      : null

    // Datas avançadas (5d): data às 09:00; lembrete usa a hora informada (ou 09:00). "" → null.
    const dateAt09 = (d: string) => (d ? new Date(`${d}T09:00:00`).toISOString() : null)
    const deliveryISO = dateAt09(form.deliveryDate)
    const reviewISO = dateAt09(form.reviewDate)
    const approvalISO = dateAt09(form.approvalDate)
    const dueISO = dateAt09(form.dueDate)
    const reminderISO = form.reminderDate
      ? new Date(`${form.reminderDate}T${form.reminderTime || "09:00"}:00`).toISOString()
      : null
    const recurrenceRule = form.recurrence === "none" ? null : form.recurrence

    const hasResearch = form.tipo === "research" || form.tipo === "research_content"
    const briefing = buildBriefing(form)
    const mainChannel = form.canais.find((c) => SOCIAL_CHANNELS.includes(c)) ?? null
    const mainFormat = form.formatos.includes("Carrossel") ? "Carrossel" : form.formatos[0] ?? null

    const executionPayload: Record<string, unknown> = {}
    // Normalização UI→API única: envia enums canônicos no payload do evento.
    if (hasResearch && form.profundidade) executionPayload.depth = normalizeDepth(form.profundidade)
    if (hasResearch && form.periodo) executionPayload.period = form.periodo
    if (mainChannel) executionPayload.channel = mainChannel
    if (mainFormat) executionPayload.format = mainFormat
    if (form.canais.length > 0) executionPayload.channels = normalizeChannels(form.canais)
    if (form.formatos.length > 0) executionPayload.formats = form.formatos
    if (form.pecas.length > 0) executionPayload.pieces = normalizePieces(form.pecas)
    if (form.tipo === "research_content") executionPayload.pipeline = "research_content"
    if (briefing) executionPayload.briefing = briefing

    const body = {
      brand_slug: brandSlug,
      title: form.title.trim(),
      description: form.description,
      objective: form.objective,
      category: form.category || "general",
      // "research_content" não existe no backend: vira research + pipeline no payload.
      event_type: form.tipo === "research_content" ? "research" : form.tipo || "content",
      status: form.status,
      channel: mainChannel,
      format: mainFormat,
      start_at: startISO,
      end_at: endISO,
      assigned_agent_slug: form.assigned_agent_slug || null,
      execution_mode: form.execution_mode,
      auto_execute_at: autoISO,
      // Sem etapa de pesquisa não há o que aprovar — o gate só se aplica a eventos com pesquisa.
      requires_research_approval: hasResearch ? form.requires_research_approval : false,
      delivery_at: deliveryISO,
      review_at: reviewISO,
      approval_at: approvalISO,
      due_at: dueISO,
      reminder_at: reminderISO,
      recurrence_rule: recurrenceRule,
      execution_payload: Object.keys(executionPayload).length > 0 ? executionPayload : null
    }
    setSaving(true)
    setFormError(null)
    try {
      if (form.id) {
        const qsBrand = encodeURIComponent(form.originalBrand ?? brandSlug)
        await apiFetch(`/api/calendar/${form.id}?brand_slug=${qsBrand}`, token, { method: "PATCH", body: JSON.stringify(body) })
      } else {
        await apiFetch(`/api/calendar`, token, { method: "POST", body: JSON.stringify(body) })
      }
      setForm(null)
      setSelectedDay(form.date)
      await load()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Falha ao salvar o evento.")
    }
    setSaving(false)
  }

  async function generate() {
    if (objective.trim().length < 10) { setGenMsg("Descreva o objetivo com mais detalhes (mín. 10 caracteres)."); return }
    const token = getTokenFromCookie()
    if (!token || !brand) { setGenMsg("Selecione uma marca."); return }
    setGenerating(true)
    setGenMsg("Gerando calendário com o agente… pode levar alguns segundos.")
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    try {
      const created = await apiFetch<CalendarEvent[]>("/api/calendar/generate", token, {
        method: "POST",
        body: JSON.stringify({ brand_slug: brand, objective, period_start: start.toISOString(), period_end: end.toISOString(), channels: ["Instagram", "LinkedIn", "Blog"] })
      })
      setGenMsg(`${created.length} evento(s) gerado(s).`)
      setObjective("")
      await load()
    } catch (e: unknown) {
      setGenMsg(e instanceof Error ? e.message : "Falha ao gerar calendário.")
    }
    setGenerating(false)
  }

  async function exportIcs() {
    const token = getTokenFromCookie()
    if (!token) return
    setExporting(true)
    try {
      const qs = scope === "brand" && brand ? `?brand_slug=${brand}` : ""
      await downloadFile(`/api/calendar/export.ics${qs}`, token, "duofy-calendario.ics")
    } catch { /* ignore */ }
    setExporting(false)
  }

  const dayEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : []
  const listEvents = useMemo(() => [...filtered].sort((a, b) => a.start_at.localeCompare(b.start_at)), [filtered])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[30px] font-extrabold tracking-[-0.04em] text-ink">
            <CalendarIcon className="h-7 w-7 text-purple" /> Calendário
          </h1>
          <p className="mt-1 text-sm text-muted">Centro operacional por marca: pesquisa, conteúdo e entregas em um fluxo só.{brandName ? ` Marca: ${brandName}.` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={scope} onChange={(v) => setScope(v as Scope)} options={[["brand", "Marca atual"], ["all", "Todas as marcas"]]} />
          <button onClick={exportIcs} disabled={exporting} className="duofy-tap flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple disabled:opacity-50">
            <DownloadIcon className="h-4 w-4" /> {exporting ? "Exportando…" : "Exportar .ics"}
          </button>
          <button onClick={() => openCreate()} className="duofy-tap flex h-10 items-center gap-2 rounded-xl bg-purple px-4 text-sm font-semibold text-white hover:bg-purple-deep">
            <PlusIcon className="h-4 w-4" /> Novo evento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => <StatCard key={s.label} icon={s.icon} iconTone={s.tone} label={s.label} value={s.value} />)}
      </div>

      {/* Barra de controles: view + filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-3">
        <Segmented value={view} onChange={(v) => setView(v as View)} options={[["month", "Mês"], ["week", "Semana"], ["list", "Lista"]]} />
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <FilterSelect label="Tipo" value={fType} onChange={setFType} options={CREATE_EVENT_TYPES.map((t) => [t, eventTypeLabel(t)])} />
        <FilterSelect label="Status" value={fStatus} onChange={setFStatus} options={["draft", "ready", "scheduled", "running", "awaiting_approval", "approved", "completed", "failed"].map((s) => [s, statusMeta(s).label])} />
        {channels.length > 0 && <FilterSelect label="Canal" value={fChannel} onChange={setFChannel} options={channels.map((c) => [c, c])} />}
        <FilterSelect label="Execução" value={fExec} onChange={setFExec} options={[["manual", "Manual"], ["auto", "Automática"]]} />
        {(fType || fStatus || fChannel || fExec) && (
          <button onClick={() => { setFType(""); setFStatus(""); setFChannel(""); setFExec("") }} className="text-xs font-semibold text-muted hover:text-purple">Limpar filtros</button>
        )}
        <span className="ml-auto text-xs text-muted">{filtered.length} evento(s)</span>
      </div>

      {view === "list" ? (
        <ListView events={listEvents} loading={loading} onOpen={setDetailId} />
      ) : view === "week" ? (
        <WeekView days={weekDays} eventsByDay={eventsByDay} onOpen={setDetailId} onCreate={openCreate} today={ymd(today)} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="duofy-card rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:text-purple"><ChevronLeftIcon className="h-4 w-4" /></button>
                <h2 className="min-w-[150px] text-center text-lg font-bold text-ink">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
                <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:text-purple"><ChevronRightIcon className="h-4 w-4" /></button>
              </div>
              <div className="flex items-center gap-2">
                <GhostButton className="text-xs" onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(ymd(today)) }}>Hoje</GhostButton>
                <button onClick={load} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:text-purple"><RefreshIcon className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => <div key={w} className="py-2 text-center text-xs font-semibold text-muted">{w}</div>)}
              {loading ? (
                Array.from({ length: 35 }).map((_, i) => <div key={i} className="duofy-skeleton h-20 rounded-lg" />)
              ) : (
                grid.map((cell, i) => {
                  const key = ymd(cell.date)
                  const evs = eventsByDay.get(key) ?? []
                  const isToday = key === ymd(today)
                  const isSelected = key === selectedDay
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDay(key)}
                      onDoubleClick={() => openCreate(key)}
                      title="Clique para ver · duplo clique para criar"
                      className={`group flex h-20 flex-col rounded-lg border p-1.5 text-left transition ${isSelected ? "border-purple ring-1 ring-purple/30" : "border-line hover:border-purple/40"} ${cell.current ? "bg-white" : "bg-panel/50"}`}
                    >
                      <span className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${isToday ? "grid h-5 w-5 place-items-center rounded-full bg-purple text-white" : cell.current ? "text-ink" : "text-muted"}`}>{cell.date.getDate()}</span>
                        <span onClick={(ev) => { ev.stopPropagation(); openCreate(key) }} className="hidden h-4 w-4 place-items-center rounded text-muted hover:text-purple group-hover:grid" role="button" aria-label="Criar evento">
                          <PlusIcon className="h-3.5 w-3.5" />
                        </span>
                      </span>
                      <div className="mt-1 space-y-0.5 overflow-hidden">
                        {evs.slice(0, 2).map((e) => (
                          <span
                            key={e.id}
                            onClick={(ev) => { ev.stopPropagation(); setDetailId(e.id) }}
                            className="flex items-center gap-1 truncate rounded px-0.5 text-[10px] text-ink hover:text-purple"
                            role="button"
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: statusMeta(e.status).dot }} />
                            <span className="truncate">{e.title}</span>
                          </span>
                        ))}
                        {evs.length > 2 && <span className="text-[10px] text-muted">+{evs.length - 2}</span>}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </section>

          <div className="space-y-5">
            <section className="duofy-card rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-ink">
                  {selectedDay ? new Date(selectedDay + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }) : "Selecione um dia"}
                </h3>
                {selectedDay && (
                  <button onClick={() => openCreate(selectedDay)} className="duofy-tap flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-semibold text-muted hover:border-purple/40 hover:text-purple">
                    <PlusIcon className="h-3.5 w-3.5" /> Evento
                  </button>
                )}
              </div>
              {!selectedDay ? (
                <p className="mt-3 text-sm text-muted">Clique num dia para ver os eventos. Duplo clique para criar.</p>
              ) : dayEvents.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Nenhum evento neste dia. Clique em “Evento” para criar.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {dayEvents.map((e) => <EventRow key={e.id} e={e} onOpen={() => setDetailId(e.id)} />)}
                </ul>
              )}
            </section>

            <section className="duofy-card rounded-2xl p-5">
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-5 w-5 text-purple" />
                <h3 className="text-base font-bold text-ink">Gerar com IA</h3>
              </div>
              <p className="mt-1 text-xs text-muted">O agente cria eventos para <span className="font-semibold text-ink">{MONTHS[cursor.getMonth()]}</span> a partir do objetivo.</p>
              <textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={3} placeholder="Ex: aumentar engajamento com conteúdo educativo 3x por semana." className="mt-3 w-full resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" />
              <button onClick={generate} disabled={generating || !brand} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-purple py-2.5 text-sm font-semibold text-white transition hover:bg-purple-deep disabled:opacity-50">
                {generating ? (<><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Gerando…</>) : (<><SparklesIcon className="h-4 w-4" /> Gerar com IA</>)}
              </button>
              {genMsg && <p className="mt-2 text-xs text-muted">{genMsg}</p>}
            </section>
          </div>
        </div>
      )}

      {form && (
        <EventWizardPanel
          form={form} update={updateForm} brands={brands} saving={saving} formError={formError}
          onSave={saveForm} onClose={() => setForm(null)}
        />
      )}

      {detailId !== null && brand && (
        <EventDetailPanel
          eventId={detailId}
          brandSlug={events.find((e) => e.id === detailId)?.brand_slug ?? brand}
          onClose={() => setDetailId(null)}
          onChanged={load}
          onEdit={(e) => { setDetailId(null); openEdit(e) }}
        />
      )}
    </div>
  )
}

function EventRow({ e, onOpen }: { e: CalendarEvent; onOpen: () => void }) {
  const st = statusMeta(e.status)
  return (
    <li>
      <button onClick={onOpen} className="w-full rounded-xl border border-line p-3 text-left transition hover:border-purple/40">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-snug text-ink">{e.title}</p>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone="slate">{eventTypeLabel(e.event_type)}</Badge>
          {e.channel && <Badge tone="purple">{e.channel}</Badge>}
          {e.execution_mode === "auto" && <Badge tone="blue">Auto</Badge>}
          <span className="text-[11px] text-muted">{new Date(e.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        {e.last_error && <p className="mt-1 line-clamp-1 text-[11px] text-red">{e.last_error}</p>}
      </button>
    </li>
  )
}

function ListView({ events, loading, onOpen }: { events: CalendarEvent[]; loading: boolean; onOpen: (id: number) => void }) {
  if (loading) return <div className="duofy-card rounded-2xl p-5"><div className="duofy-skeleton h-40 rounded" /></div>
  if (events.length === 0) return <div className="duofy-card rounded-2xl p-8 text-center text-sm text-muted">Nenhum evento com os filtros atuais.</div>
  return (
    <div className="duofy-card rounded-2xl p-3">
      <ul className="divide-y divide-line">
        {events.map((e) => {
          const st = statusMeta(e.status)
          return (
            <li key={e.id}>
              <button onClick={() => onOpen(e.id)} className="flex w-full items-center gap-3 px-2 py-3 text-left transition hover:bg-panel/40">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line text-center text-[11px] font-bold text-muted">
                  {new Date(e.start_at).toLocaleDateString("pt-BR", { day: "2-digit" })}<br />{new Date(e.start_at).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{e.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone="slate">{eventTypeLabel(e.event_type)}</Badge>
                    {e.channel && <Badge tone="purple">{e.channel}</Badge>}
                    <span className="text-[11px] text-muted">{new Date(e.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
                <Badge tone={st.tone}>{st.label}</Badge>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function WeekView({ days, eventsByDay, onOpen, onCreate, today }: {
  days: Date[]; eventsByDay: Map<string, CalendarEvent[]>; onOpen: (id: number) => void; onCreate: (d: string) => void; today: string
}) {
  return (
    <div className="duofy-card overflow-x-auto rounded-2xl p-3 duofy-scroll">
      <div className="grid min-w-[720px] grid-cols-7 gap-2">
        {days.map((d) => {
          const key = ymd(d)
          const evs = eventsByDay.get(key) ?? []
          const isToday = key === today
          return (
            <div key={key} className="flex min-h-[220px] flex-col rounded-xl border border-line bg-white">
              <div className={`flex items-center justify-between rounded-t-xl px-2 py-1.5 ${isToday ? "bg-purple/10" : "bg-panel/50"}`}>
                <span className="text-xs font-semibold text-ink">{WEEKDAYS[d.getDay()]} {d.getDate()}</span>
                <button onClick={() => onCreate(key)} className="text-muted hover:text-purple"><PlusIcon className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex-1 space-y-1 p-1.5">
                {evs.map((e) => {
                  const st = statusMeta(e.status)
                  return (
                    <button key={e.id} onClick={() => onOpen(e.id)} className="w-full rounded-lg border border-line px-1.5 py-1 text-left text-[11px] hover:border-purple/40">
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: st.dot }} />
                        <span className="truncate font-semibold text-ink">{e.title}</span>
                      </span>
                      <span className="text-[10px] text-muted">{new Date(e.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </button>
                  )
                })}
                {evs.length === 0 && <p className="px-1 py-2 text-[11px] text-muted">—</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- Wizard drawer ---------------- */

const BRIEFING_STEP = 2

function EventWizardPanel({ form, update, brands, saving, formError, onSave, onClose }: {
  form: WizardForm
  update: (patch: Partial<WizardForm>) => void
  brands: Brand[]
  saving: boolean
  formError: string | null
  onSave: () => void
  onClose: () => void
}) {
  const [step, setStep] = useState(0)
  const [stepError, setStepError] = useState<string | null>(null)

  const hasResearch = form.tipo === "research" || form.tipo === "research_content"
  const hasContent = form.tipo === "content" || form.tipo === "research_content"
  const hasAgent = hasResearch || hasContent
  const isPublication = form.tipo === "publication"

  const steps = useMemo(
    () => ["Tipo", "Marca e template", "Briefing", "Datas e automação", ...(hasAgent ? ["Peças e aprovação"] : []), "Resumo"],
    [hasAgent]
  )
  const current = Math.min(step, steps.length - 1)
  const stepName = steps[current]

  const wizBrandName = brands.find((b) => b.slug === form.brandSlug)?.name ?? form.brandSlug

  function goTo(i: number) {
    const target = Math.max(0, Math.min(i, steps.length - 1))
    if (target > BRIEFING_STEP && form.title.trim().length < 2) {
      setStepError("Informe o título/tema (mín. 2 caracteres) para avançar.")
      setStep(Math.min(target, BRIEFING_STEP))
      return
    }
    setStepError(null)
    setStep(target)
  }

  function setTipo(t: string) {
    const isWorkflow = t === "research" || t === "research_content"
    update({ tipo: t, ...(form.id ? {} : { status: isWorkflow ? "draft" : "planned" }) })
  }

  function changeBrand(slug: string) {
    const prevDefault = SEGMENTO_POR_MARCA[form.brandSlug] ?? ""
    const nextDefault = SEGMENTO_POR_MARCA[slug] ?? ""
    const segmento = !form.segmento || form.segmento === prevDefault ? nextDefault || form.segmento : form.segmento
    const prevTom = TOM_POR_SEGMENTO[form.segmento] ?? ""
    const tom = !form.tom || form.tom === prevTom ? TOM_POR_SEGMENTO[segmento] ?? form.tom : form.tom
    update({
      brandSlug: slug,
      segmento,
      tom,
      subsegmentos: segmento === form.segmento ? form.subsegmentos : []
    })
  }

  function changeSegmento(seg: string) {
    const prevTom = TOM_POR_SEGMENTO[form.segmento] ?? ""
    const tom = !form.tom || form.tom === prevTom ? TOM_POR_SEGMENTO[seg] ?? form.tom : form.tom
    update({ segmento: seg, subsegmentos: [], tom })
  }

  function onChannelsChange(next: string[]) {
    const added = next.filter((c) => !form.canais.includes(c))
    const allowed = allowedPiecesFor(next)
    const kept = form.pecas.filter((p) => allowed.has(p))
    const defaults = added.flatMap((c) => PIECES_BY_CHANNEL[c] ?? []).filter((p) => allowed.has(p))
    update({ canais: next, pecas: Array.from(new Set([...kept, ...defaults])) })
  }

  function applyTemplate(t: EventTemplate) {
    const b = (t.briefing ?? {}) as StructuredBriefing
    const canais = t.channels ?? form.canais
    const pecas =
      t.pieces ??
      (t.channels
        ? Array.from(new Set(t.channels.flatMap((c) => PIECES_BY_CHANNEL[c] ?? [])))
        : form.pecas)
    update({
      templateId: t.id,
      canais,
      formatos: t.formats ?? form.formatos,
      pecas,
      requires_research_approval: t.requires_research_approval ?? form.requires_research_approval,
      tiposPesquisa: b.tipos_pesquisa ?? form.tiposPesquisa,
      pubModo: b.publicacao?.modo ?? form.pubModo,
      pubRequisitos: b.publicacao?.requisitos ?? form.pubRequisitos,
      extraBriefing: { ...form.extraBriefing, ...extraOnly(b) }
    })
  }

  const compatTemplates = TEMPLATES_EVENTO.filter((t) => t.event_type === form.tipo)
  const templates = compatTemplates.length > 0 ? compatTemplates : TEMPLATES_EVENTO

  const subsegOptions = subsegmentosPara(form.segmento)
  const allowedNow = allowedPiecesFor(form.canais)
  const pieceOptions = form.canais.length > 0 ? PECAS.filter((p) => allowedNow.has(p.id)) : PECAS

  const statusBase = hasResearch ? WORKFLOW_STATUSES : GENERIC_STATUSES
  const statusList = statusBase.includes(form.status) ? statusBase : [form.status, ...statusBase]

  const briefingCount =
    [form.segmento, form.tom, form.cta, form.periodo, form.profundidade, form.pubModo].filter(Boolean).length +
    form.subsegmentos.length + form.tiposPesquisa.length + form.personas.length + form.pubRequisitos.length

  const completeness = computeCompleteness([
    { key: "tipo", label: "Tipo", required: true, filled: Boolean(form.tipo) },
    { key: "marca", label: "Marca", required: true, filled: Boolean(form.brandSlug) },
    { key: "titulo", label: "Título", required: true, filled: form.title.trim().length >= 2 },
    { key: "data", label: "Data", required: true, filled: Boolean(form.date) },
    { key: "template", label: "Template", required: false, filled: Boolean(form.templateId) },
    { key: "briefing", label: "Briefing", required: false, filled: briefingCount > 0 },
    { key: "canais_pecas", label: "Canais/peças", required: false, filled: form.canais.length > 0 || form.pecas.length > 0 }
  ])

  // Resumo (etapa final): linhas do evento + briefing traduzido em rótulos.
  const dateLabel = form.date
    ? new Date(form.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "—"
  // Datas avançadas → rótulo pt-BR (dd/mm/aaaa) para o resumo.
  const fmtYmd = (d: string) =>
    d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : ""
  const eventRows: SummaryRow[] = [
    { label: "Tipo", values: [labelOf(TIPOS_EVENTO, form.tipo)] },
    { label: "Marca", values: [wizBrandName || "—"] },
    { label: "Data", values: [`${dateLabel} · ${form.startTime}–${form.endTime}`] },
    { label: "Execução", values: [form.execution_mode === "auto" ? `Automática · ${form.autoDate} às ${form.autoTime}` : "Manual"] },
    ...(hasResearch
      ? [{ label: "Aprovação da pesquisa", values: [form.requires_research_approval ? "Exigida antes da cocriação" : "Não exigida"] }]
      : []),
    ...(form.deliveryDate ? [{ label: "Entrega", values: [fmtYmd(form.deliveryDate)] }] : []),
    ...(form.reviewDate ? [{ label: "Revisão", values: [fmtYmd(form.reviewDate)] }] : []),
    ...(form.approvalDate ? [{ label: "Aprovação", values: [fmtYmd(form.approvalDate)] }] : []),
    ...(form.dueDate ? [{ label: "Prazo final", values: [fmtYmd(form.dueDate)] }] : []),
    ...(form.reminderDate
      ? [{ label: "Lembrete", values: [`${fmtYmd(form.reminderDate)}${form.reminderTime ? ` às ${form.reminderTime}` : ""}`] }]
      : []),
    ...(form.recurrence !== "none"
      ? [{ label: "Recorrência", values: [RECURRENCE_LABELS[form.recurrence] ?? form.recurrence] }]
      : [])
  ]
  const resumoRows = [...eventRows, ...briefingSummaryRows(buildBriefing(form) ?? {})]

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-line bg-white shadow-panel animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-sm font-bold text-ink">{form.id ? "Editar evento" : "Novo evento"}</p>
            <p className="text-xs text-muted">
              {wizBrandName ? `Marca: ${wizBrandName}` : "Selecione uma marca"} · Etapa {current + 1} de {steps.length}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink"><CloseIcon className="h-5 w-5" /></button>
        </div>

        {/* Indicador de passos */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line px-4 py-3 duofy-scroll">
          {steps.map((s, i) => {
            const on = i === current
            const done = i < current
            return (
              <button
                key={s}
                onClick={() => goTo(i)}
                className={`duofy-tap flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  on
                    ? "border-purple bg-purple-soft text-purple-deep"
                    : done
                      ? "border-green-300 bg-green-50 text-green-700"
                      : "border-line bg-white text-muted hover:border-purple/40"
                }`}
              >
                <span className={`grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold ${on ? "bg-purple text-white" : done ? "bg-green-600 text-white" : "bg-panel text-muted"}`}>
                  {i + 1}
                </span>
                {s}
              </button>
            )
          })}
        </div>

        {/* Conteúdo da etapa */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5 duofy-scroll">
          {stepName === "Tipo" && (
            <>
              <FieldGroup label="Tipo de evento" hint="define as etapas seguintes do wizard">
                <FilterCardGroup options={TIPOS_EVENTO} value={form.tipo} onChange={setTipo} columns={2} />
              </FieldGroup>
              {form.tipo === "research_content" && (
                <p className="rounded-lg border border-purple/20 bg-purple/5 p-2.5 text-xs text-purple">
                  Pipeline completo: o evento executa a <span className="font-semibold">pesquisa</span>, para na
                  aprovação humana e depois libera a <span className="font-semibold">cocriação</span>.
                </p>
              )}
            </>
          )}

          {stepName === "Marca e template" && (
            <>
              <FieldSelect
                label="Marca"
                value={form.brandSlug}
                onChange={changeBrand}
                options={brands.map((b) => ({ value: b.slug, label: b.name }))}
              />
              <FieldGroup
                label="Template (opcional)"
                hint={compatTemplates.length > 0 ? "um clique pré-preenche briefing, canais e peças" : "nenhum template específico deste tipo — mostrando todos"}
              >
                <TemplatePicker templates={templates} activeId={form.templateId} onPick={applyTemplate} />
              </FieldGroup>
            </>
          )}

          {stepName === "Briefing" && (
            <>
              <TextField
                label={hasResearch ? "Tema da pesquisa" : "Título"}
                hint="obrigatório"
                value={form.title}
                onChange={(v) => update({ title: v })}
                placeholder={hasResearch ? "Ex.: Tendências de gestão de estoque de combustível" : hasContent ? "Ex.: Carrossel sobre gestão de estoque" : "Ex.: Reunião de pauta mensal"}
              />
              {hasAgent && (
                <TextField
                  label="Objetivo"
                  value={form.objective}
                  onChange={(v) => update({ objective: v })}
                  placeholder={hasResearch ? "O que essa pesquisa precisa responder?" : "O que esse conteúdo precisa alcançar?"}
                />
              )}

              {hasResearch && (
                <>
                  <FieldGroup label="Segmento">
                    <ChoiceChips options={SEGMENTOS} value={form.segmento} onChange={changeSegmento} />
                  </FieldGroup>
                  {subsegOptions.length > 0 && (
                    <FieldGroup label="Subsegmentos">
                      <MultiSelectChips options={subsegOptions} value={form.subsegmentos} onChange={(v) => update({ subsegmentos: v })} size="sm" />
                    </FieldGroup>
                  )}
                  <FieldGroup label="Tipo de pesquisa">
                    <MultiSelectChips options={TIPOS_PESQUISA} value={form.tiposPesquisa} onChange={(v) => update({ tiposPesquisa: v })} size="sm" />
                  </FieldGroup>
                  <FieldGroup label="Profundidade">
                    <FilterCardGroup options={PROFUNDIDADES} value={form.profundidade} onChange={(v) => update({ profundidade: v })} columns={3} />
                  </FieldGroup>
                  <FieldGroup label="Período analisado">
                    <ChoiceChips options={PERIODOS} value={form.periodo} onChange={(v) => update({ periodo: v })} size="sm" />
                  </FieldGroup>
                </>
              )}

              {hasContent && (
                <>
                  <FieldGroup label="Canais" hint="peças coerentes são pré-selecionadas">
                    <MultiSelectChips options={CANAIS} value={form.canais} onChange={onChannelsChange} />
                  </FieldGroup>
                  <FieldGroup label="Formatos">
                    <MultiSelectChips options={FORMATOS} value={form.formatos} onChange={(v) => update({ formatos: v })} size="sm" />
                  </FieldGroup>
                  <FieldGroup label="Tom" hint="DeathCare pede tom sensível; Postos, objetivo e operacional">
                    <ChoiceChips options={TONS} value={form.tom} onChange={(v) => update({ tom: v })} size="sm" />
                  </FieldGroup>
                  <FieldGroup label="CTA">
                    <ChoiceChips options={CTAS} value={form.cta} onChange={(v) => update({ cta: v })} size="sm" />
                  </FieldGroup>
                </>
              )}

              {hasAgent && (
                <CollapsibleSection title="Personas" subtitle="quem sente a dor" count={form.personas.length}>
                  <MultiSelectChips options={PERSONAS} value={form.personas} onChange={(v) => update({ personas: v })} size="sm" />
                </CollapsibleSection>
              )}

              {isPublication && (
                <>
                  <FieldGroup label="Modo de publicação">
                    <ChoiceChips options={PUBLICACAO_MODOS} value={form.pubModo} onChange={(v) => update({ pubModo: v })} />
                  </FieldGroup>
                  <FieldGroup label="Requisitos">
                    <MultiSelectChips options={PUBLICACAO_REQUISITOS} value={form.pubRequisitos} onChange={(v) => update({ pubRequisitos: v })} size="sm" />
                  </FieldGroup>
                </>
              )}

              <TextAreaField
                label="Observações / descrição"
                value={form.description}
                onChange={(v) => update({ description: v })}
                rows={3}
              />
            </>
          )}

          {stepName === "Datas e automação" && (
            <>
              <Field label="Data">
                <input type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Início"><input type="time" value={form.startTime} onChange={(e) => update({ startTime: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
                <Field label="Fim"><input type="time" value={form.endTime} onChange={(e) => update({ endTime: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
              </div>
              <Field label="Status">
                <select value={form.status} onChange={(e) => update({ status: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                  {statusList.map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}
                </select>
              </Field>

              <div className="rounded-xl border border-line bg-panel/40 p-3">
                <p className="mb-2 text-xs font-semibold text-ink">Execução</p>
                <div className="flex gap-2">
                  {(["manual", "auto"] as const).map((m) => (
                    <button key={m} onClick={() => update({ execution_mode: m })} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${form.execution_mode === m ? "border-purple bg-purple/5 text-purple" : "border-line text-muted hover:border-purple/40"}`}>
                      {m === "manual" ? "Manual" : "Automática"}
                    </button>
                  ))}
                </div>
                {form.execution_mode === "auto" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Field label="Executar em (data)"><input type="date" value={form.autoDate} onChange={(e) => update({ autoDate: e.target.value })} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
                    <Field label="Hora"><input type="time" value={form.autoTime} onChange={(e) => update({ autoTime: e.target.value })} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
                  </div>
                )}
              </div>

              <CollapsibleSection title="Datas avançadas (opcional)" subtitle="ciclo editorial: entrega, revisão, aprovação, prazo e lembrete">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Entrega"><input type="date" value={form.deliveryDate} onChange={(e) => update({ deliveryDate: e.target.value })} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
                  <Field label="Revisão"><input type="date" value={form.reviewDate} onChange={(e) => update({ reviewDate: e.target.value })} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
                  <Field label="Aprovação"><input type="date" value={form.approvalDate} onChange={(e) => update({ approvalDate: e.target.value })} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
                  <Field label="Prazo final"><input type="date" value={form.dueDate} onChange={(e) => update({ dueDate: e.target.value })} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Lembrete (data)"><input type="date" value={form.reminderDate} onChange={(e) => update({ reminderDate: e.target.value })} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
                  <Field label="Lembrete (hora)"><input type="time" value={form.reminderTime} onChange={(e) => update({ reminderTime: e.target.value })} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
                </div>
                <Field label="Recorrência">
                  <select value={form.recurrence} onChange={(e) => update({ recurrence: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                    {RECURRENCE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
              </CollapsibleSection>
            </>
          )}

          {stepName === "Peças e aprovação" && (
            <>
              <FieldGroup
                label="Peças esperadas"
                hint={form.canais.length > 0 ? "condicionais aos canais selecionados" : "selecione canais no briefing para filtrar"}
              >
                <MultiSelectChips options={pieceOptions} value={form.pecas} onChange={(v) => update({ pecas: v })} size="sm" />
              </FieldGroup>

              {hasResearch && (
                <label className="flex items-center gap-2 rounded-xl border border-line bg-panel/40 p-3 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={form.requires_research_approval}
                    onChange={(e) => update({ requires_research_approval: e.target.checked })}
                    className="h-4 w-4 rounded border-line accent-purple"
                  />
                  Exigir aprovação da pesquisa antes da cocriação
                </label>
              )}

              <CollapsibleSection title="Dependências" subtitle="informativo — não altera a execução" count={form.dependencias.length}>
                <MultiSelectChips options={DEPENDENCIAS} value={form.dependencias} onChange={(v) => update({ dependencias: v })} size="sm" />
                <p className="text-[11px] text-muted">
                  Anotação visual do fluxo desejado; o gate real é a aprovação da pesquisa acima.
                </p>
              </CollapsibleSection>
            </>
          )}

          {stepName === "Resumo" && (
            <>
              <BriefingSummary rows={resumoRows} title="Resumo do evento" emptyHint="Preencha as etapas anteriores." />
              {hasResearch && !form.id && (
                <p className="rounded-lg border border-purple/20 bg-purple/5 p-2.5 text-xs text-purple">
                  Após criar, abra o evento para <span className="font-semibold">Executar pesquisa</span>. A pesquisa
                  para em “aguardando aprovação” antes de liberar a cocriação.
                </p>
              )}
            </>
          )}
        </div>

        {/* Rodapé: completude + navegação */}
        <div className="space-y-3 border-t border-line p-5">
          <BriefingCompleteness completeness={completeness} />
          {(stepError ?? formError) && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{stepError ?? formError}</div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setStepError(null); setStep(Math.max(0, current - 1)) }}
              disabled={current === 0}
              className="duofy-tap rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple disabled:opacity-40"
            >
              Voltar
            </button>
            {current < steps.length - 1 ? (
              <button onClick={() => goTo(current + 1)} className="duofy-tap flex-1 rounded-xl bg-purple py-2.5 text-sm font-semibold text-white hover:bg-purple-deep">
                Avançar
              </button>
            ) : (
              <button onClick={onSave} disabled={saving} className="duofy-tap flex-1 rounded-xl bg-purple py-2.5 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
                {saving ? "Salvando…" : form.id ? "Salvar alterações" : "Criar evento"}
              </button>
            )}
            <button onClick={onClose} className="duofy-tap rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-white p-0.5">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${value === v ? "bg-purple text-white" : "text-muted hover:text-ink"}`}>{label}</button>
      ))}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-purple ${value ? "border-purple/40 text-purple" : "border-line text-muted"}`}>
      <option value="">{label}: todos</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  )
}
