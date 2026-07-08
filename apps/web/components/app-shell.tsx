"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { apiFetch, type AuditEvent, type ContentOutput, type MemorySearchResult, type User } from "@/lib/api"
import { clearTokenCookie, getTokenFromCookie } from "@/lib/auth"
import { DuofyLogo } from "@/components/duofy-logo"
import { brandAccent } from "@/lib/brand-accent"
import { useBrand } from "@/lib/brand-context"
import {
  BellIcon,
  CalendarIcon,
  ChartIcon,
  ChevronDownIcon,
  CloseIcon,
  FileIcon,
  GridIcon,
  BookIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon
} from "@/components/icons"

// Navegação agrupada pela jornada: Operar → Produzir → Governar. Rótulos curtos e coerentes.
const navGroups = [
  {
    label: "Operar",
    items: [
      { href: "/operations", label: "Operações", icon: GridIcon },
      { href: "/calendar", label: "Calendário", icon: CalendarIcon }
    ]
  },
  {
    label: "Produzir",
    items: [
      { href: "/research", label: "Pesquisa", icon: SearchIcon },
      { href: "/content", label: "Cocriação", icon: SparklesIcon }
    ]
  },
  {
    label: "Governar",
    items: [
      { href: "/approvals", label: "Revisão", icon: ShieldCheckIcon },
      { href: "/publicacoes", label: "Publicações", icon: SendIcon },
      { href: "/relatorios", label: "Relatórios", icon: ChartIcon },
      { href: "/admin", label: "Administração", icon: SettingsIcon }
    ]
  }
]

// Itens secundários (rodapé da sidebar) — acessíveis, fora da barra principal.
const secondaryItems = [
  { href: "/memory", label: "Memória", icon: BookIcon }
]

type SearchResults = {
  outputs: ContentOutput[]
  memory: MemorySearchResult[]
}

function GlobalSearch() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResults | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !query.trim()) return
    const token = getTokenFromCookie()
    if (!token) return
    setLoading(true)
    setOpen(true)
    try {
      const [outputs, memory] = await Promise.all([
        apiFetch<ContentOutput[]>(`/api/outputs?query=${encodeURIComponent(query.trim())}`, token),
        apiFetch<MemorySearchResult[]>("/api/memory/search", token, {
          method: "POST",
          body: JSON.stringify({ query: query.trim(), limit: 8 })
        })
      ])
      setResults({ outputs, memory })
    } catch {
      setResults({ outputs: [], memory: [] })
    } finally {
      setLoading(false)
    }
  }

  const hasResults = results && (results.outputs.length > 0 || results.memory.length > 0)

  return (
    <div ref={wrapperRef} className="relative hidden min-w-0 flex-1 md:block">
      <div className="flex h-12 items-center gap-3 rounded-2xl border border-line bg-white px-4 text-muted shadow-soft">
        <SearchIcon className="h-5 w-5 shrink-0" />
        <input
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          placeholder="Buscar pesquisas, conteúdos, marcas..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results && setOpen(true)}
        />
      </div>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(420px,92vw)] rounded-2xl border border-line bg-white shadow-pop">
          {loading && <p className="px-4 py-3 text-sm text-muted">Buscando...</p>}
          {!loading && !hasResults && results && <p className="px-4 py-3 text-sm text-muted">Nada encontrado.</p>}
          {!loading && results && results.outputs.length > 0 && (
            <div className="border-b border-line px-3 py-2">
              <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Conteúdos</p>
              {results.outputs.slice(0, 5).map((output) => (
                <Link key={output.id} href={`/approvals`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink hover:bg-purple-soft">
                  <FileIcon className="h-4 w-4 shrink-0 text-muted" />
                  <span className="truncate">{output.title}</span>
                </Link>
              ))}
            </div>
          )}
          {!loading && results && results.memory.length > 0 && (
            <div className="px-3 py-2">
              <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Memória</p>
              {results.memory.slice(0, 4).map((item) => (
                <Link key={item.id} href={`/memory`} onClick={() => setOpen(false)} className="flex flex-col rounded-lg px-2 py-2 hover:bg-purple-soft">
                  <span className="truncate text-sm font-medium text-ink">{item.title}</span>
                  <span className="truncate text-xs text-muted">{item.content.slice(0, 80)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BellPopover() {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [count, setCount] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Contagem real dos eventos recentes (sem número fictício antes do fetch).
  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) return
    let active = true
    apiFetch<AuditEvent[]>("/api/operations/audit-events?limit=10", token)
      .then((data) => {
        if (!active) return
        setEvents(data)
        setCount(data.length)
        setLoaded(true)
      })
      .catch(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  function handleOpen() {
    setOpen((prev) => !prev)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button onClick={handleOpen} className="relative grid h-11 w-11 place-items-center rounded-full text-ink/70 transition hover:bg-purple-soft hover:text-purple" aria-label="Notificações">
        <BellIcon className="h-6 w-6" />
        {count > 0 && (
          <span className="absolute right-1 top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-purple px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(340px,92vw)] rounded-2xl border border-line bg-white shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Eventos recentes</p>
          </div>
          {!loaded && <p className="px-4 py-3 text-sm text-muted">Carregando...</p>}
          {loaded && events.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nenhum evento recente.</p>}
          {loaded && events.length > 0 && (
            <ul className="max-h-[320px] overflow-y-auto duofy-scroll">
              {events.map((event) => (
                <li key={event.id} className="border-b border-line/60 px-4 py-3 last:border-0">
                  <p className="text-sm text-ink">{event.summary}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {new Date(event.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function BrandSelector() {
  const { brands, selected, setSelected } = useBrand()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = brands.find((b) => b.slug === selected)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="duofy-tap flex h-11 items-center gap-2.5 rounded-xl border border-line bg-white pl-3 pr-2.5 text-sm font-semibold text-ink hover:border-brand/40"
      >
        <span
          className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
          style={{ backgroundColor: brandAccent(selected), boxShadow: "0 0 0 1px rgba(23,22,31,0.08)" }}
        />
        <span className="max-w-[190px] truncate">{current?.name ?? "Selecionar marca"}</span>
        <ChevronDownIcon className="h-4 w-4 text-muted" />
      </button>
      {open ? (
        <div className="duofy-raised absolute left-0 top-[calc(100%+8px)] z-50 w-[280px] rounded-xl p-1.5">
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted/70">
            Marca ativa
          </p>
          {brands.length === 0 ? (
            <p className="px-2.5 py-2 text-sm text-muted">Carregando marcas…</p>
          ) : (
            brands.map((b) => {
              const active = b.slug === selected
              return (
                <button
                  key={b.slug}
                  onClick={() => {
                    setSelected(b.slug)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    active ? "bg-brand-50 font-semibold text-brand" : "text-ink hover:bg-surface"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: brandAccent(b.slug) }}
                  />
                  <span className="truncate">{b.name}</span>
                  {active ? (
                    <svg viewBox="0 0 20 20" className="ml-auto h-4 w-4 text-brand" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 10.5 3.5 3.5 6-7" />
                    </svg>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

function UserMenu({ user }: { user: User | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const name = user?.name ?? "Usuário"
  const roleLabel = user?.role === "admin" ? "Administrador" : user?.role === "manager" ? "Gerente" : "—"

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  async function logout() {
    // C5: o backend limpa o cookie HttpOnly; o cliente limpa a flag legível.
    try { await apiFetch("/api/auth/logout", undefined, { method: "POST", body: "{}" }) } catch { /* ignore */ }
    clearTokenCookie()
    router.replace("/login")
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button onClick={() => setOpen((p) => !p)} className="duofy-tap flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition hover:bg-surface">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-sm font-semibold text-ink">{name}</span>
          <span className="block text-xs text-muted">{roleLabel}</span>
        </span>
        <ChevronDownIcon className="hidden h-4 w-4 text-muted md:block" />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-48 rounded-xl border border-line bg-white p-1.5 shadow-pop">
          <button onClick={logout} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-ink hover:bg-purple-soft hover:text-purple">
            Sair
          </button>
        </div>
      )}
    </div>
  )
}

function NavItem({
  href,
  label,
  Icon,
  active,
  onNavigate
}: {
  href: string
  label: string
  Icon: (props: { className?: string }) => JSX.Element
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-3 rounded-xl py-2.5 pl-3.5 pr-3 text-[14px] transition ${
        active
          ? "bg-brand-50 font-semibold text-brand"
          : "font-medium text-muted hover:bg-surface hover:text-ink"
      }`}
    >
      {active ? (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand" />
      ) : null}
      <Icon className={`h-[18px] w-[18px] ${active ? "text-brand" : "text-muted"}`} />
      <span>{label}</span>
    </Link>
  )
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-6">
      {navGroups.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted/70">
            {group.label}
          </p>
          {group.items.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              Icon={item.icon}
              active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  )
}

function SidebarBody({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <div className="px-2">
        <DuofyLogo />
      </div>
      <div className="mt-8 flex-1 overflow-y-auto duofy-scroll">
        <NavLinks pathname={pathname} onNavigate={onNavigate} />
      </div>
      <div className="space-y-1 border-t border-line pt-3">
        {secondaryItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            Icon={item.icon}
            active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) return
    apiFetch<User>("/api/auth/me", token)
      .then(setUser)
      .catch(() => clearTokenCookie())
  }, [pathname])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <main className="min-h-screen bg-paper text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-paper px-4 py-6 text-ink lg:flex">
        <SidebarBody pathname={pathname} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-[264px] flex-col border-r border-line bg-white px-4 py-5">
            <div className="mb-2 flex items-center justify-between">
              <div className="px-2">
                <DuofyLogo />
              </div>
              <button onClick={() => setMobileOpen(false)} aria-label="Fechar menu" className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-purple-soft hover:text-purple">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto duofy-scroll">
              <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      ) : null}

      <section className="min-h-screen lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-paper/85 px-4 backdrop-blur-sm md:gap-4 md:px-8">
          <button onClick={() => setMobileOpen(true)} aria-label="Abrir menu" className="grid h-10 w-10 place-items-center rounded-lg border border-line text-ink transition hover:bg-surface lg:hidden">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>

          <div className="hidden sm:block">
            <BrandSelector />
          </div>

          <GlobalSearch />

          <BellPopover />
          <UserMenu user={user} />
        </header>

        <div className="mx-auto w-full max-w-[1280px] px-4 py-7 md:px-8">{children}</div>
      </section>
    </main>
  )
}
