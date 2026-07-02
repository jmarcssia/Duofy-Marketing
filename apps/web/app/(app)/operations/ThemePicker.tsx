"use client"

import { useMemo, useState } from "react"
import type { ResearchTheme } from "@/lib/api"

export function ThemePicker({
  themes, onPick, onClose,
}: {
  themes: ResearchTheme[]
  onPick: (theme: ResearchTheme) => void
  onClose: () => void
}) {
  const [q, setQ] = useState("")
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return themes
    return themes.filter((t) => t.title.toLowerCase().includes(term) || (t.notes || "").toLowerCase().includes(term))
  }, [themes, q])

  return (
    <div className="absolute bottom-14 left-0 z-40 w-80 rounded-xl border border-line bg-white p-3 shadow-panel">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted">Temas de pesquisa</p>
        <button onClick={onClose} className="text-xs text-muted hover:text-ink">Fechar</button>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Buscar tema…"
        className="mb-2 h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-purple" />
      <div className="max-h-64 space-y-1 overflow-y-auto duofy-scroll pr-1">
        {visible.length === 0 && <p className="px-2 py-3 text-xs text-muted">Nenhum tema. Cadastre na Memória.</p>}
        {visible.map((t) => (
          <button key={t.id} onClick={() => onPick(t)}
            className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-surface">
            {t.title}
          </button>
        ))}
      </div>
    </div>
  )
}
