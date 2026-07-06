"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useState } from "react"

import { Markdown } from "@/components/markdown"
import {
  AlertTriangleIcon,
  BookIcon,
  CalendarIcon,
  CheckCircleIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  SettingsIcon,
  SparklesIcon
} from "@/components/icons"
import { Badge, GhostButton, PageHeader, Segmented, Spinner, type Tone } from "@/components/ui"
import {
  apiFetch,
  type ContentOutput,
  type ContentOutputDetail,
  type ContentTheme,
  type ResearchReport
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { friendlyError } from "@/lib/friendly-error"
import { useBrand } from "@/lib/brand-context"
import { downloadFile, exportPath } from "@/lib/download"

import { CocreationPanel } from "../operations/CocreationPanel"
import { PiecesReview } from "../operations/PiecesReview"

type Mode = "lista" | "estruturado"
type Source = "institucional" | "pesquisa" | "tema"

const STATUS_LABEL: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "amber" },
  review: { label: "Em revisão", tone: "blue" },
  approved: { label: "Aprovado", tone: "green" },
  needs_adjustment: { label: "Ajuste", tone: "amber" },
  rejected: { label: "Rejeitado", tone: "slate" },
  archived: { label: "Arquivado", tone: "slate" }
}
const CONTENT_PRESETS = [
  { label: "Instagram · Carrossel", channel: "Instagram", format: "Carrossel" },
  { label: "Instagram · Reels", channel: "Instagram", format: "Reels" },
  { label: "LinkedIn · Post", channel: "LinkedIn", format: "Post LinkedIn" },
  { label: "Blog · Artigo", channel: "Blog", format: "Blog" },
  { label: "E-mail", channel: "E-mail", format: "E-mail" }
]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
function isResearch(o: { format?: string; channel?: string; category?: string }) {
  return o.format === "research_report" || o.channel === "Pesquisa" || o.category === "research"
}

function CocreationInner() {
  const params = useSearchParams()
  const research = params.get("research") ?? undefined
  const { selected: brand } = useBrand()

  const [mode, setMode] = useState<Mode>("estruturado")
  const [content, setContent] = useState<ContentOutput[]>([])
  const [reports, setReports] = useState<ResearchReport[]>([])
  const [themes, setThemes] = useState<ContentTheme[]>([])
  const [loading, setLoading] = useState(true)

  // criar (simples)
  const [source, setSource] = useState<Source>("institucional")
  const [researchId, setResearchId] = useState<string>("")
  const [themeId, setThemeId] = useState<string>("")
  const [preset, setPreset] = useState(0)
  const [note, setNote] = useState("")
  const [genBusy, setGenBusy] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)

  // foco (editar um conteúdo)
  const [focusId, setFocusId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ContentOutputDetail | null>(null)
  const [ef, setEf] = useState({ title: "", content: "", status: "draft" })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [refineInstr, setRefineInstr] = useState("")
  const [refineBusy, setRefineBusy] = useState(false)

  const bq = brand ? `&brand_slug=${encodeURIComponent(brand)}` : ""

  const loadData = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    setLoading(true)
    try {
      const [c, r, t] = await Promise.all([
        apiFetch<ContentOutput[]>(`/api/content/outputs?limit=60${bq}`, token).catch(() => []),
        apiFetch<ResearchReport[]>(`/api/research/reports?limit=40${bq}`, token).catch(() => []),
        apiFetch<ContentTheme[]>(`/api/themes?limit=500`, token).catch(() => [])
      ])
      setContent(c.filter((x) => !isResearch(x)))
      setReports(r)
      setThemes(t)
    } catch { /* vazio */ }
    setLoading(false)
  }, [bq])

  useEffect(() => { void loadData() }, [loadData])

  const openFocus = useCallback(async (id: number) => {
    setFocusId(id); setDetail(null); setMsg(null); setRefineInstr("")
    const token = getTokenFromCookie()
    if (!token) return
    try {
      const d = await apiFetch<ContentOutputDetail>(`/api/outputs/${id}`, token)
      setDetail(d)
      setEf({ title: d.title, content: d.current_content ?? "", status: d.status })
    } catch { setMsg("Não foi possível carregar o conteúdo.") }
  }, [])

  async function generateContent() {
    const token = getTokenFromCookie()
    if (!token || !brand) { setGenMsg("Selecione uma marca no topo."); return }
    const { channel, format } = CONTENT_PRESETS[preset]
    let base: string
    if (source === "pesquisa") {
      const r = reports.find((x) => String(x.id) === researchId)
      if (!r) { setGenMsg("Selecione uma pesquisa."); return }
      base = `Com base na pesquisa "${r.title}". ${r.briefing}`
    } else if (source === "tema") {
      const t = themes.find((x) => String(x.id) === themeId)
      if (!t) { setGenMsg("Selecione um tema do banco."); return }
      base = `Com base no tema "${t.title}". ${t.theme || ""}`
    } else {
      base = "Conteúdo institucional da marca."
    }
    const briefing = `${base}${note ? ` Observação: ${note}` : ""}`.slice(0, 4000)
    const body = JSON.stringify({ brand_slug: brand, category: "content", channel, format, briefing, status: "draft" })

    setGenBusy(true); setGenMsg("Gerando conteúdo com o agente — costuma levar 1 a 2 min. Você pode continuar; o conteúdo aparece na lista ao concluir.")
    // Resiliência ao timeout do proxy: dispara o POST e faz polling do output novo.
    let known = new Set(content.map((c) => c.id))
    try {
      const cur = await apiFetch<ContentOutput[]>(`/api/content/outputs?limit=60${bq}`, token)
      known = new Set(cur.filter((x) => !isResearch(x)).map((c) => c.id))
    } catch { /* usa o estado atual */ }
    let done = false
    let postError: string | null = null
    const post = apiFetch<ContentOutput>("/api/content/generate", token, { method: "POST", body })
      .then((out) => { if (!done) { done = true; setNote(""); void loadData(); openFocus(out.id) } })
      .catch((e: unknown) => { postError = friendlyError(e, "Não foi possível gerar o conteúdo. Revise os filtros e tente novamente.") })
    const start = Date.now()
    while (!done && Date.now() - start < 150_000) {
      await sleep(4000)
      if (done) break
      try {
        const latest = await apiFetch<ContentOutput[]>(`/api/content/outputs?limit=60${bq}`, token)
        const fresh = latest.filter((x) => !isResearch(x)).find((c) => !known.has(c.id))
        if (fresh) { done = true; setContent(latest.filter((x) => !isResearch(x))); setNote(""); openFocus(fresh.id); break }
      } catch { /* segue */ }
    }
    await post.catch(() => {})
    if (!done) setGenMsg(postError ?? "A geração está demorando (1 a 2 min é normal). Você pode continuar; o conteúdo aparece aqui na lista de \"Conteúdos\" ao concluir.")
    setGenBusy(false)
  }

  async function saveEdit() {
    if (!focusId || !detail) return
    const token = getTokenFromCookie()
    if (!token) return
    setBusy(true); setMsg(null)
    try {
      if (ef.title !== detail.title || ef.content !== (detail.current_content ?? "")) {
        await apiFetch(`/api/outputs/${focusId}`, token, { method: "PATCH", body: JSON.stringify({ title: ef.title, content: ef.content }) })
      }
      if (ef.status !== detail.status) {
        await apiFetch(`/api/outputs/${focusId}/move`, token, { method: "POST", body: JSON.stringify({ status: ef.status }) })
      }
      setMsg("Salvo.")
      await openFocus(focusId)
      await loadData()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Falha ao salvar.") }
    setBusy(false)
  }

  async function refineWithAgent() {
    if (!focusId || refineInstr.trim().length < 3) return
    const token = getTokenFromCookie()
    if (!token) return
    setRefineBusy(true); setMsg(null)
    try {
      const d = await apiFetch<ContentOutputDetail>(`/api/content/outputs/${focusId}/refine`, token, {
        method: "POST", body: JSON.stringify({ instruction: refineInstr.trim() })
      })
      setDetail(d); setEf({ title: d.title, content: d.current_content ?? "", status: d.status })
      setRefineInstr(""); setMsg("Conteúdo ajustado pelo agente (nova versão).")
      await loadData()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Falha no ajuste pelo agente.") }
    setRefineBusy(false)
  }

  async function action(path: string, okMsg: string) {
    if (!focusId) return
    const token = getTokenFromCookie()
    if (!token) return
    setBusy(true); setMsg(null)
    try {
      await apiFetch(`/api/outputs/${focusId}/${path}`, token, { method: "POST", body: "{}" })
      setMsg(okMsg)
      await openFocus(focusId)
      await loadData()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Falha.") }
    setBusy(false)
  }

  // Roda o Guardião (submit-review) e atualiza a tela. Devolve o detail resultante (status 'review' | 'needs_adjustment').
  async function runReview(token: string): Promise<ContentOutputDetail> {
    const d = await apiFetch<ContentOutputDetail>(`/api/content/outputs/${focusId}/submit-review`, token, { method: "POST", body: "{}" })
    setDetail(d); setEf({ title: d.title, content: d.current_content ?? "", status: d.status })
    return d
  }

  // Botão discreto: só envia para revisão e mostra o resultado/score do Guardião.
  async function submitReview() {
    if (!focusId) return
    const token = getTokenFromCookie()
    if (!token) return
    setBusy(true); setMsg(null)
    try {
      const d = await runReview(token)
      const note = d.quality_notes?.[0]
      if (d.status === "needs_adjustment") {
        setMsg(`Guardião pediu ajuste antes de aprovar.${note ? ` ${note}` : ""}`)
      } else if (d.status === "review") {
        setMsg("Enviado para revisão pelo Guardião — pronto para aprovar.")
      } else {
        setMsg("Enviado para revisão.")
      }
      await loadData()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Falha ao enviar para revisão.") }
    setBusy(false)
  }

  // Aprovar sem atrito: se ainda está em draft/needs_adjustment, roda o Guardião primeiro.
  async function approveOutput() {
    if (!focusId || !detail) return
    const token = getTokenFromCookie()
    if (!token) return
    setBusy(true); setMsg(null)
    try {
      let status = detail.status
      if (status === "draft" || status === "needs_adjustment") {
        const d = await runReview(token)
        status = d.status
        if (status !== "review") {
          const note = d.quality_notes?.[0]
          setMsg(`Guardião pediu ajuste — não aprovado.${note ? ` ${note}` : ""}`)
          await loadData()
          setBusy(false)
          return
        }
      }
      await apiFetch(`/api/outputs/${focusId}/approve`, token, { method: "POST", body: "{}" })
      setMsg("Aprovado.")
      await openFocus(focusId)
      await loadData()
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Falha ao aprovar.") }
    setBusy(false)
  }

  async function exportPdf() {
    if (!focusId) return
    const token = getTokenFromCookie()
    if (!token) return
    try {
      await downloadFile(exportPath(`/api/outputs/${focusId}`, "pdf"), token, `duofy-${focusId}.pdf`)
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Falha ao exportar o PDF.")
    }
  }

  // ---- Foco (editar um conteúdo) ----
  if (focusId !== null) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => { setFocusId(null); setDetail(null) }} className="duofy-tap inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple">← Conteúdos</button>
          {detail && <p className="truncate text-xs text-muted">{detail.channel} · {detail.provider}/{detail.model.replace("~", "")}</p>}
        </div>
        {!detail ? (
          <div className="grid place-items-center py-20"><Spinner size={22} className="text-purple" /></div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="duofy-card space-y-4 rounded-2xl p-5">
              <label className="block text-xs font-semibold text-muted">Título
                <input value={ef.title} onChange={(e) => setEf({ ...ef, title: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink focus:border-purple focus:outline-none" />
              </label>
              <label className="block text-xs font-semibold text-muted">Status
                <select value={ef.status} onChange={(e) => setEf({ ...ef, status: e.target.value })} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none">
                  {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s].label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-muted">Conteúdo (Markdown)
                <textarea value={ef.content} onChange={(e) => setEf({ ...ef, content: e.target.value })} rows={16} className="mt-1 w-full resize-y rounded-lg border border-line px-3 py-2 font-mono text-xs leading-relaxed text-ink focus:border-purple focus:outline-none" />
              </label>

              <div className="rounded-xl border border-purple/30 bg-purple-soft/30 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-purple-deep"><SparklesIcon className="h-4 w-4" /> Pedir ajuste ao agente</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input value={refineInstr} onChange={(e) => setRefineInstr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && refineWithAgent()} placeholder="Ex.: encurte, CTA mais direto, tom mais formal…" className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
                  <button onClick={refineWithAgent} disabled={refineBusy || refineInstr.trim().length < 3} className="duofy-tap shrink-0 rounded-lg bg-purple px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">{refineBusy ? "Ajustando…" : "Ajustar"}</button>
                </div>
              </div>

              {msg && <p className="text-xs font-medium text-purple-deep">{msg}</p>}
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <button onClick={saveEdit} disabled={busy} className="duofy-tap inline-flex items-center gap-1.5 rounded-lg bg-purple px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50"><CheckCircleIcon className="h-4 w-4" /> Salvar</button>
                {(detail.status === "draft" || detail.status === "needs_adjustment") && (
                  <GhostButton onClick={submitReview} disabled={busy}>Enviar para revisão</GhostButton>
                )}
                <button onClick={approveOutput} disabled={busy} className="duofy-tap rounded-lg border border-line px-3 py-2 text-sm font-medium text-green hover:border-green/40 disabled:opacity-50">Aprovar</button>
                <button onClick={() => action("request-adjustment", "Ajuste solicitado.")} disabled={busy} className="duofy-tap inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple disabled:opacity-50"><SettingsIcon className="h-4 w-4" /> Ajuste</button>
                <button onClick={exportPdf} className="duofy-tap inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple"><DownloadIcon className="h-4 w-4" /> PDF</button>
                <button onClick={() => navigator.clipboard?.writeText(ef.content)} className="duofy-tap inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple"><CopyIcon className="h-4 w-4" /> Copiar</button>
                <button onClick={() => action("archive", "Arquivado.")} disabled={busy} className="duofy-tap ml-auto inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted hover:border-red/40 hover:text-red disabled:opacity-50"><AlertTriangleIcon className="h-4 w-4" /> Arquivar</button>
              </div>
            </div>

            <div className="space-y-4">
              <PiecesReview outputId={focusId} onChanged={() => { void openFocus(focusId); void loadData() }} />
              {detail.quality_notes?.length > 0 && (
                <div className="duofy-card rounded-2xl p-4">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink"><BookIcon className="h-4 w-4 text-purple" /> Notas de qualidade</p>
                  <ul className="space-y-1">{detail.quality_notes.map((n, i) => <li key={i} className="flex gap-2 text-xs text-muted"><span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />{n}</li>)}</ul>
                </div>
              )}
              <div className="duofy-card rounded-2xl p-4">
                <p className="mb-1 text-xs font-semibold text-ink">Prévia</p>
                <div className="max-h-80 overflow-y-auto duofy-scroll"><Markdown content={ef.content || "_Sem conteúdo._"} /></div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---- Lista + criação ----
  return (
    <div className="space-y-6">
      <PageHeader
        title="Agente de Cocriação"
        subtitle="Gere e gerencie os conteúdos por canal — a partir de um briefing ou de uma pesquisa aprovada."
        icon={<SparklesIcon className="h-5 w-5" />}
        right={
          <Link href="/calendar" className="duofy-tap inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple">
            <CalendarIcon className="h-4 w-4" /> Voltar ao Calendário
          </Link>
        }
      />

      <div className="flex items-start gap-3 rounded-2xl border border-purple/20 bg-purple-soft/40 p-4">
        <SparklesIcon className="mt-0.5 h-5 w-5 shrink-0 text-purple" />
        <div className="text-sm text-ink">
          <p className="font-semibold">A cocriação pode começar de três formas.</p>
          <p className="mt-0.5 text-muted">Por <strong>briefing manual</strong>, por uma <strong>pesquisa aprovada</strong> vinculada ou por um <strong>template</strong> pronto. Gera roteiro, legendas e <strong>prompts visuais</strong> — não gera a imagem final.{research ? ` Pesquisa #${research} pré-vinculada.` : ""}</p>
        </div>
      </div>

      <Segmented options={[{ id: "lista", label: "Conteúdos & rascunhos" }, { id: "estruturado", label: "Pacote estruturado" }]} value={mode} onChange={setMode} />

      {mode === "estruturado" ? (
        <CocreationPanel initialResearchId={research} />
      ) : (
        <>
          {/* Barra criar */}
          <div className="duofy-card rounded-2xl p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted">Base:</span>
              {([["institucional", "Institucional"], ["pesquisa", "Pesquisa"], ["tema", "Banco de temas"]] as const).map(([id, label]) => (
                <button key={id} onClick={() => setSource(id)} className={`duofy-tap rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${source === id ? "border-purple bg-purple-soft/60 text-purple-deep" : "border-line text-muted hover:border-purple/40"}`}>{label}</button>
              ))}
              {source === "pesquisa" && (
                <select value={researchId} onChange={(e) => setResearchId(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-purple focus:outline-none">
                  <option value="">Selecione a pesquisa…</option>
                  {reports.map((r) => <option key={r.id} value={r.id}>#{r.id} · {r.title}</option>)}
                </select>
              )}
              {source === "tema" && (
                <select value={themeId} onChange={(e) => setThemeId(e.target.value)} className="min-w-[240px] rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink focus:border-purple focus:outline-none">
                  <option value="">Selecione um tema…</option>
                  {themes.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {CONTENT_PRESETS.map((p, i) => (
                <button key={p.label} onClick={() => setPreset(i)} className={`duofy-tap rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${preset === i ? "border-purple bg-purple-soft/60 text-purple-deep" : "border-line text-muted hover:border-purple/40"}`}>{p.label}</button>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Observação / direcionamento (opcional)." className="w-full resize-none rounded-xl border border-line px-3 py-2.5 text-sm text-ink focus:border-purple focus:outline-none" />
              <button onClick={generateContent} disabled={genBusy || !brand} className="duofy-tap flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-purple px-5 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
                {genBusy ? <><Spinner size={16} /> Gerando…</> : <><SparklesIcon className="h-4 w-4" /> Gerar conteúdo</>}
              </button>
            </div>
            {genMsg && <p className="mt-2 text-xs text-muted">{genMsg}</p>}
          </div>

          {/* Lista de conteúdos */}
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="duofy-skeleton h-28 rounded-xl" />)}</div>
          ) : content.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-line py-14 text-center text-sm text-muted">Nenhum conteúdo ainda. Gere o primeiro na barra acima.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {content.map((c) => {
                const st = STATUS_LABEL[c.status] ?? { label: c.status, tone: "slate" as Tone }
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
        </>
      )}
    </div>
  )
}

export default function CocreationPage() {
  return (
    <Suspense fallback={<div className="grid place-items-center py-20"><Spinner size={22} className="text-purple" /></div>}>
      <CocreationInner />
    </Suspense>
  )
}
