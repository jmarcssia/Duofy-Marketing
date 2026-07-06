"use client"

/**
 * TemplatePicker (FASE 2/4/5) — chips de template no topo do BriefingBuilder.
 * Um clique pré-preenche o briefing; o usuário ajusta depois.
 */

import { TargetIcon } from "@/components/icons"

export function TemplatePicker<T extends { id: string; label: string; hint?: string }>({
  templates,
  activeId,
  onPick
}: {
  templates: T[]
  activeId?: string | null
  onPick: (template: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {templates.map((template) => {
        const on = template.id === activeId
        return (
          <button
            key={template.id}
            type="button"
            onClick={() => onPick(template)}
            title={template.hint}
            className={`duofy-tap inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              on
                ? "border-purple bg-purple-soft text-purple-deep"
                : "border-line bg-white text-ink hover:border-purple/40 hover:text-purple"
            }`}
          >
            <TargetIcon className="h-3.5 w-3.5 text-purple" /> {template.label}
          </button>
        )
      })}
    </div>
  )
}
