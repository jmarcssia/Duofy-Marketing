"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { Badge, GhostButton } from "@/components/ui"
import { Markdown } from "@/components/markdown"
import {
  AlertTriangleIcon,
  BookIcon,
  CheckCircleIcon,
  CopyIcon,
  FileIcon,
  PlusIcon,
  RefreshIcon,
  SendIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon
} from "@/components/icons"
import {
  apiFetch,
  type AgentRun,
  type ContentOutputDetail,
  type ResearchReport
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"

type ChatMsg = { id: string; role: "user" | "assistant"; text: string; time: string; pending?: boolean; error?: boolean }

type ColId = "analise" | "revisao" | "aprovado"

const COLUMNS: { id: ColId; label: string }[] = [
  { id: "analise", label: "Em análise" },
  { id: "revisao", label: "Em revisão" },
  { id: "aprovado", label: "Aprovado" }
]

const STATUS_TO_COL: Record<string, ColId> = {
  draft: "analise",
  needs_adjustment: "analise",
  rejected: "analise",
  review: "revisao",
  approved: "aprovado",
  archived: "aprovado"
}

const STATUS_LABEL: Record<string, { label: string; tone: "amber" | "blue" | "green" | "slate" }> = {
  draft: { label: "Rascunho", tone: "amber" },
  review: { label: "Em revisão", tone: "blue" },
  approved: { label: "Aprovado", tone: "green" },
  needs_adjustment: { label: "Ajuste", tone: "amber" },
  rejected: { label: "Rejeitado", tone: "slate" },
  archived: { label: "Arquivado", tone: "slate" }
}

function now() {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function summarize(content: string, max = 420): string {
  if (!content) return "Sem conteúdo gerado ainda."
  // pega o primeiro parágrafo de texto real (ignora cabeçalhos markdown e tabelas)
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("|") && !l.startsWith("---") && !l.startsWith("-"))
  const text = lines.join(" ")
  return text.length > max ? `${text.slice(0, max)}…` : text || "Documento estruturado — abra os detalhes."
}

export default function OperationsPage() {
  const { selected: brand } = useBrand()

  // ── Orquestrador ──
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: "intro",
      role: "assistant",
      text: "Olá! Sou o Orquestrador. Posso disparar pesquisas, gerar conteúdo e coordenar os agentes. O que você precisa?",
      time: now()
    }
  ])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── Kanban ──
  const [reports, setReports] = useState<ResearchReport[]>([])
  const [loadingReports, setLoadingReports] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ContentOutputDetail | null>(null)
  const [acting, setActing] = useState(false)

  // ── Cocriação ──
  const [genLoading, setGenLoading] = useState(false)
  const [genResult, setGenResult] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) { setLoadingReports(false); return }
    setLoadingReports(true)
    try {
      const data = await apiFetch<ResearchReport[]>(`/api/research/reports?limit=50`, token)
      const filtered = brand ? data.filter((r) => r.brand_slug === brand) : data
      setReports(filtered)
      if (filtered.length > 0 && !filtered.some((r) => r.id === selectedId)) {
        setSelectedId(filtered[0].id)
      }
    } catch {
      setReports([])
    }
    setLoadingReports(false)
  }, [brand, selectedId])

  useEffect(() => { loadReports() }, [brand]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // load detail of selected report
  useEffect(() => {
    if (selectedId == null) { setDetail(null); return }
    const token = getTokenFromCookie()
    if (!token) return
    setDetail(null)
    setGenResult(null)
    setGenError(null)
    apiFetch<ContentOutputDetail>(`/api/outputs/${selectedId}`, token)
      .then(setDetail)
      .catch(() => setDetail(null))
  }, [selectedId])

  const selectedReport = reports.find((r) => r.id === selectedId) ?? null

  async function sendMessage(prompt?: string) {
    const text = (prompt ?? input).trim()
    if (!text || sending) return
    const token = getTokenFromCookie()
    if (!token) return
    const userMsg: ChatMsg = { id: `u${Date.now()}`, role: "user", text, time: now() }
    const pendingMsg: ChatMsg = { id: `p${Date.now()}`, role: "assistant", text: "Pensando…", time: now(), pending: true }
    setMessages((m) => [...m, userMsg, pendingMsg])
    setInput("")
    setSending(true)
    try {
      const run = await apiFetch<AgentRun>("/api/agents/run", token, {
        method: "POST",
        body: JSON.stringify({ agent_slug: "orchestrator", prompt: text, brand_slug: brand || undefined })
      })
      setMessages((m) =>
        m.map((msg) =>
          msg.id === pendingMsg.id
            ? { ...msg, text: run.output || run.error || "(sem resposta)", time: now(), pending: false, error: run.status === "failed" }
            : msg
        )
      )
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : "Erro ao executar o agente."
      setMessages((m) =>
        m.map((msg) => (msg.id === pendingMsg.id ? { ...msg, text: detail, time: now(), pending: false, error: true } : msg))
      )
    }
    setSending(false)
  }

  async function approveReport() {
    if (!selectedReport) return
    const token = getTokenFromCookie()
    if (!token) return
    setActing(true)
    try {
      await apiFetch(`/api/outputs/${selectedReport.id}/approve`, token, { method: "POST", body: JSON.stringify({}) })
      await loadReports()
      const fresh = await apiFetch<ContentOutputDetail>(`/api/outputs/${selectedReport.id}`, token)
      setDetail(fresh)
    } catch { /* surfaced via reload */ }
    setActing(false)
  }

  async function saveToMemory() {
    if (!selectedReport) return
    const token = getTokenFromCookie()
    if (!token) return
    setActing(true)
    try {
      await apiFetch(`/api/research/reports/${selectedReport.id}/save-memory`, token, { method: "POST", body: JSON.stringify({}) })
    } catch { /* ignore */ }
    setActing(false)
  }

  async function generateContent() {
    if (!selectedReport) return
    const token = getTokenFromCookie()
    if (!token) return
    setGenLoading(true)
    setGenError(null)
    setGenResult(null)
    const prompt = `Com base nesta pesquisa de mercado, gere um conteúdo pronto para publicação.\n\nTítulo da pesquisa: ${selectedReport.title}\nBriefing: ${selectedReport.briefing}\n\nEntregue uma legenda envolvente com CTA e hashtags para Instagram.`
    try {
      const run = await apiFetch<AgentRun>("/api/agents/run", token, {
        method: "POST",
        body: JSON.stringify({ agent_slug: "content_agent", prompt, brand_slug: brand || undefined })
      })
      if (run.status === "failed") setGenError(run.error || "Falha na geração.")
      else setGenResult(run.output)
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "Erro ao gerar conteúdo.")
    }
    setGenLoading(false)
  }

  const QUICK = [
    { icon: <PlusIcon className="h-4 w-4" />, label: "Nova pesquisa", prompt: "Faça uma pesquisa de mercado rápida sobre tendências relevantes para a nossa marca." },
    { icon: <SparklesIcon className="h-4 w-4" />, label: "Gerar conteúdo", prompt: "Gere uma ideia de carrossel para Instagram com base nas pesquisas recentes." },
    { icon: <RefreshIcon className="h-4 w-4" />, label: "Refinar tema", prompt: "Sugira 3 ângulos diferentes para abordar o último tema pesquisado." }
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[336px_minmax(0,1fr)_372px]">
        {/* Orquestrador */}
        <section className="duofy-card flex flex-col rounded-2xl p-5" style={{ maxHeight: "calc(100vh - 130px)" }}>
          <div className="mb-4 flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-purple" />
            <h2 className="text-base font-bold tracking-[-0.02em] text-ink">Orquestrador</h2>
            <Badge tone="green">conectado</Badge>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto duofy-scroll pr-1">
            {messages.map((m) => (
              <div key={m.id} className={`max-w-[90%] ${m.role === "user" ? "ml-auto" : ""}`}>
                <div
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    m.role === "user"
                      ? "bg-purple text-white"
                      : m.error
                        ? "bg-red-50 text-red-700"
                        : "bg-purple-soft/70 text-ink"
                  } ${m.pending ? "animate-pulse" : ""}`}
                >
                  {m.role === "assistant" && !m.pending && !m.error ? (
                    <Markdown content={m.text} className="text-ink/90" />
                  ) : (
                    <span className="whitespace-pre-wrap">{m.text}</span>
                  )}
                </div>
                <p className={`mt-1 text-[11px] text-muted ${m.role === "user" ? "text-right" : ""}`}>{m.time}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <GhostButton key={q.label} className="text-xs" onClick={() => sendMessage(q.prompt)}>
                {q.icon} {q.label}
              </GhostButton>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              disabled={sending}
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted disabled:opacity-60"
              placeholder="Pergunte algo ao Orquestrador..."
            />
            <button
              onClick={() => sendMessage()}
              disabled={sending || !input.trim()}
              className="grid h-8 w-8 place-items-center rounded-lg bg-purple text-white disabled:opacity-50"
              aria-label="Enviar"
            >
              {sending ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <SendIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        </section>

        {/* Kanban */}
        <section className="duofy-card rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold tracking-[-0.02em] text-ink">Kanban de Pesquisas</h2>
            <button onClick={loadReports} className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-purple">
              <RefreshIcon className="h-4 w-4" /> Atualizar
            </button>
          </div>
          {loadingReports ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => <div key={i} className="duofy-skeleton h-32 rounded-xl" />)}
            </div>
          ) : reports.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-line py-16 text-center">
              <p className="text-sm text-muted">Nenhuma pesquisa para esta marca ainda.</p>
              <button onClick={() => sendMessage(QUICK[0].prompt)} className="mt-2 text-sm font-semibold text-purple">
                Disparar primeira pesquisa →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {COLUMNS.map((col) => {
                const cards = reports.filter((r) => (STATUS_TO_COL[r.status] ?? "analise") === col.id)
                return (
                  <div key={col.id} className="flex flex-col">
                    <div className="mb-3 flex items-center justify-between px-1">
                      <span className="text-sm font-semibold text-ink">{col.label}</span>
                      <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-line/70 px-1 text-xs font-semibold text-muted">{cards.length}</span>
                    </div>
                    <div className="space-y-3">
                      {cards.map((card) => {
                        const active = selectedId === card.id
                        const st = STATUS_LABEL[card.status] ?? { label: card.status, tone: "slate" as const }
                        return (
                          <button
                            key={card.id}
                            onClick={() => setSelectedId(card.id)}
                            className={`w-full rounded-xl border bg-white p-3.5 text-left transition ${active ? "border-purple shadow-soft ring-1 ring-purple/30" : "border-line hover:border-purple/40"}`}
                          >
                            <p className="text-sm font-semibold leading-snug text-ink">{card.title}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge tone={st.tone}>{st.label}</Badge>
                              <Badge tone="slate">{card.category}</Badge>
                            </div>
                            <p className="mt-2.5 line-clamp-2 text-xs text-muted">{card.briefing}</p>
                            <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                              <span className="text-xs font-medium text-ink">{card.sources?.length ?? 0} fontes</span>
                              <span className="text-xs text-muted">#{card.id}</span>
                            </div>
                          </button>
                        )
                      })}
                      {cards.length === 0 && <p className="px-1 text-xs text-muted">—</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Detalhe */}
        <section className="duofy-card flex flex-col rounded-2xl p-5" style={{ maxHeight: "calc(100vh - 130px)" }}>
          {!selectedReport ? (
            <div className="grid flex-1 place-items-center text-center text-sm text-muted">
              Selecione uma pesquisa no kanban.
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold leading-snug tracking-[-0.02em] text-ink">{selectedReport.title}</h2>
                <Badge tone={(STATUS_LABEL[selectedReport.status]?.tone) ?? "slate"}>{STATUS_LABEL[selectedReport.status]?.label ?? selectedReport.status}</Badge>
              </div>
              <p className="text-xs text-muted">
                {selectedReport.channel} · {selectedReport.provider}/{selectedReport.model.replace("~", "")} · #{selectedReport.id}
              </p>

              <div className="mt-4 flex-1 overflow-y-auto duofy-scroll pr-1">
                <p className="text-sm leading-relaxed text-ink/80">{summarize(detail?.current_content ?? selectedReport.current_content)}</p>

                {selectedReport.sources && selectedReport.sources.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-sm font-semibold text-ink">Fontes ({selectedReport.sources.length})</p>
                    <ul className="space-y-2">
                      {selectedReport.sources.slice(0, 8).map((s) => (
                        <li key={s.id} className="rounded-lg border border-line bg-white p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-ink">{s.title}</span>
                            <Badge tone={s.reliability === "high" ? "green" : s.reliability === "low" ? "amber" : "slate"}>{s.reliability}</Badge>
                          </div>
                          {s.url && (
                            <a href={s.url} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-[11px] text-purple hover:underline">
                              {s.url}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detail?.quality_notes && detail.quality_notes.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-sm font-semibold text-ink">Notas de qualidade</p>
                    <ul className="space-y-1">
                      {detail.quality_notes.map((n, i) => (
                        <li key={i} className="flex gap-2 text-xs text-muted">
                          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />{n}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2.5">
                <button
                  onClick={approveReport}
                  disabled={acting || selectedReport.status === "approved"}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-green py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
                >
                  <CheckCircleIcon className="h-5 w-5" /> {selectedReport.status === "approved" ? "Aprovado" : "Aprovar"}
                </button>
                <div className="grid grid-cols-2 gap-2.5">
                  <GhostButton className="justify-center" onClick={() => sendMessage(`Refine e melhore a pesquisa "${selectedReport.title}".`)}>
                    <SettingsIcon className="h-4 w-4" /> Solicitar ajuste
                  </GhostButton>
                  <GhostButton className="justify-center" onClick={saveToMemory}>
                    <BookIcon className="h-4 w-4" /> Salvar na memória
                  </GhostButton>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Cocriação contextual */}
      <section className="duofy-card rounded-2xl p-5">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Cocriação contextual</h2>
          {selectedReport ? (
            <Badge tone="purple">Baseada em: {selectedReport.title}</Badge>
          ) : (
            <Badge tone="slate">Selecione uma pesquisa</Badge>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-ink">Gerar conteúdo com o agente de Cocriação</p>
                <button
                  onClick={generateContent}
                  disabled={!selectedReport || genLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-purple px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-purple-deep disabled:opacity-50"
                >
                  {genLoading ? (
                    <>
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                      Gerando…
                    </>
                  ) : (
                    <><SparklesIcon className="h-4 w-4" /> Gerar conteúdo</>
                  )}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted">
                O agente <span className="font-medium text-ink">content_agent</span> usa a pesquisa selecionada como contexto e gera uma entrega pronta.
              </p>

              {genError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{genError}</div>
              )}
              {genResult && (
                <div className="mt-3 rounded-lg border border-green-200 bg-green-50/50 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">Conteúdo gerado</span>
                    <button
                      onClick={() => navigator.clipboard?.writeText(genResult)}
                      className="flex items-center gap-1 text-xs font-semibold text-purple"
                    >
                      <CopyIcon className="h-3.5 w-3.5" /> Copiar
                    </button>
                  </div>
                  <Markdown content={genResult} />
                </div>
              )}
              {!genResult && !genError && !genLoading && (
                <div className="mt-3 grid place-items-center rounded-lg border border-dashed border-line py-8 text-center text-xs text-muted">
                  {selectedReport ? "Clique em “Gerar conteúdo” para criar uma entrega real a partir desta pesquisa." : "Selecione uma pesquisa no kanban acima."}
                </div>
              )}
            </div>
          </div>

          {/* Guardião */}
          <div className="rounded-xl border border-line bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-purple" />
              <p className="text-sm font-bold text-ink">Guardião de Qualidade</p>
            </div>
            {detail?.latest_quality_review ? (
              <>
                <div className="flex items-end gap-2">
                  <span className={`text-4xl font-extrabold leading-none ${detail.latest_quality_review.passed ? "text-green" : "text-amber"}`}>
                    {Math.round(detail.latest_quality_review.score)}
                  </span>
                  <span className="pb-1 text-sm text-muted">/100</span>
                </div>
                <p className="text-xs text-muted">{detail.latest_quality_review.summary}</p>
                {detail.latest_quality_review.required_fixes?.length > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber/10 p-2.5">
                    <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
                    <p className="text-xs text-ink">
                      <span className="font-semibold">Correções:</span> {detail.latest_quality_review.required_fixes.slice(0, 2).join("; ")}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="grid place-items-center rounded-lg border border-dashed border-line py-8 text-center">
                <FileIcon className="h-6 w-6 text-muted" />
                <p className="mt-1.5 text-xs text-muted">Sem revisão de qualidade ainda.</p>
                <button
                  onClick={() => selectedReport && sendMessage(`Acione o Guardião de Qualidade para avaliar a pesquisa "${selectedReport.title}".`)}
                  disabled={!selectedReport}
                  className="mt-1 text-xs font-semibold text-purple disabled:opacity-50"
                >
                  Solicitar avaliação →
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
