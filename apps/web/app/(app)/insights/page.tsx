"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import {
  DocumentPreview,
  DocumentWorkspace,
  ExportMenu,
  InspectorStack,
  MetadataInspector,
  WorkspaceList,
  WorkspaceListItem,
  type ExportFormat
} from "@/components/document-workspace"
import { EmptyState, PageTitle, PurpleButton, SectionCard, SoftButton } from "@/components/page-primitives"
import { apiFetch, type Brand, type InternalReport } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { downloadFile, exportPath } from "@/lib/download"

function dateTime(value: string | null) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))
}

export default function InsightsPage() {
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>([])
  const [reports, setReports] = useState<InternalReport[]>([])
  const [selected, setSelected] = useState<InternalReport | null>(null)
  const [brand, setBrand] = useState("")
  const [title, setTitle] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function loadReports(token: string, nextSelectedId?: number) {
    const items = await apiFetch<InternalReport[]>("/api/reports", token)
    setReports(items)
    setSelected(items.find((item) => item.id === nextSelectedId) ?? items[0] ?? null)
  }

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) {
      router.replace("/login")
      return
    }
    Promise.all([apiFetch<Brand[]>("/api/brands", token), loadReports(token)])
      .then(([brandList]) => setBrands(brandList))
      .catch(() => setError("Nao foi possivel carregar relatorios."))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function generateReport() {
    const token = getTokenFromCookie()
    if (!token) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const report = await apiFetch<InternalReport>("/api/reports/generate", token, {
        method: "POST",
        body: JSON.stringify({
          title: title || null,
          report_type: "internal_metrics",
          brand_slug: brand || null
        })
      })
      setNotice("Relatorio gerado.")
      setTitle("")
      await loadReports(token, report.id)
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsSaving(false)
    }
  }

  async function exportSelected(format: ExportFormat) {
    const token = getTokenFromCookie()
    if (!token || !selected) return
    setError(null)
    try {
      await downloadFile(
        exportPath(`/api/reports/${selected.id}`, format),
        token,
        `duofy-report-${selected.id}.${format}`
      )
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Insights"
        subtitle="Gere relatorios internos de produtividade, uso de IA, tokens e custo estimado."
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

      <div className="duofy-card rounded-2xl p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_240px_auto]">
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título opcional" className="duofy-focus rounded-xl border border-line bg-white px-4 py-3 text-sm" />
          <select value={brand} onChange={(event) => setBrand(event.target.value)} className="duofy-focus rounded-xl border border-line bg-white px-4 py-3 text-sm">
            <option value="">Todas as marcas</option>
            {brands.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
          <PurpleButton type="button" disabled={isSaving} onClick={generateReport}>
            {isSaving ? "Gerando..." : "Gerar snapshot"}
          </PurpleButton>
        </div>
      </div>

      <DocumentWorkspace
        title={selected?.title ?? "Relatório interno"}
        subtitle={selected ? `${selected.report_type} / ${dateTime(selected.created_at)}` : "Gere ou selecione um relatório."}
        sidebar={
          <WorkspaceList title="Relatórios">
            {reports.length === 0 ? <EmptyState title="Sem relatórios" description="Gere o primeiro snapshot para consolidar métricas." /> : null}
            {reports.map((report) => (
              <WorkspaceListItem
                key={report.id}
                active={selected?.id === report.id}
                title={report.title}
                meta={`${report.report_type} / ${dateTime(report.created_at)}`}
                badge={report.brand_slug ?? "Todas"}
                onClick={() => setSelected(report)}
              />
            ))}
          </WorkspaceList>
        }
        toolbar={<ExportMenu disabled={!selected} onExport={exportSelected} />}
        inspector={
          <InspectorStack>
            <MetadataInspector
              title="Relatório"
              items={selected ? [
                { label: "Tipo", value: selected.report_type },
                { label: "Marca", value: selected.brand_slug ?? "Todas" },
                { label: "Criado", value: dateTime(selected.created_at) },
                { label: "Atualizado", value: dateTime(selected.updated_at) }
              ] : []}
            />
            <SectionCard title="Resumo bruto">
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted">
                {selected?.summary ? JSON.stringify(selected.summary, null, 2) : "Sem resumo estruturado."}
              </pre>
            </SectionCard>
          </InspectorStack>
        }
      >
        <DocumentPreview
          title={selected?.title}
          subtitle={selected ? `${selected.report_type} / ${selected.brand_slug ?? "Todas as marcas"}` : undefined}
          content={selected?.content}
          documentType="executive_report"
          qualityNotes={["Estrutura executiva", "Indicadores consolidados", "Pronto para exportação"]}
          emptyTitle="Nenhum relatório selecionado"
          emptyDescription="Gere ou selecione um relatório."
        />
      </DocumentWorkspace>
    </div>
  )
}
