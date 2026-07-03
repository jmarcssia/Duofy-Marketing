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
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon
} from "@/components/icons"
import { apiFetch, type CalendarEvent } from "@/lib/api"
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

type EventForm = {
  id?: number
  title: string
  description: string
  objective: string
  date: string
  startTime: string
  endTime: string
  channel: string
  format: string
  category: string
  event_type: string
  status: string
  assigned_agent_slug: string
  execution_mode: string
  autoDate: string
  autoTime: string
  requires_research_approval: boolean
}

function blankForm(date: string): EventForm {
  return {
    title: "", description: "", objective: "", date, startTime: "09:00", endTime: "10:00",
    channel: "", format: "", category: "general", event_type: "research", status: "draft",
    assigned_agent_slug: "", execution_mode: "manual", autoDate: date, autoTime: "09:00",
    requires_research_approval: true
  }
}

function formFromEvent(e: CalendarEvent): EventForm {
  const start = new Date(e.start_at)
  const end = e.end_at ? new Date(e.end_at) : new Date(start.getTime() + 3600000)
  const auto = e.auto_execute_at ? new Date(e.auto_execute_at) : start
  return {
    id: e.id, title: e.title, description: e.description ?? "", objective: e.objective ?? "",
    date: ymd(start), startTime: hm(start), endTime: hm(end),
    channel: e.channel ?? "", format: e.format ?? "", category: e.category ?? "general",
    event_type: e.event_type ?? "content", status: e.status, assigned_agent_slug: e.assigned_agent_slug ?? "",
    execution_mode: e.execution_mode ?? "manual", autoDate: ymd(auto), autoTime: hm(auto),
    requires_research_approval: e.requires_research_approval ?? true
  }
}

export default function CalendarPage() {
  const { selected: brand } = useBrand()
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

  const [form, setForm] = useState<EventForm | null>(null)
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
    const autoISO = form.execution_mode === "auto" ? new Date(`${form.autoDate}T${form.autoTime || "09:00"}:00`).toISOString() : null
    const body = {
      brand_slug: brand,
      title: form.title.trim(),
      description: form.description,
      objective: form.objective,
      category: form.category || "general",
      event_type: form.event_type || "content",
      status: form.status,
      channel: form.channel || null,
      format: form.format || null,
      start_at: startISO,
      end_at: endISO,
      assigned_agent_slug: form.assigned_agent_slug || null,
      execution_mode: form.execution_mode,
      auto_execute_at: autoISO,
      requires_research_approval: form.requires_research_approval
    }
    setSaving(true)
    setFormError(null)
    try {
      if (form.id) {
        await apiFetch(`/api/calendar/${form.id}?brand_slug=${brand}`, token, { method: "PATCH", body: JSON.stringify(body) })
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
          <p className="mt-1 text-sm text-muted">Centro operacional por marca: pesquisa, conteúdo e entregas em um fluxo só.{brand ? ` Marca: ${brand}.` : ""}</p>
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
        <EventFormPanel
          form={form} setForm={setForm} brand={brand} saving={saving} formError={formError}
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

function EventFormPanel({ form, setForm, brand, saving, formError, onSave, onClose }: {
  form: EventForm; setForm: (f: EventForm) => void; brand: string; saving: boolean; formError: string | null; onSave: () => void; onClose: () => void
}) {
  const isResearch = form.event_type === "research"
  const statusOptions = isResearch ? WORKFLOW_STATUSES : GENERIC_STATUSES
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto duofy-scroll border-l border-line bg-white shadow-panel animate-scale-in">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-sm font-bold text-ink">{form.id ? "Editar evento" : "Novo evento"}</p>
            <p className="text-xs text-muted">{brand ? `Marca: ${brand}` : "Selecione uma marca"}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink"><CloseIcon className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-3 p-5">
          <Field label="Tipo de evento">
            <select value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value, status: e.target.value === "research" ? "draft" : "planned" })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none">
              {CREATE_EVENT_TYPES.map((t) => <option key={t} value={t}>{eventTypeLabel(t)}</option>)}
            </select>
          </Field>
          <Field label={isResearch ? "Tema da pesquisa" : "Título"}>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={isResearch ? "Ex: Tendências de gestão de estoque de combustível" : "Ex: Carrossel sobre gestão de estoque"} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
          </Field>
          {isResearch && (
            <Field label="Objetivo">
              <textarea value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} rows={2} placeholder="O que essa pesquisa precisa responder?" className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
            </Field>
          )}
          <Field label={isResearch ? "Briefing / contexto" : "Descrição / briefing"}>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
          </Field>
          <Field label="Data">
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início"><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
            <Field label="Fim"><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
          </div>
          {!isResearch && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Canal"><input value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} placeholder="Instagram" className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
              <Field label="Formato"><input value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} placeholder="Carrossel" className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
            </div>
          )}
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none">
              {statusOptions.map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}
            </select>
          </Field>

          <div className="rounded-xl border border-line bg-panel/40 p-3">
            <p className="mb-2 text-xs font-semibold text-ink">Execução</p>
            <div className="flex gap-2">
              {(["manual", "auto"] as const).map((m) => (
                <button key={m} onClick={() => setForm({ ...form, execution_mode: m })} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${form.execution_mode === m ? "border-purple bg-purple/5 text-purple" : "border-line text-muted hover:border-purple/40"}`}>
                  {m === "manual" ? "Manual" : "Automática"}
                </button>
              ))}
            </div>
            {form.execution_mode === "auto" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="Executar em (data)"><input type="date" value={form.autoDate} onChange={(e) => setForm({ ...form, autoDate: e.target.value })} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
                <Field label="Hora"><input type="time" value={form.autoTime} onChange={(e) => setForm({ ...form, autoTime: e.target.value })} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-purple focus:outline-none" /></Field>
              </div>
            )}
            {isResearch && (
              <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={form.requires_research_approval} onChange={(e) => setForm({ ...form, requires_research_approval: e.target.checked })} className="h-4 w-4 rounded border-line accent-purple" />
                Exigir aprovação da pesquisa antes de liberar a cocriação
              </label>
            )}
          </div>

          {isResearch && !form.id && (
            <p className="rounded-lg border border-purple/20 bg-purple/5 p-2.5 text-xs text-purple">
              Após criar, abra o evento para <span className="font-semibold">Executar pesquisa</span>. A pesquisa para em “aguardando aprovação” antes de liberar a cocriação.
            </p>
          )}
          {formError && <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{formError}</div>}
        </div>

        <div className="flex items-center gap-2 border-t border-line p-5">
          <button onClick={onSave} disabled={saving} className="duofy-tap flex-1 rounded-lg bg-purple py-2.5 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
            {saving ? "Salvando…" : form.id ? "Salvar alterações" : "Criar evento"}
          </button>
          <button onClick={onClose} className="duofy-tap rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface">Cancelar</button>
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
