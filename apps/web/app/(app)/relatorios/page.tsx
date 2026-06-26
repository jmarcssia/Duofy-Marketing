"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { AreaLineChart, DonutChart, HBarChart, Legend } from "@/components/charts"
import { GhostButton, StatCard } from "@/components/ui"
import {
  ChartIcon,
  CheckCircleIcon,
  DatabaseIcon,
  DollarIcon,
  MoreIcon,
  PhoneIcon,
  RefreshIcon,
  ZapIcon
} from "@/components/icons"
import { apiFetch, type MetricsSummary, type ModelCall, type InternalReport } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"

const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const num = (v: number) => v.toLocaleString("pt-BR")
const DONUT_COLORS = ["#6d35ee", "#8b5cf6", "#2563eb", "#0d9488", "#f97316", "#db2777"]

export default function RelatoriosPage() {
  const { selected: brand } = useBrand()
  const [summary, setSummary] = useState<MetricsSummary | null>(null)
  const [calls, setCalls] = useState<ModelCall[]>([])
  const [reports, setReports] = useState<InternalReport[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    setLoading(true)
    const qs = brand ? `?brand_slug=${brand}` : ""
    const [s, c, r] = await Promise.allSettled([
      apiFetch<MetricsSummary>(`/api/metrics/summary${qs}`, token),
      apiFetch<ModelCall[]>(`/api/metrics/model-calls?limit=300`, token),
      apiFetch<InternalReport[]>(`/api/reports?limit=10`, token)
    ])
    if (s.status === "fulfilled") setSummary(s.value)
    if (c.status === "fulfilled") setCalls(brand ? c.value.filter((x) => x.brand_slug === brand) : c.value)
    if (r.status === "fulfilled") setReports(r.value)
    setLoading(false)
  }, [brand])

  useEffect(() => { load() }, [load])

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
        { icon: <RefreshIcon className="h-5 w-5" />, tone: "pink" as const, label: "Latência média", value: summary.avg_latency_ms ? `${(summary.avg_latency_ms / 1000).toFixed(1)}s` : "—" }
      ]
    : []

  const totalTokens = summary?.total_tokens ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-extrabold tracking-[-0.04em] text-ink">Relatórios</h1>
          <p className="mt-1 text-sm text-muted">Custos e uso de IA reais — dados do OpenRouter via model_calls.{brand ? ` Marca: ${brand}.` : " Todas as marcas."}</p>
        </div>
        <button onClick={load} className="flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple">
          <RefreshIcon className="h-4 w-4" /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-line/50" />)}
        </div>
      ) : !summary ? (
        <div className="duofy-card grid place-items-center rounded-2xl py-16 text-sm text-muted">Não foi possível carregar as métricas.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
            {stats.map((s) => (
              <StatCard key={s.label} icon={s.icon} iconTone={s.tone} label={s.label} value={s.value} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ChartCard title="Custo ao longo do tempo" sub="Centavos de USD por dia (model_calls reais)" right={<GhostButton className="text-xs">Diário</GhostButton>}>
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

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <TableCard title="Desempenho por agente">
              <table className="w-full min-w-[460px] text-sm">
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
              <table className="w-full min-w-[460px] text-sm">
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

          {/* Relatórios internos gerados */}
          <div>
            <h2 className="mb-3 text-lg font-bold tracking-[-0.02em] text-ink">Relatórios internos gerados</h2>
            {reports.length === 0 ? (
              <div className="duofy-card rounded-2xl p-6 text-center text-sm text-muted">
                Nenhum relatório gerado ainda. Os relatórios criados pelo agente de métricas aparecem aqui.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {reports.map((r) => (
                  <div key={r.id} className="duofy-card rounded-2xl p-4">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-purple-soft text-purple"><ChartIcon className="h-5 w-5" /></span>
                    <p className="mt-3 line-clamp-1 text-sm font-bold text-ink">{r.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{r.report_type} · {r.brand_slug ?? "—"}</p>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted">{r.content}</p>
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
