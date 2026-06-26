"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { EmptyState, PageTitle, SectionCard, SoftButton } from "@/components/page-primitives"
import {
  apiFetch,
  type AgentHealth,
  type AuditEvent,
  type Brand,
  type OperationsSummary,
  type QualityReviewListItem
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"

function number(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0)
}

function usd(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6
  }).format(value ?? 0)
}

function dateTime(value: string | null | undefined) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))
}

function statusClass(status: string) {
  if (status === "ok" || status === "success" || status === "approved") {
    return "bg-green/10 text-green"
  }
  if (status === "critical" || status === "failed" || status === "blocked") {
    return "bg-red/10 text-red"
  }
  return "bg-orange/10 text-orange"
}

export default function OperationsPage() {
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>([])
  const [brand, setBrand] = useState("")
  const [summary, setSummary] = useState<OperationsSummary | null>(null)
  const [health, setHealth] = useState<AgentHealth[]>([])
  const [reviews, setReviews] = useState<QualityReviewListItem[]>([])
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function loadData(token: string, nextBrand = brand) {
    setIsLoading(true)
    const params = new URLSearchParams()
    if (nextBrand) params.set("brand_slug", nextBrand)
    const [nextSummary, nextHealth, nextReviews, nextEvents] = await Promise.all([
      apiFetch<OperationsSummary>(`/api/operations/summary?${params}`, token),
      apiFetch<AgentHealth[]>("/api/operations/agent-health", token),
      apiFetch<QualityReviewListItem[]>("/api/operations/quality-reviews?limit=20", token),
      apiFetch<AuditEvent[]>(`/api/operations/audit-events?${params}&limit=60`, token)
    ])
    setSummary(nextSummary)
    setHealth(nextHealth)
    setReviews(nextReviews)
    setEvents(nextEvents)
    setIsLoading(false)
  }

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) {
      router.replace("/login")
      return
    }
    Promise.all([apiFetch<Brand[]>("/api/brands", token), loadData(token)])
      .then(([brandList]) => setBrands(brandList))
      .catch(() => {
        setIsLoading(false)
        setError("Não foi possível carregar observabilidade operacional.")
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function refresh(nextBrand = brand) {
    const token = getTokenFromCookie()
    if (!token) return
    setError(null)
    try {
      await loadData(token, nextBrand)
    } catch {
      setIsLoading(false)
      setError("Não foi possível atualizar observabilidade.")
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Operações"
        subtitle="Observabilidade de agentes, custos, Guardião de Qualidade, erros e trilha de auditoria."
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
            refresh(event.target.value)
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
        <SoftButton type="button" disabled={isLoading} onClick={() => refresh()}>
          {isLoading ? "Atualizando..." : "Atualizar"}
        </SoftButton>
      </div>

      <div className="grid gap-5 md:grid-cols-4">
        <SectionCard title="Chamadas IA">
          <div className="text-4xl font-extrabold tracking-[-0.06em]">
            {number(summary?.total_model_calls)}
          </div>
          <p className="mt-2 text-sm text-muted">{number(summary?.failed_model_calls)} falhas</p>
        </SectionCard>
        <SectionCard title="Custo estimado">
          <div className="text-4xl font-extrabold tracking-[-0.06em]">
            {usd(summary?.estimated_cost_usd)}
          </div>
          <p className="mt-2 text-sm text-muted">Estimativa local, não billing oficial.</p>
        </SectionCard>
        <SectionCard title="Qualidade">
          <div className="text-4xl font-extrabold tracking-[-0.06em]">
            {number(Math.round(summary?.avg_quality_score ?? 0))}
          </div>
          <p className="mt-2 text-sm text-muted">
            {number(summary?.failed_quality_reviews)} revisões bloqueadas
          </p>
        </SectionCard>
        <SectionCard title="Auditoria">
          <div className="text-4xl font-extrabold tracking-[-0.06em]">
            {number(summary?.audit_events)}
          </div>
          <p className="mt-2 text-sm text-muted">{number(summary?.total_decisions)} decisões</p>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Saúde dos agentes">
          {health.length === 0 ? (
            <EmptyState title="Sem atividade" description="A saúde aparecerá após chamadas de IA." />
          ) : (
            <div className="space-y-3">
              {health.map((item) => (
                <div key={item.agent_slug} className="rounded-2xl border border-line bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <strong>{item.agent_slug}</strong>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(item.health_status)}`}>
                      {item.health_status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {number(item.model_calls)} chamadas / {number(item.failed_model_calls)} falhas / {usd(item.estimated_cost_usd)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Última atividade: {dateTime(item.last_activity_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Ações auditadas">
          <div className="grid gap-3 md:grid-cols-2">
            {(summary?.by_action ?? []).map((item) => (
              <div key={item.key} className="rounded-2xl border border-line bg-white p-4">
                <strong className="text-sm">{item.key}</strong>
                <p className="mt-2 text-2xl font-extrabold tracking-[-0.05em]">{number(item.events)}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Revisões recentes do Guardião">
          {reviews.length === 0 ? (
            <EmptyState title="Sem revisões" description="As revisões aparecerão após envio para aprovação." />
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className="rounded-2xl border border-line bg-white p-4">
                  <div className="flex items-center justify-between">
                    <strong>Output #{review.output_id}</strong>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(review.status)}`}>
                      {review.score}/100
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{review.summary}</p>
                  <p className="mt-2 text-xs text-muted">
                    {review.review_mode} / {review.llm_provider ?? "local"} / {dateTime(review.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Timeline de auditoria">
          {events.length === 0 ? (
            <EmptyState title="Sem eventos" description="A trilha será criada a partir das próximas ações." />
          ) : (
            <div className="max-h-[620px] space-y-3 overflow-auto pr-2">
              {events.map((event) => (
                <div key={event.id} className="rounded-2xl border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong>{event.action}</strong>
                      <p className="mt-1 text-sm text-muted">{event.summary || event.entity_type}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(event.status)}`}>
                      {event.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {dateTime(event.created_at)} / {event.user_email ?? "sistema"} / {event.entity_type} #{event.entity_id ?? "-"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
