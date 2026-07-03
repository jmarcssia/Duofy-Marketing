"use client"

import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/ui"
import {
  CloseIcon,
  ExternalLinkIcon,
  PencilIcon,
  RefreshIcon,
  ZapIcon
} from "@/components/icons"
import {
  executeCalendarResearch,
  getCalendarEventDetail,
  type CalendarEvent,
  type CalendarEventDetail,
  type CalendarStep
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"

import { eventTypeLabel, statusMeta, STEP_STYLE } from "./status"

const TABS = ["Visão geral", "Briefing", "Fluxo", "Resultados", "Automação", "Histórico"] as const
type Tab = (typeof TABS)[number]

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })
}

function isResearch(e: CalendarEvent): boolean {
  return e.event_type === "research" || e.assigned_agent_slug === "research_agent"
}

export function EventDetailPanel({
  eventId,
  brandSlug,
  onClose,
  onChanged,
  onEdit
}: {
  eventId: number
  brandSlug: string
  onClose: () => void
  onChanged: () => void
  onEdit: (e: CalendarEvent) => void
}) {
  const [detail, setDetail] = useState<CalendarEventDetail | null>(null)
  const [tab, setTab] = useState<Tab>("Visão geral")
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token || !brandSlug) return
    setLoading(true)
    try {
      setDetail(await getCalendarEventDetail(eventId, brandSlug, token))
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao carregar o evento.")
    }
    setLoading(false)
  }, [eventId, brandSlug])

  useEffect(() => {
    load()
  }, [load])

  async function runResearch() {
    const token = getTokenFromCookie()
    if (!token || !brandSlug) return
    setRunning(true)
    setError(null)
    try {
      const d = await executeCalendarResearch(eventId, brandSlug, token)
      setDetail(d)
      onChanged()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao executar a pesquisa.")
      await load() // reflete o status 'failed' + last_error persistidos
      onChanged()
    }
    setRunning(false)
  }

  const st = detail ? statusMeta(detail.status) : null
  const research = detail ? isResearch(detail) : false
  const canExecute =
    research && detail !== null && ["draft", "briefing_incomplete", "ready", "failed"].includes(detail.status)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto duofy-scroll border-l border-line bg-white shadow-panel animate-scale-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {detail && <Badge tone="slate">{eventTypeLabel(detail.event_type)}</Badge>}
              {st && <Badge tone={st.tone}>{st.label}</Badge>}
            </div>
            <p className="mt-1 truncate text-base font-bold text-ink">{detail?.title ?? "Carregando…"}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={load} title="Recarregar" className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-purple">
              <RefreshIcon className="h-4 w-4" />
            </button>
            {detail && (
              <button onClick={() => onEdit(detail)} title="Editar" className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-purple">
                <PencilIcon className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-ink">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Pipeline sempre visível */}
        {detail && <Pipeline steps={detail.steps} />}

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-line px-3 duofy-scroll">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${tab === t ? "border-purple text-purple" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 p-5">
          {loading && !detail ? (
            <div className="space-y-2">
              <div className="duofy-skeleton h-5 w-2/3 rounded" />
              <div className="duofy-skeleton h-24 rounded" />
            </div>
          ) : !detail ? (
            <p className="text-sm text-muted">{error ?? "Evento não encontrado."}</p>
          ) : (
            <>
              {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{error}</div>}

              {tab === "Visão geral" && (
                <div className="space-y-3 text-sm">
                  <Row label="Marca" value={detail.brand_slug} />
                  <Row label="Tipo" value={eventTypeLabel(detail.event_type)} />
                  {research && <Row label="Tema" value={detail.title} />}
                  {detail.objective && <Row label="Objetivo" value={detail.objective} />}
                  <Row label="Status" value={statusMeta(detail.status).label} />
                  <Row label="Início" value={fmtDateTime(detail.start_at)} />
                  <Row label="Execução" value={detail.execution_mode === "auto" ? "Automática" : "Manual"} />
                  {detail.channel && <Row label="Canal" value={detail.channel} />}
                  {detail.format && <Row label="Formato" value={detail.format} />}
                  {detail.last_error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                      <span className="font-semibold">Erro na execução:</span> {detail.last_error}
                    </div>
                  )}
                  {research && <ResearchActions detail={detail} running={running} canExecute={canExecute} onRun={runResearch} />}
                </div>
              )}

              {tab === "Briefing" && (
                <div className="space-y-3 text-sm">
                  <Block label="Tema / título" value={detail.title} />
                  <Block label="Objetivo" value={detail.objective || "—"} />
                  <Block label="Briefing / descrição" value={detail.description || "—"} />
                </div>
              )}

              {tab === "Fluxo" && (
                <div className="space-y-3">
                  <p className="text-xs text-muted">
                    A pesquisa sempre para para aprovação humana antes de liberar a cocriação. Etapas de fases
                    futuras aparecem bloqueadas.
                  </p>
                  <ol className="space-y-2">
                    {detail.steps.map((s) => (
                      <StepRow key={s.key} step={s} />
                    ))}
                  </ol>
                </div>
              )}

              {tab === "Resultados" && (
                <div className="space-y-3 text-sm">
                  {detail.research_output_id ? (
                    <div className="rounded-xl border border-line p-3">
                      <p className="font-semibold text-ink">Pesquisa #{detail.research_output_id}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        Status da pesquisa: {detail.research_output_status ?? "—"}
                        {detail.research_approved ? " • aprovada" : " • aguardando aprovação"}
                      </p>
                      <a href="/operations" className="duofy-tap mt-2 inline-flex items-center gap-1.5 rounded-lg bg-purple px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-deep">
                        <ExternalLinkIcon className="h-3.5 w-3.5" /> Abrir no Agente de Pesquisa
                      </a>
                    </div>
                  ) : (
                    <p className="text-muted">Nenhum resultado ainda. Execute a etapa de pesquisa.</p>
                  )}
                  <div className="rounded-xl border border-dashed border-line p-3 text-xs text-muted">
                    Peças de conteúdo (carrossel, legendas, etc.) aparecem aqui após a cocriação — liberada
                    depois da aprovação da pesquisa. <span className="font-semibold">Próxima fase.</span>
                  </div>
                </div>
              )}

              {tab === "Automação" && (
                <div className="space-y-3 text-sm">
                  <Row label="Modo" value={detail.execution_mode === "auto" ? "Automática" : "Manual"} />
                  <Row label="Execução automática em" value={fmtDateTime(detail.auto_execute_at)} />
                  <Row label="Exige aprovação da pesquisa" value={detail.requires_research_approval ? "Sim" : "Não"} />
                  <p className="rounded-lg border border-line bg-panel/50 p-2.5 text-xs text-muted">
                    No modo automático, o agendador executa a pesquisa no horário definido (idempotente). A cocriação
                    continua exigindo aprovação humana. Pausar/retomar e histórico de tentativas entram na próxima fase.
                  </p>
                </div>
              )}

              {tab === "Histórico" && (
                <div className="space-y-2 text-sm">
                  <Row label="Criado em" value={fmtDateTime(detail.created_at)} />
                  <Row label="Atualizado em" value={fmtDateTime(detail.updated_at)} />
                  {detail.agent_task_id && <Row label="Tarefa de execução" value={`AgentTask #${detail.agent_task_id}`} />}
                  {detail.agent_run_id && <Row label="Execução do agente" value={`AgentRun #${detail.agent_run_id}`} />}
                  <p className="pt-1 text-xs text-muted">A trilha completa de auditoria fica registrada em audit_events.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ResearchActions({
  detail,
  running,
  canExecute,
  onRun
}: {
  detail: CalendarEventDetail
  running: boolean
  canExecute: boolean
  onRun: () => void
}) {
  return (
    <div className="mt-2 rounded-xl border border-line bg-panel/40 p-3">
      {detail.status === "awaiting_approval" ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">Pesquisa concluída — aguardando aprovação</p>
          <p className="text-xs text-muted">Aprove a pesquisa na página do Agente de Pesquisa para liberar a cocriação.</p>
          <a href="/operations" className="duofy-tap inline-flex items-center gap-1.5 rounded-lg bg-purple px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-deep">
            <ExternalLinkIcon className="h-3.5 w-3.5" /> Abrir no Agente de Pesquisa
          </a>
        </div>
      ) : running || detail.status === "running" ? (
        <div className="flex items-center gap-2 text-sm text-purple">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Executando pesquisa com o agente… pode levar até um minuto.
        </div>
      ) : (
        <button
          onClick={onRun}
          disabled={!canExecute}
          className="duofy-tap flex w-full items-center justify-center gap-2 rounded-lg bg-purple py-2.5 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50"
        >
          <ZapIcon className="h-4 w-4" /> {detail.status === "failed" ? "Tentar novamente" : "Executar pesquisa"}
        </button>
      )}
    </div>
  )
}

function Pipeline({ steps }: { steps: CalendarStep[] }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-line bg-panel/30 px-4 py-3 duofy-scroll">
      {steps.map((s, i) => {
        const style = STEP_STYLE[s.status] ?? STEP_STYLE.pending
        return (
          <div key={s.key} className="flex shrink-0 items-center">
            <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${style.ring} ${style.bg}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: style.dot }} />
              <span className={`text-[11px] font-semibold ${style.text}`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <span className="mx-0.5 h-px w-3 bg-line" />}
          </div>
        )
      })}
    </div>
  )
}

function StepRow({ step }: { step: CalendarStep }) {
  const style = STEP_STYLE[step.status] ?? STEP_STYLE.pending
  const statusLabel = { done: "Concluída", current: "Atual", pending: "Pendente", locked: "Bloqueada" }[step.status]
  return (
    <li className={`flex items-start gap-3 rounded-xl border p-3 ${style.ring} ${style.bg}`}>
      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: style.dot }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-sm font-semibold ${step.status === "locked" ? "text-muted" : "text-ink"}`}>{step.label}</p>
          <span className={`text-[11px] font-semibold ${style.text}`}>{statusLabel}</span>
        </div>
        {step.detail && <p className="mt-0.5 text-xs text-muted">{step.detail}</p>}
      </div>
    </li>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 pb-2">
      <span className="shrink-0 text-xs font-semibold text-muted">{label}</span>
      <span className="text-right text-sm text-ink">{value}</span>
    </div>
  )
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted">{label}</p>
      <p className="whitespace-pre-wrap rounded-lg border border-line bg-panel/40 p-2.5 text-sm text-ink">{value}</p>
    </div>
  )
}
