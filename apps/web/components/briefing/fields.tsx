"use client"

/**
 * Campos de texto padronizados do BriefingBuilder — o pouco de digitação que resta
 * (pergunta principal, contexto, concorrentes, observações) com o visual do sistema.
 */

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <label className="block text-xs font-semibold text-muted">
      {label}
      {hint ? <span className="ml-1 font-normal">· {hint}</span> : null}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-line px-3 py-2 text-sm font-normal text-ink focus:border-purple focus:outline-none"
      />
    </label>
  )
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
  hint
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  rows?: number
  hint?: string
}) {
  return (
    <label className="block text-xs font-semibold text-muted">
      {label}
      {hint ? <span className="ml-1 font-normal">· {hint}</span> : null}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="mt-1 w-full resize-none rounded-xl border border-line px-3 py-2.5 text-sm font-normal text-ink focus:border-purple focus:outline-none"
      />
    </label>
  )
}
