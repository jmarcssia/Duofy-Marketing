"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { AreaLineChart, DonutChart, HBarChart, Legend } from "@/components/charts"
import { Segmented, StatCard, useToast } from "@/components/ui"
import { Markdown } from "@/components/markdown"
import {
  AlertTriangleIcon,
  ChartIcon,
  CheckCircleIcon,
  DatabaseIcon,
  DollarIcon,
  DownloadIcon,
  MoreIcon,
  PhoneIcon,
  RefreshIcon,
  SendIcon,
  ZapIcon
} from "@/components/icons"
import { apiFetch, type InternalReport, type MetricsSummary, type ModelCall, type Publication } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { friendlyError } from "@/lib/friendly-error"
import { useBrand } from "@/lib/brand-context"
import { downloadFile, exportPath } from "@/lib/download"

type Period = "7" | "30" | "90" | "all"
const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: "7", label: "7 dias" },
  { id: "30", label: "30 dias" },
  { id: "90", label: "90 dias" },
  { id: "all", label: "Tudo" }
]

function startFor(period: Period, nowMs: number): string | null {
  if (period === "all") return null
  const days = Number(period)
  return new Date(nowMs - days * 86400000).toISOString()
}

const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const num = (v: number) => v.toLocaleString("pt-BR")
const DONUT_COLORS = ["#5a34e0", "#3e63c8", "#0d7d72", "#c17722", "#c14a86", "#4a3fce"]

export default function RelatoriosPage() {
  const toast = useToast()
  const { selected: brand, brands } = useBrand()
  const brandName = (slug: string | null | undefined) =>
    slug ? brands.find((b) => b.slug === slug)?.name ?? slug : null
  const [summary, setSummary] = useState<MetricsSummary | null>(null)
  const [calls, setCalls] = useState<ModelCall[]>([])
  const [reports, setReports] = useState<InternalReport[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>("30")
  const [publishedCount, setPublishedCount] = useState(0)

  const load = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    setLoading(true)
    const params = new URLSearchParams()
    if (brand) params.set("brand_slug", brand)
    const start = startFor(period, Date.now())
    if (start) params.set("start", start)
    const qs = params.toString() ? `?${params.toString()}` : ""
    const callsQs = `?limit=300${params.toString() ? `&${params.toString()}` : ""}`
    const pubQs = brand ? `?brand_slug=${encodeURIComponent(brand)}&status=published` : "?status=published"
    const [s, c, r, p] = await Promise.allSettled([
      apiFetch<MetricsSummary>(`/api/metrics/summary${qs}`, token),
      apiFetch<ModelCall[]>(`/api/metrics/model-calls${callsQs}`, token),
      apiFetch<InternalReport[]>(`/api/reports?limit=10`, token),
      apiFetch<Publication[]>(`/api/publications${pubQs}`, token)
    ])
    if (s.status === "fulfilled") setSummary(s.value)
    if (c.status === "fulfilled") setCalls(c.value)
    if (r.status === "fulfilled") setReports(r.value)
    setPublishedCount(p.status === "fulfilled" ? p.value.length : 0)
    setLoading(false)
  }, [brand, period])

  useEffect(() => { load() }, [load])

  async function exportReport(id: number, format: "pdf" | "md") {
    const token = getTokenFromCookie()
    if (!token) return
    try {
      await downloadFile(exportPath(`/api/reports/${id}`, format), token, `duofy-relatorio-${id}.${format}`)
    } catch (e: unknown) {
      toast(friendlyError(e, "Falha ao exportar o relatório."), "danger")
    }
  }

  // série de custo por dia (a partir dos model-calls reais)
  const costSeries = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const c of calls) {
      const day = c.created_at.slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + (c.estimated_cost_usd ?? 0))
    }
    const sorted = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    return {
      labels: sorted.map(([d]) => d.slice(5)),
      points: sorted.map(([, v]) => Number((v * 100).toFixed(2))) // centavos de USD p/ visual
    }
  }, [calls])

  const callsByAgent = useMemo(
    () => (summary?.by_agent ?? []).map((a) => ({ label: a.key, value: a.calls })).slice(0, 6),
    [summary]
  )
  const costByAgent = useMemo(
    () => (summary?.by_agent ?? []).map((a) => ({ label: a.key, value: Number((a.cost * 100).toFixed(2)) })).slice(0, 6),
    [summary]
  )
  const tokensByModel = useMemo(
    () => (summary?.by_model ?? []).map((m, i) => ({ label: m.key.replace("~", ""), value: m.tokens, color: DONUT_COLORS[i % DONUT_COLORS.length] })),
    [summary]
  )

  const stats = summary
    ? [
        { icon: <DollarIcon className="h-5 w-5" />, tone: "purple" as const, label: "Custo estimado", value: usd(summary.estimated_cost_usd) },
        { icon: <PhoneIcon className="h-5 w-5" />, tone: "blue" as const, label: "Chamadas de modelo", value: num(summary.total_calls) },
        { icon: <DatabaseIcon className="h-5 w-5" />, tone: "teal" as const, label: "Tokens totais", value: num(summary.total_tokens) },
        { icon: <ZapIcon className="h-5 w-5" />, tone: "amber" as const, label: "Tokens entrada/saída", value: `${num(summary.total_input_tokens)} / ${num(summary.total_output_tokens)}` },
        { icon: <CheckCircleIcon className="h-5 w-5" />, tone: "green" as const, label: "Concluídas", value: `${summary.completed_calls}/${summary.total_calls}` },
        { icon: <RefreshIcon className="h-5 w-5" />, tone: "pink" as const, label: "Latência média", value: summary.avg_latency_ms ? `${(summary.avg_latency_ms / 1000).toFixed(1)}s` : "—" },
        { icon: <SendIcon className="h-5 w-5" />, tone: "indigo" as const, label: "Publicações realizadas", value: num(publishedCount) }
      ]
    : []

  const insights = useMemo(() => {
    if (!summary) return [] as string[]
    const out: string[] = []
    const rate = summary.total_calls ? Math.round((summary.completed_calls / summary.total_calls) * 100) : 0
    out.push(`${rate}% das chamadas de modelo concluíram no período (${summary.completed_calls}/${summary.total_calls}).`)
    const topCost = [...(summary.by_agent ?? [])].sort((a, b) => b.cost - a.cost)[0]
    if (topCost && summary.estimated_cost_usd > 0)
      out.push(`"${topCost.key}" concentra ${Math.round((topCost.cost / summary.estimated_cost_usd) * 100)}% do custo de IA.`)
    const topModel = [...(summary.by_model ?? [])].sort((a, b) => b.tokens - a.tokens)[0]
    if (topModel) out.push(`Modelo mais usado: ${topModel.key.replace("~", "")} (${num(topModel.tokens)} tokens).`)
    if (publishedCount > 0) out.push(`${publishedCount} publicação(ões) registrada(s) no período.`)
    return out
  }, [summary, publishedCount])

  const totalTokens = summary?.total_tokens ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-bold leading-[1.1] tracking-[-0.025em] text-ink">Relatórios</h1>
          <p className="mt-1 text-sm text-muted">Custos e uso de IA reais — dados do OpenRouter via model_calls.{brand ? ` Marca: ${brandName(brand)}.` : " Todas as marcas."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
          <button onClick={load} className="duofy-tap flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple">
            <RefreshIcon className="h-4 w-4" /> Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="duofy-skeleton h-24 rounded-2xl" />)}
        </div>
      ) : !summary ? (
        <div className="duofy-card grid place-items-center rounded-2xl py-16 text-sm text-muted">Não foi possível carregar as métricas.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {stats.map((s) => (
              <StatCard key={s.label} icon={s.icon} iconTone={s.tone} label={s.label} value={s.value} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <ChartCard title="Custo ao longo do tempo" sub={`Centavos de USD por dia · ${PERIOD_OPTIONS.find((p) => p.id === period)?.label}`} right={<span className="rounded-lg bg-purple-soft px-2.5 py-1 text-xs font-semibold text-purple-deep">Diário</span>}>
              {costSeries.points.length === 0 ? (
                <Empty />
              ) : (
                <AreaLineChart points={costSeries.points} labels={costSeries.labels} height={210} format={(v) => `¢${Math.round(v)}`} />
              )}
            </ChartCard>

            <ChartCard title="Chamadas por agente" sub="Distribuição real por agente">
              {callsByAgent.length === 0 ? <Empty /> : <div className="pt-2"><HBarChart data={callsByAgent} /></div>}
            </ChartCard>

            <ChartCard title="Tokens por modelo" sub="Consumo real de tokens">
              {tokensByModel.length === 0 ? (
                <Empty />
              ) : (
                <div className="flex items-center gap-6 pt-2">
                  <DonutChart segments={tokensByModel} centerTop={num(totalTokens)} centerBottom="tokens" />
                  <div className="flex-1"><Legend segments={tokensByModel} format={(v) => `${Math.round((v / (totalTokens || 1)) * 100)}%`} /></div>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Custo por agente" sub="Centavos de USD por agente">
              {costByAgent.length === 0 ? <Empty /> : <div className="pt-2"><HBarChart data={costByAgent} format={(v) => `¢${v.toFixed(1)}`} /></div>}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <TableCard title="Desempenho por agente">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold text-muted">
                    <th className="py-2 pr-3">Agente</th><th className="py-2 pr-3">Chamadas</th><th className="py-2 pr-3">Tokens</th><th className="py-2">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary.by_agent ?? []).map((a) => (
                    <tr key={a.key} className="border-b border-line/70 last:border-0">
                      <td className="py-2.5 pr-3 font-semibold text-ink">{a.key}</td>
                      <td className="py-2.5 pr-3 text-muted">{num(a.calls)}</td>
                      <td className="py-2.5 pr-3 text-muted">{num(a.tokens)}</td>
                      <td className="py-2.5 text-ink">{usd(a.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>

            <TableCard title="Modelos / Provedores">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold text-muted">
                    <th className="py-2 pr-3">Modelo</th><th className="py-2 pr-3">Chamadas</th><th className="py-2 pr-3">Tokens</th><th className="py-2">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary.by_model ?? []).map((m) => (
                    <tr key={m.key} className="border-b border-line/70 last:border-0">
                      <td className="py-2.5 pr-3 font-semibold text-ink">{m.key.replace("~", "")}</td>
                      <td className="py-2.5 pr-3 text-muted">{num(m.calls)}</td>
                      <td className="py-2.5 pr-3 text-muted">{num(m.tokens)}</td>
                      <td className="py-2.5 text-ink">{usd(m.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          </div>

          {/* Insights automáticos + métricas de mídia (honestas) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="duofy-card rounded-2xl p-5">
              <h3 className="flex items-center gap-1.5 text-base font-bold text-ink"><ZapIcon className="h-4 w-4 text-purple" /> Insights automáticos</h3>
              <ul className="mt-3 space-y-2">
                {insights.length === 0 ? (
                  <li className="text-sm text-muted">Sem dados suficientes para insights.</li>
                ) : insights.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-xl border border-line bg-panel/40 p-3 text-xs text-ink/90"><ZapIcon className="mt-0.5 h-4 w-4 shrink-0 text-purple" /> {s}</li>
                ))}
              </ul>
            </section>

            <section className="duofy-card rounded-2xl p-5">
              <h3 className="text-base font-bold text-ink">Métricas de mídia</h3>
              <p className="text-xs text-muted">Dependem de integrações externas — sem dados inventados.</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { label: "Tráfego pago", note: "Requer integração de Ads (Meta/Google)." },
                  { label: "Alcance orgânico", note: "Requer Meta Graph API." },
                  { label: "Leads nutridos", note: "Requer integração de CRM/e-mail." }
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-dashed border-line p-3">
                    <p className="text-xs text-muted">{m.label}</p>
                    <p className="mt-0.5 text-lg font-bold text-ink">—</p>
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber"><AlertTriangleIcon className="h-3.5 w-3.5" /> Configuração pendente</p>
                    <p className="mt-1 text-[10px] leading-tight text-muted">{m.note}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Relatórios internos gerados */}
          <div>
            <h2 className="mb-3 text-lg font-bold tracking-[-0.02em] text-ink">Relatórios internos gerados</h2>
            {reports.length === 0 ? (
              <div className="duofy-card rounded-2xl p-6 text-center text-sm text-muted">
                Nenhum relatório gerado ainda. Os relatórios criados pelo agente de métricas aparecem aqui.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {reports.map((r) => (
                  <div key={r.id} className="duofy-card flex flex-col rounded-2xl p-4">
                    <div className="flex items-start justify-between">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-purple-soft text-purple"><ChartIcon className="h-5 w-5" /></span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => exportReport(r.id, "pdf")} title="Exportar PDF" className="duofy-tap rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-muted hover:border-purple/40 hover:text-purple">PDF</button>
                        <button onClick={() => exportReport(r.id, "md")} title="Exportar Markdown" className="duofy-tap grid h-7 w-7 place-items-center rounded-lg border border-line text-muted hover:border-purple/40 hover:text-purple"><DownloadIcon className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-1 text-sm font-bold text-ink">{r.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{r.report_type} · {brandName(r.brand_slug) ?? "—"}</p>
                    <div className="mt-2 max-h-40 overflow-hidden text-xs text-muted [mask-image:linear-gradient(to_bottom,#000_70%,transparent)]">
                      <Markdown content={r.content} className="text-xs text-muted" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ChartCard({ title, sub, right, children }: { title: string; sub: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="duofy-card rounded-2xl p-5">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold text-ink">{title}</h3>
          <p className="text-xs text-muted">{sub}</p>
        </div>
        {right ?? <button className="text-muted"><MoreIcon className="h-5 w-5" /></button>}
      </div>
      {children}
    </section>
  )
}

function TableCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="duofy-card rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-base font-bold text-ink"><ChartIcon className="h-4 w-4 text-muted" /> {title}</h3>
      </div>
      <div className="overflow-x-auto duofy-scroll">{children}</div>
    </section>
  )
}

function Empty() {
  return <div className="grid h-[180px] place-items-center text-sm text-muted">Sem dados no período.</div>
}
