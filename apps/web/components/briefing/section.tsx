"use client"

/**
 * Seções expansíveis do BriefingBuilder (FASE 7) — mantêm a tela limpa:
 * o essencial fica aberto; o avançado fica dobrado com contador de seleções.
 */

import { useState, type ReactNode } from "react"

import { ChevronDownIcon } from "@/components/icons"

export function CollapsibleSection({
  title,
  subtitle,
  count = 0,
  defaultOpen = false,
  children
}: {
  title: string
  subtitle?: string
  /** Nº de seleções feitas dentro da seção (badge quando fechada). */
  count?: number
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-line bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-bold text-ink">{title}</span>
          {subtitle ? <span className="hidden truncate text-xs text-muted sm:inline">{subtitle}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {count > 0 ? (
            <span className="rounded-full bg-purple-soft px-2 py-0.5 text-[11px] font-bold text-purple-deep">
              {count}
            </span>
          ) : null}
          <ChevronDownIcon className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && <div className="space-y-3 border-t border-line px-4 py-3">{children}</div>}
    </div>
  )
}

/** Rótulo curto acima de um grupo de chips/campos. */
export function FieldGroup({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted">
        {label}
        {hint ? <span className="ml-1 font-normal">· {hint}</span> : null}
      </p>
      {children}
    </div>
  )
}
