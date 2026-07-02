"use client"

import { useState } from "react"
import { apiFetch, type Briefing, type BriefingApproveResponse, type ResearchModel, type ResearchTheme } from "@/lib/api"

export function BriefingPanel({
  briefing, models, themes, token, onApproved, onCancel,
}: {
  briefing: Briefing
  models: ResearchModel[]
  themes: ResearchTheme[]
  token: string
  onApproved: (answer: string) => void
  onCancel: () => void
}) {
  const isResearch = briefing.tipo === "pesquisa"
  const [modelId, setModelId] = useState(models[0]?.model_id ?? "")
  const [themeId, setThemeId] = useState<number | null>(briefing.research_theme_id)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function approve() {
    setBusy(true); setErr(null)
    try {
      const res = await apiFetch<BriefingApproveResponse>(
        `/api/orchestrator/briefings/${briefing.id}/approve`, token,
        {
          method: "POST",
          body: JSON.stringify({
            model_override: isResearch && modelId ? modelId : undefined,
            research_theme_id: isResearch ? themeId ?? undefined : undefined,
          }),
        }
      )
      onApproved(res.answer)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Falha ao aprovar.")
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={onCancel} aria-hidden="true" />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto duofy-scroll border-l border-line bg-white p-6 shadow-panel animate-scale-in">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-ink">Briefing do Orquestrador</h3>
          <span className="rounded-full bg-purple/10 px-2.5 py-1 text-xs font-semibold text-purple-deep">{briefing.tipo}</span>
        </div>

        <p className="text-xs font-semibold text-muted">Objetivo</p>
        <p className="mb-3 text-sm text-ink">{briefing.objetivo || "—"}</p>
        <p className="text-xs font-semibold text-muted">Plano</p>
        <p className="mb-3 text-sm text-ink">{briefing.resumo_plano || "—"}</p>
        {briefing.agente_alvo && (
          <p className="mb-3 text-xs text-muted">Agente: <span className="font-semibold text-ink">{briefing.agente_alvo}</span></p>
        )}

        {isResearch && (
          <div className="mt-2 space-y-3 rounded-xl border border-line bg-surface p-3">
            <label className="block text-xs font-semibold text-muted">Modelo LLM (pesquisa)
              <select value={modelId} onChange={(e) => setModelId(e.target.value)}
                className="mt-1 h-10 w-full appearance-none rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-purple focus:outline-none">
                {models.map((m) => <option key={m.model_id} value={m.model_id}>{m.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted">Tema de pesquisa (opcional)
              <select value={themeId ?? ""} onChange={(e) => setThemeId(e.target.value ? Number(e.target.value) : null)}
                className="mt-1 h-10 w-full appearance-none rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-purple focus:outline-none">
                <option value="">— sem tema —</option>
                {themes.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>
          </div>
        )}

        {err && <p className="mt-3 text-xs text-red">{err}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={approve} disabled={busy || (isResearch && !modelId)}
            className="duofy-tap flex-1 rounded-lg bg-purple py-2.5 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
            {busy ? "Executando…" : "Aprovar e executar"}
          </button>
          <button onClick={onCancel} disabled={busy}
            className="duofy-tap rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface">
            Ajustar
          </button>
        </div>
      </aside>
    </div>
  )
}
