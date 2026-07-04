"use client"

import Link from "next/link"
import { useState, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui"
import { PlusIcon, RefreshIcon } from "@/components/icons"
import { apiFetch } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"
import { Markdown } from "@/components/markdown"

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

type QualitySettings = {
  review_mode: "local_only" | "hybrid" | "llm_required"
  provider: "openrouter" | "anthropic" | "openai" | null
  model: string | null
}

type ProviderForm = {
  provider: string
  display_name: string
  base_url: string
  default_model: string
  is_enabled: boolean
  api_key: string
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

  // Config (escrita real)
  const [quality, setQuality] = useState<QualitySettings | null>(null)
  const [editProvider, setEditProvider] = useState<ProviderForm | null>(null)
  const [savingProvider, setSavingProvider] = useState(false)
  const [savingSkills, setSavingSkills] = useState(false)
  const [savingQuality, setSavingQuality] = useState(false)
  const [adminMsg, setAdminMsg] = useState<string | null>(null)

  // Monitor de execuções (aba Automações)
  const [allRuns, setAllRuns] = useState<AgentRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)

  const loadAll = useCallback(async (first = false) => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    if (first) setLoading(true)
    const [ag, pv, st, ql] = await Promise.allSettled([
      apiFetch<Agent[]>("/api/admin/agents", token),
      apiFetch<Provider[]>("/api/admin/providers", token),
      apiFetch<AgentSettings>("/api/admin/agent-settings", token),
      apiFetch<QualitySettings>("/api/admin/quality-settings", token),
    ])
    if (ag.status === "fulfilled") {
      setAgents(ag.value)
      if (first && ag.value.length > 0) setSelectedAgent(ag.value[0])
    }
    if (pv.status === "fulfilled") setProviders(pv.value)
    if (st.status === "fulfilled") setAgentSettings(st.value)
    if (ql.status === "fulfilled") setQuality(ql.value)
    if (first) setLoading(false)
  }, [])

  useEffect(() => { loadAll(true) }, [loadAll])

  function flash(msg: string) {
    setAdminMsg(msg)
    setTimeout(() => setAdminMsg(null), 3000)
  }

  async function saveProvider() {
    if (!editProvider) return
    const token = getTokenFromCookie()
    if (!token) return
    setSavingProvider(true)
    try {
      const body: Record<string, unknown> = {
        provider: editProvider.provider,
        display_name: editProvider.display_name,
        base_url: editProvider.base_url || null,
        default_model: editProvider.default_model || null,
        is_enabled: editProvider.is_enabled,
      }
      if (editProvider.api_key.trim()) body.api_key = editProvider.api_key.trim()
      await apiFetch(`/api/admin/providers/${editProvider.provider}`, token, {
        method: "PUT",
        body: JSON.stringify(body),
      })
      setEditProvider(null)
      await loadAll()
      flash("Provedor atualizado.")
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Falha ao salvar provedor.")
    }
    setSavingProvider(false)
  }

  async function saveSkills() {
    if (!agentSettings) return
    const token = getTokenFromCookie()
    if (!token) return
    setSavingSkills(true)
    try {
      await apiFetch("/api/admin/agent-settings", token, {
        method: "PUT",
        body: JSON.stringify({ token_budgets: agentSettings.token_budgets, research_depth: agentSettings.research_depth }),
      })
      flash("Limites de agentes salvos.")
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Falha ao salvar limites.")
    }
    setSavingSkills(false)
  }

  async function saveQuality() {
    if (!quality) return
    const token = getTokenFromCookie()
    if (!token) return
    setSavingQuality(true)
    try {
      await apiFetch("/api/admin/quality-settings", token, {
        method: "PUT",
        body: JSON.stringify(quality),
      })
      flash("Configuração de qualidade salva.")
    } catch (e: unknown) {
      flash(e instanceof Error ? e.message : "Falha ao salvar qualidade.")
    }
    setSavingQuality(false)
  }

  const loadAllRuns = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) return
    setRunsLoading(true)
    try {
      const data = await apiFetch<AgentRun[]>("/api/agents/runs?limit=40", token)
      setAllRuns(data)
    } catch { setAllRuns([]) }
    setRunsLoading(false)
  }, [])

  useEffect(() => {
    if (tab === "automacoes") loadAllRuns()
  }, [tab, loadAllRuns])

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
        <div className="flex items-center justify-between gap-2">
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
          <Link
            href="/admin/acessos"
            className="duofy-tap inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-purple hover:bg-purple-soft"
          >
            Acessos &amp; Auditoria →
          </Link>
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
                <button disabled title="Em breve" className="flex cursor-not-allowed items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-medium text-muted opacity-60">
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                              <p className="text-xs font-medium text-muted mb-1.5">Saída do agente</p>
                              <Markdown content={testResult.output} />
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
            <div className="hidden w-64 shrink-0 flex-col overflow-hidden border-l border-line bg-white lg:flex xl:w-72">
              <div className="overflow-y-auto duofy-scroll flex-1">

                {/* Providers */}
                <div className="border-b border-line p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-ink">Modelos (OpenRouter)</p>
                    <button onClick={() => setTab("modelos")} className="duofy-tap flex items-center gap-1 text-xs font-medium text-purple-deep hover:underline">
                      <PlusIcon className="w-3 h-3" /> Gerenciar
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
                    <button onClick={() => setTab("automacoes")} className="duofy-tap flex items-center gap-1 text-xs font-medium text-purple-deep hover:underline">
                      Ver execuções
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
                    <button onClick={() => setTab("automacoes")} className="duofy-tap text-xs font-medium text-purple-deep hover:underline">Ver execuções recentes →</button>
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
              <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="duofy-skeleton h-16 rounded-xl"/>)}</div>
            ) : !agentSettings ? (
              <p className="text-sm text-muted">Configurações não disponíveis.</p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-line bg-white p-5 shadow-card">
                  <p className="mb-1 text-sm font-semibold text-ink">Orçamentos de tokens por agente</p>
                  <p className="mb-3 text-xs text-muted">Entre 256 e 32000 tokens por execução.</p>
                  <div className="space-y-2.5">
                    {Object.entries(agentSettings.token_budgets).map(([slug, budget]) => (
                      <div key={slug} className="flex items-center gap-3">
                        <span className="w-44 shrink-0 text-sm text-ink">{slug}</span>
                        <input
                          type="range" min={256} max={32000} step={256} value={budget}
                          onChange={(e) => setAgentSettings({ ...agentSettings, token_budgets: { ...agentSettings.token_budgets, [slug]: Number(e.target.value) } })}
                          className="flex-1 accent-purple-deep"
                        />
                        <input
                          type="number" min={256} max={32000} value={budget}
                          onChange={(e) => setAgentSettings({ ...agentSettings, token_budgets: { ...agentSettings.token_budgets, [slug]: Number(e.target.value) } })}
                          className="w-24 shrink-0 rounded-lg border border-line px-2 py-1 text-right text-xs font-mono text-ink focus:border-purple-deep focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-white p-5 shadow-card">
                  <p className="mb-1 text-sm font-semibold text-ink">Profundidade de pesquisa</p>
                  <p className="mb-3 text-xs text-muted">Fontes 1–30 · Excerpt 500–20000 chars.</p>
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
                          <td className="py-2 text-right">
                            <input type="number" min={1} max={30} value={cfg.sources}
                              onChange={(e) => setAgentSettings({ ...agentSettings, research_depth: { ...agentSettings.research_depth, [name]: { ...cfg, sources: Number(e.target.value) } } })}
                              className="w-16 rounded-lg border border-line px-2 py-1 text-right text-xs font-mono text-ink focus:border-purple-deep focus:outline-none" />
                          </td>
                          <td className="py-2 text-right">
                            <input type="number" min={500} max={20000} step={100} value={cfg.excerpt}
                              onChange={(e) => setAgentSettings({ ...agentSettings, research_depth: { ...agentSettings.research_depth, [name]: { ...cfg, excerpt: Number(e.target.value) } } })}
                              className="w-24 rounded-lg border border-line px-2 py-1 text-right text-xs font-mono text-ink focus:border-purple-deep focus:outline-none" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  onClick={saveSkills}
                  disabled={savingSkills}
                  className="duofy-tap flex items-center gap-2 rounded-lg bg-purple-deep px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep/90 disabled:opacity-50"
                >
                  {savingSkills ? "Salvando…" : "Salvar limites"}
                </button>

                {/* Qualidade */}
                {quality && (
                  <div className="rounded-xl border border-line bg-white p-5 shadow-card">
                    <p className="mb-1 text-sm font-semibold text-ink">Guardião de Qualidade</p>
                    <p className="mb-3 text-xs text-muted">Modo de revisão aplicado à cocriação e imprensa.</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="text-xs font-medium text-muted">
                        Modo
                        <select
                          value={quality.review_mode}
                          onChange={(e) => setQuality({ ...quality, review_mode: e.target.value as QualitySettings["review_mode"] })}
                          className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:border-purple-deep focus:outline-none"
                        >
                          <option value="local_only">Apenas local</option>
                          <option value="hybrid">Híbrido</option>
                          <option value="llm_required">LLM obrigatório</option>
                        </select>
                      </label>
                      <label className="text-xs font-medium text-muted">
                        Provedor LLM
                        <select
                          value={quality.provider ?? ""}
                          onChange={(e) => setQuality({ ...quality, provider: (e.target.value || null) as QualitySettings["provider"] })}
                          className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink focus:border-purple-deep focus:outline-none"
                        >
                          <option value="">—</option>
                          <option value="openrouter">openrouter</option>
                          <option value="anthropic">anthropic</option>
                          <option value="openai">openai</option>
                        </select>
                      </label>
                      <label className="text-xs font-medium text-muted">
                        Modelo
                        <input
                          value={quality.model ?? ""}
                          onChange={(e) => setQuality({ ...quality, model: e.target.value || null })}
                          placeholder="ex: ~anthropic/claude-sonnet-latest"
                          className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm text-ink placeholder:text-muted focus:border-purple-deep focus:outline-none"
                        />
                      </label>
                    </div>
                    <button
                      onClick={saveQuality}
                      disabled={savingQuality}
                      className="duofy-tap mt-3 flex items-center gap-2 rounded-lg bg-purple-deep px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep/90 disabled:opacity-50"
                    >
                      {savingQuality ? "Salvando…" : "Salvar qualidade"}
                    </button>
                  </div>
                )}
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
                      <button
                        onClick={() => setEditProvider({
                          provider: p.provider,
                          display_name: p.display_name,
                          base_url: p.base_url ?? "",
                          default_model: p.default_model ?? "",
                          is_enabled: p.is_enabled,
                          api_key: "",
                        })}
                        className="duofy-tap rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-purple/40 hover:text-purple"
                      >
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
          <div className="overflow-y-auto duofy-scroll h-full p-6 max-w-3xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-ink">Execuções dos agentes</h2>
                <p className="text-sm text-muted">Histórico real das últimas execuções (agents/runs).</p>
              </div>
              <button onClick={loadAllRuns} className="duofy-tap flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:border-purple/40 hover:text-purple">
                <RefreshIcon className="w-3.5 h-3.5" /> Atualizar
              </button>
            </div>

            {/* Pipelines nativos (informativo) */}
            <div className="mb-5 grid gap-2 sm:grid-cols-2">
              {FLUXOS.map((f) => (
                <div key={f} className="flex items-center gap-2.5 rounded-lg border border-line bg-white px-3 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-purple-deep/10">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6d35ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20 20.8 3.2M21 16v5h-5M15 15l5.9 5.9"/></svg>
                  </span>
                  <p className="flex-1 text-xs font-medium text-ink">{f}</p>
                  <Badge tone="green">Ativo</Badge>
                </div>
              ))}
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Últimas execuções</p>
            {runsLoading ? (
              <div className="space-y-2">{[1,2,3,4].map(i=><div key={i} className="duofy-skeleton h-14 rounded-xl"/>)}</div>
            ) : allRuns.length === 0 ? (
              <div className="grid place-items-center rounded-xl border border-dashed border-line py-12 text-center text-sm text-muted">
                Nenhuma execução registrada ainda. Rode um agente em Operações ou no Console de Testes.
              </div>
            ) : (
              <div className="space-y-1.5">
                {allRuns.map((r) => (
                  <div key={r.id} className="flex items-start gap-3 rounded-xl border border-line bg-white p-3">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${r.status === "completed" ? "bg-green-500" : r.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{r.agent_slug}</span>
                        <Badge tone={r.status === "completed" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>
                        <span className="text-[11px] text-muted">{r.provider} · {r.model.replace("~", "")}</span>
                        <span className="ml-auto text-[11px] text-muted">#{r.id}</span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-muted">{r.prompt}</p>
                      {r.output && <p className="mt-0.5 line-clamp-1 text-xs text-ink/70">→ {r.output}</p>}
                      {r.error && <p className="mt-0.5 line-clamp-1 text-xs text-red-600">{r.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Permissões tab ── */}
        {tab === "permissoes" && (
          <div className="overflow-y-auto duofy-scroll h-full p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-ink">Permissões e Papéis</h2>
                <p className="text-sm text-muted">Modelo de acesso da plataforma (somente leitura nesta versão).</p>
              </div>
              <button disabled title="Em breve" className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted opacity-60">
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
                        <span className="text-xs text-muted">{r.role === "Administrador" ? "Acesso total" : "Predefinido"}</span>
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
              {(() => {
                const apify = providers.find((p) => p.provider === "apify")
                const apifyOn = !!apify?.is_enabled && !!apify?.has_api_key
                const items = [
                  { name: "Apify", desc: "Scraping de fontes externas para pesquisa", real: true, connected: apifyOn },
                  { name: "Meta Ads", desc: "Gerenciador de Anúncios e Instagram Insights", real: false, connected: false },
                  { name: "Google Sheets", desc: "Importação de temas e calendário editorial", real: false, connected: false },
                  { name: "Tavily", desc: "Busca web para agente de pesquisa", real: false, connected: false },
                  { name: "SendGrid", desc: "Envio de relatórios por e-mail", real: false, connected: false },
                ]
                return items.map((int) => (
                  <div key={int.name} className="flex items-center gap-4 rounded-xl border border-line bg-white p-4 shadow-card">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6d35ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-ink">{int.name}</p>
                      <p className="text-xs text-muted">{int.desc}</p>
                    </div>
                    <Badge tone={int.connected ? "green" : int.real ? "amber" : "slate"}>
                      {int.connected ? "Conectado" : int.real ? "Sem chave" : "Em breve"}
                    </Badge>
                    {int.real && apify ? (
                      <button
                        onClick={() => setEditProvider({ provider: "apify", display_name: apify.display_name, base_url: apify.base_url ?? "", default_model: apify.default_model ?? "", is_enabled: apify.is_enabled, api_key: "" })}
                        className="duofy-tap rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-purple/40 hover:text-purple"
                      >
                        Configurar
                      </button>
                    ) : (
                      <button disabled title="Em breve" className="cursor-not-allowed rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted opacity-60">
                        Configurar
                      </button>
                    )}
                  </div>
                ))
              })()}
            </div>
          </div>
        )}

        {/* Permissões table at the bottom of Agentes tab */}
        {tab === "agentes" && (
          <div className="hidden" />
        )}

      </div>

      {/* Toast de feedback */}
      {adminMsg && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-pop animate-fade-in">
          {adminMsg}
        </div>
      )}

      {/* Painel de configuração de provedor */}
      {editProvider && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setEditProvider(null)} aria-hidden="true" />
          <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto duofy-scroll border-l border-line bg-white shadow-panel animate-scale-in">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-bold text-ink">Configurar provedor</p>
                <p className="text-xs text-muted">{editProvider.provider}</p>
              </div>
              <button onClick={() => setEditProvider(null)} className="text-muted hover:text-ink">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <div className="flex-1 space-y-4 p-5">
              <label className="block text-xs font-semibold text-muted">
                Nome de exibição
                <input
                  value={editProvider.display_name}
                  onChange={(e) => setEditProvider({ ...editProvider, display_name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-purple-deep focus:outline-none"
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                Base URL
                <input
                  value={editProvider.base_url}
                  onChange={(e) => setEditProvider({ ...editProvider, base_url: e.target.value })}
                  placeholder="https://openrouter.ai/api/v1"
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-purple-deep focus:outline-none"
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                Modelo padrão
                <input
                  value={editProvider.default_model}
                  onChange={(e) => setEditProvider({ ...editProvider, default_model: e.target.value })}
                  placeholder="~anthropic/claude-sonnet-latest"
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-purple-deep focus:outline-none"
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                Chave de API <span className="font-normal normal-case">(deixe em branco para manter a atual)</span>
                <input
                  type="password"
                  value={editProvider.api_key}
                  onChange={(e) => setEditProvider({ ...editProvider, api_key: e.target.value })}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-mono text-sm text-ink placeholder:text-muted focus:border-purple-deep focus:outline-none"
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
                <span className="text-sm font-medium text-ink">Habilitado</span>
                <button
                  type="button"
                  onClick={() => setEditProvider({ ...editProvider, is_enabled: !editProvider.is_enabled })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${editProvider.is_enabled ? "bg-purple-deep" : "bg-line"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${editProvider.is_enabled ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </label>
            </div>
            <div className="flex items-center gap-2 border-t border-line p-5">
              <button
                onClick={saveProvider}
                disabled={savingProvider}
                className="duofy-tap flex-1 rounded-lg bg-purple-deep py-2.5 text-sm font-semibold text-white hover:bg-purple-deep/90 disabled:opacity-50"
              >
                {savingProvider ? "Salvando…" : "Salvar provedor"}
              </button>
              <button onClick={() => setEditProvider(null)} className="duofy-tap rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
