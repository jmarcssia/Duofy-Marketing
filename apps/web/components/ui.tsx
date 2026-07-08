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

export function Dot({ tone = "purple" }: { tone?: Tone }) {
  const color: Record<Tone, string> = {
    purple: "bg-purple",
    blue: "bg-blue",
    green: "bg-green",
    amber: "bg-amber",
    red: "bg-red",
    teal: "bg-teal",
    pink: "bg-pink",
    indigo: "bg-indigo",
    sky: "bg-sky",
    slate: "bg-slatex",
    orange: "bg-orange"
  }
  return <span className={`inline-block h-2 w-2 rounded-full ${color[tone]}`} />
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

/* ---------------- Avatar ---------------- */

const AVATAR_TONES = [
  "from-purple/30 to-blue/30",
  "from-orange/30 to-pink/30",
  "from-teal/30 to-green/30",
  "from-indigo/30 to-sky/30"
]

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
  const tone = AVATAR_TONES[name.charCodeAt(0) % AVATAR_TONES.length]
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${tone} font-bold text-ink`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  )
}

/* ---------------- Progress ring (Guardião score) ---------------- */

export function ProgressRing({
  value,
  size = 96,
  label
}: {
  value: number
  size?: number
  label?: string
}) {
  const stroke = 8
  const radius = (size - stroke) / 2
  const circ = 2 * Math.PI * radius
  const offset = circ - (Math.min(100, Math.max(0, value)) / 100) * circ
  const color = value >= 80 ? "#1e8e5a" : value >= 60 ? "#b7791f" : "#d8483f"
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#ece9f6" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          fill="none"
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <span className="tabular block font-display text-2xl font-bold text-ink">{value}</span>
        {label ? <span className="block text-[10px] font-medium text-muted">{label}</span> : null}
      </div>
    </div>
  )
}

/* ---------------- Buttons / IconButton ---------------- */

export function IconButton({
  children,
  onClick,
  label,
  className = ""
}: {
  children: ReactNode
  onClick?: () => void
  label?: string
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`duofy-tap grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-muted hover:border-purple/40 hover:text-purple ${className}`}
    >
      {children}
    </button>
  )
}

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

/* ---------------- Skeleton ---------------- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`duofy-skeleton ${className}`} aria-hidden="true" />
}

export function SkeletonGroup({
  count = 3,
  className = "h-16",
  gap = "space-y-2"
}: {
  count?: number
  className?: string
  gap?: string
}) {
  return (
    <div className={gap}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`${className} rounded-xl`} />
      ))}
    </div>
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

/* ---------------- Empty state ---------------- */

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
  className = ""
}: {
  icon?: ReactNode
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`grid place-items-center rounded-2xl border border-dashed border-line bg-panel/60 px-6 py-14 text-center animate-fade-in ${className}`}
    >
      {icon ? (
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-purple-soft text-purple">
          {icon}
        </span>
      ) : null}
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {subtitle ? <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{subtitle}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
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

/* ---------------- Side panel / Drawer ---------------- */

export function SidePanel({
  children,
  onClose,
  width = 420
}: {
  children: ReactNode
  onClose?: () => void
  width?: number
}) {
  return (
    <aside
      className="duofy-card flex max-h-full flex-col overflow-hidden rounded-2xl"
      style={{ width }}
    >
      {children}
    </aside>
  )
}

/* ---------------- Card ---------------- */

export function Card({
  children,
  className = "",
  hover = false,
  padded = true
}: {
  children: ReactNode
  className?: string
  hover?: boolean
  padded?: boolean
}) {
  return (
    <div
      className={`duofy-card rounded-2xl ${hover ? "duofy-card-hover" : ""} ${padded ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  )
}

export function SectionCard({
  title,
  subtitle,
  right,
  children,
  className = ""
}: {
  title?: string
  subtitle?: string
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`duofy-card rounded-2xl p-5 ${className}`}>
      {title ? <SectionHeader title={title} subtitle={subtitle} right={right} className="mb-4" /> : null}
      {children}
    </div>
  )
}

/* ---------------- Buttons (primary / secondary) ---------------- */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { block?: boolean }

export function PrimaryButton({ className = "", block = false, children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`duofy-tap inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 ${block ? "w-full" : ""} ${className}`}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ className = "", block = false, children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`duofy-tap inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50 ${block ? "w-full" : ""} ${className}`}
    >
      {children}
    </button>
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

/* ---------------- Checklist row ---------------- */

export function ChecklistRow({
  label,
  state = "done"
}: {
  label: string
  state?: "done" | "warn" | "pending"
}) {
  const map = {
    done: { c: "text-green", b: "bg-green/10", i: "M5 10.5 8.5 14l6-7" },
    warn: { c: "text-amber", b: "bg-amber/10", i: "M10 5v6M10 14h.01" },
    pending: { c: "text-muted", b: "bg-line", i: "M5 10h10" }
  }[state]
  return (
    <li className="flex items-center gap-2.5 text-sm text-ink">
      <span className={`grid h-5 w-5 place-items-center rounded-full ${map.b} ${map.c}`}>
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d={map.i} />
        </svg>
      </span>
      {label}
    </li>
  )
}
