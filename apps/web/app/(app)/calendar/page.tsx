"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { EmptyState, PageTitle, PurpleButton, SectionCard, SoftButton } from "@/components/page-primitives"
import { apiFetch, type Brand, type CalendarEvent, type ContentOutput, type ProviderCredential } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"

const eventTypes = ["content", "research", "press", "approval", "campaign", "internal_task"]
const statuses = ["planned", "scheduled", "completed", "failed", "cancelled"]
const agentSlugs = ["", "content_agent", "research_agent", "press_agent", "calendar_agent"]
const pressFormats = [
  { value: "pauta", label: "Pauta" },
  { value: "press_release", label: "Press release" },
  { value: "comunicado", label: "Comunicado" },
  { value: "editorial_angle", label: "Angulo editorial" },
  { value: "approach", label: "Abordagem" }
]

const statusLabels: Record<string, string> = {
  planned: "Planejado",
  scheduled: "Agendado",
  in_progress: "Executando",
  completed: "Concluido",
  failed: "Falhou",
  cancelled: "Cancelado"
}

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromLocalInputValue(value: string) {
  return new Date(value).toISOString()
}

function currentMonthRange() {
  const now = new Date()
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))
}

function isLlmProvider(provider: ProviderCredential) {
  return !["apify", "openai_embeddings"].includes(provider.provider)
}

export default function CalendarPage() {
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>([])
  const [providers, setProviders] = useState<ProviderCredential[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [view, setView] = useState<"month" | "week" | "list">("month")
  const [brand, setBrand] = useState("")
  const [provider, setProvider] = useState("openrouter")
  const [statusFilter, setStatusFilter] = useState("")
  const [form, setForm] = useState({
    title: "",
    description: "",
    event_type: "content",
    status: "planned",
    category: "general",
    channel: "LinkedIn",
    format: "Post LinkedIn",
    assigned_agent_slug: "",
    start_at: toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000))
  })
  const [calendarBriefing, setCalendarBriefing] = useState("")
  const [pressBriefing, setPressBriefing] = useState("")
  const [pressFormat, setPressFormat] = useState("pauta")
  const [latestOutput, setLatestOutput] = useState<ContentOutput | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const visibleEvents = useMemo(() => {
    const filtered = statusFilter
      ? events.filter((event) => event.status === statusFilter)
      : events
    if (view === "week") {
      const now = new Date()
      const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      return filtered.filter((event) => {
        const start = new Date(event.start_at)
        return start >= now && start <= weekEnd
      })
    }
    return filtered
  }, [events, statusFilter, view])

  async function loadEvents(token: string, nextSelectedId?: number) {
    const range = currentMonthRange()
    const params = new URLSearchParams({
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      limit: "200"
    })
    if (brand) params.set("brand_slug", brand)
    const items = await apiFetch<CalendarEvent[]>(`/api/calendar?${params.toString()}`, token)
    setEvents(items)
    const target = items.find((event) => event.id === nextSelectedId) ?? items[0] ?? null
    setSelected(target)
  }

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) {
      router.replace("/login")
      return
    }

    Promise.all([
      apiFetch<Brand[]>("/api/brands", token),
      apiFetch<ProviderCredential[]>("/api/admin/providers", token)
    ])
      .then(async ([brandList, providerList]) => {
        const llmProviders = providerList.filter(isLlmProvider)
        const firstBrand = brandList[0]?.slug ?? ""
        setBrands(brandList)
        setProviders(llmProviders)
        setBrand(firstBrand)
        setProvider(llmProviders.find((item) => item.is_enabled)?.provider ?? "openrouter")
        setIsLoading(false)
      })
      .catch(() => {
        setError("Nao foi possivel carregar o calendario.")
        setIsLoading(false)
      })
  }, [router])

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token || !brand) return
    loadEvents(token).catch(() => setError("Nao foi possivel carregar eventos."))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand])

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = getTokenFromCookie()
    if (!token) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const created = await apiFetch<CalendarEvent>("/api/calendar", token, {
        method: "POST",
        body: JSON.stringify({
          brand_slug: brand,
          category: form.category,
          title: form.title,
          description: form.description,
          event_type: form.event_type,
          status: form.status,
          channel: form.channel || null,
          format: form.format || null,
          start_at: fromLocalInputValue(form.start_at),
          assigned_agent_slug: form.assigned_agent_slug || null,
          execution_payload: { briefing: form.description || form.title }
        })
      })
      setNotice("Evento criado.")
      setForm((current) => ({ ...current, title: "", description: "" }))
      await loadEvents(token, created.id)
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsSaving(false)
    }
  }

  async function generateCalendar() {
    const token = getTokenFromCookie()
    if (!token) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    const range = currentMonthRange()
    try {
      const generated = await apiFetch<CalendarEvent[]>("/api/calendar/generate", token, {
        method: "POST",
        body: JSON.stringify({
          brand_slug: brand,
          category: "general",
          objective: calendarBriefing,
          period_start: range.start.toISOString(),
          period_end: range.end.toISOString(),
          channels: ["LinkedIn", "Instagram", "Assessoria"],
          provider
        })
      })
      setNotice(`${generated.length} evento(s) gerado(s).`)
      await loadEvents(token, generated[0]?.id)
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsSaving(false)
    }
  }

  async function runNow() {
    const token = getTokenFromCookie()
    if (!token || !selected) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const event = await apiFetch<CalendarEvent>(`/api/calendar/${selected.id}/run-now`, token, {
        method: "POST"
      })
      setNotice(event.status === "completed" ? "Evento executado." : "Execucao finalizada com erro.")
      await loadEvents(token, event.id)
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsSaving(false)
    }
  }

  async function cancelSelected() {
    const token = getTokenFromCookie()
    if (!token || !selected) return
    setIsSaving(true)
    setError(null)
    try {
      await apiFetch<CalendarEvent>(`/api/calendar/${selected.id}`, token, { method: "DELETE" })
      setNotice("Evento cancelado.")
      await loadEvents(token)
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsSaving(false)
    }
  }

  async function generatePress() {
    const token = getTokenFromCookie()
    if (!token) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const output = await apiFetch<ContentOutput>("/api/press/generate", token, {
        method: "POST",
        body: JSON.stringify({
          brand_slug: brand,
          category: selected?.category ?? "general",
          format: pressFormat,
          briefing: pressBriefing || selected?.description || selected?.title,
          event_id: selected?.id ?? null,
          provider,
          status: "draft"
        })
      })
      setLatestOutput(output)
      setNotice("Material de assessoria gerado.")
      if (selected) await loadEvents(token, selected.id)
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Calendário Editorial"
        subtitle="Planeje eventos, execute agentes agendados e gere materiais de assessoria com contexto real."
      />

      {error ? (
        <p className="rounded-2xl border border-red/20 bg-red/5 p-4 text-sm font-semibold text-red">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-2xl border border-green/20 bg-green/5 p-4 text-sm font-semibold text-green">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.45fr_0.85fr]">
        <div className="space-y-5">
          <SectionCard title="Novo evento">
            <form onSubmit={createEvent} className="space-y-3">
              <select
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
                className="duofy-focus w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
              >
                {brands.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Titulo do evento"
                className="duofy-focus w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
                required
              />
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Briefing ou descricao"
                className="duofy-focus min-h-24 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={form.event_type}
                  onChange={(event) => setForm((current) => ({ ...current, event_type: event.target.value }))}
                  className="duofy-focus rounded-xl border border-line bg-white px-3 py-3 text-sm"
                >
                  {eventTypes.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  className="duofy-focus rounded-xl border border-line bg-white px-3 py-3 text-sm"
                >
                  {statuses.map((item) => (
                    <option key={item} value={item}>
                      {statusLabels[item] ?? item}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={form.channel}
                  onChange={(event) => setForm((current) => ({ ...current, channel: event.target.value }))}
                  placeholder="Canal"
                  className="duofy-focus rounded-xl border border-line bg-white px-3 py-3 text-sm"
                />
                <input
                  value={form.format}
                  onChange={(event) => setForm((current) => ({ ...current, format: event.target.value }))}
                  placeholder="Formato"
                  className="duofy-focus rounded-xl border border-line bg-white px-3 py-3 text-sm"
                />
              </div>
              <input
                type="datetime-local"
                value={form.start_at}
                onChange={(event) => setForm((current) => ({ ...current, start_at: event.target.value }))}
                className="duofy-focus w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
              />
              <select
                value={form.assigned_agent_slug}
                onChange={(event) => setForm((current) => ({ ...current, assigned_agent_slug: event.target.value }))}
                className="duofy-focus w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
              >
                {agentSlugs.map((item) => (
                  <option key={item} value={item}>
                    {item || "Sem agente"}
                  </option>
                ))}
              </select>
              <PurpleButton disabled={isSaving || !brand || !form.title.trim()} className="w-full">
                {isSaving ? "Salvando..." : "Criar evento"}
              </PurpleButton>
            </form>
          </SectionCard>

          <SectionCard title="Gerar calendario">
            <textarea
              value={calendarBriefing}
              onChange={(event) => setCalendarBriefing(event.target.value)}
              placeholder="Ex.: planejar conteudos do mes sobre inadimplencia, retencao e atendimento."
              className="duofy-focus min-h-28 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
            />
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="duofy-focus mt-3 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
            >
              {providers.map((item) => (
                <option key={item.provider} value={item.provider}>
                  {item.display_name} {item.is_enabled ? "" : "(off)"}
                </option>
              ))}
            </select>
            <PurpleButton
              type="button"
              disabled={isSaving || calendarBriefing.trim().length < 10}
              onClick={generateCalendar}
              className="mt-3 w-full"
            >
              Gerar calendario
            </PurpleButton>
          </SectionCard>
        </div>

        <SectionCard
          title="Eventos"
          action={
            <div className="flex flex-wrap gap-2">
              {(["month", "week", "list"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setView(item)}
                  className={`rounded-xl px-3 py-2 text-xs font-bold ${
                    view === item ? "bg-purple text-white" : "border border-line bg-white text-muted"
                  }`}
                >
                  {item === "month" ? "Mes" : item === "week" ? "Semana" : "Lista"}
                </button>
              ))}
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="duofy-focus rounded-xl border border-line bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="">Todos</option>
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {statusLabels[item] ?? item}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {isLoading ? <EmptyState title="Carregando" description="Buscando eventos do calendario." /> : null}
          {!isLoading && visibleEvents.length === 0 ? (
            <EmptyState
              title="Sem eventos"
              description="Crie um evento manualmente ou gere um calendario com o agente."
            />
          ) : null}
          <div className={view === "month" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
            {visibleEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => setSelected(event)}
                className={`rounded-2xl border p-4 text-left transition ${
                  selected?.id === event.id ? "border-purple bg-purple-soft" : "border-line bg-white hover:border-purple/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <strong className="line-clamp-2 text-sm">{event.title}</strong>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-purple">
                    {statusLabels[event.status] ?? event.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">{formatDateTime(event.start_at)}</p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">
                  {event.description || event.event_type}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-muted">
                  <span className="rounded-full bg-slate-100 px-2 py-1">{event.event_type}</span>
                  {event.assigned_agent_slug ? (
                    <span className="rounded-full bg-purple-soft px-2 py-1 text-purple">
                      {event.assigned_agent_slug}
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </SectionCard>

        <div className="space-y-5">
          <SectionCard title="Detalhe do evento">
            {selected ? (
              <div className="space-y-3 text-sm leading-6 text-muted">
                <h3 className="text-xl font-extrabold tracking-[-0.04em] text-ink">{selected.title}</h3>
                <p>{selected.description || "Sem descricao."}</p>
                <p><strong className="text-ink">Quando:</strong> {formatDateTime(selected.start_at)}</p>
                <p><strong className="text-ink">Tipo:</strong> {selected.event_type}</p>
                <p><strong className="text-ink">Status:</strong> {statusLabels[selected.status] ?? selected.status}</p>
                <p><strong className="text-ink">Agente:</strong> {selected.assigned_agent_slug ?? "Nao definido"}</p>
                <p><strong className="text-ink">Output:</strong> {selected.output_id ?? "Nao gerado"}</p>
                {selected.last_error ? <p className="text-red">{selected.last_error}</p> : null}
                <div className="flex flex-wrap gap-2 pt-2">
                  <SoftButton
                    type="button"
                    disabled={isSaving || !selected.assigned_agent_slug}
                    onClick={runNow}
                  >
                    Executar agora
                  </SoftButton>
                  <SoftButton type="button" disabled={isSaving} onClick={cancelSelected}>
                    Cancelar
                  </SoftButton>
                </div>
              </div>
            ) : (
              <EmptyState title="Nenhum evento" description="Selecione um evento para ver detalhes." />
            )}
          </SectionCard>

          <SectionCard title="Assessoria">
            <select
              value={pressFormat}
              onChange={(event) => setPressFormat(event.target.value)}
              className="duofy-focus w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
            >
              {pressFormats.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <textarea
              value={pressBriefing}
              onChange={(event) => setPressBriefing(event.target.value)}
              placeholder="Briefing da pauta/release. Se vazio, usa o evento selecionado."
              className="duofy-focus mt-3 min-h-28 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
            />
            <PurpleButton
              type="button"
              disabled={isSaving || (!pressBriefing.trim() && !selected)}
              onClick={generatePress}
              className="mt-3 w-full"
            >
              Gerar assessoria
            </PurpleButton>
            {latestOutput ? (
              <div className="mt-4 rounded-2xl border border-line bg-white p-4 text-sm">
                <strong className="line-clamp-2">{latestOutput.title}</strong>
                <p className="mt-2 text-xs text-muted">
                  Output #{latestOutput.id} / {latestOutput.format} / {latestOutput.status}
                </p>
                <p className="mt-3 line-clamp-5 whitespace-pre-line text-xs leading-5 text-muted">
                  {latestOutput.current_content}
                </p>
              </div>
            ) : null}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
