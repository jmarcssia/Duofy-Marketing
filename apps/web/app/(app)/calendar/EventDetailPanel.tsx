"use client"

import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/ui"
import {
  CloseIcon,
  ExternalLinkIcon,
  PencilIcon,
  RefreshIcon,
  SparklesIcon,
  ZapIcon
} from "@/components/icons"
import {
  executeCalendarCocreation,
  executeCalendarResearch,
  getCalendarEventDetail,
  publishCalendarEvent,
  setCalendarEventPaused,
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
  const [cocreating, setCocreating] = useState(false)
  const [coChannel, setCoChannel] = useState("Instagram")
  const [coFormat, setCoFormat] = useState("Carrossel")
  const [publishing, setPublishing] = useState(false)
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

  async function runCocreation() {
    const token = getTokenFromCookie()
    if (!token || !brandSlug) return
    setCocreating(true)
    setError(null)
    try {
      const d = await executeCalendarCocreation(eventId, brandSlug, coChannel, coFormat, token)
      setDetail(d)
      onChanged()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao executar a cocriação.")
      await load()
      onChanged()
    }
    setCocreating(false)
  }

  async function runPublish(target: "meta" | "manual") {
    const token = getTokenFromCookie()
    if (!token || !brandSlug) return
    setPublishing(true)
    setError(null)
    try {
      const d = await publishCalendarEvent(eventId, brandSlug, target, token)
      setDetail(d)
      onChanged()
    } catch (e: unknown) {
      // Meta ainda não integrada: a mensagem clara do backend aparece aqui (não finge sucesso).
      setError(e instanceof Error ? e.message : "Falha ao publicar.")
    }
    setPublishing(false)
  }

  async function togglePause() {
    const token = getTokenFromCookie()
    if (!token || !brandSlug || !detail) return
    setError(null)
    try {
      const d = await setCalendarEventPaused(eventId, brandSlug, !detail.is_paused, token)
      setDetail(d)
      onChanged()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao alterar a pausa.")
    }
  }

  const st = detail ? statusMeta(detail.status) : null
  const research = detail ? isResearch(detail) : false
  const canExecute =
    research && detail !== null && ["draft", "briefing_incomplete", "ready", "failed"].includes(detail.status)
  // Cocriação: liberada quando a pesquisa está aprovada (ou gate desligado) e ainda não há conteúdo.
  const showCocreation =
    detail !== null && detail.cocreation_unlocked && detail.content_output_id === null
  // Publicação: liberada quando o conteúdo está aprovado e ainda não foi publicado.
  const published = detail?.publish_status === "published"
  const showPublish = detail !== null && detail.content_approved && !published

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
              {detail?.is_paused && <Badge tone="amber">Pausado</Badge>}
              {detail?.publish_status === "published" && <Badge tone="green">Publicado</Badge>}
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
                  {research && !detail.cocreation_unlocked && (
                    <ResearchActions detail={detail} running={running} canExecute={canExecute} onRun={runResearch} />
                  )}
                  {showCocreation && (
                    <CocreationActions
                      cocreating={cocreating}
                      channel={coChannel}
                      format={coFormat}
                      setChannel={setCoChannel}
                      setFormat={setCoFormat}
                      onRun={runCocreation}
                    />
                  )}
                  {showPublish && <PublishActions publishing={publishing} onPublish={runPublish} />}
                  {published && (
                    <div className="mt-2 rounded-xl border border-green-200 bg-green-50 p-3">
                      <p className="text-sm font-semibold text-green-800">Publicado</p>
                      <p className="mt-0.5 text-xs text-green-700">
                        Via {detail.publish_target === "manual" ? "publicação manual" : detail.publish_target} · {fmtDateTime(detail.published_at)}
                        {detail.publish_ref && detail.publish_ref !== "manual" ? ` · ref ${detail.publish_ref}` : ""}
                      </p>
                    </div>
                  )}
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
                  {detail.content_output_id ? (
                    <div className="rounded-xl border border-line p-3">
                      <p className="font-semibold text-ink">Conteúdo #{detail.content_output_id}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        Status do conteúdo: {detail.content_output_status ?? "—"}
                        {detail.content_approved ? " • aprovado" : " • em revisão"}
                      </p>
                      <a href="/operations" className="duofy-tap mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-purple/40 hover:text-purple">
                        <ExternalLinkIcon className="h-3.5 w-3.5" /> Abrir na Cocriação
                      </a>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-line p-3 text-xs text-muted">
                      As peças de conteúdo (carrossel, legendas, direção visual) aparecem aqui após a
                      cocriação — liberada depois da aprovação da pesquisa.
                    </div>
                  )}
                </div>
              )}

              {tab === "Automação" && (
                <div className="space-y-3 text-sm">
                  <Row label="Modo" value={detail.execution_mode === "auto" ? "Automática" : "Manual"} />
                  <Row label="Execução automática em" value={fmtDateTime(detail.auto_execute_at)} />
                  <Row label="Exige aprovação da pesquisa" value={detail.requires_research_approval ? "Sim" : "Não"} />
                  <Row label="Estado" value={detail.is_paused ? "Pausado" : "Ativo"} />
                  {detail.execution_mode === "auto" && (
                    <button
                      onClick={togglePause}
                      className={`duofy-tap flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold transition ${detail.is_paused ? "border-purple bg-purple text-white hover:bg-purple-deep" : "border-line text-ink hover:border-purple/40 hover:text-purple"}`}
                    >
                      {detail.is_paused ? "Retomar automação" : "Pausar automação"}
                    </button>
                  )}
                  <p className="rounded-lg border border-line bg-panel/50 p-2.5 text-xs text-muted">
                    No modo automático, o agendador executa a pesquisa no horário definido e, após a aprovação
                    humana da pesquisa, dispara a cocriação — tudo idempotente. Pause para o agendador ignorar o
                    evento; a publicação (Meta) fica para a próxima fase.
                  </p>
                </div>
              )}

              {tab === "Histórico" && (
                <div className="space-y-3 text-sm">
                  <Row label="Criado em" value={fmtDateTime(detail.created_at)} />
                  <Row label="Atualizado em" value={fmtDateTime(detail.updated_at)} />
                  <p className="pt-1 text-xs font-semibold text-muted">Tentativas de execução</p>
                  {detail.history.length === 0 ? (
                    <p className="text-xs text-muted">Nenhuma execução ainda.</p>
                  ) : (
                    <ul className="space-y-2">
                      {detail.history.map((h) => (
                        <li key={h.id} className="rounded-xl border border-line p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-ink">
                              {h.kind === "research" ? "Pesquisa" : "Cocriação"}
                              <span className="ml-1 text-xs font-normal text-muted">· {h.trigger === "auto" ? "automática" : "manual"}</span>
                            </span>
                            <Badge tone={h.status === "completed" ? "green" : h.status === "failed" ? "red" : "amber"}>{h.status}</Badge>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted">
                            {fmtDateTime(h.created_at)}{h.output_id ? ` · Output #${h.output_id}` : ""}
                          </p>
                          {h.error && <p className="mt-0.5 line-clamp-2 text-[11px] text-red">{h.error}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="pt-1 text-xs text-muted">Trilha completa registrada em audit_events.</p>
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

function PublishActions({
  publishing,
  onPublish
}: {
  publishing: boolean
  onPublish: (target: "meta" | "manual") => void
}) {
  return (
    <div className="mt-2 rounded-xl border border-line bg-panel/40 p-3">
      <p className="text-sm font-semibold text-ink">Conteúdo aprovado — pronto para publicar</p>
      <p className="mt-0.5 text-xs text-muted">A integração com a Meta entra na próxima fase. Você pode registrar uma publicação manual.</p>
      {publishing ? (
        <div className="mt-2 flex items-center gap-2 text-sm text-purple">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Publicando…
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => onPublish("meta")}
            className="duofy-tap flex items-center justify-center gap-1.5 rounded-lg border border-line py-2.5 text-xs font-semibold text-muted hover:border-purple/40 hover:text-purple"
            title="Integração Meta na próxima fase"
          >
            Publicar na Meta
            <span className="rounded bg-panel px-1 py-0.5 text-[9px] font-bold text-muted">em breve</span>
          </button>
          <button
            onClick={() => onPublish("manual")}
            className="duofy-tap flex items-center justify-center rounded-lg bg-purple py-2.5 text-xs font-semibold text-white hover:bg-purple-deep"
          >
            Marcar como publicado
          </button>
        </div>
      )}
    </div>
  )
}

const COCREATION_CHANNELS = ["Instagram", "LinkedIn", "Blog", "Email", "WhatsApp"]
const COCREATION_FORMATS = ["Carrossel", "Post único", "Reels", "Stories", "Artigo", "Newsletter"]

function CocreationActions({
  cocreating,
  channel,
  format,
  setChannel,
  setFormat,
  onRun
}: {
  cocreating: boolean
  channel: string
  format: string
  setChannel: (v: string) => void
  setFormat: (v: string) => void
  onRun: () => void
}) {
  return (
    <div className="mt-2 rounded-xl border border-purple/20 bg-purple/5 p-3">
      <p className="text-sm font-semibold text-ink">Pesquisa aprovada — cocriação liberada</p>
      <p className="mt-0.5 text-xs text-muted">Gere as peças consumindo a pesquisa aprovada. O conteúdo entra em revisão.</p>
      {cocreating ? (
        <div className="mt-2 flex items-center gap-2 text-sm text-purple">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Cocriando conteúdo com o agente… pode levar até um minuto.
        </div>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-muted">Canal</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                {COCREATION_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-muted">Formato</span>
              <select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                {COCREATION_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          </div>
          <button onClick={onRun} className="duofy-tap mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-purple py-2.5 text-sm font-semibold text-white hover:bg-purple-deep">
            <SparklesIcon className="h-4 w-4" /> Cocriar conteúdo
          </button>
        </>
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
