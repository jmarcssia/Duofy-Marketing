"use client"

/**
 * Resumo lateral do briefing + indicador de completude (FASE 7).
 *
 * `BriefingSummary` mostra o que foi selecionado (rótulos da taxonomia).
 * `BriefingCompleteness` mostra a barra de progresso e o estado
 * "Pronto para executar" (todos os campos obrigatórios preenchidos).
 */

import { CheckCircleIcon } from "@/components/icons"
import { Badge } from "@/components/ui"
import type { Completeness, SummaryRow } from "@/lib/briefing"

export function BriefingSummary({
  rows,
  title = "Resumo do briefing",
  emptyHint = "Selecione filtros para montar o briefing."
}: {
  rows: SummaryRow[]
  title?: string
  emptyHint?: string
}) {
  return (
    <div className="duofy-card rounded-2xl p-4">
      <p className="mb-2 text-sm font-bold text-ink">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">{emptyHint}</p>
      ) : (
        <dl className="space-y-2">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{row.label}</dt>
              <dd className="mt-0.5 flex flex-wrap gap-1">
                {row.values.map((value, i) => (
                  <Badge key={`${row.label}-${i}`} tone="slate" className="!font-medium">
                    {value}
                  </Badge>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

export function BriefingCompleteness({ completeness }: { completeness: Completeness }) {
  const { percent, ready, missing, requiredFilled, requiredTotal } = completeness
  return (
    <div className="duofy-card rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Completude</p>
        <span className={`text-xs font-bold ${ready ? "text-green" : "text-muted"}`}>{percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all ${ready ? "bg-green" : "bg-purple"}`}
          style={{ width: `${Math.max(4, percent)}%` }}
        />
      </div>
      {ready ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-green">
          <CheckCircleIcon className="h-4 w-4" /> Pronto para executar
        </p>
      ) : (
        <div className="mt-2 text-xs text-muted">
          <p className="font-semibold">
            Obrigatórios: {requiredFilled}/{requiredTotal}
          </p>
          {missing.length > 0 && <p className="mt-0.5">Falta: {missing.join(", ")}.</p>}
        </div>
      )}
    </div>
  )
}
