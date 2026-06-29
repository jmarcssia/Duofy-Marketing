"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge, GhostButton, StatCard } from "@/components/ui"
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  RefreshIcon,
  SparklesIcon,
  ZapIcon
} from "@/components/icons"
import { apiFetch, type CalendarEvent } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"

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

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` }

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

  const load = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    setLoading(true)
    try {
      const qs = brand ? `?brand_slug=${brand}&limit=200` : "?limit=200"
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
        body: JSON.stringify({
          brand_slug: brand,
          objective,
          period_start: start.toISOString(),
          period_end: end.toISOString(),
          channels: ["Instagram", "LinkedIn", "Blog"]
        })
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
    try {
      await apiFetch(`/api/calendar/${id}/run-now`, token, { method: "POST", body: "{}" })
      await load()
    } catch { /* ignore */ }
    setActing(null)
  }

  async function remove(id: number) {
    const token = getTokenFromCookie()
    if (!token) return
    if (!window.confirm("Cancelar este evento?")) return
    setActing(id)
    try {
      await apiFetch(`/api/calendar/${id}`, token, { method: "DELETE" })
      await load()
    } catch { /* ignore */ }
    setActing(null)
  }

  const dayEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-[30px] font-extrabold tracking-[-0.04em] text-ink">
          <CalendarIcon className="h-7 w-7 text-purple" /> Calendário Editorial
        </h1>
        <p className="mt-1 text-sm text-muted">Planeje e dispare conteúdos. Eventos reais do agente de calendário.{brand ? ` Marca: ${brand}.` : ""}</p>
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
              <h2 className="min-w-[160px] text-center text-lg font-bold text-ink">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
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
              Array.from({ length: 35 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-line/40" />)
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
                    className={`flex h-20 flex-col rounded-lg border p-1.5 text-left transition ${
                      isSelected ? "border-purple ring-1 ring-purple/30" : "border-line hover:border-purple/40"
                    } ${cell.current ? "bg-white" : "bg-panel/50"}`}
                  >
                    <span className={`text-xs font-semibold ${isToday ? "grid h-5 w-5 place-items-center rounded-full bg-purple text-white" : cell.current ? "text-ink" : "text-muted"}`}>
                      {cell.date.getDate()}
                    </span>
                    <div className="mt-1 space-y-0.5 overflow-hidden">
                      {evs.slice(0, 2).map((e) => (
                        <span key={e.id} className="flex items-center gap-1 truncate text-[10px] text-ink">
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
          {/* Gerar com agente */}
          <section className="duofy-card rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <SparklesIcon className="h-5 w-5 text-purple" />
              <h3 className="text-base font-bold text-ink">Gerar calendário</h3>
            </div>
            <p className="mt-1 text-xs text-muted">O agente de calendário cria eventos para <span className="font-semibold text-ink">{MONTHS[cursor.getMonth()]}</span> com base no objetivo.</p>
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              placeholder="Ex: aumentar engajamento com conteúdo educativo sobre nossos produtos, 3x por semana."
              className="mt-3 w-full resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-purple"
            />
            <button
              onClick={generate}
              disabled={generating || !brand}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-purple py-2.5 text-sm font-semibold text-white transition hover:bg-purple-deep disabled:opacity-50"
            >
              {generating ? (
                <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Gerando…</>
              ) : (
                <><SparklesIcon className="h-4 w-4" /> Gerar com IA</>
              )}
            </button>
            {genMsg && <p className="mt-2 text-xs text-muted">{genMsg}</p>}
          </section>

          {/* Detalhe do dia */}
          <section className="duofy-card rounded-2xl p-5">
            <h3 className="text-base font-bold text-ink">
              {selectedDay ? `Eventos · ${new Date(selectedDay + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}` : "Selecione um dia"}
            </h3>
            {!selectedDay ? (
              <p className="mt-3 text-sm text-muted">Clique em um dia no calendário para ver e disparar eventos.</p>
            ) : dayEvents.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nenhum evento neste dia.</p>
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
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => runNow(e.id)}
                          disabled={acting === e.id}
                          className="flex items-center gap-1 rounded-lg bg-purple px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          <ZapIcon className="h-3.5 w-3.5" /> {acting === e.id ? "..." : "Executar agora"}
                        </button>
                        <button
                          onClick={() => remove(e.id)}
                          disabled={acting === e.id}
                          className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted hover:text-red disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </div>
                      {e.last_error && <p className="mt-1 text-[11px] text-red">{e.last_error}</p>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
