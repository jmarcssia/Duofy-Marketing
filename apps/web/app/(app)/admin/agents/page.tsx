"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { PageTitle, PurpleButton, SectionCard, SoftButton } from "@/components/page-primitives"
import { apiFetch, type Agent, type AgentRun, type ProviderCredential } from "@/lib/api"
import { clearTokenCookie, getTokenFromCookie } from "@/lib/auth"

const statusLabels: Record<string, string> = {
  completed: "em revisao",
  approved: "aprovado",
  needs_adjustment: "ajuste",
  rejected: "rejeitado",
  failed: "falhou"
}

function isLlmProvider(provider: ProviderCredential) {
  return !["apify", "openai_embeddings"].includes(provider.provider)
}

function parseError(error: unknown) {
  const text = String(error)
  try {
    const payload = JSON.parse(text.slice(text.indexOf("{")))
    return payload.detail ?? text
  } catch {
    return text.replace(/^Error:\s*/, "")
  }
}

export default function AgentsPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [providers, setProviders] = useState<ProviderCredential[]>([])
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [selectedAgent, setSelectedAgent] = useState("")
  const [provider, setProvider] = useState("openrouter")
  const [prompt, setPrompt] = useState("")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
  const [run, setRun] = useState<AgentRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const enabledProviders = useMemo(
    () => providers.filter((item) => isLlmProvider(item) && item.is_enabled),
    [providers]
  )

  async function loadRuns(token: string, nextAgent = selectedAgent) {
    const params = new URLSearchParams()
    if (nextAgent) params.set("agent_slug", nextAgent)
    if (status) params.set("status", status)
    if (query.trim()) params.set("query", query.trim())
    params.set("limit", "20")
    const history = await apiFetch<AgentRun[]>(`/api/agents/runs?${params}`, token)
    setRuns(history)
  }

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) {
      router.replace("/login")
      return
    }

    Promise.all([
      apiFetch<Agent[]>("/api/admin/agents", token),
      apiFetch<ProviderCredential[]>("/api/admin/providers", token)
    ])
      .then(async ([agentList, providerList]) => {
        const firstAgent = agentList[0]?.slug ?? ""
        const firstProvider =
          providerList.find((item) => item.is_enabled && isLlmProvider(item))?.provider ??
          "openrouter"
        setAgents(agentList)
        setProviders(providerList)
        setSelectedAgent(firstAgent)
        setProvider(firstProvider)
        await loadRuns(token, firstAgent)
      })
      .catch((requestError) => {
        if (String(requestError).includes("401")) {
          clearTokenCookie()
          router.replace("/login")
          return
        }
        setError("Não foi possível carregar agentes.")
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function execute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = getTokenFromCookie()
    if (!token) return
    setError(null)
    setRun(null)
    setIsRunning(true)

    try {
      const result = await apiFetch<AgentRun>("/api/agents/run", token, {
        method: "POST",
        body: JSON.stringify({
          agent_slug: selectedAgent,
          provider,
          prompt
        })
      })
      setRun(result)
      await loadRuns(token)
      if (result.status === "failed") {
        setError(result.error ?? "Falha ao executar agente.")
      }
    } catch (requestError) {
      setError(parseError(requestError))
    } finally {
      setIsRunning(false)
    }
  }

  async function applyFilters(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const token = getTokenFromCookie()
    if (!token) return
    await loadRuns(token)
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Agentes IA"
        subtitle="Execute agentes reais usando os provedores configurados em Configurações Admin."
      />

      {error ? (
        <p className="rounded-2xl border border-red/20 bg-red/5 p-4 text-sm font-semibold text-red">
          {error}
        </p>
      ) : null}

      {enabledProviders.length === 0 ? (
        <p className="rounded-2xl border border-orange/20 bg-orange/5 p-4 text-sm font-semibold text-orange">
          Configure e habilite pelo menos um provedor em Configurações Admin &gt; Modelos LLM.
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <SectionCard title="Agentes configurados">
          <div className="space-y-3">
            {agents.map((agent) => (
              <button
                key={agent.slug}
                type="button"
                onClick={() => {
                  setSelectedAgent(agent.slug)
                  const token = getTokenFromCookie()
                  if (token) loadRuns(token, agent.slug).catch(() => null)
                }}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedAgent === agent.slug
                    ? "border-purple bg-purple-soft"
                    : "border-line bg-white hover:border-purple/40"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-bold tracking-[-0.03em]">{agent.name}</h3>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-purple">
                    {agent.is_active ? "ativo" : "inativo"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">{agent.default_model}</p>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Executar agente">
          <form onSubmit={execute} className="space-y-4">
            <label className="block text-sm font-semibold">
              Agente
              <select
                value={selectedAgent}
                onChange={(event) => setSelectedAgent(event.target.value)}
                className="duofy-focus mt-2 w-full rounded-xl border border-line bg-white px-4 py-3"
              >
                {agents.map((agent) => (
                  <option key={agent.slug} value={agent.slug}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-semibold">
              Provedor
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className="duofy-focus mt-2 w-full rounded-xl border border-line bg-white px-4 py-3"
              >
                {providers
                  .filter((item) => isLlmProvider(item))
                  .map((item) => (
                    <option key={item.provider} value={item.provider}>
                      {item.display_name} {item.is_enabled ? "" : "(não habilitado)"}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block text-sm font-semibold">
              Pedido
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ex.: Gere três ideias de posts sobre automação de marketing para a Duofy."
                className="duofy-focus mt-2 min-h-36 w-full rounded-xl border border-line bg-white px-4 py-3"
                required
              />
            </label>

            <PurpleButton disabled={isRunning || !selectedAgent || !prompt.trim()}>
              {isRunning ? "Executando..." : "Executar agente"}
            </PurpleButton>
          </form>

          {run ? (
            <div className="mt-6 rounded-2xl border border-line bg-white p-5">
              <div className="mb-3 text-sm font-bold text-muted">
                {run.provider} - {run.model} - {statusLabels[run.status] ?? run.status}
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-ink">
                {run.output || run.error}
              </pre>
            </div>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard title="Histórico e filtros">
        <form onSubmit={applyFilters} className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar no pedido ou resposta..."
            className="duofy-focus rounded-xl border border-line bg-white px-4 py-3"
          />
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
          <SoftButton type="submit">Filtrar</SoftButton>
        </form>

        <div className="space-y-3">
          {runs.length === 0 ? (
            <p className="rounded-2xl border border-line bg-white p-5 text-sm text-muted">
              Nenhuma execução encontrada para os filtros atuais.
            </p>
          ) : null}
          {runs.map((item) => (
            <article key={item.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
                <strong>{item.agent_slug}</strong>
                <span className="rounded-full bg-purple-soft px-3 py-1 text-xs font-bold text-purple">
                  {statusLabels[item.status] ?? item.status}
                </span>
              </div>
              <p className="text-sm font-semibold text-ink">{item.prompt}</p>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">
                {item.output || item.error}
              </p>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
