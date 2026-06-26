import type { ButtonHTMLAttributes, ReactNode } from "react"

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`duofy-skeleton ${className}`} aria-hidden="true" />
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-[32px] font-extrabold tracking-[-0.045em] text-ink">{title}</h1>
      {subtitle ? <p className="mt-1 text-[15px] text-muted">{subtitle}</p> : null}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="duofy-card rounded-2xl p-8 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-purple-soft text-2xl text-purple">
        +
      </div>
      <h2 className="text-lg font-bold tracking-[-0.03em]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

export function SectionCard({
  title,
  children,
  action,
  className = ""
}: {
  title: string
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <section className={`duofy-card rounded-2xl p-6 ${className}`}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold tracking-[-0.03em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function PurpleButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl bg-purple px-5 py-3 text-sm font-bold text-white shadow-lg shadow-purple/20 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  )
}

export function SoftButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-purple/40 hover:text-purple disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  )
}
