"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import {
  DocumentPreview,
  DocumentWorkspace,
  ExportMenu,
  InspectorStack,
  MetadataInspector,
  WorkspaceList,
  WorkspaceListItem,
  WorkspaceToolbarButton,
  type ExportFormat
} from "@/components/document-workspace"
import { EmptyState, PageTitle, PurpleButton, SectionCard, SoftButton } from "@/components/page-primitives"
import {
  apiFetch,
  type Brand,
  type ProviderCredential,
  type ResearchContentBriefing,
  type ResearchReport
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { downloadFile, exportPath } from "@/lib/download"

function isLlmProvider(provider: ProviderCredential) {
  return !["apify", "openai_embeddings"].includes(provider.provider)
}

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  review: "Em revisao",
  approved: "Aprovado",
  needs_adjustment: "Ajuste",
  rejected: "Rejeitado",
  archived: "Arquivado"
}

export default function ResearchPage() {
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>([])
  const [providers, setProviders] = useState<ProviderCredential[]>([])
  const [reports, setReports] = useState<ResearchReport[]>([])
  const [selectedReport, setSelectedReport] = useState<ResearchReport | null>(null)
  const [brand, setBrand] = useState("")
  const [theme, setTheme] = useState("")
  const [provider, setProvider] = useState("openrouter")
  const [period, setPeriod] = useState("ultimos 30 dias")
  const [depth, setDepth] = useState<"quick" | "standard" | "deep">("standard")
  const [status, setStatus] = useState("")
  const [sourceUrls, setSourceUrls] = useState("")
  const [useApify, setUseApify] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadReports(token: string, nextSelectedId?: number) {
    const params = new URLSearchParams({ limit: "30" })
    if (brand) params.set("brand_slug", brand)
    if (status) params.set("status", status)
    if (theme.trim()) params.set("theme", theme.trim())
    if (period) params.set("period", period)
    const items = await apiFetch<ResearchReport[]>(`/api/research/reports?${params}`, token)
    setReports(items)
    const targetId = nextSelectedId ?? selectedReport?.id ?? items[0]?.id
    if (!targetId) {
      setSelectedReport(null)
      return
    }
    const target = items.find((item) => item.id === targetId)
    if (target) {
      setSelectedReport(target)
      return
    }
    const detail = await apiFetch<ResearchReport>(`/api/research/reports/${targetId}`, token)
    setSelectedReport(detail)
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
        setBrands(brandList)
        setBrand(brandList[0]?.slug ?? "")
        const llmProviders = providerList.filter(isLlmProvider)
        setProviders(llmProviders)
        setProvider(llmProviders.find((item) => item.is_enabled)?.provider ?? "openrouter")
        await loadReports(token)
      })
      .catch(() => setError("Nao foi possivel carregar pesquisas."))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function selectReport(reportId: number) {
    const token = getTokenFromCookie()
    if (!token) return
    const detail = await apiFetch<ResearchReport>(`/api/research/reports/${reportId}`, token)
    setSelectedReport(detail)
  }

  async function runResearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = getTokenFromCookie()
    if (!token) return
    setIsRunning(true)
    setNotice(null)
    setError(null)

    const urls = sourceUrls
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)

    try {
      const result = await apiFetch<ResearchReport>("/api/research/run", token, {
        method: "POST",
        body: JSON.stringify({
          brand_slug: brand,
          theme,
          period,
          depth,
          provider,
          source_urls: urls,
          use_apify: useApify
        })
      })
      setSelectedReport(result)
      await loadReports(token, result.id)
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsRunning(false)
    }
  }

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = getTokenFromCookie()
    if (!token) return
    await loadReports(token)
  }

  async function saveMemory() {
    const token = getTokenFromCookie()
    if (!token || !selectedReport) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const result = await apiFetch<{ memory_entry_id: number; title: string }>(
        `/api/research/reports/${selectedReport.id}/save-memory`,
        token,
        { method: "POST" }
      )
      setNotice(`Memória criada: #${result.memory_entry_id} - ${result.title}`)
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsSaving(false)
    }
  }

  async function useInContent() {
    const token = getTokenFromCookie()
    if (!token || !selectedReport) return
    setIsSaving(true)
    setError(null)
    try {
      const briefing = await apiFetch<ResearchContentBriefing>(
        `/api/research/reports/${selectedReport.id}/use-in-content`,
        token,
        { method: "POST" }
      )
      window.localStorage.setItem("duofy.content.prefill", JSON.stringify(briefing))
      router.push("/content")
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsSaving(false)
    }
  }

  async function exportReport(format: ExportFormat) {
    const token = getTokenFromCookie()
    if (!token || !selectedReport) return
    setError(null)
    try {
      await downloadFile(
        exportPath(`/api/outputs/${selectedReport.id}`, format),
        token,
        `duofy-research-${selectedReport.id}.${format}`
      )
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Pesquisa de Mercado"
        subtitle="Colete fontes externas, gere relatorios estruturados e transforme achados em memoria ou conteudo."
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

      <form onSubmit={runResearch} className="duofy-card grid gap-4 rounded-2xl p-5 xl:grid-cols-6">
        <select
          value={brand}
          onChange={(event) => setBrand(event.target.value)}
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3"
        >
          {brands.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
        <input
          value={theme}
          onChange={(event) => setTheme(event.target.value)}
          placeholder="Tema da pesquisa"
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3"
          required
        />
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3"
        >
          {providers.map((item) => (
            <option key={item.provider} value={item.provider}>
              {item.display_name} {item.is_enabled ? "" : "(off)"}
            </option>
          ))}
        </select>
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3"
        >
          <option>ultimos 7 dias</option>
          <option>ultimos 30 dias</option>
          <option>ultimos 90 dias</option>
          <option>ano atual</option>
        </select>
        <select
          value={depth}
          onChange={(event) => setDepth(event.target.value as "quick" | "standard" | "deep")}
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3"
        >
          <option value="quick">quick</option>
          <option value="standard">standard</option>
          <option value="deep">deep + Playwright</option>
        </select>
        <PurpleButton disabled={isRunning || !theme.trim()}>
          {isRunning ? "Rodando..." : "Rodar agora"}
        </PurpleButton>

        <div className="xl:col-span-5">
          <textarea
            value={sourceUrls}
            onChange={(event) => setSourceUrls(event.target.value)}
            placeholder="URLs opcionais, uma por linha. A pesquisa tambem usa RSS automaticamente."
            className="duofy-focus min-h-20 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
          />
        </div>
        <label className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={useApify}
            onChange={(event) => setUseApify(event.target.checked)}
          />
          Usar Apify
        </label>
      </form>

      <form onSubmit={applyFilters} className="duofy-card grid gap-3 rounded-2xl p-5 md:grid-cols-[1fr_220px_auto]">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3"
        >
          <option value="">Todos os status</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <SoftButton type="submit">Aplicar filtros</SoftButton>
      </form>

      <DocumentWorkspace
        title={selectedReport?.title ?? "Relatório de pesquisa"}
        subtitle={selectedReport ? `${selectedReport.brand_slug} / ${selectedReport.sources.length} fontes` : "Rode ou selecione uma pesquisa real."}
        sidebar={
          <WorkspaceList title="Relatórios">
            {reports.length === 0 ? <EmptyState title="Nenhum relatório" description="Rode uma pesquisa para criar o primeiro relatório estruturado." /> : null}
            {reports.map((item) => (
              <WorkspaceListItem
                key={item.id}
                active={selectedReport?.id === item.id}
                title={item.title}
                meta={`${item.sources.length} fontes vinculadas`}
                excerpt={item.briefing}
                badge={statusLabels[item.status] ?? item.status}
                onClick={() => selectReport(item.id)}
              />
            ))}
          </WorkspaceList>
        }
        toolbar={
          <>
            <ExportMenu disabled={!selectedReport} onExport={exportReport} />
            <WorkspaceToolbarButton disabled={!selectedReport || isSaving} onClick={saveMemory}>Salvar memória</WorkspaceToolbarButton>
            <WorkspaceToolbarButton disabled={!selectedReport || isSaving} onClick={useInContent} variant="primary">Usar em conteúdo</WorkspaceToolbarButton>
          </>
        }
        inspector={
          <InspectorStack>
            <MetadataInspector
              title="Relatório"
              items={selectedReport ? [
                { label: "Marca", value: selectedReport.brand_slug },
                { label: "Status", value: statusLabels[selectedReport.status] ?? selectedReport.status },
                { label: "Provider", value: selectedReport.provider },
                { label: "Modelo", value: selectedReport.model },
                { label: "Fontes", value: selectedReport.sources.length }
              ] : []}
            />
            <section className="rounded-2xl border border-line bg-white p-5">
              <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-muted">Fontes</h3>
              <div className="mt-4 space-y-3">
                {selectedReport?.sources.map((source) => (
                  <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-line bg-white p-4 text-sm transition hover:border-purple/40">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="line-clamp-2">{source.title}</strong>
                      <span className="rounded-full bg-purple-soft px-2 py-1 text-xs font-bold text-purple">{source.reliability}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted">{source.publisher ?? "Fonte externa"}</p>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted">{source.evidence || source.error || "Sem evidência extraída."}</p>
                  </a>
                ))}
                {!selectedReport ? <p className="text-sm text-muted">Selecione um relatório.</p> : null}
              </div>
            </section>
          </InspectorStack>
        }
      >
        <DocumentPreview
          title={selectedReport?.title}
          subtitle={selectedReport ? `${selectedReport.provider} / ${selectedReport.model}` : undefined}
          content={selectedReport?.current_content}
          documentType={selectedReport?.document_type}
          qualityNotes={selectedReport?.quality_notes}
          emptyTitle="Nenhum relatório selecionado"
          emptyDescription="Selecione um relatório ou rode uma nova pesquisa."
        />
      </DocumentWorkspace>
    </div>
  )
}
