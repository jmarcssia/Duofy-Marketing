"use client"

import { createContext, type ReactNode, useCallback, useContext, useState } from "react"

import { ChevronDownIcon, TrendDownIcon, TrendUpIcon } from "@/components/icons"

/* ---------------- Badge / Chip ---------------- */

export type Tone =
  | "purple"
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "teal"
  | "pink"
  | "indigo"
  | "sky"
  | "slate"
  | "orange"

const TONE: Record<Tone, string> = {
  purple: "bg-purple-soft text-purple-deep",
  blue: "bg-blue/10 text-blue",
  green: "bg-green/10 text-green",
  amber: "bg-amber/10 text-amber",
  red: "bg-red/10 text-red",
  teal: "bg-teal/10 text-teal",
  pink: "bg-pink/10 text-pink",
  indigo: "bg-indigo/10 text-indigo",
  sky: "bg-sky/10 text-sky",
  slate: "bg-slatex/10 text-slatex",
  orange: "bg-orange/10 text-orange"
}

export function Badge({
  children,
  tone = "purple",
  className = ""
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/* ---------------- StatCard (KPI) ---------------- */

export function StatCard({
  icon,
  iconTone = "purple",
  label,
  value,
  delta,
  deltaDir = "up",
  hint
}: {
  icon: ReactNode
  iconTone?: Tone
  label: string
  value: ReactNode
  delta?: string
  deltaDir?: "up" | "down"
  hint?: string
}) {
  return (
    <div className="duofy-card duofy-card-hover flex items-start gap-4 rounded-2xl p-5">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${TONE[iconTone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="tabular mt-1 font-display text-[26px] font-bold leading-none tracking-[-0.02em] text-ink">
          {value}
        </p>
        {delta ? (
          <p
            className={`mt-2 flex items-center gap-1 text-xs font-semibold ${
              deltaDir === "up" ? "text-green" : "text-red"
            }`}
          >
            {deltaDir === "up" ? (
              <TrendUpIcon className="h-3.5 w-3.5" />
            ) : (
              <TrendDownIcon className="h-3.5 w-3.5" />
            )}
            {delta}
            {hint ? <span className="font-normal text-muted">{hint}</span> : null}
          </p>
        ) : hint ? (
          <p className="mt-2 text-xs text-muted">{hint}</p>
        ) : null}
      </div>
    </div>
  )
}

/* ---------------- Tabs ---------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange
}: {
  tabs: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex items-center gap-6 border-b border-line">
      {tabs.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative -mb-px pb-3 text-sm font-semibold transition ${
              active ? "text-purple" : "text-muted hover:text-ink"
            }`}
          >
            {tab.label}
            {active ? <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-purple" /> : null}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Segmented control ---------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-white p-1">
      {options.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
              active ? "bg-purple text-white shadow-soft" : "text-muted hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Buttons / IconButton ---------------- */

export function GhostButton({
  children,
  onClick,
  className = "",
  disabled = false
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`duofy-tap inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

/* ---------------- Spinner ---------------- */

export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

/* ---------------- Page / Section headers ---------------- */

export function PageHeader({
  title,
  subtitle,
  icon,
  right
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
            {icon}
          </span>
        ) : null}
        <div>
          <h1 className="font-display text-[26px] font-bold leading-[1.1] tracking-[-0.025em] text-ink">
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {right}
    </div>
  )
}

export function SectionHeader({
  title,
  subtitle,
  right,
  className = ""
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div>
        <h2 className="font-display text-[17px] font-semibold tracking-[-0.015em] text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  )
}

/* ---------------- Select (visual) ---------------- */

export function FieldSelect({
  label,
  value,
  options,
  onChange
}: {
  label?: string
  value: string
  options: { value: string; label: string }[]
  onChange?: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      {label ? <span className="text-xs font-semibold text-muted">{label}</span> : null}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="duofy-focus h-11 w-full appearance-none rounded-xl border border-line bg-white px-3.5 pr-9 text-sm font-medium text-ink"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
    </label>
  )
}

/* ---------------- Toast (notificação global) ---------------- */

type ToastTone = "default" | "positive" | "danger"
type ToastItem = { id: number; message: string; tone: ToastTone }
const ToastCtx = createContext<(message: string, tone?: ToastTone) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((message: string, tone: ToastTone = "default") => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev, { id, message, tone }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`duofy-raised pointer-events-auto max-w-sm animate-slide-up rounded-xl px-4 py-3 text-sm font-medium ${
              t.tone === "danger"
                ? "bg-red text-white"
                : t.tone === "positive"
                  ? "bg-green text-white"
                  : "bg-ink text-white"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}
