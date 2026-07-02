"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge, GhostButton, StatCard } from "@/components/ui"
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  DownloadIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SparklesIcon,
  ZapIcon
} from "@/components/icons"
import { apiFetch, type CalendarEvent } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"
import { downloadFile } from "@/lib/download"

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

const STATUS_META: Record<string, { label: string; tone: "amber" | "blue" | "green" | "purple" | "red" | "slate"; dot: string }> = {
  planned: { label: "Planejado", tone: "slate", dot: "#94a3b8" },
  scheduled: { label: "Agendado", tone: "blue", dot: "#2563eb" },
  in_progress: { label: "Em andamento", tone: "amber", dot: "#f97316" },
  completed: { label: "Concluído", tone: "green", dot: "#16a34a" },
  cancelled: { label: "Cancelado", tone: "slate", dot: "#cbd5e1" },
  failed: { label: "Falhou", tone: "red", dot: "#ef4444" }
}

const EVENT_TYPES = ["content", "campaign", "research", "press", "meeting", "milestone", "other"]
const STATUSES = ["planned", "scheduled", "in_progress", "completed", "failed"]
// Calendário é módulo do usuário/Orquestrador; eventos são executados por estes agentes.
const AGENTS = ["", "content_agent", "research_agent", "press_agent"]

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` }
function hm(d: Date) { return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` }

type EventForm = {
  id?: number
  title: string
  description: string
  date: string
  startTime: string
  endTime: string
  channel: string
  format: string
  category: string
  event_type: string
  status: string
  assigned_agent_slug: string
}

function blankForm(date: string): EventForm {
  return { title: "", description: "", date, startTime: "09:00", endTime: "10:00", channel: "", format: "", category: "general", event_type: "content", status: "planned", assigned_agent_slug: "" }
}

function formFromEvent(e: CalendarEvent): EventForm {
  const start = new Date(e.start_at)
  const end = e.end_at ? new Date(e.end_at) : new Date(start.getTime() + 3600000)
  return {
    id: e.id,
    title: e.title,
    description: e.description ?? "",
    date: ymd(start),
    startTime: hm(start),
    endTime: hm(end),
    channel: e.channel ?? "",
    format: e.format ?? "",
    category: e.category ?? "general",
    event_type: e.event_type ?? "content",
    status: e.status,
    assigned_agent_slug: e.assigned_agent_slug ?? ""
  }
}

// Links de "adicionar ao calendário" (abrem Google/Outlook já preenchidos).
function gcalLink(e: CalendarEvent): string {
  const start = new Date(e.start_at)
  const end = e.end_at ? new Date(e.end_at) : new Date(start.getTime() + 3600000)
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${z(start)}/${z(end)}`, details: e.description ?? "" })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}
function outlookLink(e: CalendarEvent): string {
  const start = new Date(e.start_at)
  const end = e.end_at ? new Date(e.end_at) : new Date(start.getTime() + 3600000)
  const p = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: e.title, startdt: start.toISOString(), enddt: end.toISOString(), body: e.description ?? "" })
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`
}

export default function CalendarPage() {
  const { selected: brand } = useBrand()
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const [objective, setObjective] = useState("")
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)
  const [acting, setActing] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)

  // Form de criação/edição
  const [form, setForm] = useState<EventForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    setLoading(true)
    try {
      const qs = brand ? `?brand_slug=${brand}&limit=300` : "?limit=300"
      const data = await apiFetch<CalendarEvent[]>(`/api/calendar${qs}`, token)
      setEvents(data)
    } catch { setEvents([]) }
    setLoading(false)
  }, [brand])

  useEffect(() => { load() }, [load])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const key = e.start_at.slice(0, 10)
      const arr = map.get(key) ?? []
      arr.push(e)
      map.set(key, arr)
    }
    return map
  }, [events])

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

  const monthEvents = useMemo(
    () => events.filter((e) => { const d = new Date(e.start_at); return d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear() }),
    [events, cursor]
  )

  const stats = [
    { icon: <CalendarIcon className="h-5 w-5" />, tone: "purple" as const, label: "Eventos no mês", value: String(monthEvents.length) },
    { icon: <ClockIcon className="h-5 w-5" />, tone: "blue" as const, label: "Agendados", value: String(monthEvents.filter((e) => e.status === "scheduled").length) },
    { icon: <ZapIcon className="h-5 w-5" />, tone: "amber" as const, label: "Em andamento", value: String(monthEvents.filter((e) => e.status === "in_progress").length) },
    { icon: <SparklesIcon className="h-5 w-5" />, tone: "green" as const, label: "Concluídos", value: String(monthEvents.filter((e) => e.status === "completed").length) }
  ]

  function openCreate(day?: string) {
    const d = day ?? selectedDay ?? ymd(today)
    setForm(blankForm(d))
    setFormError(null)
  }
  function openEdit(e: CalendarEvent) {
    setForm(formFromEvent(e))
    setFormError(null)
  }

  async function saveForm() {
    if (!form) return
    if (form.title.trim().length < 2) { setFormError("Informe um título."); return }
    const token = getTokenFromCookie()
    if (!token || !brand) { setFormError("Selecione uma marca."); return }
    const startISO = new Date(`${form.date}T${form.startTime || "09:00"}:00`).toISOString()
    const endISO = form.endTime ? new Date(`${form.date}T${form.endTime}:00`).toISOString() : null
    const body = {
      brand_slug: brand,
      title: form.title.trim(),
      description: form.description,
      category: form.category || "general",
      event_type: form.event_type || "content",
      status: form.status,
      channel: form.channel || null,
      format: form.format || null,
      start_at: startISO,
      end_at: endISO,
      assigned_agent_slug: form.assigned_agent_slug || null
    }
    setSaving(true)
    setFormError(null)
    try {
      if (form.id) {
        await apiFetch(`/api/calendar/${form.id}`, token, { method: "PATCH", body: JSON.stringify(body) })
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

  async function runNow(id: number) {
    const token = getTokenFromCookie()
    if (!token) return
    setActing(id)
    try { await apiFetch(`/api/calendar/${id}/run-now`, token, { method: "POST", body: "{}" }); await load() } catch { /* ignore */ }
    setActing(null)
  }

  async function remove(id: number) {
    const token = getTokenFromCookie()
    if (!token) return
    if (!window.confirm("Cancelar este evento?")) return
    setActing(id)
    try { await apiFetch(`/api/calendar/${id}`, token, { method: "DELETE" }); await load() } catch { /* ignore */ }
    setActing(null)
  }

  async function exportIcs() {
    const token = getTokenFromCookie()
    if (!token) return
    setExporting(true)
    try {
      const qs = brand ? `?brand_slug=${brand}` : ""
      await downloadFile(`/api/calendar/export.ics${qs}`, token, "duofy-calendario.ics")
    } catch { /* ignore */ }
    setExporting(false)
  }

  const dayEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[30px] font-extrabold tracking-[-0.04em] text-ink">
            <CalendarIcon className="h-7 w-7 text-purple" /> Calendário Editorial
          </h1>
          <p className="mt-1 text-sm text-muted">Crie, edite e dispare conteúdos. Integra com Google Agenda e Outlook.{brand ? ` Marca: ${brand}.` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportIcs} disabled={exporting} className="duofy-tap flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple disabled:opacity-50">
            <DownloadIcon className="h-4 w-4" /> {exporting ? "Exportando…" : "Exportar .ics"}
          </button>
          <button onClick={() => openCreate()} className="duofy-tap flex h-10 items-center gap-2 rounded-xl bg-purple px-4 text-sm font-semibold text-white hover:bg-purple-deep">
            <PlusIcon className="h-4 w-4" /> Novo evento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => <StatCard key={s.label} icon={s.icon} iconTone={s.tone} label={s.label} value={s.value} />)}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Calendário */}
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
                        <span key={e.id} className="flex items-center gap-1 truncate rounded px-0.5 text-[10px] text-ink">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_META[e.status]?.dot ?? "#94a3b8" }} />
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

        {/* Painel lateral */}
        <div className="space-y-5">
          {/* Detalhe do dia */}
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
              <ul className="mt-3 space-y-3">
                {dayEvents.map((e) => {
                  const st = STATUS_META[e.status] ?? { label: e.status, tone: "slate" as const, dot: "#94a3b8" }
                  return (
                    <li key={e.id} className="rounded-xl border border-line p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-snug text-ink">{e.title}</p>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                      {e.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{e.description}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {e.channel && <Badge tone="slate">{e.channel}</Badge>}
                        {e.format && <Badge tone="purple">{e.format}</Badge>}
                        <span className="text-[11px] text-muted">{new Date(e.start_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button onClick={() => openEdit(e)} className="duofy-tap flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-purple/40 hover:text-purple">
                          <PencilIcon className="h-3.5 w-3.5" /> Editar
                        </button>
                        {e.assigned_agent_slug && (
                          <button onClick={() => runNow(e.id)} disabled={acting === e.id} className="duofy-tap flex items-center gap-1 rounded-lg bg-purple px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                            <ZapIcon className="h-3.5 w-3.5" /> {acting === e.id ? "..." : "Executar"}
                          </button>
                        )}
                        <a href={gcalLink(e)} target="_blank" rel="noreferrer" className="duofy-tap flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:border-purple/40 hover:text-purple" title="Adicionar ao Google Agenda">
                          <ExternalLinkIcon className="h-3.5 w-3.5" /> Google
                        </a>
                        <a href={outlookLink(e)} target="_blank" rel="noreferrer" className="duofy-tap flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:border-purple/40 hover:text-purple" title="Adicionar ao Outlook">
                          <ExternalLinkIcon className="h-3.5 w-3.5" /> Outlook
                        </a>
                        <button onClick={() => remove(e.id)} disabled={acting === e.id} className="duofy-tap rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted hover:border-red/40 hover:text-red disabled:opacity-50">
                          Excluir
                        </button>
                      </div>
                      {e.last_error && <p className="mt-1 text-[11px] text-red">{e.last_error}</p>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Gerar com agente */}
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

          {/* Integração */}
          <section className="duofy-card rounded-2xl p-5">
            <h3 className="text-base font-bold text-ink">Integração de calendário</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              <span className="font-semibold text-ink">Exportar .ics</span> baixa todos os eventos. No <span className="font-semibold">Google Agenda</span>: Configurações → Importar. No <span className="font-semibold">Outlook</span>: Adicionar calendário → Carregar do arquivo. Por evento, use os botões <span className="font-semibold">Google</span>/<span className="font-semibold">Outlook</span> para adicionar direto.
            </p>
            <button onClick={exportIcs} disabled={exporting} className="duofy-tap mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple disabled:opacity-50">
              <DownloadIcon className="h-4 w-4" /> {exporting ? "Exportando…" : "Exportar .ics (Google/Outlook)"}
            </button>
          </section>
        </div>
      </div>

      {/* Slide-over de criação/edição */}
      {form && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={() => setForm(null)} aria-hidden="true" />
          <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto duofy-scroll border-l border-line bg-white shadow-panel animate-scale-in">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-bold text-ink">{form.id ? "Editar evento" : "Novo evento"}</p>
                <p className="text-xs text-muted">{brand ? `Marca: ${brand}` : "Selecione uma marca"}</p>
              </div>
              <button onClick={() => setForm(null)} className="text-muted hover:text-ink"><CloseIcon className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 space-y-3 p-5">
              <Field label="Título">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Carrossel sobre gestão de estoque" className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
              </Field>
              <Field label="Descrição / briefing">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
              </Field>
              <Field label="Data">
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Início"><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
                <Field label="Fim"><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Canal"><input value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} placeholder="Instagram" className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
                <Field label="Formato"><input value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} placeholder="Carrossel" className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo">
                  <select value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                    {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s]?.label ?? s}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Categoria"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
              <Field label="Agente para automação (opcional)">
                <select value={form.assigned_agent_slug} onChange={(e) => setForm({ ...form, assigned_agent_slug: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                  {AGENTS.map((a) => <option key={a} value={a}>{a || "Nenhum (evento manual)"}</option>)}
                </select>
              </Field>
              {formError && <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{formError}</div>}
            </div>

            <div className="flex items-center gap-2 border-t border-line p-5">
              <button onClick={saveForm} disabled={saving} className="duofy-tap flex-1 rounded-lg bg-purple py-2.5 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
                {saving ? "Salvando…" : form.id ? "Salvar alterações" : "Criar evento"}
              </button>
              {form.id && (
                <button onClick={() => { const id = form.id!; setForm(null); remove(id) }} className="duofy-tap rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-muted hover:border-red/40 hover:text-red">
                  Excluir
                </button>
              )}
              <button onClick={() => setForm(null)} className="duofy-tap rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
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
