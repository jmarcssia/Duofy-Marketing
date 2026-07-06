"use client"

/**
 * Chips de seleção (FASE 2/7) — blocos clicáveis do BriefingBuilder.
 *
 * `MultiSelectChips` (n seleções) e `ChoiceChips` (1 seleção) usam a mesma
 * linguagem visual dos chips existentes (admin/acessos, presets de conteúdo).
 * `allowOther` acrescenta um chip "Outro…" com campo livre curto.
 */

import { useState } from "react"

import type { Option } from "@/lib/briefing"

const CHIP_ON = "border-purple bg-purple-soft text-purple-deep"
const CHIP_OFF = "border-line bg-white text-muted hover:border-purple/40 hover:text-ink"

export function MultiSelectChips({
  options,
  value,
  onChange,
  allowOther = false,
  otherValue = "",
  onOtherChange,
  size = "md"
}: {
  options: Option[]
  value: string[]
  onChange: (next: string[]) => void
  allowOther?: boolean
  otherValue?: string
  onOtherChange?: (text: string) => void
  size?: "sm" | "md"
}) {
  const [showOther, setShowOther] = useState(Boolean(otherValue))
  const pad = size === "sm" ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-xs"

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = value.includes(option.id)
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => toggle(option.id)}
            title={option.hint}
            className={`duofy-tap rounded-lg border font-semibold transition ${pad} ${on ? CHIP_ON : CHIP_OFF}`}
          >
            {on ? "✓ " : ""}
            {option.label}
          </button>
        )
      })}
      {allowOther && (
        <button
          type="button"
          onClick={() => {
            if (showOther) onOtherChange?.("")
            setShowOther((v) => !v)
          }}
          className={`duofy-tap rounded-lg border font-semibold transition ${pad} ${showOther ? CHIP_ON : CHIP_OFF}`}
        >
          Outro…
        </button>
      )}
      {allowOther && showOther && (
        <input
          value={otherValue}
          onChange={(e) => onOtherChange?.(e.target.value)}
          placeholder="Descreva"
          className="h-8 rounded-lg border border-line px-2.5 text-xs text-ink focus:border-purple focus:outline-none"
        />
      )}
    </div>
  )
}

export function ChoiceChips({
  options,
  value,
  onChange,
  allowEmpty = true,
  size = "md"
}: {
  options: Option[]
  value: string
  onChange: (next: string) => void
  /** Clicar no chip ativo desmarca (volta a vazio). */
  allowEmpty?: boolean
  size?: "sm" | "md"
}) {
  const pad = size === "sm" ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-xs"
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(on && allowEmpty ? "" : option.id)}
            title={option.hint}
            className={`duofy-tap rounded-lg border font-semibold transition ${pad} ${on ? CHIP_ON : CHIP_OFF}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Cards de escolha única com título + dica (ex.: profundidade, tipo de evento). */
export function FilterCardGroup({
  options,
  value,
  onChange,
  columns = 3
}: {
  options: Option[]
  value: string
  onChange: (next: string) => void
  columns?: 2 | 3 | 4
}) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" }[columns]
  return (
    <div className={`grid grid-cols-1 gap-2 ${grid}`}>
      {options.map((option) => {
        const on = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`duofy-tap rounded-xl border px-3 py-2.5 text-left transition ${
              on ? "border-purple bg-purple-soft text-purple-deep" : "border-line bg-white text-muted hover:border-purple/40"
            }`}
          >
            <span className="block text-xs font-bold">{option.label}</span>
            {option.hint ? <span className="mt-0.5 block text-[11px]">{option.hint}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
