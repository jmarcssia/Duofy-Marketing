"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { Badge, GhostButton } from "@/components/ui"
import { Markdown } from "@/components/markdown"
import {
  AlertTriangleIcon,
  BookIcon,
  CheckCircleIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  PlusIcon,
  RefreshIcon,
  SendIcon,
  SettingsIcon,
  SparklesIcon
} from "@/components/icons"
import {
  apiFetch,
  type AgentRun,
  type ContentOutput,
  type ContentOutputDetail,
  type ContentTheme,
  type ResearchReport
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"
import { downloadFile, exportPath } from "@/lib/download"

type ChatMsg = { id: string; role: "user" | "assistant"; text: string; time: string; pending?: boolean; error?: boolean }
type ColId = "analise" | "revisao" | "aprovado"
type Source = "institucional" | "pesquisa" | "tema"

const COLUMNS: { id: ColId; label: string; status: string }[] = [
  { id: "analise", label: "Em análise", status: "draft" },
  { id: "revisao", label: "Em revisão", status: "review" },
  { id: "aprovado", label: "Aprovado", status: "approved" }
]
const STATUS_TO_COL: Record<string, ColId> = {
  draft: "analise", needs_adjustment: "analise", rejected: "analise",
  review: "revisao", approved: "aprovado", archived: "aprovado"
}
const STATUS_LABEL: Record<string, { label: string; tone: "amber" | "blue" | "green" | "slate" }> = {
  draft: { label: "Rascunho", tone: "amber" }, review: { label: "Em revisão", tone: "blue" },
  approved: { label: "Aprovado", tone: "green" }, needs_adjustment: { label: "Ajuste", tone: "amber" },
  rejected: { label: "Rejeitado", tone: "slate" }, archived: { label: "Arquivado", tone: "slate" }
}
const CONTENT_PRESETS = [
  { label: "Instagram · Carrossel", channel: "Instagram", format: "Carrossel" },
  { label: "Instagram · Reels", channel: "Instagram", format: "Reels" },
  { label: "LinkedIn · Post", channel: "LinkedIn", format: "Post LinkedIn" },
  { label: "Blog · Artigo", channel: "Blog", format: "Blog" },
  { label: "E-mail", channel: "E-mail", format: "E-mail" }
]

function now() { return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }
function isResearch(o: { format?: string; channel?: string; category?: string }) {
  return o.format === "research_report" || o.channel === "Pesquisa" || o.category === "research"
}

export default function OperationsPage() {
  const { selected: brand } = useBrand()

  // Orquestrador
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: "intro", role: "assistant", text: "Olá! Sou o Orquestrador. Posso disparar pesquisas e gerar conteúdo — o que criar aparece no Kanban e na Cocriação de conteúdos.", time: now() }
  ])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Dados
  const [reports, setReports] = useState<ResearchReport[]>([])
  const [content, setContent] = useState<ContentOutput[]>([])
  const [themes, setThemes] = useState<ContentTheme[]>([])
  const [loading, setLoading] = useState(true)

  // Pesquisa (modal de criação)
  const [researchOpen, setResearchOpen] = useState(false)
  const [researchTheme, setResearchTheme] = useState("")
  const [researchDepth, setResearchDepth] = useState<"quick" | "standard" | "deep">("quick")
  const [researchBusy, setResearchBusy] = useState(false)

  // Criar novo conteúdo (barra da seção unificada)
  const [source, setSource] = useState<Source>("institucional")
  const [selectedResearchId, setSelectedResearchId] = useState<number | null>(null)
  const [themeId, setThemeId] = useState<number | null>(null)
  const [preset, setPreset] = useState(0)
  const [coNote, setCoNote] = useState("")
  const [genBusy, setGenBusy] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)

  // Foco (item aberto inline — conteúdo ou pesquisa)
  const [focusId, setFocusId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ContentOutputDetail | null>(null)
  const [ef, setEf] = useState<{ title: string; content: string; status: string }>({ title: "", content: "", status: "draft" })
  const [modalBusy, setModalBusy] = useState(false)
  const [modalMsg, setModalMsg] = useState<string | null>(null)
  const [refineInstr, setRefineInstr] = useState("")
  const [refineBusy, setRefineBusy] = useState(false)
  const coSectionRef = useRef<HTMLDivElement>(null)

  // Drag & drop
  const [dragId, setDragId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<ColId | null>(null)
  const justDragged = useRef(false)

  const loadData = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    setLoading(true)
    try {
      const [r, c, th] = await Promise.all([
        apiFetch<ResearchReport[]>(`/api/research/reports?limit=60`, token),
        apiFetch<ContentOutput[]>(`/api/content/outputs?limit=60${brand ? `&brand_slug=${brand}` : ""}`, token),
        apiFetch<ContentTheme[]>(`/api/calendar/themes?limit=500`, token).catch(() => [])
      ])
      setReports(brand ? r.filter((x) => x.brand_slug === brand) : r)
      setContent(c.filter((x) => !isResearch(x)))
      setThemes(th)
    } catch { setReports([]); setContent([]); setThemes([]) }
    setLoading(false)
  }, [brand])

  useEffect(() => { loadData() }, [brand]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  const selectedResearch = reports.find((r) => r.id === selectedResearchId) ?? null
  const selectedTheme = themes.find((t) => t.id === themeId) ?? null

  async function sendMessage(prompt?: string) {
    const text = (prompt ?? input).trim()
    if (!text || sending) return
    const token = getTokenFromCookie()
    if (!token) return
    const u: ChatMsg = { id: `u${Date.now()}`, role: "user", text, time: now() }
    const p: ChatMsg = { id: `p${Date.now()}`, role: "assistant", text: "Pensando…", time: now(), pending: true }
    setMessages((m) => [...m, u, p])
    setInput("")
    setSending(true)
    try {
      const run = await apiFetch<AgentRun>("/api/agents/run", token, {
        method: "POST", body: JSON.stringify({ agent_slug: "orchestrator", prompt: text, brand_slug: brand || undefined })
      })
      setMessages((m) => m.map((x) => x.id === p.id ? { ...x, text: run.output || run.error || "(sem resposta)", time: now(), pending: false, error: run.status === "failed" } : x))
      loadData()
    } catch (e: unknown) {
      setMessages((m) => m.map((x) => x.id === p.id ? { ...x, text: e instanceof Error ? e.message : "Erro.", time: now(), pending: false, error: true } : x))
    }
    setSending(false)
  }

  async function runResearch() {
    if (researchTheme.trim().length < 3) return
    const token = getTokenFromCookie()
    if (!token || !brand) { setGenMsg("Selecione uma marca."); return }
    setResearchBusy(true)
    try {
      const rep = await apiFetch<ResearchReport>("/api/research/run", token, {
        method: "POST",
        body: JSON.stringify({ brand_slug: brand, theme: researchTheme.trim(), depth: researchDepth })
      })
      setResearchOpen(false)
      setResearchTheme("")
      setMessages((m) => [...m, { id: `s${Date.now()}`, role: "assistant", text: `Pesquisa criada e enviada ao Kanban: **${rep.title}** (#${rep.id}).`, time: now() }])
      await loadData()
      setSource("pesquisa")
      setSelectedResearchId(rep.id)
    } catch (e: unknown) {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: "assistant", text: e instanceof Error ? e.message : "Falha na pesquisa.", time: now(), error: true }])
    }
    setResearchBusy(false)
  }

  async function generateContent() {
    const token = getTokenFromCookie()
    if (!token || !brand) { setGenMsg("Selecione uma marca."); return }
    let channel = CONTENT_PRESETS[preset].channel
    let format = CONTENT_PRESETS[preset].format
    let base: string
    if (source === "pesquisa") {
      if (!selectedResearch) { setGenMsg("Selecione uma pesquisa."); return }
      base = `Com base na pesquisa "${selectedResearch.title}". ${selectedResearch.briefing}`
    } else if (source === "tema") {
      if (!selectedTheme) { setGenMsg("Selecione um tema do banco."); return }
      base = `Com base no tema do banco "${selectedTheme.title}". ${selectedTheme.theme || ""}`
    } else {
      base = "Conteúdo institucional da marca."
    }
    const briefing = `${base}${coNote ? ` Observação: ${coNote}` : ""}`.slice(0, 4000)
    setGenBusy(true); setGenMsg("Gerando conteúdo com o agente…")
    try {
      const out = await apiFetch<ContentOutput>("/api/content/generate", token, {
        method: "POST",
        body: JSON.stringify({ brand_slug: brand, category: "content", channel, format, briefing, status: "draft" })
      })
      setGenMsg(`Conteúdo criado: ${out.title} (#${out.id}). Abrindo para cocriação…`)
      setCoNote("")
      await loadData()
      openFocus(out.id)
    } catch (e: unknown) {
      setGenMsg(e instanceof Error ? e.message : "Falha ao gerar conteúdo.")
    }
    setGenBusy(false)
  }

  // ── Foco (inline) ──
  const openFocus = useCallback(async (id: number) => {
    setFocusId(id); setDetail(null); setModalMsg(null); setRefineInstr("")
    coSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    const token = getTokenFromCookie()
    if (!token) return
    try {
      const d = await apiFetch<ContentOutputDetail>(`/api/outputs/${id}`, token)
      setDetail(d)
      setEf({ title: d.title, content: d.current_content ?? "", status: d.status })
    } catch { setModalMsg("Não foi possível carregar.") }
  }, [])

  function closeFocus() { setFocusId(null); setDetail(null) }

  async function saveEdit() {
    if (!focusId || !detail) return
    const token = getTokenFromCookie()
    if (!token) return
    setModalBusy(true); setModalMsg(null)
    try {
      const titleChanged = ef.title !== detail.title
      const contentChanged = ef.content !== (detail.current_content ?? "")
      const statusChanged = ef.status !== detail.status
      if (titleChanged || contentChanged) {
        await apiFetch(`/api/outputs/${focusId}`, token, { method: "PATCH", body: JSON.stringify({ title: ef.title, content: ef.content }) })
      }
      if (statusChanged) {
        await apiFetch(`/api/outputs/${focusId}/move`, token, { method: "POST", body: JSON.stringify({ status: ef.status }) })
      }
      setModalMsg("Salvo.")
      await loadData()
      const d = await apiFetch<ContentOutputDetail>(`/api/outputs/${focusId}`, token)
      setDetail(d); setEf({ title: d.title, content: d.current_content ?? "", status: d.status })
    } catch (e: unknown) { setModalMsg(e instanceof Error ? e.message : "Falha ao salvar.") }
    setModalBusy(false)
  }

  async function refineWithAgent() {
    if (!focusId || refineInstr.trim().length < 3) return
    const token = getTokenFromCookie()
    if (!token) return
    setRefineBusy(true); setModalMsg(null)
    try {
      const d = await apiFetch<ContentOutputDetail>(`/api/content/outputs/${focusId}/refine`, token, {
        method: "POST", body: JSON.stringify({ instruction: refineInstr.trim() })
      })
      setDetail(d); setEf({ title: d.title, content: d.current_content ?? "", status: d.status })
      setRefineInstr(""); setModalMsg("Conteúdo ajustado pelo agente (nova versão).")
      await loadData()
    } catch (e: unknown) { setModalMsg(e instanceof Error ? e.message : "Falha no ajuste pelo agente.") }
    setRefineBusy(false)
  }

  async function modalAction(path: string, okMsg: string) {
    if (!focusId) return
    const token = getTokenFromCookie()
    if (!token) return
    setModalBusy(true); setModalMsg(null)
    try {
      await apiFetch(`/api/outputs/${focusId}/${path}`, token, { method: "POST", body: JSON.stringify({}) })
      setModalMsg(okMsg)
      await loadData()
      const d = await apiFetch<ContentOutputDetail>(`/api/outputs/${focusId}`, token)
      setDetail(d); setEf((f) => ({ ...f, status: d.status }))
    } catch (e: unknown) { setModalMsg(e instanceof Error ? e.message : "Falha.") }
    setModalBusy(false)
  }

  async function exportPdf() {
    if (!focusId) return
    const token = getTokenFromCookie()
    if (!token) return
    try { await downloadFile(exportPath(`/api/outputs/${focusId}`, "pdf"), token, `duofy-${focusId}.pdf`) } catch { /* ignore */ }
  }

  async function saveResearchMemory() {
    if (!focusId) return
    const token = getTokenFromCookie()
    if (!token) return
    setModalBusy(true)
    try { await apiFetch(`/api/research/reports/${focusId}/save-memory`, token, { method: "POST", body: JSON.stringify({}) }); setModalMsg("Salvo na memória.") }
    catch (e: unknown) { setModalMsg(e instanceof Error ? e.message : "Falha.") }
    setModalBusy(false)
  }

  // ── Drag & drop ──
  async function dropTo(col: ColId) {
    setDragOver(null)
    const id = dragId
    setDragId(null)
    if (!id) return
    const target = COLUMNS.find((c) => c.id === col)?.status
    if (!target) return
    const rep = reports.find((r) => r.id === id)
    if (!rep || STATUS_TO_COL[rep.status] === col) return
    setReports((rs) => rs.map((r) => r.id === id ? { ...r, status: target } : r)) // otimista
    const token = getTokenFromCookie()
    if (!token) return
    try { await apiFetch(`/api/outputs/${id}/move`, token, { method: "POST", body: JSON.stringify({ status: target }) }) }
    catch { await loadData() }
  }

  const focusIsResearch = detail ? isResearch(detail) : false

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Orquestrador */}
        <section className="duofy-card flex flex-col rounded-2xl p-5" style={{ maxHeight: "calc(100vh - 130px)" }}>
          <div className="mb-4 flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-purple" />
            <h2 className="text-base font-bold tracking-[-0.02em] text-ink">Orquestrador</h2>
            <Badge tone="green">conectado</Badge>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto duofy-scroll pr-1">
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
          <div className="mt-4 flex flex-wrap gap-2">
            <GhostButton className="text-xs" onClick={() => setResearchOpen(true)}><PlusIcon className="h-4 w-4" /> Nova pesquisa</GhostButton>
            <GhostButton className="text-xs" onClick={() => coSectionRef.current?.scrollIntoView({ behavior: "smooth" })}><SparklesIcon className="h-4 w-4" /> Cocriar conteúdo</GhostButton>
            <GhostButton className="text-xs" onClick={loadData}><RefreshIcon className="h-4 w-4" /> Atualizar</GhostButton>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} disabled={sending} className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted disabled:opacity-60" placeholder="Pergunte algo ao Orquestrador..." />
            <button onClick={() => sendMessage()} disabled={sending || !input.trim()} className="grid h-8 w-8 place-items-center rounded-lg bg-purple text-white disabled:opacity-50" aria-label="Enviar">
              {sending ? <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> : <SendIcon className="h-4 w-4" />}
            </button>
          </div>
        </section>

        {/* Kanban */}
        <section className="duofy-card rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold tracking-[-0.02em] text-ink">Kanban de Pesquisas</h2>
              <p className="text-xs text-muted">Clique para abrir · arraste entre colunas para mudar o status.</p>
            </div>
            <button onClick={() => setResearchOpen(true)} className="duofy-tap flex items-center gap-1.5 rounded-lg bg-purple px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-deep">
              <PlusIcon className="h-4 w-4" /> Nova pesquisa
            </button>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="duofy-skeleton h-40 rounded-xl" />)}</div>
          ) : reports.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-line py-16 text-center">
              <p className="text-sm text-muted">Nenhuma pesquisa ainda.</p>
              <button onClick={() => setResearchOpen(true)} className="mt-2 text-sm font-semibold text-purple">Criar primeira pesquisa →</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {COLUMNS.map((col) => {
                const cards = reports.filter((r) => (STATUS_TO_COL[r.status] ?? "analise") === col.id)
                return (
                  <div
                    key={col.id}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(col.id) }}
                    onDragLeave={() => setDragOver((c) => c === col.id ? null : c)}
                    onDrop={(e) => { e.preventDefault(); dropTo(col.id) }}
                    className={`flex min-h-[120px] flex-col rounded-xl p-1 transition ${dragOver === col.id ? "bg-purple-soft/60 ring-1 ring-purple/40" : ""}`}
                  >
                    <div className="mb-2 flex items-center justify-between px-2 pt-1">
                      <span className="text-sm font-semibold text-ink">{col.label}</span>
                      <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-line/70 px-1 text-xs font-semibold text-muted">{cards.length}</span>
                    </div>
                    <div className="space-y-2.5 px-1">
                      {cards.map((card) => {
                        const st = STATUS_LABEL[card.status] ?? { label: card.status, tone: "slate" as const }
                        return (
                          <div
                            key={card.id}
                            draggable
                            onDragStart={() => setDragId(card.id)}
                            onDragEnd={() => { justDragged.current = true; setDragId(null); setDragOver(null); setTimeout(() => { justDragged.current = false }, 150) }}
                            onClick={() => { if (!justDragged.current) { setSelectedResearchId(card.id); openFocus(card.id) } }}
                            className={`cursor-grab rounded-xl border bg-white p-3.5 transition active:cursor-grabbing ${dragId === card.id ? "opacity-40" : focusId === card.id ? "border-purple shadow-soft" : "border-line hover:border-purple/40 hover:shadow-soft"}`}
                          >
                            <p className="text-sm font-semibold leading-snug text-ink">{card.title}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Badge tone={st.tone}>{st.label}</Badge>
                              <Badge tone="slate">{card.category}</Badge>
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs text-muted">{card.briefing}</p>
                            <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-xs text-muted">
                              <span>{card.sources?.length ?? 0} fontes</span><span>#{card.id}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Cocriação de conteúdos — seção única (Lista ⇄ Foco) */}
      <section ref={coSectionRef} id="cocriacao" className="duofy-card rounded-2xl p-5">
        {focusId === null ? (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Cocriação de conteúdos</h2>
              <p className="text-xs text-muted">Crie a partir de uma pesquisa, de um tema do banco ou institucional — e clique num conteúdo para cocriar.</p>
            </div>

            {/* Barra: criar novo */}
            <div className="rounded-xl border border-line bg-panel/50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted">Base:</span>
                {([["institucional", "Institucional"], ["pesquisa", "Pesquisa"], ["tema", "Banco de temas"]] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setSource(id)} className={`duofy-tap rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${source === id ? "border-purple bg-purple-soft/60 text-purple-deep" : "border-line text-muted hover:border-purple/40"}`}>{label}</button>
                ))}
                {source === "pesquisa" && (
                  <select value={selectedResearchId ?? ""} onChange={(e) => setSelectedResearchId(e.target.value ? Number(e.target.value) : null)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-purple focus:outline-none">
                    <option value="">Selecione a pesquisa…</option>
                    {reports.map((r) => <option key={r.id} value={r.id}>#{r.id} · {r.title}</option>)}
                  </select>
                )}
                {source === "tema" && (
                  <select value={themeId ?? ""} onChange={(e) => setThemeId(e.target.value ? Number(e.target.value) : null)} className="min-w-[260px] max-w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-purple focus:outline-none">
                    <option value="">Selecione um tema do banco…</option>
                    {themes.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {CONTENT_PRESETS.map((p, i) => (
                  <button key={p.label} onClick={() => setPreset(i)} className={`duofy-tap rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${preset === i ? "border-purple bg-purple-soft/60 text-purple-deep" : "border-line text-muted hover:border-purple/40"}`}>{p.label}</button>
                ))}
                {source === "tema" && selectedTheme?.kind && <Badge tone="purple">{selectedTheme.kind}</Badge>}
              </div>
              <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end">
                <textarea value={coNote} onChange={(e) => setCoNote(e.target.value)} rows={2} placeholder="Observação / direcionamento opcional." className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" />
                <button onClick={generateContent} disabled={genBusy || !brand} className="duofy-tap flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-purple px-5 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
                  {genBusy ? <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Gerando…</> : <><SparklesIcon className="h-4 w-4" /> Gerar conteúdo</>}
                </button>
              </div>
              {genMsg && <p className="mt-2 text-xs text-muted">{genMsg}</p>}
              {!brand && <p className="mt-2 text-xs text-red-600">Selecione uma marca no topo.</p>}
            </div>

            {/* Lista de conteúdos */}
            <div className="mt-5">
              {loading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="duofy-skeleton h-28 rounded-xl" />)}</div>
              ) : content.length === 0 ? (
                <div className="grid place-items-center rounded-xl border border-dashed border-line py-10 text-center text-sm text-muted">
                  Nenhum conteúdo ainda. Gere o primeiro na barra acima.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {content.map((c) => {
                    const st = STATUS_LABEL[c.status] ?? { label: c.status, tone: "slate" as const }
                    return (
                      <button key={c.id} onClick={() => openFocus(c.id)} className="duofy-card-hover flex flex-col rounded-xl border border-line bg-white p-4 text-left">
                        <div className="flex items-start justify-between gap-2">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-soft text-purple"><FileIcon className="h-4 w-4" /></span>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm font-semibold text-ink">{c.title}</p>
                        <p className="mt-0.5 text-xs text-muted">{c.channel} · {c.format} · #{c.id}</p>
                        <p className="mt-1.5 line-clamp-2 text-xs text-muted">{c.briefing}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Foco — apenas o item manejado */
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <button onClick={closeFocus} className="duofy-tap flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple">← Voltar</button>
              <div className="min-w-0 flex-1 text-right">
                <p className="truncate text-sm font-bold text-ink">{detail ? (focusIsResearch ? "Pesquisa" : "Cocriação") : "Carregando…"} #{focusId}</p>
                {detail && <p className="truncate text-xs text-muted">{detail.channel} · {detail.provider}/{detail.model.replace("~", "")}</p>}
              </div>
            </div>

            {!detail ? (
              <div className="grid place-items-center py-16 text-sm text-muted">Carregando…</div>
            ) : (
              <div className="space-y-4">
                <label className="block text-xs font-semibold text-muted">Título
                  <input value={ef.title} onChange={(e) => setEf({ ...ef, title: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink focus:border-purple focus:outline-none" />
                </label>
                <label className="block text-xs font-semibold text-muted">Status
                  <select value={ef.status} onChange={(e) => setEf({ ...ef, status: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                    {["draft", "review", "approved", "needs_adjustment", "rejected", "archived"].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]?.label ?? s}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-muted">Conteúdo (Markdown)
                  <textarea value={ef.content} onChange={(e) => setEf({ ...ef, content: e.target.value })} rows={16} className="mt-1 w-full resize-y rounded-lg border border-line px-3 py-2 font-mono text-xs leading-relaxed text-ink focus:border-purple focus:outline-none" />
                </label>

                {!focusIsResearch && (
                  <div className="rounded-xl border border-purple/30 bg-purple-soft/30 p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-purple-deep"><SparklesIcon className="h-4 w-4" /> Pedir ajuste ao agente</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input value={refineInstr} onChange={(e) => setRefineInstr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && refineWithAgent()} placeholder="Ex.: encurte, deixe o CTA mais direto, tom mais formal…" className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
                      <button onClick={refineWithAgent} disabled={refineBusy || refineInstr.trim().length < 3} className="duofy-tap flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-purple px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
                        {refineBusy ? "Ajustando…" : "Ajustar"}
                      </button>
                    </div>
                  </div>
                )}

                {detail.quality_notes?.length > 0 && (
                  <div className="rounded-lg border border-line bg-panel/60 p-3">
                    <p className="mb-1 text-xs font-semibold text-ink">Notas de qualidade</p>
                    <ul className="space-y-1">{detail.quality_notes.map((n, i) => <li key={i} className="flex gap-2 text-xs text-muted"><span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />{n}</li>)}</ul>
                  </div>
                )}
                {"sources" in detail && Array.isArray((detail as unknown as ResearchReport).sources) && (detail as unknown as ResearchReport).sources.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-ink">Fontes</p>
                    <ul className="space-y-1.5">
                      {(detail as unknown as ResearchReport).sources.slice(0, 8).map((s) => (
                        <li key={s.id} className="rounded-lg border border-line p-2 text-xs">
                          <span className="font-semibold text-ink">{s.title}</span>
                          {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-purple hover:underline">{s.url}</a>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {modalMsg && <p className="text-xs font-medium text-purple-deep">{modalMsg}</p>}

                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  <button onClick={saveEdit} disabled={modalBusy} className="duofy-tap flex items-center gap-1.5 rounded-lg bg-purple px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50"><CheckCircleIcon className="h-4 w-4" /> Salvar</button>
                  <button onClick={() => modalAction("approve", "Aprovado.")} disabled={modalBusy} className="duofy-tap rounded-lg border border-line px-3 py-2 text-sm font-medium text-green hover:border-green/40 disabled:opacity-50">Aprovar</button>
                  <button onClick={() => modalAction("request-adjustment", "Ajuste solicitado.")} disabled={modalBusy} className="duofy-tap flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple disabled:opacity-50"><SettingsIcon className="h-4 w-4" /> Ajuste</button>
                  {focusIsResearch && <button onClick={saveResearchMemory} disabled={modalBusy} className="duofy-tap flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple disabled:opacity-50"><BookIcon className="h-4 w-4" /> Memória</button>}
                  <button onClick={exportPdf} className="duofy-tap flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple"><DownloadIcon className="h-4 w-4" /> PDF</button>
                  <button onClick={() => navigator.clipboard?.writeText(ef.content)} className="duofy-tap flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple"><CopyIcon className="h-4 w-4" /> Copiar</button>
                  <button onClick={() => modalAction("archive", "Arquivado.")} disabled={modalBusy} className="duofy-tap ml-auto flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted hover:border-red/40 hover:text-red disabled:opacity-50"><AlertTriangleIcon className="h-4 w-4" /> Arquivar</button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Modal de criação de pesquisa */}
      {researchOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={() => setResearchOpen(false)} aria-hidden="true" />
          <div className="relative w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-panel animate-scale-in">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">Nova pesquisa</h3>
              <button onClick={() => setResearchOpen(false)} className="text-muted hover:text-ink"><CloseIcon className="h-5 w-5" /></button>
            </div>
            <label className="block text-xs font-semibold text-muted">Tema
              <input value={researchTheme} onChange={(e) => setResearchTheme(e.target.value)} placeholder="Ex: tendências de IA para gestão de postos em 2026" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" autoFocus />
            </label>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-semibold text-muted">Profundidade:</span>
              {(["quick", "standard", "deep"] as const).map((d) => (
                <button key={d} onClick={() => setResearchDepth(d)} className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${researchDepth === d ? "bg-purple text-white" : "border border-line text-muted"}`}>{d === "quick" ? "Rápida" : d === "standard" ? "Padrão" : "Profunda"}</button>
              ))}
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={runResearch} disabled={researchBusy || researchTheme.trim().length < 3 || !brand} className="duofy-tap flex-1 rounded-lg bg-purple py-2.5 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
                {researchBusy ? "Pesquisando…" : "Criar pesquisa"}
              </button>
              <button onClick={() => setResearchOpen(false)} className="duofy-tap rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface">Cancelar</button>
            </div>
            {!brand && <p className="mt-2 text-xs text-red-600">Selecione uma marca no topo.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
