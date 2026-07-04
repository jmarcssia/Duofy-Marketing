"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { Markdown } from "@/components/markdown"
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BookmarkIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  ExternalLinkIcon,
  RefreshIcon,
  SearchIcon,
  SparklesIcon,
  TargetIcon
} from "@/components/icons"
import {
  Badge,
  FieldSelect,
  GhostButton,
  PageHeader,
  SectionHeader,
  Spinner,
  type Tone
} from "@/components/ui"
import {
  apiFetch,
  getResearchModels,
  type ResearchModel,
  type ResearchReport
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"

const TEMPLATES: { label: string; theme: string }[] = [
  { label: "Análise de mercado", theme: "Análise de mercado e dimensionamento do setor" },
  { label: "Concorrência", theme: "Mapeamento de concorrentes, posicionamento e diferenciais" },
  { label: "Tendências do setor", theme: "Tendências e sinais de mercado para 2026" },
  { label: "Jornada do cliente", theme: "Jornada de compra, dores e pontos de decisão do cliente" },
  { label: "Oportunidades", theme: "Oportunidades de crescimento e nichos pouco explorados" },
  { label: "Lançamento de produto", theme: "Pesquisa para lançamento: cenário, riscos e go-to-market" }
]

const DEPTHS = [
  { id: "quick", label: "Rápida", hint: "menos fontes, resposta rápida" },
  { id: "standard", label: "Padrão", hint: "equilíbrio entre amplitude e tempo" },
  { id: "deep", label: "Profunda", hint: "mais fontes e profundidade" }
] as const

type Depth = (typeof DEPTHS)[number]["id"]

const STATUS_TONE: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "slate" },
  review: { label: "Em revisão", tone: "blue" },
  approved: { label: "Aprovada", tone: "green" },
  needs_adjustment: { label: "Ajustes pedidos", tone: "amber" },
  rejected: { label: "Rejeitada", tone: "red" },
  archived: { label: "Arquivada", tone: "slate" }
}

const RELIABILITY_TONE: Record<string, Tone> = { A: "green", B: "teal", C: "amber", D: "slate" }

function composeTheme(pergunta: string, objetivo: string, segmento: string, persona: string): string {
  const bits = [pergunta.trim()]
  if (objetivo.trim()) bits.push(`Objetivo: ${objetivo.trim()}`)
  if (segmento.trim()) bits.push(`Segmento: ${segmento.trim()}`)
  if (persona.trim()) bits.push(`Persona: ${persona.trim()}`)
  return bits.join(" · ").slice(0, 255)
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit"
  })
}

export default function ResearchPage() {
  const router = useRouter()
  const { selected: brand } = useBrand()
  const [models, setModels] = useState<ResearchModel[]>([])
  const [reports, setReports] = useState<ResearchReport[]>([])
  const [loadingReports, setLoadingReports] = useState(true)

  // formulário de nova pesquisa
  const [pergunta, setPergunta] = useState("")
  const [objetivo, setObjetivo] = useState("")
  const [segmento, setSegmento] = useState("")
  const [persona, setPersona] = useState("")
  const [period, setPeriod] = useState("últimos 30 dias")
  const [depth, setDepth] = useState<Depth>("standard")
  const [model, setModel] = useState("")
  const [sourceUrls, setSourceUrls] = useState("")

  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // resultado
  const [selected, setSelected] = useState<ResearchReport | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) return
    setLoadingReports(true)
    try {
      const qs = brand ? `?brand_slug=${encodeURIComponent(brand)}&limit=12` : "?limit=12"
      setReports(await apiFetch<ResearchReport[]>(`/api/research/reports${qs}`, token))
    } catch {
      setReports([])
    } finally {
      setLoadingReports(false)
    }
  }, [brand])

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) return
    getResearchModels(token).then(setModels).catch(() => setModels([]))
  }, [])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  async function runResearch() {
    const token = getTokenFromCookie()
    if (!token) return
    if (!brand) {
      setError("Selecione uma marca no topo.")
      return
    }
    if (pergunta.trim().length < 3) {
      setError("Descreva a pergunta principal da pesquisa.")
      return
    }
    setRunning(true)
    setError(null)
    try {
      const report = await apiFetch<ResearchReport>("/api/research/run", token, {
        method: "POST",
        body: JSON.stringify({
          brand_slug: brand,
          theme: composeTheme(pergunta, objetivo, segmento, persona),
          period: period.trim() || "últimos 30 dias",
          depth,
          model: model || undefined,
          source_urls: sourceUrls
            .split(/\n+/)
            .map((u) => u.trim())
            .filter((u) => u.startsWith("http"))
            .slice(0, 8)
        })
      })
      setSelected(report)
      setActionMsg(null)
      void loadReports()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao executar a pesquisa.")
    }
    setRunning(false)
  }

  async function openReport(id: number) {
    const token = getTokenFromCookie()
    if (!token) return
    try {
      setSelected(await apiFetch<ResearchReport>(`/api/research/reports/${id}`, token))
      setActionMsg(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao abrir a pesquisa.")
    }
  }

  async function act(kind: "approve" | "request-adjustment") {
    if (!selected) return
    const token = getTokenFromCookie()
    if (!token) return
    let body = "{}"
    if (kind === "request-adjustment") {
      const feedback = window.prompt("O que precisa ser ajustado na pesquisa?")
      if (feedback == null) return
      body = JSON.stringify({ feedback })
    }
    setActing(kind)
    setActionMsg(null)
    try {
      await apiFetch(`/api/outputs/${selected.id}/${kind}`, token, { method: "POST", body })
      setSelected(await apiFetch<ResearchReport>(`/api/research/reports/${selected.id}`, token))
      setActionMsg(kind === "approve" ? "Pesquisa aprovada — etapa de cocriação liberada quando vinculada a evento." : "Ajustes solicitados.")
      void loadReports()
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : "Falha na ação.")
    }
    setActing(null)
  }

  async function saveMemory() {
    if (!selected) return
    const token = getTokenFromCookie()
    if (!token) return
    setActing("memory")
    setActionMsg(null)
    try {
      await apiFetch(`/api/research/reports/${selected.id}/save-memory`, token, { method: "POST", body: "{}" })
      setActionMsg("Pesquisa salva na memória (RAG).")
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : "Falha ao salvar na memória.")
    }
    setActing(null)
  }

  const st = selected ? STATUS_TONE[selected.status] ?? { label: selected.status, tone: "slate" as Tone } : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agente de Pesquisa"
        subtitle="Pesquisa de mercado de consultoria: coleta real de fontes, evidências e recomendações."
        icon={<SearchIcon className="h-5 w-5" />}
        right={
          selected ? (
            <GhostButton onClick={() => { setSelected(null); setActionMsg(null) }}>
              <SearchIcon className="h-4 w-4" /> Nova pesquisa
            </GhostButton>
          ) : undefined
        }
      />

      {!selected && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* A) Nova pesquisa */}
          <div className="space-y-5">
            <div className="duofy-card rounded-2xl p-5">
              <SectionHeader title="Templates" subtitle="Comece a partir de um objetivo comum" />
              <div className="mt-3 flex flex-wrap gap-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => setPergunta(t.theme)}
                    className="duofy-tap inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-ink hover:border-purple/40 hover:text-purple"
                  >
                    <TargetIcon className="h-3.5 w-3.5 text-purple" /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="duofy-card space-y-4 rounded-2xl p-5">
              <SectionHeader title="Nova pesquisa" subtitle={`Marca: ${brand || "—"} · foco Brasil · usa a memória (RAG) da marca`} />

              <label className="block text-xs font-semibold text-muted">
                Pergunta principal
                <textarea
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                  rows={2}
                  placeholder="O que você precisa descobrir? Ex.: Tamanho e concorrência do mercado de gestão para postos no Brasil."
                  className="mt-1 w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-sm text-ink focus:border-purple focus:outline-none"
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-muted">
                  Objetivo (opcional)
                  <input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
                </label>
                <label className="block text-xs font-semibold text-muted">
                  Segmento (opcional)
                  <input value={segmento} onChange={(e) => setSegmento(e.target.value)} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
                </label>
                <label className="block text-xs font-semibold text-muted">
                  Persona (opcional)
                  <input value={persona} onChange={(e) => setPersona(e.target.value)} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
                </label>
                <label className="block text-xs font-semibold text-muted">
                  Período
                  <input value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
                </label>
              </div>

              <div>
                <span className="text-xs font-semibold text-muted">Profundidade</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {DEPTHS.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDepth(d.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                        depth === d.id ? "border-purple bg-purple-soft text-purple-deep" : "border-line bg-white text-muted hover:border-purple/40"
                      }`}
                    >
                      <span className="block font-bold">{d.label}</span>
                      <span className="block">{d.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FieldSelect
                  label="Modelo de pesquisa"
                  value={model}
                  onChange={setModel}
                  options={[{ value: "", label: "Padrão do agente" }, ...models.map((m) => ({ value: m.model_id, label: m.label }))]}
                />
                <label className="block text-xs font-semibold text-muted">
                  Fontes informadas (opcional, 1 URL por linha)
                  <textarea value={sourceUrls} onChange={(e) => setSourceUrls(e.target.value)} rows={2} placeholder="https://..." className="mt-1 w-full resize-none rounded-xl border border-line px-3 py-2 text-sm text-ink focus:border-purple focus:outline-none" />
                </label>
              </div>

              {error && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-red">
                  <AlertTriangleIcon className="h-4 w-4" /> {error}
                </p>
              )}

              <button
                onClick={runResearch}
                disabled={running || !brand}
                className="duofy-tap flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-purple px-5 text-sm font-bold text-white hover:bg-purple-deep disabled:opacity-50"
              >
                {running ? (
                  <><Spinner size={16} /> Pesquisando… (pode levar 1–2 min)</>
                ) : (
                  <><SearchIcon className="h-4 w-4" /> Iniciar pesquisa</>
                )}
              </button>
            </div>
          </div>

          {/* Pesquisas recentes */}
          <div className="duofy-card h-fit rounded-2xl p-5">
            <SectionHeader title="Pesquisas recentes" subtitle={brand ? `Marca ${brand}` : "Todas as marcas"} />
            <div className="mt-3 space-y-2">
              {loadingReports && <p className="text-sm text-muted">Carregando…</p>}
              {!loadingReports && reports.length === 0 && (
                <p className="text-sm text-muted">Nenhuma pesquisa ainda.</p>
              )}
              {reports.map((r) => {
                const rst = STATUS_TONE[r.status] ?? { label: r.status, tone: "slate" as Tone }
                return (
                  <button
                    key={r.id}
                    onClick={() => openReport(r.id)}
                    className="group flex w-full items-start gap-2 rounded-xl border border-line bg-white p-3 text-left hover:border-purple/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{r.title}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                        <ClockIcon className="h-3.5 w-3.5" /> {fmtDate(r.updated_at)}
                        <Badge tone={rst.tone} className="ml-1">{rst.label}</Badge>
                      </p>
                    </div>
                    <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-muted group-hover:text-purple" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* B) Resultado da pesquisa */}
      {selected && st && (
        <div className="space-y-5">
          <div className="duofy-card rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">{selected.title}</h2>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {selected.provider} · {selected.model} · {selected.sources.length} fontes · atualizada {fmtDate(selected.updated_at)}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => act("approve")}
                disabled={acting != null || selected.status === "approved"}
                className="duofy-tap inline-flex items-center gap-2 rounded-xl bg-purple px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50"
              >
                <CheckCircleIcon className="h-4 w-4" />
                {acting === "approve" ? "Aprovando…" : selected.status === "approved" ? "Aprovada" : "Aprovar pesquisa"}
              </button>
              <GhostButton onClick={() => act("request-adjustment")} disabled={acting != null}>
                <RefreshIcon className="h-4 w-4" /> Solicitar ajustes
              </GhostButton>
              <GhostButton onClick={saveMemory} disabled={acting != null}>
                <BookmarkIcon className="h-4 w-4" /> {acting === "memory" ? "Salvando…" : "Salvar na memória"}
              </GhostButton>
              <GhostButton onClick={() => router.push(`/content?research=${selected.id}`)} disabled={acting != null}>
                <SparklesIcon className="h-4 w-4" /> Enviar para cocriação
              </GhostButton>
              <GhostButton onClick={() => window.open(`/api/outputs/${selected.id}/pdf`, "_blank")}>
                <DownloadIcon className="h-4 w-4" /> Exportar PDF
              </GhostButton>
            </div>
            {actionMsg && <p className="mt-3 text-xs font-medium text-purple">{actionMsg}</p>}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
            <div className="duofy-card rounded-2xl p-6">
              <Markdown content={selected.current_content || "_Pesquisa sem conteúdo._"} />
            </div>

            <div className="duofy-card h-fit rounded-2xl p-5">
              <SectionHeader title="Fontes e evidências" subtitle={`${selected.sources.length} fontes coletadas`} />
              <div className="mt-3 space-y-2.5">
                {selected.sources.length === 0 && <p className="text-sm text-muted">Sem fontes registradas.</p>}
                {selected.sources.map((s, i) => (
                  <div key={s.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-center gap-2">
                      <Badge tone={RELIABILITY_TONE[s.reliability] ?? "slate"}>{s.reliability}</Badge>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{s.source_kind}</span>
                    </div>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 flex items-start gap-1 text-sm font-medium text-ink hover:text-purple"
                    >
                      <span className="min-w-0 flex-1">[{i + 1}] {s.title}</span>
                      <ExternalLinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                    </a>
                    {s.publisher && <p className="mt-0.5 text-[11px] text-muted">{s.publisher}</p>}
                    {s.evidence && <p className="mt-1 line-clamp-3 text-xs text-ink/70">{s.evidence}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
