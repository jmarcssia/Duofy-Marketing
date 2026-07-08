"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { Badge, type Tone } from "@/components/ui"
import {
  CloseIcon,
  ExternalLinkIcon,
  LayersIcon,
  PencilIcon,
  RefreshIcon,
  SparklesIcon,
  ZapIcon
} from "@/components/icons"
import {
  executeCalendarCocreation,
  executeCalendarResearch,
  getCalendarEventDetail,
  listContentPieces,
  publishCalendarEvent,
  setCalendarEventPaused,
  type CalendarEvent,
  type CalendarEventDetail,
  type CalendarStep,
  type ContentPiece
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { friendlyError } from "@/lib/friendly-error"
import { useBrand } from "@/lib/brand-context"
import { briefingSummaryRows, labelOf, PECAS, type StructuredBriefing } from "@/lib/briefing"

import { eventTypeLabel, statusMeta, STEP_STYLE } from "./status"

const TABS = ["Visão geral", "Briefing", "Fluxo", "Pesquisa", "Peças", "Automação", "Histórico"] as const
type Tab = (typeof TABS)[number]

function pieceStatusMeta(s: string): { label: string; tone: Tone } {
  if (s === "approved") return { label: "Aprovada", tone: "green" }
  if (s === "rejected") return { label: "Rejeitada", tone: "red" }
  return { label: "Pendente", tone: "amber" }
}

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

/** Rótulo pt-BR da recorrência do evento (5d); "—" quando nulo. */
const RECURRENCE_LABELS: Record<string, string> = {
  none: "Sem recorrência",
  daily: "Diária",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal"
}
function recurrenceLabel(rule: string | null): string {
  if (!rule) return "—"
  return RECURRENCE_LABELS[rule] ?? rule
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
  const { brands } = useBrand()
  const [detail, setDetail] = useState<CalendarEventDetail | null>(null)
  const [tab, setTab] = useState<Tab>("Visão geral")
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [cocreating, setCocreating] = useState(false)
  // "" = usar o canal/formato do briefing do evento (backend decide).
  const [coChannel, setCoChannel] = useState("")
  const [coFormat, setCoFormat] = useState("")
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pieces, setPieces] = useState<ContentPiece[]>([])
  const [piecesLoading, setPiecesLoading] = useState(false)
  // Semeia o canal/formato da cocriação com o que o briefing do evento definiu (uma vez).
  const seeded = useRef(false)

  const brandName = brands.find((b) => b.slug === brandSlug)?.name ?? brandSlug

  const load = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token || !brandSlug) return
    setLoading(true)
    try {
      setDetail(await getCalendarEventDetail(eventId, brandSlug, token))
      setError(null)
    } catch (e: unknown) {
      setError(friendlyError(e, "Falha ao carregar o evento."))
    }
    setLoading(false)
  }, [eventId, brandSlug])

  useEffect(() => {
    load()
  }, [load])

  // Ao carregar o evento, pré-seleciona o canal/formato definidos no briefing (uma vez).
  useEffect(() => {
    if (seeded.current || !detail) return
    seeded.current = true
    const payload = (detail.execution_payload ?? {}) as Record<string, unknown>
    if (typeof payload.channel === "string" && payload.channel) setCoChannel(payload.channel)
    if (typeof payload.format === "string" && payload.format) setCoFormat(payload.format)
  }, [detail])

  // Peças/subpeças do conteúdo cocriado (carregadas ao abrir a aba "Peças").
  useEffect(() => {
    if (tab !== "Peças" || !detail?.content_output_id) return
    const token = getTokenFromCookie()
    if (!token) return
    setPiecesLoading(true)
    listContentPieces(detail.content_output_id, token)
      .then(setPieces)
      .catch(() => setPieces([]))
      .finally(() => setPiecesLoading(false))
  }, [tab, detail?.content_output_id])

  async function runResearch() {
    const token = getTokenFromCookie()
    if (!token || !brandSlug) return
    setRunning(true)
    setError(null)
    // A pesquisa leva 1–2 min e o proxy estoura ~30s (500), mas o backend conclui. Então:
    // dispara o POST E faz polling do detalhe do evento até vincular a pesquisa (ou falhar).
    const before = detail?.research_output_id ?? null
    let done = false
    const start = Date.now()
    const post = executeCalendarResearch(eventId, brandSlug, token)
      .then((d) => { if (!done) { done = true; setDetail(d); onChanged() } })
      .catch((e) => {
        // Rejeição rápida (antes do teto do proxy ~30s) = erro real do backend (ex.: gate,
        // fontes insuficientes) → mostra a mensagem e para o polling, sem spinner de 210s.
        if (!done && Date.now() - start < 25_000) {
          done = true
          setError(friendlyError(e, "Falha ao executar a pesquisa."))
        }
        // Caso contrário: provável timeout do proxy — o polling recupera.
      })
    while (!done && Date.now() - start < 210_000) {
      await new Promise((r) => setTimeout(r, 5000))
      if (done) break
      try {
        const d = await getCalendarEventDetail(eventId, brandSlug, token)
        if (d.status === "failed") { done = true; setDetail(d); setError(d.last_error || "Falha ao executar a pesquisa."); onChanged(); break }
        if (d.research_output_id && d.research_output_id !== before) { done = true; setDetail(d); onChanged(); break }
      } catch { /* segue tentando */ }
    }
    await post.catch(() => {})
    if (!done) { await load(); onChanged() }
    setRunning(false)
  }

  async function runCocreation() {
    const token = getTokenFromCookie()
    if (!token || !brandSlug) return
    setCocreating(true)
    setError(null)
    // Mesma resiliência ao timeout: POST + polling até o conteúdo ser vinculado (ou falhar).
    const before = detail?.content_output_id ?? null
    let done = false
    const start = Date.now()
    // "" → null: usa o canal/formato do briefing do evento.
    const post = executeCalendarCocreation(eventId, brandSlug, coChannel || null, coFormat || null, token)
      .then((d) => { if (!done) { done = true; setDetail(d); onChanged() } })
      .catch((e) => {
        // Rejeição rápida = erro real do backend (ex.: cocriação bloqueada até aprovação da
        // pesquisa) → mostra a mensagem e para, em vez de girar 210s.
        if (!done && Date.now() - start < 25_000) {
          done = true
          setError(friendlyError(e, "Falha ao executar a cocriação."))
        }
      })
    while (!done && Date.now() - start < 210_000) {
      await new Promise((r) => setTimeout(r, 5000))
      if (done) break
      try {
        const d = await getCalendarEventDetail(eventId, brandSlug, token)
        if (d.status === "failed") { done = true; setDetail(d); setError(d.last_error || "Falha ao executar a cocriação."); onChanged(); break }
        if (d.content_output_id && d.content_output_id !== before) { done = true; setDetail(d); onChanged(); break }
      } catch { /* segue tentando */ }
    }
    await post.catch(() => {})
    if (!done) { await load(); onChanged() }
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
      setError(friendlyError(e, "Falha ao publicar."))
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
      setError(friendlyError(e, "Falha ao alterar a pausa."))
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
                  <Row label="Marca" value={brandName} />
                  <Row label="Tipo" value={eventTypeLabel(detail.event_type)} />
                  {research && <Row label="Tema" value={detail.title} />}
                  {detail.objective && <Row label="Objetivo" value={detail.objective} />}
                  <Row label="Status" value={statusMeta(detail.status).label} />
                  <Row label="Início" value={fmtDateTime(detail.start_at)} />
                  <Row label="Execução" value={detail.execution_mode === "auto" ? "Automática" : "Manual"} />
                  {detail.channel && <Row label="Canal" value={detail.channel} />}
                  {detail.format && <Row label="Formato" value={detail.format} />}
                  {detail.delivery_at && <Row label="Entrega" value={fmtDateTime(detail.delivery_at)} />}
                  {detail.review_at && <Row label="Revisão" value={fmtDateTime(detail.review_at)} />}
                  {detail.approval_at && <Row label="Aprovação" value={fmtDateTime(detail.approval_at)} />}
                  {detail.due_at && <Row label="Prazo final" value={fmtDateTime(detail.due_at)} />}
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
                  <StructuredBriefingBlock payload={detail.execution_payload} />
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

              {tab === "Pesquisa" && (
                <div className="space-y-3 text-sm">
                  {detail.research_output_id ? (
                    <div className="rounded-xl border border-line p-3">
                      <p className="font-semibold text-ink">Pesquisa #{detail.research_output_id}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        Status: {detail.research_output_status ?? "—"}
                        {detail.research_approved ? " • aprovada" : " • aguardando aprovação"}
                      </p>
                      <a href={`/research?id=${detail.research_output_id}`} className="duofy-tap mt-2 inline-flex items-center gap-1.5 rounded-lg bg-purple px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-deep">
                        <ExternalLinkIcon className="h-3.5 w-3.5" /> Abrir no Agente de Pesquisa
                      </a>
                    </div>
                  ) : (
                    <p className="text-muted">Nenhuma pesquisa executada ainda. Use a aba “Visão geral” para executar.</p>
                  )}
                </div>
              )}

              {tab === "Peças" && (
                <div className="space-y-3 text-sm">
                  {!detail.content_output_id ? (
                    <div className="rounded-xl border border-dashed border-line p-3 text-xs text-muted">
                      As peças (carrossel, legendas, direção visual…) aparecem aqui após a cocriação —
                      liberada depois da aprovação da pesquisa.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-ink">Conteúdo #{detail.content_output_id}</p>
                        <Badge tone={detail.content_approved ? "green" : "amber"}>
                          {detail.content_approved ? "aprovado" : "em revisão"}
                        </Badge>
                      </div>
                      {piecesLoading ? (
                        <p className="text-xs text-muted">Carregando peças…</p>
                      ) : pieces.length === 0 ? (
                        <p className="text-xs text-muted">Nenhuma peça registrada.</p>
                      ) : (
                        <ul className="space-y-2">
                          {pieces.map((p) => {
                            const ps = pieceStatusMeta(p.status)
                            return (
                              <li key={p.id} className="rounded-xl border border-line p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                                      <LayersIcon className="h-3.5 w-3.5 shrink-0 text-purple" /> {p.label}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-muted">
                                      {p.kind}{p.channel ? ` · ${p.channel}` : ""}{p.origin ? ` · ${p.origin}` : ""}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-1">
                                    <Badge tone={ps.tone}>{ps.label}</Badge>
                                    <Badge tone={p.required ? "purple" : "slate"}>{p.required ? "obrigatória" : "opcional"}</Badge>
                                  </div>
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <a href={`/content?id=${detail.content_output_id}`} className="duofy-tap inline-flex items-center gap-1.5 rounded-lg bg-purple px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-deep">
                          <SparklesIcon className="h-3.5 w-3.5" /> Abrir na Cocriação
                        </a>
                        <a href="/approvals" className="duofy-tap inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:border-purple/40 hover:text-purple">
                          <ExternalLinkIcon className="h-3.5 w-3.5" /> Abrir na Revisão
                        </a>
                      </div>
                    </>
                  )}
                </div>
              )}

              {tab === "Automação" && (
                <div className="space-y-3 text-sm">
                  <Row label="Modo" value={detail.execution_mode === "auto" ? "Automática" : "Manual"} />
                  <Row label="Execução automática em" value={fmtDateTime(detail.auto_execute_at)} />
                  <Row label="Lembrete" value={fmtDateTime(detail.reminder_at)} />
                  <Row label="Recorrência" value={recurrenceLabel(detail.recurrence_rule)} />
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
          <a href={`/research?id=${detail.research_output_id}`} className="duofy-tap inline-flex items-center gap-1.5 rounded-lg bg-purple px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-deep">
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

const COCREATION_CHANNELS = ["Instagram", "LinkedIn", "Blog", "Email", "WhatsApp", "Facebook"]
const COCREATION_FORMATS = ["Carrossel", "Post único", "Reels", "Stories", "Artigo", "Newsletter"]

/** Opções do select incluindo o valor atual (caso venha do briefing e não esteja na lista fixa). */
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options
}

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
                <option value="">Padrão do briefing</option>
                {withCurrent(COCREATION_CHANNELS, channel).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-muted">Formato</span>
              <select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                <option value="">Padrão do briefing</option>
                {withCurrent(COCREATION_FORMATS, format).map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            “Padrão do briefing” usa os canais e peças definidos no evento — inclusive multicanal.
          </p>
          <button onClick={onRun} className="duofy-tap mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-purple py-2.5 text-sm font-semibold text-white hover:bg-purple-deep">
            <SparklesIcon className="h-4 w-4" /> Cocriar conteúdo
          </button>
        </>
      )}
    </div>
  )
}

/** Briefing estruturado do evento (chips). Metadados de execução (pipeline/depth/período) como
 * badges; o restante do briefing via briefingSummaryRows — sem duplicar canais/peças. */
function StructuredBriefingBlock({ payload }: { payload: Record<string, unknown> | null }) {
  const data = (payload ?? {}) as Record<string, unknown>
  const briefing = (
    typeof data.briefing === "object" && data.briefing !== null ? data.briefing : {}
  ) as StructuredBriefing
  // Peças no briefing chegam como ids (carousel, caption_instagram…) — traduz para rótulos.
  const rows = briefingSummaryRows(briefing).map((row) =>
    row.label === "Peças"
      ? { ...row, values: row.values.map((v) => labelOf(PECAS, v)) }
      : row
  )
  const depth = typeof data.depth === "string" ? data.depth : ""
  const period = typeof data.period === "string" ? data.period : ""
  const pipeline = data.pipeline === "research_content"

  if (rows.length === 0 && !depth && !period && !pipeline) {
    return (
      <div>
        <p className="mb-1 text-xs font-semibold text-muted">Briefing estruturado</p>
        <p className="rounded-lg border border-dashed border-line p-2.5 text-xs text-muted">
          Este evento foi criado sem filtros estruturados. Edite-o para adicionar o briefing.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted">Briefing estruturado</p>
      <div className="space-y-2 rounded-lg border border-line bg-panel/40 p-3">
        {(pipeline || depth || period) && (
          <div className="flex flex-wrap gap-1">
            {pipeline && <Badge tone="purple">Pesquisa + Conteúdo</Badge>}
            {depth && <Badge tone="blue">Profundidade: {depth}</Badge>}
            {period && <Badge tone="blue">Período: {period}</Badge>}
          </div>
        )}
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{row.label}</p>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {row.values.map((v, i) => <Badge key={`${row.label}-${i}`} tone="slate">{v}</Badge>)}
            </div>
          </div>
        ))}
      </div>
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
