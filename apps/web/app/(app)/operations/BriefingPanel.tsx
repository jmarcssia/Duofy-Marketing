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
  const [themeText, setThemeText] = useState(briefing.tema_sugerido ?? "")
  const [themeId, setThemeId] = useState<number | null>(briefing.research_theme_id)
  const [depth, setDepth] = useState<"quick" | "deep">("quick")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const themeReady = themeText.trim().length >= 3
  const canApprove = !busy && (!isResearch || (!!modelId && themeReady))

  async function approve() {
    setBusy(true); setErr(null)
    try {
      const res = await apiFetch<BriefingApproveResponse>(
        `/api/orchestrator/briefings/${briefing.id}/approve`, token,
        {
          method: "POST",
          body: JSON.stringify(
            isResearch
              ? {
                  model_override: modelId || undefined,
                  research_theme_id: themeId ?? undefined,
                  theme_override: themeText.trim(),
                  depth,
                }
              : {}
          ),
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
            <div>
              <label className="block text-xs font-semibold text-muted">Tema da pesquisa
                <input
                  value={themeText}
                  onChange={(e) => { setThemeText(e.target.value); setThemeId(null) }}
                  placeholder="Digite o tema…"
                  autoFocus
                  className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-purple focus:outline-none"
                />
              </label>
              {themes.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    const t = themes.find((x) => x.id === Number(e.target.value))
                    if (t) { setThemeText(t.title); setThemeId(t.id) }
                  }}
                  className="mt-2 h-9 w-full appearance-none rounded-lg border border-line bg-white px-3 text-xs text-muted focus:border-purple focus:outline-none"
                >
                  <option value="">… ou selecione do banco de temas</option>
                  {themes.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted">Profundidade</p>
              <div className="mt-1 flex gap-2">
                {([["quick", "Rápida", "mín. 3 fontes"], ["deep", "Profunda", "máximo de fontes"]] as const).map(([val, label, hint]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setDepth(val)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${depth === val ? "border-purple bg-purple text-white" : "border-line bg-white text-ink hover:border-purple/40"}`}
                  >
                    {label}
                    <span className={`block text-[11px] font-normal ${depth === val ? "text-white/80" : "text-muted"}`}>{hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-xs font-semibold text-muted">Modelo LLM
              <select value={modelId} onChange={(e) => setModelId(e.target.value)}
                className="mt-1 h-10 w-full appearance-none rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-purple focus:outline-none">
                {models.length === 0 && <option value="">(nenhum modelo configurado)</option>}
                {models.map((m) => <option key={m.model_id} value={m.model_id}>{m.label}</option>)}
              </select>
            </label>
          </div>
        )}

        {err && <p className="mt-3 text-xs text-red">{err}</p>}

        <div className="mt-5 flex gap-2">
          <button onClick={approve} disabled={!canApprove}
            className="duofy-tap flex-1 rounded-lg bg-purple py-2.5 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
            {busy ? (isResearch && depth === "deep" ? "Pesquisando (pode levar minutos)…" : "Executando…") : "Aprovar e executar"}
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
