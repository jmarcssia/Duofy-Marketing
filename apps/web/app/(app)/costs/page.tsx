"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { EmptyState, PageTitle, SectionCard, SoftButton } from "@/components/page-primitives"
import { apiFetch, type Brand, type MetricsSummary, type ModelCall } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"

function usd(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6
  }).format(value ?? 0)
}

function number(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0)
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))
}

export default function CostsPage() {
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>([])
  const [brand, setBrand] = useState("")
  const [status, setStatus] = useState("")
  const [summary, setSummary] = useState<MetricsSummary | null>(null)
  const [calls, setCalls] = useState<ModelCall[]>([])
  const [error, setError] = useState<string | null>(null)

  async function loadData(token: string, nextBrand = brand, nextStatus = status) {
    const summaryParams = new URLSearchParams()
    const callsParams = new URLSearchParams({ limit: "100" })
    if (nextBrand) {
      summaryParams.set("brand_slug", nextBrand)
      callsParams.set("brand_slug", nextBrand)
    }
    if (nextStatus) callsParams.set("status", nextStatus)
    const [nextSummary, nextCalls] = await Promise.all([
      apiFetch<MetricsSummary>(`/api/metrics/summary?${summaryParams.toString()}`, token),
      apiFetch<ModelCall[]>(`/api/metrics/model-calls?${callsParams.toString()}`, token)
    ])
    setSummary(nextSummary)
    setCalls(nextCalls)
  }

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) {
      router.replace("/login")
      return
    }
    Promise.all([apiFetch<Brand[]>("/api/brands", token), loadData(token)])
      .then(([brandList]) => setBrands(brandList))
      .catch(() => setError("Nao foi possivel carregar metricas de custo."))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function refresh(nextBrand = brand, nextStatus = status) {
    const token = getTokenFromCookie()
    if (!token) return
    setError(null)
    try {
      await loadData(token, nextBrand, nextStatus)
    } catch {
      setError("Nao foi possivel atualizar metricas.")
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Custos e Tokens"
        subtitle="Acompanhe chamadas de IA, tokens, latencia e custo estimado por provider, modelo e agente."
      />

      {error ? (
        <p className="rounded-2xl border border-red/20 bg-red/5 p-4 text-sm font-semibold text-red">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={brand}
          onChange={(event) => {
            setBrand(event.target.value)
            refresh(event.target.value, status)
          }}
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3 text-sm"
        >
          <option value="">Todas as marcas</option>
          {brands.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            refresh(brand, event.target.value)
          }}
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3 text-sm"
        >
          <option value="">Todos os status</option>
          <option value="completed">Concluidas</option>
          <option value="failed">Falhas</option>
        </select>
        <SoftButton type="button" onClick={() => refresh()}>
          Atualizar
        </SoftButton>
      </div>

      <div className="grid gap-5 md:grid-cols-4">
        <SectionCard title="Chamadas">
          <div className="text-4xl font-extrabold tracking-[-0.06em]">
            {number(summary?.total_calls)}
          </div>
          <p className="mt-2 text-sm text-muted">{number(summary?.failed_calls)} falhas</p>
        </SectionCard>
        <SectionCard title="Tokens">
          <div className="text-4xl font-extrabold tracking-[-0.06em]">
            {number(summary?.total_tokens)}
          </div>
          <p className="mt-2 text-sm text-muted">
            {number(summary?.total_input_tokens)} in / {number(summary?.total_output_tokens)} out
          </p>
        </SectionCard>
        <SectionCard title="Custo estimado">
          <div className="text-4xl font-extrabold tracking-[-0.06em]">
            {usd(summary?.estimated_cost_usd)}
          </div>
          <p className="mt-2 text-sm text-muted">Estimativa local, nao billing oficial.</p>
        </SectionCard>
        <SectionCard title="Latencia media">
          <div className="text-4xl font-extrabold tracking-[-0.06em]">
            {number(Math.round(summary?.avg_latency_ms ?? 0))} ms
          </div>
          <p className="mt-2 text-sm text-muted">Media das chamadas filtradas.</p>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
        <div className="space-y-5">
          <SectionCard title="Por provider">
            <div className="space-y-3">
              {(summary?.by_provider ?? []).map((item) => (
                <div key={item.key} className="rounded-2xl border border-line bg-white p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <strong>{item.key}</strong>
                    <span>{usd(item.cost)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {number(item.calls)} chamadas / {number(item.tokens)} tokens
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Por agente">
            <div className="space-y-3">
              {(summary?.by_agent ?? []).map((item) => (
                <div key={item.key} className="rounded-2xl border border-line bg-white p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <strong>{item.key}</strong>
                    <span>{usd(item.cost)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {number(item.calls)} chamadas / {number(item.tokens)} tokens
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Chamadas recentes">
          {calls.length === 0 ? (
            <EmptyState
              title="Sem chamadas registradas"
              description="As metricas comecam a aparecer apos novas execucoes de IA."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Agente</th>
                    <th className="px-4 py-3">Modelo</th>
                    <th className="px-4 py-3">Tokens</th>
                    <th className="px-4 py-3">Custo</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-white">
                  {calls.map((call) => (
                    <tr key={call.id}>
                      <td className="px-4 py-3 text-xs text-muted">{dateTime(call.created_at)}</td>
                      <td className="px-4 py-3">{call.agent_slug ?? "-"}</td>
                      <td className="px-4 py-3 text-xs">{call.model}</td>
                      <td className="px-4 py-3">{number(call.total_tokens)}</td>
                      <td className="px-4 py-3">{usd(call.estimated_cost_usd)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-purple-soft px-2.5 py-1 text-xs font-bold text-purple">
                          {call.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
