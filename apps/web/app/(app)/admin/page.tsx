"use client"

import { useState, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui"
import { PlusIcon } from "@/components/icons"
import { apiFetch } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"

// ── API types ──────────────────────────────────────────────────────────────

type Agent = {
  id: number
  name: string
  slug: string
  default_model: string
  is_active: boolean
}

type Provider = {
  provider: string
  display_name: string
  base_url: string | null
  default_model: string | null
  is_enabled: boolean
  has_api_key: boolean
  masked_api_key: string | null
}

type AgentRun = {
  id: number
  agent_slug: string
  provider: string
  model: string
  prompt: string
  output: string | null
  status: string
  error: string | null
}

type MemoryHit = {
  id: number
  title: string
  content: string
  score: number
  category: string
  source_type: string
}

type AgentSettings = {
  token_budgets: Record<string, number>
  research_depth: Record<string, { sources: number; excerpt: number }>
}

type Tab = "agentes" | "skills" | "modelos" | "automacoes" | "permissoes" | "integracoes"

const AGENT_ICONS: Record<string, string> = {
  orchestrator:      "✦",
  research_agent:    "◎",
  content_agent:     "✏",
  calendar_agent:    "◫",
  press_agent:       "◈",
  metrics_agent:     "◷",
  quality_guardian:  "◉",
}

const ROLE_TABLE = [
  { role: "Administrador", desc: "Acesso total",             access: "Total",    agents: "Total",    skills: "Total",    models: "Total",    auto: "Total",    int: "Total",    users: "Total" },
  { role: "Editor",        desc: "Cria e gerencia conteúdos", access: "Completo", agents: "Completo", skills: "Completo", models: "Visualizar",auto: "Completo", int: "Visualizar",users: "Visualizar"},
  { role: "Revisor",       desc: "Revisa e aprova conteúdos", access: "Limitado", agents: "Executar", skills: "Executar", models: "Visualizar",auto: "Executar", int: "Visualizar",users: "—"         },
  { role: "Visualizador",  desc: "Somente leitura",           access: "Limitado", agents: "Visualizar",skills:"Visualizar",models:"Visualizar",auto:"Visualizar",int:"Visualizar",users:"—"           },
]

const FLUXOS = [
  "Fluxo de Pesquisa Completa",
  "Fluxo de Cocriação de Conteúdo",
  "Fluxo de Revisão e Aprovação",
  "Fluxo de Monitoramento Diário",
]

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { selected: selectedBrand } = useBrand()
  const [tab, setTab] = useState<Tab>("agentes")

  // Data
  const [agents, setAgents] = useState<Agent[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)

  // Test console
  const [testPrompt, setTestPrompt] = useState("")
  const [brandSlug, setBrandSlug] = useState("")
  const [testResult, setTestResult] = useState<AgentRun | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // RAG search
  const [memQuery, setMemQuery] = useState("")
  const [memResults, setMemResults] = useState<MemoryHit[]>([])
  const [memLoading, setMemLoading] = useState(false)

  // Load agents + providers + settings
  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    const load = async () => {
      setLoading(true)
      const [ag, pv, st] = await Promise.allSettled([
        apiFetch<Agent[]>("/api/admin/agents", token),
        apiFetch<Provider[]>("/api/admin/providers", token),
        apiFetch<AgentSettings>("/api/admin/agent-settings", token),
      ])
      if (ag.status === "fulfilled") {
        setAgents(ag.value)
        if (ag.value.length > 0) setSelectedAgent(ag.value[0])
      }
      if (pv.status === "fulfilled") setProviders(pv.value)
      if (st.status === "fulfilled") setAgentSettings(st.value)
      setLoading(false)
    }
    load()
  }, [])

  const loadRuns = useCallback(async (slug: string) => {
    const token = getTokenFromCookie()
    if (!token) return
    try {
      const data = await apiFetch<AgentRun[]>(`/api/agents/runs?agent_slug=${slug}&limit=10`, token)
      setRuns(data)
    } catch { /* ignore */ }
  }, [])

  const selectAgent = (a: Agent) => {
    setSelectedAgent(a)
    setTestResult(null)
    setTestError(null)
    setRuns([])
    setShowHistory(false)
  }

  const runAgent = async () => {
    if (!selectedAgent || !testPrompt.trim()) return
    const token = getTokenFromCookie()
    if (!token) { setTestError("Sessão expirada. Faça login novamente."); return }
    setTestLoading(true)
    setTestError(null)
    setTestResult(null)
    try {
      const data = await apiFetch<AgentRun>("/api/agents/run", token, {
        method: "POST",
        body: JSON.stringify({
          agent_slug: selectedAgent.slug,
          prompt: testPrompt,
          brand_slug: (brandSlug || selectedBrand) || undefined,
        }),
      })
      setTestResult(data)
      loadRuns(selectedAgent.slug)
    } catch (e: unknown) {
      setTestError(e instanceof Error ? e.message : "Erro desconhecido")
    }
    setTestLoading(false)
  }

  const searchMemory = async () => {
    if (!memQuery.trim()) return
    const token = getTokenFromCookie()
    if (!token) return
    setMemLoading(true)
    try {
      const data = await apiFetch<MemoryHit[]>("/api/memory/search", token, {
        method: "POST",
        body: JSON.stringify({ query: memQuery, brand_slug: selectedBrand || undefined, limit: 5 }),
      })
      setMemResults(data)
    } catch { setMemResults([]) }
    setMemLoading(false)
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "agentes",     label: "Agentes"       },
    { id: "skills",      label: "Skills"        },
    { id: "modelos",     label: "Modelos"       },
    { id: "automacoes",  label: "Automações"    },
    { id: "permissoes",  label: "Permissões"    },
    { id: "integracoes", label: "Integrações"   },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* Tab bar */}
      <div className="border-b border-line bg-white px-6">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-purple-deep text-purple-deep"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">

        {/* ── Agentes tab ── */}
        {tab === "agentes" && (
          <div className="flex h-full overflow-hidden">

            {/* Left: agent list */}
            <div className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-line bg-white">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="font-semibold text-sm text-ink">Agentes</p>
                <button className="flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-medium text-muted hover:text-ink transition-colors">
                  <PlusIcon className="w-3 h-3" /> Novo agente
                </button>
              </div>
              <div className="flex-1 overflow-y-auto duofy-scroll py-2">
                {loading && (
                  <div className="space-y-2 px-3 py-2">
                    {[1,2,3,4].map(i => <div key={i} className="h-14 animate-pulse rounded-lg bg-line/60" />)}
                  </div>
                )}
                {!loading && agents.length === 0 && (
                  <p className="px-4 py-6 text-center text-xs text-muted">Nenhum agente encontrado.<br/>Verifique a conexão com a API.</p>
                )}
                {agents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => selectAgent(a)}
                    className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                      selectedAgent?.id === a.id
                        ? "bg-purple-deep/5 border-l-2 border-purple-deep"
                        : "border-l-2 border-transparent hover:bg-surface"
                    }`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-100 to-purple-50 text-sm font-bold text-purple-deep">
                      {AGENT_ICONS[a.slug] ?? "◆"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                      <p className="truncate text-[11px] text-muted">{a.slug}</p>
                    </div>
                    <span className={`mt-0.5 ml-auto h-2 w-2 shrink-0 rounded-full ${a.is_active ? "bg-green-500" : "bg-slate-300"}`} />
                  </button>
                ))}
              </div>
              {!loading && agents.length > 0 && (
                <button className="border-t border-line px-4 py-2.5 text-left text-xs font-medium text-muted hover:text-ink transition-colors">
                  Ver agentes inativos ({agents.filter(a => !a.is_active).length}) ▾
                </button>
              )}
            </div>

            {/* Center: agent detail + test console */}
            <div className="flex-1 overflow-y-auto duofy-scroll">
              {!selectedAgent && !loading && (
                <div className="flex h-full items-center justify-center text-muted text-sm">
                  Selecione um agente na lista
                </div>
              )}
              {selectedAgent && (
                <div className="space-y-4 p-6">

                  {/* Agent header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-200 to-purple-100 text-xl font-bold text-purple-deep">
                        {AGENT_ICONS[selectedAgent.slug] ?? "◆"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-bold text-ink">{selectedAgent.name}</h2>
                          <Badge tone="purple">Agente central</Badge>
                          <Badge tone={selectedAgent.is_active ? "green" : "slate"}>
                            {selectedAgent.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted">Modelo padrão: <span className="font-medium text-ink">{selectedAgent.default_model || "não configurado"}</span></p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface transition-colors">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Editar agente
                      </button>
                      <button className="text-muted hover:text-ink transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                      </button>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Modelo padrão", value: selectedAgent.default_model || "—" },
                      { label: "Status", value: selectedAgent.is_active ? "Ativo" : "Inativo" },
                      { label: "Slug", value: selectedAgent.slug },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl border border-line bg-surface/50 p-3">
                        <p className="text-[11px] text-muted">{s.label}</p>
                        <p className="mt-0.5 text-sm font-semibold text-ink truncate">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* ── Console de Testes ── */}
                  <div className="rounded-xl border border-purple-deep/20 bg-white shadow-card">
                    <div className="flex items-center justify-between border-b border-line px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-deep/10">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6d35ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                        </div>
                        <p className="text-sm font-semibold text-ink">Console de Testes — {selectedAgent.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadRuns(selectedAgent.slug) }}
                          className="text-xs font-medium text-purple-deep hover:underline"
                        >
                          {showHistory ? "Ocultar histórico" : "Ver histórico"}
                        </button>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      {/* Brand slug */}
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-muted w-24 shrink-0">Brand slug</label>
                        <input
                          value={brandSlug}
                          onChange={e => setBrandSlug(e.target.value)}
                          placeholder="ex: growth (opcional)"
                          className="flex-1 rounded-lg border border-line bg-surface/50 px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-purple-deep focus:outline-none transition-colors"
                        />
                      </div>

                      {/* Prompt */}
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted">Prompt de teste</label>
                        <textarea
                          value={testPrompt}
                          onChange={e => setTestPrompt(e.target.value)}
                          rows={4}
                          placeholder={`Envie uma mensagem para ${selectedAgent.name}…\n\nExemplo: "Pesquise tendências de marketing digital para maio 2025"`}
                          className="w-full resize-none rounded-lg border border-line bg-surface/50 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-purple-deep focus:outline-none transition-colors"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={runAgent}
                          disabled={testLoading || !testPrompt.trim()}
                          className="flex items-center gap-1.5 rounded-lg bg-purple-deep px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {testLoading ? (
                            <>
                              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                              Executando…
                            </>
                          ) : (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                              Executar agente
                            </>
                          )}
                        </button>
                        {(testResult || testError) && (
                          <button
                            onClick={() => { setTestResult(null); setTestError(null) }}
                            className="text-xs text-muted hover:text-ink transition-colors"
                          >
                            Limpar resultado
                          </button>
                        )}
                      </div>

                      {/* Error */}
                      {testError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                          <p className="text-xs font-semibold text-red-700 mb-1">Erro na execução</p>
                          <p className="text-xs text-red-600 font-mono">{testError}</p>
                        </div>
                      )}

                      {/* Result */}
                      {testResult && (
                        <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${testResult.status === "completed" ? "bg-green-500" : testResult.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} />
                              <span className="text-xs font-semibold text-ink capitalize">{testResult.status}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-muted">
                              <span>#{testResult.id}</span>
                              <span>{testResult.provider}</span>
                              <span className="font-medium text-ink">{testResult.model}</span>
                            </div>
                          </div>
                          {testResult.output && (
                            <div className="rounded-md bg-white border border-green-200 p-3">
                              <p className="text-xs font-medium text-muted mb-1">Saída do agente</p>
                              <p className="whitespace-pre-wrap text-sm text-ink leading-relaxed">{testResult.output}</p>
                            </div>
                          )}
                          {testResult.error && (
                            <p className="text-xs text-red-600 font-mono">{testResult.error}</p>
                          )}
                        </div>
                      )}

                      {/* Run history */}
                      {showHistory && (
                        <div>
                          <p className="mb-2 text-xs font-semibold text-muted uppercase tracking-wide">Últimas 10 execuções</p>
                          {runs.length === 0 ? (
                            <p className="text-xs text-muted py-2">Nenhuma execução registrada para este agente.</p>
                          ) : (
                            <div className="space-y-1.5 max-h-64 overflow-y-auto duofy-scroll pr-1">
                              {runs.map((r) => (
                                <div key={r.id} className="flex items-start gap-2 rounded-lg border border-line bg-surface/30 p-2.5 text-xs">
                                  <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${r.status === "completed" ? "bg-green-500" : r.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="truncate font-medium text-ink">{r.prompt}</span>
                                      <span className="shrink-0 text-muted">#{r.id}</span>
                                    </div>
                                    <span className="text-muted">{r.model}</span>
                                    {r.output && <p className="mt-0.5 line-clamp-1 text-muted">{r.output}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Busca na Memória (RAG) ── */}
                  <div className="rounded-xl border border-line bg-white shadow-card">
                    <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-50">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      </div>
                      <p className="text-sm font-semibold text-ink">Busca na Memória (RAG)</p>
                      <Badge tone="teal">pgvector HNSW</Badge>
                    </div>
                    <div className="p-4 space-y-3">
                      <p className="text-xs text-muted">Teste a busca semântica na base de conhecimento. Resultados mostram os chunks mais próximos ao seu query.</p>
                      <div className="flex gap-2">
                        <input
                          value={memQuery}
                          onChange={e => setMemQuery(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && searchMemory()}
                          placeholder="Ex: estratégias de engajamento no Instagram"
                          className="flex-1 rounded-lg border border-line bg-surface/50 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-teal-500 focus:outline-none transition-colors"
                        />
                        <button
                          onClick={searchMemory}
                          disabled={memLoading || !memQuery.trim()}
                          className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {memLoading ? <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> : "Buscar"}
                        </button>
                      </div>

                      {memResults.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{memResults.length} resultado(s) encontrado(s)</p>
                          {memResults.map((hit) => (
                            <div key={hit.id} className="rounded-lg border border-line bg-surface/30 p-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-ink truncate">{hit.title || "(sem título)"}</p>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <Badge tone="teal">{hit.source_type}</Badge>
                                  <span className="text-[11px] font-mono font-bold text-teal-600">
                                    {(hit.score * 100).toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                              <p className="line-clamp-2 text-[11px] text-muted leading-relaxed">{hit.content}</p>
                              {hit.category && <Badge tone="slate">{hit.category}</Badge>}
                            </div>
                          ))}
                        </div>
                      )}
                      {memQuery && !memLoading && memResults.length === 0 && (
                        <p className="text-xs text-muted py-1">Nenhum resultado. Verifique se há documentos na base de memória.</p>
                      )}
                    </div>
                  </div>

                </div>
              )}
            </div>

            {/* Right: providers + fluxos */}
            <div className="hidden w-72 shrink-0 flex-col overflow-hidden border-l border-line bg-white xl:flex">
              <div className="overflow-y-auto duofy-scroll flex-1">

                {/* Providers */}
                <div className="border-b border-line p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-ink">Modelos (OpenRouter)</p>
                    <button className="flex items-center gap-1 text-xs font-medium text-purple-deep hover:underline">
                      <PlusIcon className="w-3 h-3" /> Adicionar
                    </button>
                  </div>
                  {loading ? (
                    <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-10 animate-pulse rounded-lg bg-line/60"/>)}</div>
                  ) : providers.length === 0 ? (
                    <p className="text-xs text-muted">Nenhum provedor configurado.</p>
                  ) : (
                    <div className="space-y-2">
                      {providers.map((p) => (
                        <div key={p.provider} className="flex items-center gap-3 rounded-lg border border-line p-2.5">
                          <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${p.is_enabled && p.has_api_key ? "bg-green-500" : "bg-slate-300"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-ink">{p.display_name}</p>
                            <p className="truncate text-[10px] text-muted">{p.default_model || p.provider}</p>
                          </div>
                          {p.is_enabled && p.has_api_key ? (
                            <Badge tone="green">Ativo</Badge>
                          ) : (
                            <Badge tone="slate">{p.has_api_key ? "Desativado" : "Sem chave"}</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {providers.length > 0 && (
                    <button className="mt-2 text-xs font-medium text-purple-deep hover:underline">
                      Ver todos os modelos ▾
                    </button>
                  )}
                </div>

                {/* Fluxos */}
                <div className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-ink">Automações e fluxos</p>
                    <button className="flex items-center gap-1 text-xs font-medium text-purple-deep hover:underline">
                      <PlusIcon className="w-3 h-3" /> Novo fluxo
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {FLUXOS.map((f) => (
                      <div key={f} className="flex items-center gap-2 rounded-lg border border-line p-2.5">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6d35ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16 3h5v5M4 20 20.8 3.2M21 16v5h-5M15 15l5.9 5.9"/>
                        </svg>
                        <p className="flex-1 text-xs font-medium text-ink">{f}</p>
                        <Badge tone="green">Ativo</Badge>
                        <button className="text-muted hover:text-ink">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                        </button>
                      </div>
                    ))}
                    <button className="text-xs font-medium text-purple-deep hover:underline">Ver todos os fluxos ▾</button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── Skills tab ── */}
        {tab === "skills" && (
          <div className="overflow-y-auto duofy-scroll h-full p-6 max-w-3xl">
            <div className="mb-4">
              <h2 className="text-base font-bold text-ink">Skills & Configurações de Agentes</h2>
              <p className="text-sm text-muted">Orçamentos de tokens e profundidade de pesquisa por agente.</p>
            </div>
            {loading ? (
              <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-16 animate-pulse rounded-xl bg-line/60"/>)}</div>
            ) : !agentSettings ? (
              <p className="text-sm text-muted">Configurações não disponíveis.</p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-line bg-white p-5 shadow-card">
                  <p className="mb-3 text-sm font-semibold text-ink">Orçamentos de tokens por agente</p>
                  <div className="space-y-2">
                    {Object.entries(agentSettings.token_budgets).map(([slug, budget]) => (
                      <div key={slug} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 text-sm text-ink">{slug}</span>
                        <div className="flex-1 h-2 rounded-full bg-line/70 overflow-hidden">
                          <div className="h-full bg-purple-deep rounded-full" style={{ width: `${Math.min((budget / 32000) * 100, 100)}%` }} />
                        </div>
                        <span className="w-20 shrink-0 text-right text-xs font-mono font-semibold text-ink">{budget.toLocaleString()} tk</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-white p-5 shadow-card">
                  <p className="mb-3 text-sm font-semibold text-ink">Profundidade de pesquisa</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wide text-muted">
                        <th className="pb-2 text-left">Agente</th>
                        <th className="pb-2 text-right">Fontes</th>
                        <th className="pb-2 text-right">Excerpt (chars)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(agentSettings.research_depth).map(([name, cfg]) => (
                        <tr key={name} className="border-b border-line last:border-0">
                          <td className="py-2 text-ink">{name}</td>
                          <td className="py-2 text-right font-mono text-muted">{cfg.sources}</td>
                          <td className="py-2 text-right font-mono text-muted">{cfg.excerpt.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Modelos tab ── */}
        {tab === "modelos" && (
          <div className="overflow-y-auto duofy-scroll h-full p-6 max-w-2xl">
            <div className="mb-4">
              <h2 className="text-base font-bold text-ink">Modelos & Provedores</h2>
              <p className="text-sm text-muted">Gerencie provedores de LLM e suas chaves de API.</p>
            </div>
            {loading ? (
              <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-24 animate-pulse rounded-xl bg-line/60"/>)}</div>
            ) : (
              <div className="space-y-3">
                {providers.map((p) => (
                  <div key={p.provider} className="rounded-xl border border-line bg-white p-4 shadow-card">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${p.is_enabled && p.has_api_key ? "bg-green-500" : "bg-slate-300"}`} />
                          <p className="font-semibold text-ink">{p.display_name}</p>
                          {p.is_enabled && p.has_api_key
                            ? <Badge tone="green">Conectado</Badge>
                            : <Badge tone="slate">{p.has_api_key ? "Chave presente" : "Sem chave API"}</Badge>
                          }
                        </div>
                        <p className="mt-1 text-[11px] text-muted">
                          {p.base_url ?? "URL padrão"} · Modelo: {p.default_model ?? "não configurado"}
                        </p>
                        {p.masked_api_key && (
                          <p className="mt-0.5 font-mono text-[11px] text-muted">{p.masked_api_key}</p>
                        )}
                      </div>
                      <button className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface transition-colors">
                        Configurar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Automações tab ── */}
        {tab === "automacoes" && (
          <div className="overflow-y-auto duofy-scroll h-full p-6 max-w-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-ink">Automações e Fluxos</h2>
                <p className="text-sm text-muted">Fluxos automáticos de agentes configurados na plataforma.</p>
              </div>
              <button className="flex items-center gap-1.5 rounded-lg bg-purple-deep px-3 py-2 text-sm font-semibold text-white hover:bg-purple-deep/90 transition-colors">
                <PlusIcon className="w-3.5 h-3.5" /> Novo fluxo
              </button>
            </div>
            <div className="space-y-3">
              {FLUXOS.map((f, i) => (
                <div key={f} className="flex items-center gap-4 rounded-xl border border-line bg-white p-4 shadow-card">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-deep/10">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6d35ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20 20.8 3.2M21 16v5h-5M15 15l5.9 5.9"/></svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-ink">{f}</p>
                    <p className="text-xs text-muted">Agente: {agents[i % agents.length]?.name ?? "Orquestrador"}</p>
                  </div>
                  <Badge tone="green">Ativo</Badge>
                  <button className="text-muted hover:text-ink transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Permissões tab ── */}
        {tab === "permissoes" && (
          <div className="overflow-y-auto duofy-scroll h-full p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-ink">Permissões e Papéis</h2>
                <p className="text-sm text-muted">Defina o nível de acesso de cada papel aos recursos da plataforma.</p>
              </div>
              <button className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface transition-colors">
                <PlusIcon className="w-3.5 h-3.5" /> Novo papel
              </button>
            </div>
            <div className="rounded-xl border border-line bg-white shadow-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {["Papel","Acesso","Agentes","Skills","Modelos","Automações","Integrações","Usuários","Ações"].map((h,i) => (
                      <th key={i} className="px-4 py-3 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROLE_TABLE.map((r) => (
                    <tr key={r.role} className="border-b border-line last:border-0 hover:bg-surface/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{r.role}</p>
                        <p className="text-[11px] text-muted">{r.desc}</p>
                      </td>
                      {[r.access, r.agents, r.skills, r.models, r.auto, r.int, r.users].map((v, vi) => (
                        <td key={vi} className="px-4 py-3">
                          {v === "—" ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <span className={`flex items-center gap-1 text-xs font-medium ${v === "Total" || v === "Completo" ? "text-green-700" : v === "Limitado" ? "text-amber-700" : "text-muted"}`}>
                              {v !== "Visualizar" && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              )}
                              {v}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <button className="text-xs font-medium text-purple-deep hover:underline">
                          {r.role === "Administrador" ? "Gerenciar tudo" : "Editar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Integrações tab ── */}
        {tab === "integracoes" && (
          <div className="overflow-y-auto duofy-scroll h-full p-6 max-w-2xl">
            <div className="mb-4">
              <h2 className="text-base font-bold text-ink">Integrações externas</h2>
              <p className="text-sm text-muted">Conecte fontes de dados e ferramentas de pesquisa à plataforma.</p>
            </div>
            <div className="space-y-3">
              {[
                { name: "Meta Ads", desc: "Gerenciador de Anúncios e Instagram Insights", status: "Não configurado", tone: "slate" as const },
                { name: "Google Sheets", desc: "Importação de temas e calendário editorial", status: "Não configurado", tone: "slate" as const },
                { name: "Apify", desc: "Scraping de fontes externas para pesquisa", status: "Não configurado", tone: "slate" as const },
                { name: "Tavily", desc: "Busca web para agente de pesquisa", status: "Não configurado", tone: "slate" as const },
                { name: "SendGrid", desc: "Envio de relatórios por e-mail", status: "Não configurado", tone: "slate" as const },
              ].map((int) => (
                <div key={int.name} className="flex items-center gap-4 rounded-xl border border-line bg-white p-4 shadow-card">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6d35ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-ink">{int.name}</p>
                    <p className="text-xs text-muted">{int.desc}</p>
                  </div>
                  <Badge tone={int.tone}>{int.status}</Badge>
                  <button className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface transition-colors">
                    Configurar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Permissões table at the bottom of Agentes tab */}
        {tab === "agentes" && (
          <div className="hidden" />
        )}

      </div>
    </div>
  )
}
