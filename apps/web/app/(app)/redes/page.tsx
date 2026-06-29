"use client"

import { useState } from "react"
import { DonutChart, HBarChart, Legend } from "@/components/charts"
import { Badge } from "@/components/ui"
import { ChevronDownIcon, DownloadIcon, SparklesIcon, AlertTriangleIcon, ZapIcon, MoreIcon } from "@/components/icons"

// ── Mock data ──────────────────────────────────────────────────────────────

const ORGANIC_KPIS = [
  { label: "Alcance", value: "1,28M", delta: "18,7%", dir: "up" as const, spark: [40,55,50,70,68,85,95,112] },
  { label: "Impressões", value: "2,91M", delta: "16,2%", dir: "up" as const, spark: [100,120,115,145,140,165,175,200] },
  { label: "Engajamento", value: "145,6K", delta: "22,4%", dir: "up" as const, spark: [60,72,65,80,78,95,100,118] },
  { label: "Seguidores ganhos", value: "7.642", delta: "34,1%", dir: "up" as const, spark: [200,280,250,320,300,380,420,500] },
]

const PAID_KPIS = [
  { label: "Investimento", value: "R$ 23.842,18", delta: "4,1%", dir: "down" as const, spark: [8.5,8.0,8.2,7.8,8.5,8.0,7.6,7.2] },
  { label: "CPC médio", value: "R$ 1,24", delta: "12,3%", dir: "down" as const, spark: [1.8,1.7,1.6,1.5,1.4,1.3,1.25,1.24] },
  { label: "CTR médio", value: "1,87%", delta: "24,8%", dir: "up" as const, spark: [1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.87] },
  { label: "ROAS", value: "3,42", delta: "28,6%", dir: "up" as const, spark: [2,2.3,2.5,2.8,3,3.1,3.3,3.42] },
]

const PERF_LABELS = ["01 mai","06 mai","11 mai","16 mai","21 mai","26 mai","31 mai"]
const SERIES = [
  { label: "Alcance",    color: "#6d35ee", points: [200000,280000,250000,320000,300000,380000,400000] },
  { label: "Impressões", color: "#8b5cf6", points: [450000,600000,550000,720000,680000,850000,920000] },
  { label: "Engajamento",color: "#0d9488", points: [80000,110000,95000,130000,120000,160000,175000] },
]

const FUNNEL = [
  { label: "Impressões",         value: "2,91M",        pct: null,    delta: null,    up: true  },
  { label: "Cliques (todos)",    value: "54.423",       pct: "1,87%", delta: "24,8%", up: true  },
  { label: "Cliques no link",    value: "18.732",       pct: "0,64%", delta: "18,6%", up: true  },
  { label: "Conversões",         value: "3.214",        pct: "11,5%", delta: "20,9%", up: true  },
  { label: "Valor de conversão", value: "R$ 81.417,32", pct: null,    delta: "28,6%", up: true  },
]

const TOP_CAMPANHAS = [
  { name: "Campanha | Conversão | Maio",        invest: "R$ 7.812,20", roas: 4.82 },
  { name: "Campanha | Tráfego | Reels",          invest: "R$ 3.245,11", roas: 3.91 },
  { name: "Campanha | Vendas | Lookalike 1%",    invest: "R$ 6.127,43", roas: 3.27 },
  { name: "Campanha | Engajamento | Stories",    invest: "R$ 2.134,89", roas: 2.88 },
  { name: "Campanha | Conversão | Remarketing",  invest: "R$ 4.522,55", roas: 2.41 },
]

const BEST_POSTS = [
  { title: "5 dicas para organizar seu conteúdo",     tipo: "Reels",     alcance: "182,6K", eng: "12,5K" },
  { title: "Checklist de planejamento mensal",         tipo: "Carrossel", alcance: "143,9K", eng: "9,8K"  },
  { title: "Bastidores: como criamos campanhas",       tipo: "Reels",     alcance: "121,3K", eng: "8,2K"  },
]

const STORIES = [
  { title: "Bastidores da gravação",   tipo: "Stories", conclusoes: "78,4K", taxa: "62%" },
  { title: "Dica rápida: CTA eficaz", tipo: "Reels",   conclusoes: "51,7K", taxa: "48%" },
  { title: "Template gratuito",        tipo: "Stories", conclusoes: "46,2K", taxa: "57%" },
]

const FAIXA = [
  { label: "18–24", value: 12 },
  { label: "25–34", value: 38 },
  { label: "35–44", value: 28 },
  { label: "45–54", value: 15 },
  { label: "55+",   value:  7 },
]

const GENERO = [
  { label: "Mulheres", value: 64, color: "#6d35ee" },
  { label: "Homens",   value: 34, color: "#2563eb" },
  { label: "Outros",   value:  2, color: "#94a3b8" },
]

const DAYS = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"]
const PEAK_DAYS = new Set([1,2,3]) // Ter Qua Qui

const ADS = [
  { name: "Campanha | Conversão | Maio",       obj: "Conversões",  invest: "R$ 7.812,20", cpm: "R$ 16,42", cpc: "R$ 1,12", ctr: "2,31%", conv: "1.842",  roas: "4,82", status: "Ativa",   active: true  },
  { name: "Campanha | Tráfego | Reels",         obj: "Tráfego",     invest: "R$ 3.245,11", cpm: "R$ 12,81", cpc: "R$ 1,35", ctr: "1,76%", conv: "—",      roas: "3,91", status: "Ativa",   active: true  },
  { name: "Campanha | Vendas | Lookalike 1%",   obj: "Conversões",  invest: "R$ 6.127,43", cpm: "R$ 18,76", cpc: "R$ 1,06", ctr: "2,09%", conv: "1.478",  roas: "3,27", status: "Ativa",   active: true  },
  { name: "Campanha | Engajamento | Stories",   obj: "Engajamento", invest: "R$ 2.134,89", cpm: "R$ 9,72",  cpc: "R$ 0,87", ctr: "1,94%", conv: "—",      roas: "2,88", status: "Ativa",   active: true  },
  { name: "Campanha | Conversão | Remarketing", obj: "Conversões",  invest: "R$ 4.522,55", cpm: "R$ 20,13", cpc: "R$ 1,18", ctr: "1,98%", conv: "1.096",  roas: "2,41", status: "Pausada", active: false },
]

// ── Sub-components ─────────────────────────────────────────────────────────

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const max = Math.max(...data), min = Math.min(...data)
  const range = max - min || 1
  const W = 80, H = 20
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`
  ).join(" ")
  return (
    <svg width={W} height={H} className="overflow-visible opacity-70">
      <polyline points={pts} fill="none" stroke={up ? "#22c55e" : "#ef4444"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MultiLineChart({ labels }: { labels: string[] }) {
  const W = 640, PAD = { t: 16, r: 12, b: 28, l: 50 }
  const H = 200
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b
  const allPts = SERIES.flatMap(s => s.points)
  const max = Math.max(...allPts) * 1.1 || 1
  const n = SERIES[0].points.length
  const x = (i: number) => PAD.l + (i / Math.max(n - 1, 1)) * iw
  const y = (v: number) => PAD.t + ih - (v / max) * ih
  const fmtK = (v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`
  const ticks = 4
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <defs>
        {SERIES.map((s, si) => (
          <linearGradient key={si} id={`redes-area-${si}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.12" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const gy = PAD.t + (i / ticks) * ih
        const val = max - (i / ticks) * max
        return (
          <g key={i}>
            <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy} stroke="#eeedf4" strokeWidth="1" />
            <text x={PAD.l - 6} y={gy + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{fmtK(val)}</text>
          </g>
        )
      })}
      {SERIES.map((s, si) => {
        const line = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ")
        const area = `${line} L${x(n-1).toFixed(1)},${PAD.t + ih} L${x(0).toFixed(1)},${PAD.t + ih} Z`
        return (
          <g key={si}>
            <path d={area} fill={`url(#redes-area-${si})`} />
            <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )
      })}
      {labels.map((l, i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">{l}</text>
      ))}
    </svg>
  )
}

function FunnelViz() {
  const n = FUNNEL.length
  const W = 180, stepH = 38, gap = 3
  const H = n * (stepH + gap)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      {FUNNEL.map((_, i) => {
        const topRatio = 1 - i * 0.14
        const btmRatio = Math.max(1 - (i + 1) * 0.14, 0.1)
        const topW = W * topRatio, btmW = W * btmRatio
        const x1t = (W - topW) / 2, x2t = (W + topW) / 2
        const x1b = (W - btmW) / 2, x2b = (W + btmW) / 2
        const y1 = i * (stepH + gap), y2 = y1 + stepH
        return (
          <polygon
            key={i}
            points={`${x1t},${y1} ${x2t},${y1} ${x2b},${y2} ${x1b},${y2}`}
            fill="#6d35ee"
            opacity={1 - i * 0.14}
          />
        )
      })}
    </svg>
  )
}

function KpiCard({ label, value, delta, dir, spark }: { label: string; value: string; delta: string; dir: "up" | "down"; spark: number[] }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold leading-none text-ink">{value}</p>
      <p className={`mt-1 text-[11px] font-semibold ${dir === "up" ? "text-green-600" : "text-red-500"}`}>
        {dir === "up" ? "↑" : "↓"} {delta} <span className="font-normal text-muted">vs. 01–30 abr</span>
      </p>
      <div className="mt-2"><Sparkline data={spark} up={dir === "up"} /></div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function RedesPage() {
  const [interval, setInterval] = useState<"Diário" | "Semanal">("Diário")
  const [agentInput, setAgentInput] = useState("")

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto duofy-scroll">
        <div className="space-y-5 p-6 min-w-0">

          {/* Header */}
          <div>
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6d35ee" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 2H7a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h10a5 5 0 0 0 5-5V7a5 5 0 0 0-5-5z"/>
                <path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/>
              </svg>
              <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-ink">Redes & Tráfego</h1>
            </div>
            <p className="mt-0.5 text-sm text-muted">Acompanhe insights do Instagram e dados do Gerenciador de Anúncios com supervisão humana.</p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { icon: true, label: "01 – 31 mai 2025" },
              { icon: false, label: "@duofy.oficial" },
              { icon: false, label: "Instagram" },
              { icon: false, label: "Todas as campanhas" },
            ].map((f, i) => (
              <button key={i} className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink hover:border-purple-deep/30 transition-colors">
                {i === 0 && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
                {i === 1 && <span className="h-4 w-4 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-[8px] font-bold text-white">D</span>}
                {i === 2 && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e1306c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>}
                {f.label}
                <ChevronDownIcon className="w-3.5 h-3.5 text-muted" />
              </button>
            ))}
            <button
              onClick={() => typeof window !== "undefined" && window.print()}
              className="duofy-tap ml-auto flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink hover:border-purple-deep/30"
            >
              <DownloadIcon className="w-3.5 h-3.5" /> Exportar PDF
            </button>
          </div>

          {/* Organic KPIs */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Métricas orgânicas (Instagram)</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {ORGANIC_KPIS.map((k) => <KpiCard key={k.label} {...k} />)}
            </div>
          </div>

          {/* Paid KPIs */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Métricas mídia paga (Meta Ads)</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {PAID_KPIS.map((k) => <KpiCard key={k.label} {...k} />)}
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">

            {/* Performance chart */}
            <div className="lg:col-span-2 rounded-xl border border-line bg-white p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">Performance do Instagram ao longo do tempo</p>
                  <div className="mt-1.5 flex items-center gap-3">
                    {SERIES.map((s) => (
                      <span key={s.label} className="flex items-center gap-1 text-[11px] text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">
                  {(["Diário","Semanal"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setInterval(v)}
                      className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${interval === v ? "bg-purple-deep text-white" : "text-muted hover:text-ink"}`}
                    >{v}</button>
                  ))}
                </div>
              </div>
              <MultiLineChart labels={PERF_LABELS} />
            </div>

            {/* Funnel */}
            <div className="lg:col-span-2 rounded-xl border border-line bg-white p-5 shadow-card">
              <p className="mb-3 text-sm font-semibold text-ink">Funil de resultados de anúncios</p>
              <div className="flex gap-4">
                <div className="w-24 shrink-0">
                  <FunnelViz />
                </div>
                <div className="flex-1 space-y-1 pt-1">
                  <div className="grid grid-cols-3 gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted pb-1 border-b border-line">
                    <span>Etapa</span><span className="text-right">Taxa</span><span className="text-right">vs. anterior</span>
                  </div>
                  {FUNNEL.map((f, i) => (
                    <div key={i} className="grid grid-cols-3 gap-1 text-xs py-1">
                      <div>
                        <p className="font-medium text-ink leading-tight">{f.label}</p>
                        <p className="text-muted">{f.value}</p>
                      </div>
                      <p className="text-right text-muted">{f.pct ?? "—"}</p>
                      <p className={`text-right font-semibold ${f.delta ? (f.up ? "text-green-600" : "text-red-500") : "text-muted"}`}>
                        {f.delta ? `↑ ${f.delta}` : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top campanhas */}
            <div className="lg:col-span-1 rounded-xl border border-line bg-white p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Top campanhas por ROAS</p>
                <span className="rounded-lg border border-line px-2 py-0.5 text-[11px] font-medium text-muted">ROAS</span>
              </div>
              <div className="space-y-3">
                {TOP_CAMPANHAS.map((c, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="truncate pr-2 text-ink font-medium">{c.name}</span>
                      <span className="shrink-0 font-bold text-purple-deep">{c.roas.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-line/70 overflow-hidden">
                      <div className="h-full rounded-full bg-purple-deep" style={{ width: `${(c.roas / 5) * 100}%` }} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted">{c.invest}</p>
                  </div>
                ))}
              </div>
              <button className="mt-3 w-full text-center text-xs font-medium text-purple-deep hover:underline">
                Ver todas as campanhas →
              </button>
            </div>

          </div>

          {/* Instagram Insights */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">

            {/* Melhores posts */}
            <div className="rounded-xl border border-line bg-white p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Melhores posts</p>
                <button className="text-xs font-medium text-purple-deep hover:underline">Ver todos</button>
              </div>
              <div className="grid grid-cols-4 gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted pb-1 border-b border-line">
                <span className="col-span-2">Post</span><span className="text-right">Alcance</span><span className="text-right">Eng.</span>
              </div>
              {BEST_POSTS.map((p, i) => (
                <div key={i} className="grid grid-cols-4 gap-1 items-center border-b border-line py-2.5 last:border-0">
                  <div className="col-span-2 flex items-center gap-2">
                    <span className="h-8 w-8 shrink-0 rounded-md bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center text-purple-deep text-xs font-bold">{i+1}</span>
                    <div>
                      <p className="text-xs font-medium text-ink leading-tight line-clamp-2">{p.title}</p>
                      <Badge tone="slate">{p.tipo}</Badge>
                    </div>
                  </div>
                  <p className="text-right text-xs text-muted">{p.alcance}</p>
                  <p className="text-right text-xs font-semibold text-ink">{p.eng}</p>
                </div>
              ))}
            </div>

            {/* Stories & Reels */}
            <div className="rounded-xl border border-line bg-white p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Stories & Reels – Performance</p>
                <button className="text-xs font-medium text-purple-deep hover:underline">Ver todos</button>
              </div>
              <div className="grid grid-cols-4 gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted pb-1 border-b border-line">
                <span className="col-span-2">Conteúdo</span><span className="text-right">Conclusões</span><span className="text-right">Taxa</span>
              </div>
              {STORIES.map((s, i) => (
                <div key={i} className="grid grid-cols-4 gap-1 items-center border-b border-line py-2.5 last:border-0">
                  <div className="col-span-2 flex items-center gap-2">
                    <span className="h-8 w-8 shrink-0 rounded-md bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6d35ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </span>
                    <div>
                      <p className="text-xs font-medium text-ink leading-tight line-clamp-2">{s.title}</p>
                      <Badge tone={s.tipo === "Reels" ? "purple" : "slate"}>{s.tipo}</Badge>
                    </div>
                  </div>
                  <p className="text-right text-xs text-muted">{s.conclusoes}</p>
                  <p className="text-right text-xs font-semibold text-green-600">{s.taxa}</p>
                </div>
              ))}
            </div>

            {/* Audiência */}
            <div className="rounded-xl border border-line bg-white p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Audiência & maior atividade</p>
                <button className="text-xs font-medium text-purple-deep hover:underline">Ver detalhes</button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Faixa etária</p>
                  <HBarChart data={FAIXA} format={(v) => `${v}%`} />
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Gênero</p>
                  <DonutChart segments={GENERO} size={90} thickness={16} centerTop={<span className="text-xs font-bold">64%</span>} />
                  <Legend segments={GENERO} format={(v) => `${v}%`} />
                </div>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Horários de maior atividade <span className="font-normal normal-case text-purple-deep">19h – 22h</span></p>
                <div className="grid grid-cols-7 gap-0.5">
                  {DAYS.map((d, i) => (
                    <div key={d} className="space-y-0.5">
                      <div className={`h-2 w-full rounded-sm ${PEAK_DAYS.has(i) ? "bg-purple-deep" : "bg-line"}`} />
                      <p className="text-center text-[9px] text-muted">{d}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Gerenciador de Anúncios */}
          <div className="rounded-xl border border-line bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1877F2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                </svg>
                <p className="font-semibold text-ink">Gerenciador de Anúncios</p>
              </div>
              <button className="text-xs font-medium text-purple-deep hover:underline">Ver todas as campanhas →</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {["Campanha","Objetivo","Investimento","CPM","CPC","CTR","Conversões","ROAS","Status",""].map((h, i) => (
                      <th key={i} className={`px-4 py-3 ${i > 1 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ADS.map((a, i) => (
                    <tr key={i} className="border-b border-line last:border-0 hover:bg-surface/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1877F2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                          </svg>
                          <span className="font-medium text-ink">{a.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">{a.obj}</td>
                      <td className="px-4 py-3 text-right font-medium text-ink">{a.invest}</td>
                      <td className="px-4 py-3 text-right text-muted">{a.cpm}</td>
                      <td className="px-4 py-3 text-right text-muted">{a.cpc}</td>
                      <td className="px-4 py-3 text-right text-muted">{a.ctr}</td>
                      <td className="px-4 py-3 text-right text-muted">{a.conv}</td>
                      <td className="px-4 py-3 text-right font-bold text-purple-deep">{a.roas}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${a.active ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${a.active ? "bg-green-500" : "bg-amber-500"}`} />
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-muted hover:text-ink transition-colors"><MoreIcon className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="h-4" />
        </div>
      </div>

      {/* ── Agente de insights sidebar ── */}
      <div className="hidden w-64 shrink-0 overflow-y-auto duofy-scroll border-l border-line bg-white lg:flex lg:flex-col xl:w-72">
        <div className="border-b border-line px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-deep/10">
                <SparklesIcon className="h-4 w-4 text-purple-deep" />
              </div>
              <p className="font-semibold text-ink">Agente de insights</p>
            </div>
            <Badge tone="purple">Beta</Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted">Análise com base em dados da Meta e supervisão humana.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted flex items-center gap-1">
              <AlertTriangleIcon className="w-3 h-3 text-amber-500" /> Anomalias detectadas
            </p>
            <ul className="space-y-1.5">
              {[
                "Queda de 21% no alcance orgânico entre 18 e 22 mai.",
                "Aumento de CPC em 12,3% na campanha Tráfego | Reels.",
              ].map((t, i) => (
                <li key={i} className="flex gap-2 text-xs text-ink">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted flex items-center gap-1">
              <ZapIcon className="w-3 h-3 text-purple-deep" /> Oportunidades
            </p>
            <ul className="space-y-1.5">
              {[
                "Reels com tema bastidores têm 2,3x mais engajamento.",
                "Campanhas de conversão com público 1% lookalike entregam melhor ROAS.",
              ].map((t, i) => (
                <li key={i} className="flex gap-2 text-xs text-ink">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-deep" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Recomendações</p>
            <ul className="space-y-1.5">
              {[
                "Aumentar investimento nas campanhas de conversão com público 1%.",
                "Testar novos criativos para reduzir CPC na campanha Tráfego | Reels.",
              ].map((t, i) => (
                <li key={i} className="flex gap-2 text-xs text-ink">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[11px] text-muted">Insights e recomendações para análise com supervisão humana.</p>
        </div>

        <div className="border-t border-line p-4 space-y-2">
          <button className="w-full flex items-center justify-center gap-2 rounded-lg bg-purple-deep py-2.5 text-sm font-semibold text-white hover:bg-purple-deep/90 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Gerar relatório
          </button>
          <button className="w-full flex items-center justify-center gap-2 rounded-lg border border-line py-2 text-sm font-medium text-ink hover:bg-surface transition-colors">
            <SparklesIcon className="w-3.5 h-3.5" /> Ver recomendações
          </button>
          <button className="w-full flex items-center justify-center gap-2 rounded-lg border border-line py-2 text-sm font-medium text-ink hover:bg-surface transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Enviar para revisão
          </button>
          <p className="flex items-center justify-center gap-1 text-[10px] text-muted">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Recomendado para análise humana
          </p>
        </div>
      </div>

    </div>
  )
}
