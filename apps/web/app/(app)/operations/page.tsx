"use client"

import Link from "next/link"
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Markdown } from "@/components/markdown"
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  FileIcon,
  GridIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  ZapIcon
} from "@/components/icons"
import {
  Badge,
  GhostButton,
  PageHeader,
  SectionHeader,
  StatCard,
  type Tone
} from "@/components/ui"
import {
  apiFetch,
  type AuditEvent,
  type Briefing,
  type CalendarEvent,
  type ContentOutput,
  type OperationsSummary,
  type ResearchModel,
  type ResearchReport,
  type ResearchTheme
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"
import { isResearchOutput, resultHref } from "@/lib/output-kind"

import { BriefingPanel } from "./BriefingPanel"
import { ThemePicker } from "./ThemePicker"

type ChatMsg = { id: string; role: "user" | "assistant"; text: string; time: string; pending?: boolean; error?: boolean }

const IN_PRODUCTION = ["draft", "review", "needs_adjustment"]

const STATUS_LABEL: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "amber" },
  review: { label: "Em revisão", tone: "blue" },
  approved: { label: "Aprovado", tone: "green" },
  needs_adjustment: { label: "Ajustes", tone: "amber" },
  rejected: { label: "Rejeitado", tone: "slate" },
  archived: { label: "Arquivado", tone: "slate" }
}

// Pipeline derivado do current_step dos eventos do calendário.
const PIPELINE: { key: string; label: string }[] = [
  { key: "briefing", label: "Briefing" },
  { key: "research", label: "Pesquisa" },
  { key: "research_approval", label: "Revisão de Pesquisa" },
  { key: "cocreation", label: "Cocriação" },
  { key: "review", label: "Revisão de Conteúdo" },
  { key: "publish", label: "Publicação" }
]

function now() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export default function OperationsPage() {
  const { selected: brand } = useBrand()

  // ── Orquestrador (chat) ──
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: "intro", role: "assistant", text: "Olá! Sou o Orquestrador. Posso montar briefings e disparar pesquisas — e te aponto os atalhos para Pesquisa, Cocriação, Revisão e Calendário.", time: "" }
  ])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [activeBriefing, setActiveBriefing] = useState<Briefing | null>(null)
  const [researchModels, setResearchModels] = useState<ResearchModel[]>([])
  const [researchThemes, setResearchThemes] = useState<ResearchTheme[]>([])
  const [themePickerOpen, setThemePickerOpen] = useState(false)

  // ── Dados do dashboard ──
  const [reports, setReports] = useState<ResearchReport[]>([])
  const [content, setContent] = useState<ContentOutput[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [summary, setSummary] = useState<OperationsSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    setLoading(true)
    const bq = brand ? `&brand_slug=${encodeURIComponent(brand)}` : ""
    const bq1 = brand ? `?brand_slug=${encodeURIComponent(brand)}` : ""
    try {
      const [r, c, ev, au, sm, rm, rth] = await Promise.all([
        apiFetch<ResearchReport[]>(`/api/research/reports?limit=60${bq}`, token).catch(() => []),
        apiFetch<ContentOutput[]>(`/api/content/outputs?limit=60${bq}`, token).catch(() => []),
        apiFetch<CalendarEvent[]>(`/api/calendar?limit=200${bq}`, token).catch(() => []),
        apiFetch<AuditEvent[]>(`/api/operations/audit-events?limit=12${bq}`, token).catch(() => []),
        apiFetch<OperationsSummary>(`/api/operations/summary${bq1}`, token).catch(() => null),
        apiFetch<ResearchModel[]>("/api/research-models", token).catch(() => []),
        apiFetch<ResearchTheme[]>(`/api/research-themes?limit=500${bq}`, token).catch(() => [])
      ])
      setReports(r)
      setContent(c.filter((x) => !isResearchOutput(x)))
      setEvents(ev)
      setAudit(au)
      setSummary(sm)
      setResearchModels(rm)
      setResearchThemes(rth)
    } catch {
      /* mantém estados vazios */
    }
    setLoading(false)
  }, [brand])

  useEffect(() => { void loadData() }, [loadData])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])
  useEffect(() => {
    setMessages((m) => m.map((x) => (x.id === "intro" && !x.time ? { ...x, time: now() } : x)))
  }, [])

  // ── Derivados (cards, pipeline, pendências, saídas, alertas, sugestões) ──
  const activeEvents = useMemo(() => events.filter((e) => e.status !== "cancelled"), [events])
  const cards = useMemo(() => {
    const pesquisasAtivas = reports.filter((r) => IN_PRODUCTION.includes(r.status)).length
    const conteudosProducao = content.filter((c) => IN_PRODUCTION.includes(c.status)).length
    const aprovacoesPendentes = [...reports, ...content].filter((x) => x.status === "review").length
    const pubConcluidas = events.filter((e) => e.published_at).length
    const pubAgendadas = activeEvents.filter(
      (e) => !e.published_at && (e.publish_status === "scheduled" || (e.execution_mode === "auto" && !!e.auto_execute_at))
    ).length
    return { pesquisasAtivas, conteudosProducao, aprovacoesPendentes, pubAgendadas, pubConcluidas }
  }, [reports, content, events, activeEvents])

  const pending = useMemo(() => {
    const items: { id: string; label: string; hint: string; href: string; tone: Tone }[] = []
    reports.filter((r) => r.status === "review").forEach((r) =>
      items.push({ id: `r${r.id}`, label: r.title, hint: "Pesquisa aguardando aprovação", href: "/research", tone: "blue" }))
    content.filter((c) => c.status === "review").forEach((c) =>
      items.push({ id: `c${c.id}`, label: c.title, hint: `Conteúdo em revisão · ${c.channel}`, href: "/approvals", tone: "indigo" }))
    activeEvents.filter((e) => e.current_step === "research_approval").forEach((e) =>
      items.push({ id: `e${e.id}`, label: e.title, hint: "Evento: aprove a pesquisa para liberar a cocriação", href: "/calendar", tone: "purple" }))
    return items.slice(0, 6)
  }, [reports, content, activeEvents])

  const recentOutputs = useMemo(() => {
    return [...reports, ...content]
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
      .slice(0, 6)
  }, [reports, content])

  const alerts = useMemo(() => {
    const list: string[] = []
    const errs = summary?.recent_errors ?? []
    errs.slice(0, 4).forEach((e) => {
      const rec = e as Record<string, unknown>
      const msg = rec.summary ?? rec.error ?? rec.message ?? rec.action ?? JSON.stringify(rec)
      list.push(String(msg))
    })
    return list
  }, [summary])

  const suggestions = useMemo(() => {
    const s: string[] = []
    if (cards.aprovacoesPendentes) s.push(`${cards.aprovacoesPendentes} item(ns) aguardando aprovação — abra a Revisão.`)
    const semBriefing = activeEvents.filter((e) => e.current_step === "briefing").length
    if (semBriefing) s.push(`${semBriefing} evento(s) ainda sem briefing completo no Calendário.`)
    const ajustes = [...reports, ...content].filter((x) => x.status === "needs_adjustment").length
    if (ajustes) s.push(`${ajustes} item(ns) com ajustes solicitados — retome a produção.`)
    if (summary?.failed_model_calls) s.push(`${summary.failed_model_calls} chamada(s) de modelo falharam — verifique provedores em Administração.`)
    if (cards.pubAgendadas) s.push(`${cards.pubAgendadas} publicação(ões) agendada(s) — acompanhe no Calendário.`)
    if (!s.length) s.push("Tudo fluindo. Use o Orquestrador para iniciar uma pesquisa ou cocriação.")
    return s
  }, [cards, activeEvents, reports, content, summary])

  // ── Orquestrador: ações ──
  async function sendMessage(prompt?: string) {
    const text = (prompt ?? input).trim()
    if (!text || sending) return
    const token = getTokenFromCookie()
    if (!token) return
    const u: ChatMsg = { id: `u${Date.now()}`, role: "user", text, time: now() }
    const p: ChatMsg = { id: `p${Date.now()}`, role: "assistant", text: "Preparando briefing…", time: now(), pending: true }
    setMessages((m) => [...m, u, p])
    setInput("")
    setSending(true)
    try {
      const briefing = await apiFetch<Briefing>("/api/orchestrator/plan", token, {
        method: "POST",
        body: JSON.stringify({ prompt: text, brand_slug: brand || undefined })
      })
      if (briefing.tipo === "conversa") {
        setMessages((m) => m.map((x) => x.id === p.id ? { ...x, text: briefing.direct_answer || "(sem resposta)", time: now(), pending: false } : x))
      } else {
        setMessages((m) => m.map((x) => x.id === p.id ? { ...x, text: `Preparei um briefing de ${briefing.tipo}. Revise ao lado para eu executar.`, time: now(), pending: false } : x))
        setActiveBriefing(briefing)
      }
    } catch (e: unknown) {
      setMessages((m) => m.map((x) => x.id === p.id ? { ...x, text: e instanceof Error ? e.message : "Erro.", time: now(), pending: false, error: true } : x))
    }
    setSending(false)
  }

  async function pickResearchTheme(theme: ResearchTheme) {
    setThemePickerOpen(false)
    const token = getTokenFromCookie()
    if (!token) return
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", text: `Pesquisar: ${theme.title}`, time: now() }])
    try {
      const briefing = await apiFetch<Briefing>("/api/orchestrator/plan-from-theme", token, {
        method: "POST",
        body: JSON.stringify({ research_theme_id: theme.id, brand_slug: brand || undefined })
      })
      setActiveBriefing(briefing)
    } catch (e: unknown) {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: "assistant", text: e instanceof Error ? e.message : "Erro.", time: now(), error: true }])
    }
  }

  async function openNewResearch() {
    const token = getTokenFromCookie()
    if (!token) return
    try {
      const briefing = await apiFetch<Briefing>("/api/orchestrator/plan-research", token, {
        method: "POST",
        body: JSON.stringify({ brand_slug: brand || undefined })
      })
      setActiveBriefing(briefing)
    } catch (e: unknown) {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: "assistant", text: e instanceof Error ? e.message : "Erro ao abrir a pesquisa.", time: now(), error: true }])
    }
  }

  function onBriefingApproved(answer: string) {
    setMessages((m) => [...m, { id: `a${Date.now()}`, role: "assistant", text: answer, time: now() }])
    setActiveBriefing(null)
    void loadData()
  }

  const QUICK_ACTIONS = [
    { href: "/calendar", label: "Criar evento", icon: CalendarIcon },
    { href: "/research", label: "Abrir pesquisa", icon: SearchIcon },
    { href: "/content", label: "Abrir cocriação", icon: SparklesIcon },
    { href: "/approvals", label: "Ver revisão", icon: ShieldCheckIcon }
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de Operações"
        subtitle="Acompanhe o que está acontecendo e acione os atalhos — a produção acontece nas páginas especializadas."
        icon={<GridIcon className="h-5 w-5" />}
        right={<GhostButton onClick={() => void loadData()}>Atualizar</GhostButton>}
      />

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard icon={<SearchIcon className="h-5 w-5" />} iconTone="purple" label="Pesquisas ativas" value={cards.pesquisasAtivas} />
        <StatCard icon={<FileIcon className="h-5 w-5" />} iconTone="blue" label="Conteúdos em produção" value={cards.conteudosProducao} />
        <StatCard icon={<ShieldCheckIcon className="h-5 w-5" />} iconTone="amber" label="Aprovações pendentes" value={cards.aprovacoesPendentes} />
        <StatCard icon={<ClockIcon className="h-5 w-5" />} iconTone="indigo" label="Publicações agendadas" value={cards.pubAgendadas} />
        <StatCard icon={<CheckCircleIcon className="h-5 w-5" />} iconTone="green" label="Publicações concluídas" value={cards.pubConcluidas} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Coluna principal */}
        <div className="space-y-6">
          {/* Pipeline */}
          <section className="duofy-card rounded-2xl p-5">
            <SectionHeader title="Pipeline operacional" subtitle="Eventos do calendário por etapa" />
            <div className="mt-4 flex items-stretch gap-1 overflow-x-auto duofy-scroll pb-1">
              {PIPELINE.map((s, i) => {
                const count = activeEvents.filter((e) => e.current_step === s.key).length
                return (
                  <Fragment key={s.key}>
                    <div className="min-w-[128px] flex-1 rounded-xl border border-line bg-panel/40 p-3 text-center">
                      <p className="text-2xl font-extrabold leading-none text-ink">{count}</p>
                      <p className="mt-1.5 text-[11px] font-semibold leading-tight text-muted">{s.label}</p>
                    </div>
                    {i < PIPELINE.length - 1 && (
                      <div className="grid shrink-0 place-items-center px-0.5 text-muted">
                        <ChevronRightIcon className="h-4 w-4" />
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
          </section>

          {/* Pendências prioritárias */}
          <section className="duofy-card rounded-2xl p-5">
            <SectionHeader title="Pendências prioritárias" subtitle="Itens que precisam de uma ação sua" />
            <div className="mt-3 space-y-2">
              {loading && <p className="text-sm text-muted">Carregando…</p>}
              {!loading && pending.length === 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-6 text-sm text-muted">
                  <CheckCircleIcon className="h-5 w-5 text-green" /> Nada pendente. Tudo em dia.
                </div>
              )}
              {pending.map((p) => (
                <Link key={p.id} href={p.href} className="group flex items-center gap-3 rounded-xl border border-line bg-white p-3 hover:border-purple/40">
                  <Badge tone={p.tone}>{p.hint.split(" ")[0]}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{p.label}</p>
                    <p className="truncate text-xs text-muted">{p.hint}</p>
                  </div>
                  <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted group-hover:text-purple" />
                </Link>
              ))}
            </div>
          </section>

          {/* Saídas recentes com prévias */}
          <section className="duofy-card rounded-2xl p-5">
            <SectionHeader title="Saídas recentes" subtitle="Últimas pesquisas e conteúdos" />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {!loading && recentOutputs.length === 0 && (
                <p className="text-sm text-muted">Nenhuma saída ainda.</p>
              )}
              {recentOutputs.map((o) => {
                const research = isResearchOutput(o)
                const st = STATUS_LABEL[o.status] ?? { label: o.status, tone: "slate" as Tone }
                return (
                  <Link key={`${research ? "r" : "c"}${o.id}`} href={resultHref(o)} className="duofy-card-hover flex flex-col rounded-xl border border-line bg-white p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <Badge tone={research ? "purple" : "blue"}>{research ? "Pesquisa" : "Conteúdo"}</Badge>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold text-ink">{o.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{o.briefing || o.current_content?.slice(0, 120) || "—"}</p>
                    <p className="mt-2 text-[11px] text-muted">{o.channel} · atualizado {fmtDate(o.updated_at)}</p>
                  </Link>
                )
              })}
            </div>
          </section>

          {/* Alertas + Sugestões */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <section className="duofy-card rounded-2xl p-5">
              <SectionHeader title="Alertas operacionais" subtitle="Erros recentes de execução" />
              <div className="mt-3 space-y-2">
                {alerts.length === 0 && (
                  <div className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-5 text-sm text-muted">
                    <CheckCircleIcon className="h-5 w-5 text-green" /> Sem alertas.
                  </div>
                )}
                {alerts.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl border border-red/30 bg-red/5 p-3 text-xs text-ink/90">
                    <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-red" />
                    <span className="line-clamp-3">{a}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="duofy-card rounded-2xl p-5">
              <SectionHeader title="Sugestões" subtitle="A partir do estado operacional" />
              <ul className="mt-3 space-y-2">
                {suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-xl border border-line bg-panel/40 p-3 text-xs text-ink/90">
                    <ZapIcon className="mt-0.5 h-4 w-4 shrink-0 text-purple" /> {s}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        {/* Coluna lateral: Orquestrador + Atividades recentes */}
        <div className="space-y-6">
          <section className="duofy-card flex flex-col rounded-2xl p-5" style={{ minHeight: 420 }}>
            <div className="mb-3 flex items-center gap-2">
              <SparklesIcon className="h-5 w-5 text-purple" />
              <h2 className="text-base font-bold tracking-[-0.02em] text-ink">Orquestrador</h2>
              <Badge tone="green">conectado</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((a) => {
                const Icon = a.icon
                return (
                  <Link key={a.href} href={a.href} className="duofy-tap inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-ink hover:border-purple/40 hover:text-purple">
                    <Icon className="h-4 w-4 text-purple" /> {a.label}
                  </Link>
                )
              })}
            </div>

            <div className="mt-4 flex-1 space-y-3 overflow-y-auto duofy-scroll pr-1" style={{ maxHeight: 360 }}>
              {messages.map((m) => (
                <div key={m.id} className={`max-w-[92%] ${m.role === "user" ? "ml-auto" : ""}`}>
                  <div className={`rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-purple text-white" : m.error ? "bg-red-50 text-red-700" : "bg-purple-soft/70 text-ink"} ${m.pending ? "animate-pulse" : ""}`}>
                    {m.role === "assistant" && !m.pending && !m.error ? <Markdown content={m.text} className="text-ink/90" /> : <span className="whitespace-pre-wrap">{m.text}</span>}
                  </div>
                  <p className={`mt-1 text-[11px] text-muted ${m.role === "user" ? "text-right" : ""}`}>{m.time}</p>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="mt-3">
              <GhostButton className="text-xs" onClick={openNewResearch}><PlusIcon className="h-4 w-4" /> Nova pesquisa (briefing)</GhostButton>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
              <div className="relative">
                <button onClick={() => setThemePickerOpen((v) => !v)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-purple/40 hover:text-purple" aria-label="Temas de pesquisa">
                  <SearchIcon className="h-4 w-4" />
                </button>
                {themePickerOpen && <ThemePicker themes={researchThemes} onPick={pickResearchTheme} onClose={() => setThemePickerOpen(false)} />}
              </div>
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} disabled={sending} className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted disabled:opacity-60" placeholder="Pergunte ao Orquestrador..." />
              <button onClick={() => sendMessage()} disabled={sending || !input.trim()} className="grid h-8 w-8 place-items-center rounded-lg bg-purple text-white disabled:opacity-50" aria-label="Enviar">
                {sending ? <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> : <SendIcon className="h-4 w-4" />}
              </button>
            </div>
          </section>

          <section className="duofy-card rounded-2xl p-5">
            <SectionHeader title="Atividades recentes" subtitle="Trilha de auditoria" />
            <ul className="mt-3 space-y-2.5">
              {audit.length === 0 && <p className="text-sm text-muted">Sem atividades.</p>}
              {audit.map((e) => (
                <li key={e.id} className="border-b border-line/60 pb-2.5 last:border-0">
                  <p className="text-sm text-ink">{e.summary}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                    <ClockIcon className="h-3.5 w-3.5" /> {fmtDate(e.created_at)}
                    {e.brand_slug && <Badge tone="slate" className="ml-1">{e.brand_slug}</Badge>}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {activeBriefing && (
        <BriefingPanel
          key={activeBriefing.id}
          briefing={activeBriefing}
          models={researchModels}
          themes={researchThemes}
          token={getTokenFromCookie() ?? ""}
          onApproved={onBriefingApproved}
          onCancel={() => setActiveBriefing(null)}
        />
      )}
    </div>
  )
}
