"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge, GhostButton, StatCard, useToast } from "@/components/ui"
import {
  BookIcon,
  BookmarkIcon,
  ClockIcon,
  CloseIcon,
  DownloadIcon,
  FileIcon,
  LayersIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon
} from "@/components/icons"
import {
  apiFetch,
  type ContentTheme,
  type DocumentChunk,
  type DocumentItem,
  type MemorySearchResult,
  type ResearchTheme
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { friendlyError } from "@/lib/friendly-error"
import { useBrand } from "@/lib/brand-context"
import { downloadFile, exportPath } from "@/lib/download"

type Toast = (message: string, tone?: "default" | "positive" | "danger") => void

async function downloadDoc(id: number, name: string, toast: Toast) {
  const token = getTokenFromCookie()
  if (!token) return
  try {
    await downloadFile(`/api/documents/${id}/download`, token, name)
  } catch {
    // O arquivo original pode não estar no disco (ex.: reindexado/seed). Sugere o PDF.
    toast("Original indisponível. Use “Exportar PDF” para gerar do conteúdo indexado.", "danger")
  }
}

async function exportDoc(id: number, name: string, toast: Toast) {
  const token = getTokenFromCookie()
  if (!token) return
  try {
    await downloadFile(exportPath(`/api/documents/${id}`, "pdf"), token, `${name}.pdf`)
  } catch (e: unknown) {
    toast(friendlyError(e, "Falha ao exportar o documento."), "danger")
  }
}

type MemoryEntry = {
  id: number
  brand_slug: string
  category: string
  source_type: string
  title: string
  content: string
  created_at: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ""  // C5: mesmo-origem (proxy /api)

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
  } catch {
    return iso
  }
}

function fmtRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const h = Math.floor(diff / 3.6e6)
    if (h < 1) return "agora há pouco"
    if (h < 24) return `há ${h}h`
    const d = Math.floor(h / 24)
    return `há ${d}d`
  } catch {
    return ""
  }
}

export default function MemoryPage() {
  const toast = useToast()
  const { selected: brand } = useBrand()
  const [docs, setDocs] = useState<DocumentItem[]>([])
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null)
  const [chunks, setChunks] = useState<DocumentChunk[] | null>(null)
  const [chunksLoading, setChunksLoading] = useState(false)

  // Upload de documento (RAG)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadBrand, setUploadBrand] = useState<string>("")
  const [uploadCategory, setUploadCategory] = useState("general")
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)

  // filters / search
  const [filter, setFilter] = useState("")
  const [ragQuery, setRagQuery] = useState("")
  const [ragResults, setRagResults] = useState<MemorySearchResult[] | null>(null)
  const [ragLoading, setRagLoading] = useState(false)

  // Banco de temas (contexto da cocriação) — gerenciado aqui na Memória
  const [themes, setThemes] = useState<ContentTheme[]>([])
  const [themeBusy, setThemeBusy] = useState(false)
  const [themeMsg, setThemeMsg] = useState<string | null>(null)
  const [newTheme, setNewTheme] = useState({ title: "", theme: "", kind: "" })
  const [themeFilter, setThemeFilter] = useState("")

  // Banco de temas de pesquisa — contexto para pesquisa/briefing
  const [researchThemes, setResearchThemes] = useState<ResearchTheme[]>([])
  const [newRTheme, setNewRTheme] = useState({ title: "", notes: "" })
  const [rThemeBusy, setRThemeBusy] = useState(false)
  const [rThemeMsg, setRThemeMsg] = useState<string | null>(null)
  const [rThemeFilter, setRThemeFilter] = useState("")

  const loadThemes = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) return
    try {
      setThemes(await apiFetch<ContentTheme[]>("/api/themes?limit=500", token))
    } catch { setThemes([]) }
  }, [])

  useEffect(() => { loadThemes() }, [loadThemes])

  async function createTheme() {
    const token = getTokenFromCookie()
    if (!token || newTheme.title.trim().length < 2) return
    setThemeBusy(true); setThemeMsg(null)
    try {
      await apiFetch("/api/themes", token, {
        method: "POST",
        body: JSON.stringify({
          title: newTheme.title.trim(),
          theme: newTheme.theme.trim(),
          kind: newTheme.kind.trim() || undefined,
          brand_slug: brand || undefined
        })
      })
      setNewTheme({ title: "", theme: "", kind: "" })
      setThemeMsg("Tema adicionado.")
      await loadThemes()
    } catch (e: unknown) { setThemeMsg(friendlyError(e, "Falha ao adicionar tema.")) }
    setThemeBusy(false)
  }

  async function deleteTheme(id: number) {
    const token = getTokenFromCookie()
    if (!token) return
    setThemes((ts) => ts.filter((t) => t.id !== id)) // otimista
    try { await apiFetch(`/api/themes/${id}`, token, { method: "DELETE" }) }
    catch { await loadThemes() }
  }

  async function importThemesCsv(file: File) {
    const token = getTokenFromCookie()
    if (!token) return
    setThemeBusy(true); setThemeMsg(null)
    try {
      const text = await file.text()
      const res = await apiFetch<{ parsed: number; inserted: number; skipped: number }>(
        "/api/themes/import", token,
        { method: "POST", body: text, headers: { "Content-Type": "text/csv" } }
      )
      setThemeMsg(`Importados ${res.inserted} novos (de ${res.parsed}; ${res.skipped} já existiam).`)
      await loadThemes()
    } catch (e: unknown) { setThemeMsg(friendlyError(e, "Falha ao importar CSV.")) }
    setThemeBusy(false)
  }

  const loadResearchThemes = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) return
    try {
      setResearchThemes(
        await apiFetch<ResearchTheme[]>(`/api/research-themes?limit=500${brand ? `&brand_slug=${brand}` : ""}`, token)
      )
    } catch { setResearchThemes([]) }
  }, [brand])

  useEffect(() => { loadResearchThemes() }, [loadResearchThemes])

  async function createResearchTheme() {
    const token = getTokenFromCookie()
    if (!token || newRTheme.title.trim().length < 2) return
    setRThemeBusy(true); setRThemeMsg(null)
    try {
      await apiFetch("/api/research-themes", token, {
        method: "POST",
        body: JSON.stringify({
          title: newRTheme.title.trim(),
          notes: newRTheme.notes.trim() || undefined,
          brand_slug: brand || undefined,
        }),
      })
      setNewRTheme({ title: "", notes: "" })
      setRThemeMsg("Tema de pesquisa adicionado.")
      await loadResearchThemes()
    } catch (e: unknown) { setRThemeMsg(friendlyError(e, "Falha ao adicionar.")) }
    setRThemeBusy(false)
  }

  async function deleteResearchTheme(id: number) {
    const token = getTokenFromCookie()
    if (!token) return
    setResearchThemes((ts) => ts.filter((t) => t.id !== id))
    try { await apiFetch(`/api/research-themes/${id}`, token, { method: "DELETE" }) }
    catch { await loadResearchThemes() }
  }

  async function importResearchThemesCsv(file: File) {
    const token = getTokenFromCookie()
    if (!token) return
    setRThemeBusy(true); setRThemeMsg(null)
    try {
      const text = await file.text()
      const res = await apiFetch<{ parsed: number; inserted: number; skipped: number }>(
        `/api/research-themes/import${brand ? `?brand_slug=${brand}` : ""}`, token,
        { method: "POST", body: text, headers: { "Content-Type": "text/csv" } }
      )
      setRThemeMsg(`Importados ${res.inserted} novos (de ${res.parsed}; ${res.skipped} já existiam).`)
      await loadResearchThemes()
    } catch (e: unknown) { setRThemeMsg(friendlyError(e, "Falha ao importar CSV.")) }
    setRThemeBusy(false)
  }

  const load = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    setLoading(true)
    const [d, m] = await Promise.allSettled([
      apiFetch<DocumentItem[]>("/api/documents?limit=200", token),
      apiFetch<MemoryEntry[]>("/api/memory?limit=200", token)
    ])
    const allDocs = d.status === "fulfilled" ? d.value : []
    const allEntries = m.status === "fulfilled" ? m.value : []
    const fdocs = brand ? allDocs.filter((x) => x.brand_slug === brand) : allDocs
    const fentries = brand ? allEntries.filter((x) => x.brand_slug === brand) : allEntries
    setDocs(fdocs)
    setEntries(fentries)
    setSelectedDoc((prev) => (prev && fdocs.some((x) => x.id === prev.id) ? prev : fdocs[0] ?? null))
    setLoading(false)
  }, [brand])

  useEffect(() => { load() }, [load])

  useEffect(() => { setUploadBrand(brand || "institucional") }, [brand])

  async function uploadDoc() {
    const token = getTokenFromCookie()
    if (!token || !uploadFile) return
    setUploadBusy(true); setUploadMsg(null)
    try {
      const fd = new FormData()
      fd.append("file", uploadFile)
      fd.append("brand_slug", uploadBrand || "institucional")
      fd.append("category", uploadCategory.trim() || "general")
      fd.append("source_type", "upload")
      await apiFetch("/api/documents/upload", token, { method: "POST", body: fd })
      setUploadMsg("Documento enviado e indexado.")
      setUploadFile(null)
      await load()
    } catch (e: unknown) {
      setUploadMsg(friendlyError(e, "Falha ao enviar documento."))
    }
    setUploadBusy(false)
  }

  async function deleteDoc(id: number) {
    const token = getTokenFromCookie()
    if (!token) return
    setDocs((ds) => ds.filter((d) => d.id !== id))
    setSelectedDoc((prev) => (prev && prev.id === id ? null : prev))
    try { await apiFetch(`/api/documents/${id}`, token, { method: "DELETE" }) }
    catch { await load() }
  }

  // load chunks when a doc is selected
  useEffect(() => {
    if (!selectedDoc) { setChunks(null); return }
    const token = getTokenFromCookie()
    if (!token) return
    setChunks(null)
    setChunksLoading(true)
    apiFetch<DocumentChunk[]>(`/api/documents/${selectedDoc.id}/chunks`, token)
      .then(setChunks)
      .catch(() => setChunks([]))
      .finally(() => setChunksLoading(false))
  }, [selectedDoc])

  async function runRag() {
    if (ragQuery.trim().length < 3) return
    const token = getTokenFromCookie()
    if (!token) return
    setRagLoading(true)
    try {
      const res = await apiFetch<MemorySearchResult[]>("/api/memory/search", token, {
        method: "POST",
        body: JSON.stringify({ query: ragQuery, brand_slug: brand || undefined, limit: 8 })
      })
      setRagResults(res)
    } catch {
      setRagResults([])
    }
    setRagLoading(false)
  }

  const visibleDocs = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return docs
    return docs.filter((d) => d.filename.toLowerCase().includes(q) || d.category.toLowerCase().includes(q))
  }, [docs, filter])

  const collections = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) map.set(e.category, (map.get(e.category) ?? 0) + 1)
    for (const d of docs) map.set(d.category, (map.get(d.category) ?? 0) + 1)
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [entries, docs])

  const activity = useMemo(() => {
    const items = [
      ...docs.map((d) => ({ kind: "doc" as const, title: d.filename, when: d.created_at, sub: `${d.category} · ${fmtSize(d.file_size)}` })),
      ...entries.map((e) => ({ kind: "mem" as const, title: e.title, when: e.created_at, sub: `${e.source_type}` }))
    ]
    return items.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()).slice(0, 6)
  }, [docs, entries])

  const visibleThemes = useMemo(() => {
    const q = themeFilter.trim().toLowerCase()
    if (!q) return themes
    return themes.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      (t.theme || "").toLowerCase().includes(q) ||
      (t.kind || "").toLowerCase().includes(q)
    )
  }, [themes, themeFilter])

  const visibleRThemes = useMemo(() => {
    const q = rThemeFilter.trim().toLowerCase()
    if (!q) return researchThemes
    return researchThemes.filter((t) =>
      t.title.toLowerCase().includes(q) || (t.notes || "").toLowerCase().includes(q))
  }, [researchThemes, rThemeFilter])

  const indexedCount = docs.filter((d) => d.status === "indexed").length
  const brands = new Set([...docs.map((d) => d.brand_slug), ...entries.map((e) => e.brand_slug)]).size

  const stats = [
    { icon: <FileIcon className="h-5 w-5" />, tone: "purple" as const, label: "Documentos", value: String(docs.length), hint: brand ? "nesta marca" : "todas as marcas" },
    { icon: <LayersIcon className="h-5 w-5" />, tone: "blue" as const, label: "Entradas de memória", value: String(entries.length), hint: "indexadas no RAG" },
    { icon: <SparklesIcon className="h-5 w-5" />, tone: "green" as const, label: "Indexados", value: `${indexedCount}/${docs.length}`, hint: "prontos p/ busca" },
    { icon: <UsersIcon className="h-5 w-5" />, tone: "amber" as const, label: "Marcas cobertas", value: String(brands), hint: "com conteúdo" }
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-[30px] font-extrabold tracking-[-0.04em] text-ink">
          <SparklesIcon className="h-7 w-7 text-purple" /> Memória
        </h1>
        <p className="mt-1 text-sm text-muted">Base de conhecimento confiável para agentes e para todo o time.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} icon={s.icon} iconTone={s.tone} label={s.label} value={s.value} hint={s.hint} />
        ))}
      </div>

      {/* Banco de temas — contexto da cocriação, gerenciável aqui */}
      <section className="duofy-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookmarkIcon className="h-5 w-5 text-purple" />
            <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Banco de temas</h2>
            <Badge tone="purple">{themes.length}</Badge>
            <span className="hidden text-xs text-muted sm:inline">contexto para a cocriação de conteúdos</span>
          </div>
          <label className={`duofy-tap flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple ${themeBusy ? "opacity-50" : ""}`}>
            <DownloadIcon className="h-4 w-4" /> Importar CSV
            <input type="file" accept=".csv,text/csv" className="hidden" disabled={themeBusy}
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) importThemesCsv(f); e.target.value = "" }} />
          </label>
        </div>

        {/* Adicionar manualmente */}
        <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_170px_auto]">
          <input value={newTheme.title} onChange={(e) => setNewTheme({ ...newTheme, title: e.target.value })}
                 onKeyDown={(e) => e.key === "Enter" && createTheme()}
                 placeholder="Título do tema" className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" />
          <input value={newTheme.kind} onChange={(e) => setNewTheme({ ...newTheme, kind: e.target.value })}
                 placeholder="Tipo (opcional)" className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" />
          <button onClick={createTheme} disabled={themeBusy || newTheme.title.trim().length < 2}
                  className="duofy-tap flex h-10 items-center justify-center gap-1.5 rounded-xl bg-purple px-4 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
            <PlusIcon className="h-4 w-4" /> Adicionar
          </button>
        </div>
        <input value={newTheme.theme} onChange={(e) => setNewTheme({ ...newTheme, theme: e.target.value })}
               placeholder="Descrição / direcionamento do tema (opcional)"
               className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" />
        {themeMsg && <p className="mt-2 text-xs text-purple-deep">{themeMsg}</p>}

        {/* Filtro + lista */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-white px-3 text-muted">
          <SearchIcon className="h-4 w-4" />
          <input value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)}
                 placeholder="Filtrar temas…" className="h-9 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted" />
        </div>
        <div className="mt-3 max-h-96 space-y-2 overflow-y-auto duofy-scroll pr-1">
          {visibleThemes.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-line py-8 text-center text-sm text-muted">
              {themes.length === 0 ? "Nenhum tema ainda. Adicione manualmente ou importe um CSV." : "Nenhum tema corresponde ao filtro."}
            </div>
          ) : (
            visibleThemes.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-white p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug text-ink">{t.title}</p>
                  {t.theme && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.theme}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {t.brand_slug && <Badge tone="slate">{t.brand_slug}</Badge>}
                    {t.kind && <Badge tone="blue">{t.kind}</Badge>}
                    {t.audience && <Badge tone="slate">{t.audience}</Badge>}
                  </div>
                </div>
                <button onClick={() => deleteTheme(t.id)} aria-label="Excluir tema"
                        className="duofy-tap grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-muted hover:border-red/40 hover:text-red">
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Banco de temas de pesquisa — contexto para pesquisa/briefing */}
      <section className="duofy-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookmarkIcon className="h-5 w-5 text-purple" />
            <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Temas de pesquisa</h2>
            <Badge tone="purple">{researchThemes.length}</Badge>
            <span className="hidden text-xs text-muted sm:inline">contexto para a pesquisa/briefing</span>
          </div>
          <label className={`duofy-tap flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple ${rThemeBusy ? "opacity-50" : ""}`}>
            <DownloadIcon className="h-4 w-4" /> Importar CSV
            <input type="file" accept=".csv,text/csv" className="hidden" disabled={rThemeBusy}
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) importResearchThemesCsv(f); e.target.value = "" }} />
          </label>
        </div>

        {/* Adicionar manualmente */}
        <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <input value={newRTheme.title} onChange={(e) => setNewRTheme({ ...newRTheme, title: e.target.value })}
                 onKeyDown={(e) => e.key === "Enter" && createResearchTheme()}
                 placeholder="Título do tema de pesquisa" className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" />
          <button onClick={createResearchTheme} disabled={rThemeBusy || newRTheme.title.trim().length < 2}
                  className="duofy-tap flex h-10 items-center justify-center gap-1.5 rounded-xl bg-purple px-4 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
            <PlusIcon className="h-4 w-4" /> Adicionar
          </button>
        </div>
        <input value={newRTheme.notes} onChange={(e) => setNewRTheme({ ...newRTheme, notes: e.target.value })}
               placeholder="Notas / direcionamento (opcional)"
               className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" />
        {rThemeMsg && <p className="mt-2 text-xs text-purple-deep">{rThemeMsg}</p>}

        {/* Filtro + lista */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-white px-3 text-muted">
          <SearchIcon className="h-4 w-4" />
          <input value={rThemeFilter} onChange={(e) => setRThemeFilter(e.target.value)}
                 placeholder="Filtrar temas de pesquisa…" className="h-9 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted" />
        </div>
        <div className="mt-3 max-h-96 space-y-2 overflow-y-auto duofy-scroll pr-1">
          {visibleRThemes.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-line py-8 text-center text-sm text-muted">
              {researchThemes.length === 0 ? "Nenhum tema de pesquisa ainda. Adicione manualmente ou importe um CSV." : "Nenhum tema corresponde ao filtro."}
            </div>
          ) : (
            visibleRThemes.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-white p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug text-ink">{t.title}</p>
                  {t.notes && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.notes}</p>}
                  {t.brand_slug && <div className="mt-1.5"><Badge tone="slate">{t.brand_slug}</Badge></div>}
                </div>
                <button onClick={() => deleteResearchTheme(t.id)} aria-label="Excluir tema de pesquisa"
                        className="duofy-tap grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-muted hover:border-red/40 hover:text-red">
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          {/* Busca semântica (RAG) */}
          <section className="duofy-card rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Busca semântica (RAG)</h2>
              <Badge tone="teal">pgvector</Badge>
            </div>
            <div className="mt-3 flex gap-2">
              <div className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 text-muted">
                <SearchIcon className="h-4 w-4" />
                <input
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runRag()}
                  className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                  placeholder="Ex: posicionamento de marca, tom de voz, persona..."
                />
              </div>
              <button
                onClick={runRag}
                disabled={ragLoading || ragQuery.trim().length < 3}
                className="rounded-xl bg-purple px-4 text-sm font-semibold text-white transition hover:bg-purple-deep disabled:opacity-50"
              >
                {ragLoading ? "Buscando…" : "Buscar"}
              </button>
            </div>
            {ragResults && (
              <div className="mt-3 space-y-2">
                {ragResults.length === 0 ? (
                  <p className="text-sm text-muted">Nenhum resultado semântico encontrado.</p>
                ) : (
                  ragResults.map((r) => (
                    <div key={`${r.kind}-${r.id}`} className="rounded-lg border border-line bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{r.title || "(sem título)"}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge tone="slate">{r.source_type}</Badge>
                          <span className="font-mono text-xs font-bold text-teal">{(r.score * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{r.content}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>

          {/* Biblioteca */}
          <section className="duofy-card rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Biblioteca de memória</h2>
              <button onClick={load} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:text-purple">
                <RefreshIcon className="h-4 w-4" />
              </button>
            </div>
            {/* Upload de novo documento */}
            <div className="mt-4 grid gap-2 rounded-xl border border-dashed border-line p-3 md:grid-cols-[minmax(0,1fr)_160px_140px_auto]">
              <label className="duofy-tap flex h-10 cursor-pointer items-center gap-2 truncate rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple">
                <PlusIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{uploadFile ? uploadFile.name : "Escolher arquivo (.pdf, .docx, .txt, .md)"}</span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  disabled={uploadBusy}
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <select
                value={uploadBrand}
                onChange={(e) => setUploadBrand(e.target.value)}
                disabled={uploadBusy}
                className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-purple"
              >
                <option value="institucional">Institucional (todas as marcas)</option>
                {brand && <option value={brand}>{brand}</option>}
              </select>
              <input
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                placeholder="Categoria"
                disabled={uploadBusy}
                className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-purple"
              />
              <button
                onClick={uploadDoc}
                disabled={uploadBusy || !uploadFile}
                className="duofy-tap flex h-10 items-center justify-center gap-1.5 rounded-xl bg-purple px-4 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50"
              >
                {uploadBusy ? "Enviando e indexando…" : <><PlusIcon className="h-4 w-4" /> Enviar</>}
              </button>
            </div>
            {uploadMsg && <p className="mt-2 text-xs text-purple-deep">{uploadMsg}</p>}

            <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-muted">
              <SearchIcon className="h-4 w-4" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                placeholder="Filtrar documentos por nome ou categoria..."
              />
            </div>

            <div className="mt-4 overflow-x-auto duofy-scroll">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="py-2.5 pr-4">Documento</th>
                    <th className="py-2.5 pr-4">Categoria</th>
                    <th className="py-2.5 pr-4">Marca</th>
                    <th className="py-2.5 pr-4">Tamanho</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 pr-4">Criado</th>
                    <th className="py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [1, 2, 3, 4].map((i) => (
                      <tr key={i}><td colSpan={7} className="py-3"><div className="h-8 animate-pulse rounded bg-line/50" /></td></tr>
                    ))
                  ) : visibleDocs.length === 0 ? (
                    <tr><td colSpan={7} className="py-10 text-center text-muted">Nenhum documento {filter ? "para esse filtro" : "para esta marca"}.</td></tr>
                  ) : (
                    visibleDocs.map((d) => {
                      const active = selectedDoc?.id === d.id
                      return (
                        <tr key={d.id} onClick={() => setSelectedDoc(d)} className={`cursor-pointer border-b border-line/70 last:border-0 ${active ? "bg-purple-soft/40" : "hover:bg-panel"}`}>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2.5">
                              <span className={`h-2 w-2 rounded-full ${active ? "bg-purple" : "bg-line"}`} />
                              <span className="grid h-7 w-7 place-items-center rounded-md bg-red/10 text-red"><FileIcon className="h-4 w-4" /></span>
                              <span className="max-w-[260px] truncate font-semibold text-ink">{d.filename}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-muted">{d.category}</td>
                          <td className="py-3 pr-4 text-muted">{d.brand_slug}</td>
                          <td className="py-3 pr-4 text-muted">{fmtSize(d.file_size)}</td>
                          <td className="py-3 pr-4">
                            <Badge tone={d.status === "indexed" ? "green" : d.status === "error" ? "red" : "amber"}>{d.status}</Badge>
                          </td>
                          <td className="py-3 pr-4 text-xs text-muted">{fmtDate(d.created_at)}</td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); downloadDoc(d.id, d.filename, toast) }}
                                title="Baixar original"
                                className="duofy-tap grid h-7 w-7 place-items-center rounded-lg border border-line text-muted hover:border-purple/40 hover:text-purple"
                              >
                                <DownloadIcon className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); exportDoc(d.id, d.filename, toast) }}
                                title="Exportar PDF"
                                className="duofy-tap rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-muted hover:border-purple/40 hover:text-purple"
                              >
                                PDF
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteDoc(d.id) }}
                                title="Remover documento"
                                aria-label="Remover documento"
                                className="duofy-tap grid h-7 w-7 place-items-center rounded-lg border border-line text-muted hover:border-red/40 hover:text-red"
                              >
                                <CloseIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm text-muted">Exibindo {visibleDocs.length} de {docs.length} documentos</p>
          </section>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <section className="duofy-card rounded-2xl p-5">
              <h3 className="text-base font-bold text-ink">Coleções e contexto</h3>
              <ul className="mt-4 space-y-4">
                {collections.length === 0 ? (
                  <li className="text-sm text-muted">Sem coleções ainda.</li>
                ) : (
                  collections.map(([name, count]) => (
                    <li key={name} className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-soft text-purple"><LayersIcon className="h-4 w-4" /></span>
                      <p className="flex-1 text-sm font-semibold capitalize text-ink">{name}</p>
                      <p className="text-sm font-semibold text-ink">{count}</p>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="duofy-card rounded-2xl p-5">
              <h3 className="text-base font-bold text-ink">Atividade recente</h3>
              <ul className="mt-4 space-y-4">
                {activity.length === 0 ? (
                  <li className="text-sm text-muted">Sem atividade.</li>
                ) : (
                  activity.map((a, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-soft text-purple">
                        {a.kind === "doc" ? <FileIcon className="h-4 w-4" /> : <LayersIcon className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{a.title}</p>
                        <p className="text-xs text-muted">{a.sub}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted">{fmtRelative(a.when)}</span>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        </div>

        {/* Painel de detalhe */}
        <aside className="duofy-card h-fit rounded-2xl p-5">
          {!selectedDoc ? (
            <div className="grid place-items-center py-16 text-center text-sm text-muted">
              Selecione um documento para ver detalhes.
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-red/10 text-red"><FileIcon className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-base font-bold text-ink">{selectedDoc.filename}</p>
                  <Badge tone={selectedDoc.status === "indexed" ? "green" : "amber"}>{selectedDoc.status}</Badge>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a
                  href={`${API_URL}/api/documents/${selectedDoc.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-deep"
                >
                  <BookIcon className="h-4 w-4" /> Baixar original
                </a>
              </div>

              <Section title="Metadados">
                <dl className="grid grid-cols-2 gap-y-2.5 text-sm">
                  <Meta label="Tipo" value={selectedDoc.content_type} />
                  <Meta label="Categoria" value={selectedDoc.category} />
                  <Meta label="Marca" value={selectedDoc.brand_slug} />
                  <Meta label="Tamanho" value={fmtSize(selectedDoc.file_size)} />
                  <Meta label="Criado em" value={fmtDate(selectedDoc.created_at)} />
                  <Meta label="ID" value={`#${selectedDoc.id}`} />
                </dl>
              </Section>

              <Section title={`Chunks indexados${chunks ? ` (${chunks.length})` : ""}`}>
                {chunksLoading ? (
                  <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-line/50" />)}</div>
                ) : !chunks || chunks.length === 0 ? (
                  <p className="text-sm text-muted">Nenhum chunk indexado.</p>
                ) : (
                  <ul className="space-y-2">
                    {chunks.slice(0, 5).map((c) => (
                      <li key={c.id} className="rounded-lg border border-line bg-white p-2.5">
                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                          <span>Chunk #{c.chunk_index}</span>
                          <span>{c.token_count} tokens</span>
                        </div>
                        <p className="line-clamp-3 text-xs text-ink/80">{c.content}</p>
                      </li>
                    ))}
                    {chunks.length > 5 && <li className="text-center text-xs text-muted">+{chunks.length - 5} chunks</li>}
                  </ul>
                )}
              </Section>

              <Section title="Permissões por agente">
                <p className="flex items-center gap-2 text-sm text-ink">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-green/10"><svg viewBox="0 0 16 16" className="h-3 w-3 text-green" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m4 8 2.5 2.5L12 5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  Disponível para todos os agentes via RAG
                </p>
              </Section>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="mb-2.5 text-sm font-bold text-ink">{title}</p>
      {children}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-medium text-ink">{value}</dd>
    </div>
  )
}
