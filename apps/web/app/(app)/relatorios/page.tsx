"use client"

import { AreaLineChart, DonutChart, HBarChart, Legend } from "@/components/charts"
import { Badge, GhostButton, StatCard } from "@/components/ui"
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ChartIcon,
  CheckCircleIcon,
  DatabaseIcon,
  DollarIcon,
  DownloadIcon,
  MoreIcon,
  PhoneIcon,
  PiggyIcon,
  RefreshIcon,
  ShareIcon,
  TrendDownIcon,
  TrendUpIcon
} from "@/components/icons"
import {
  agentPerformance,
  callsByAgent,
  costByWorkflow,
  costOverTime,
  modelTable,
  potentialSaving,
  reportInsights,
  reportStats,
  tokensByModel
} from "@/lib/mock"

const statIcons: Record<string, typeof DollarIcon> = {
  dollar: DollarIcon,
  phone: PhoneIcon,
  database: DatabaseIcon,
  refresh: RefreshIcon,
  check: CheckCircleIcon,
  piggy: PiggyIcon
}
const insightIcons: Record<string, typeof ShareIcon> = {
  share: ShareIcon,
  alert: AlertTriangleIcon,
  trend: TrendUpIcon,
  check: CheckCircleIcon
}
const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[30px] font-extrabold tracking-[-0.04em] text-ink">Relatórios</h1>
        <p className="mt-1 text-sm text-muted">Acompanhe o desempenho, os custos e o uso de IA em todo o workspace.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {[
          { label: "Período", value: "Últimos 30 dias" },
          { label: "Workspace", value: "Workspace Growth" },
          { label: "Marca", value: "Todas as marcas" },
          { label: "Agente", value: "Todos os agentes" },
          { label: "Modelo", value: "Todos os modelos" }
        ].map((f) => (
          <label key={f.label} className="flex min-w-[150px] flex-1 flex-col gap-1">
            <span className="text-xs font-semibold text-muted">{f.label}</span>
            <div className="flex h-10 items-center justify-between rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink">
              {f.value}
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" strokeLinecap="round" /></svg>
            </div>
          </label>
        ))}
        <button className="flex h-10 items-center gap-2 rounded-xl bg-purple px-4 text-sm font-semibold text-white shadow-lg shadow-purple/20 transition hover:bg-purple-deep">
          <DownloadIcon className="h-4 w-4" /> Exportar relatório
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {reportStats.map((s) => {
          const Icon = statIcons[s.icon]
          return (
            <StatCard key={s.label} icon={<Icon className="h-5 w-5" />} iconTone={s.tone} label={s.label} value={s.value} delta={s.delta} deltaDir={s.dir} />
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard title="Custo ao longo do tempo" sub="Valores em Reais (R$)" right={<GhostButton className="text-xs">Diário ⌄</GhostButton>}>
          <AreaLineChart points={costOverTime.points} labels={costOverTime.labels} height={210} format={(v) => `${Math.round(v / 1000)}k`} />
        </ChartCard>
        <ChartCard title="Chamadas por agente" sub="Top 6 agentes por número de chamadas">
          <div className="pt-2">
            <HBarChart data={callsByAgent} />
          </div>
        </ChartCard>
        <ChartCard title="Tokens por modelo" sub="Distribuição do consumo de tokens">
          <div className="flex items-center gap-6 pt-2">
            <DonutChart segments={tokensByModel} centerTop="145,2M" centerBottom="tokens" />
            <div className="flex-1"><Legend segments={tokensByModel} format={(v) => `${v}%`} /></div>
          </div>
        </ChartCard>
        <ChartCard title="Uso por fluxo de trabalho" sub="Custo por fluxo (R$)">
          <div className="pt-2">
            <HBarChart data={costByWorkflow} format={brl} />
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <TableCard title="Desempenho por agente">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold text-muted">
                <th className="py-2 pr-3">Agente</th><th className="py-2 pr-3">Chamadas</th><th className="py-2 pr-3">Tokens</th><th className="py-2 pr-3">Custo</th><th className="py-2 pr-3">Eficiência</th><th className="py-2">Sucesso</th>
              </tr>
            </thead>
            <tbody>
              {agentPerformance.map((a) => (
                <tr key={a.agent} className="border-b border-line/70 last:border-0">
                  <td className="py-2.5 pr-3 font-semibold text-ink">{a.agent}</td>
                  <td className="py-2.5 pr-3 text-muted">{a.calls}</td>
                  <td className="py-2.5 pr-3 text-muted">{a.tokens}</td>
                  <td className="py-2.5 pr-3 text-ink">{a.cost}</td>
                  <td className="py-2.5 pr-3"><Delta value={a.eff} delta={a.delta} dir={a.dir} /></td>
                  <td className="py-2.5 text-muted">{a.success}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="mt-3 text-sm font-semibold text-purple">Ver todos os agentes →</button>
        </TableCard>

        <TableCard title="Modelos OpenRouter">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold text-muted">
                <th className="py-2 pr-3">Modelo</th><th className="py-2 pr-3">Tokens</th><th className="py-2 pr-3">% total</th><th className="py-2 pr-3">Custo</th><th className="py-2 pr-3">Custo/1M</th><th className="py-2">Eficiência</th>
              </tr>
            </thead>
            <tbody>
              {modelTable.map((m) => (
                <tr key={m.model} className="border-b border-line/70 last:border-0">
                  <td className="py-2.5 pr-3 font-semibold text-ink">{m.model}</td>
                  <td className="py-2.5 pr-3 text-muted">{m.tokens}</td>
                  <td className="py-2.5 pr-3 text-muted">{m.pct}</td>
                  <td className="py-2.5 pr-3 text-ink">{m.cost}</td>
                  <td className="py-2.5 pr-3 text-muted">{m.per1m}</td>
                  <td className="py-2.5"><Delta value={m.eff} delta={m.delta} dir={m.dir} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="mt-3 text-sm font-semibold text-purple">Ver todos os modelos →</button>
        </TableCard>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold tracking-[-0.02em] text-ink">Insights principais</h2>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-4 xl:grid-cols-4">
            {reportInsights.map((ins) => {
              const Icon = insightIcons[ins.icon] ?? ShareIcon
              return (
                <div key={ins.title} className="duofy-card rounded-2xl p-4">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-purple-soft text-purple"><Icon className="h-5 w-5" /></span>
                  <p className="mt-3 text-sm font-bold text-ink">{ins.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{ins.text}</p>
                  <button className="mt-2 text-xs font-semibold text-purple">{ins.link}</button>
                </div>
              )
            })}
          </div>
          <div className="rounded-2xl bg-purple p-5 text-white shadow-lg shadow-purple/20 lg:col-span-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-white/90"><PiggyIcon className="h-5 w-5" /> Economia potencial</p>
            <p className="mt-2 text-xs text-white/70">Com as otimizações sugeridas, é possível economizar até</p>
            <p className="mt-3 text-3xl font-extrabold">{potentialSaving.value}</p>
            <p className="text-xs text-white/70">{potentialSaving.window}</p>
            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white/15 py-2.5 text-sm font-semibold text-white transition hover:bg-white/25">
              Ver plano de otimização <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
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
        <button className="text-muted"><MoreIcon className="h-5 w-5" /></button>
      </div>
      <div className="overflow-x-auto duofy-scroll">{children}</div>
    </section>
  )
}

function Delta({ value, delta, dir }: { value: string; delta: string; dir: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-ink">{value}</span>
      <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${dir === "up" ? "text-green" : "text-red"}`}>
        {dir === "up" ? <TrendUpIcon className="h-3 w-3" /> : <TrendDownIcon className="h-3 w-3" />}
        {delta}
      </span>
    </span>
  )
}
