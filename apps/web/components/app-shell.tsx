"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { apiFetch, type AuditEvent, type ContentOutput, type MemorySearchResult, type User } from "@/lib/api"
import { clearTokenCookie, getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"
import { LogoutButton } from "@/components/logout-button"
import { DuofyLogo } from "@/components/duofy-logo"
import {
  BellIcon,
  BotIcon,
  BuildingIcon,
  ChartIcon,
  CheckCircleIcon,
  DatabaseIcon,
  DollarIcon,
  FileIcon,
  GridIcon,
  MegaphoneIcon,
  SearchIcon,
  SettingsIcon
} from "@/components/icons"

const navItems = [
  { href: "/workspace", label: "Workspace", icon: GridIcon },
  { href: "/dashboard", label: "Visão Geral", icon: GridIcon },
  { href: "/chat", label: "Chat", icon: BotIcon },
  { href: "/research", label: "Pesquisas", icon: SearchIcon },
  { href: "/content", label: "Conteúdos", icon: FileIcon },
  { href: "/approvals", label: "Aprovações", icon: CheckCircleIcon },
  { href: "/calendar", label: "Calendário", icon: MegaphoneIcon },
  { href: "/admin/agents", label: "Agentes IA", icon: BotIcon },
  { href: "/insights", label: "Insights", icon: ChartIcon },
  { href: "/costs", label: "Custos", icon: DollarIcon },
  { href: "/operations", label: "Operações", icon: ChartIcon },
  { href: "/admin/config", label: "Configurações", icon: SettingsIcon },
  { href: "/memory", label: "Memória / Documentos", icon: DatabaseIcon }
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
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
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
    <div ref={wrapperRef} className="relative hidden md:block">
      <div className="flex h-12 w-[320px] items-center gap-3 rounded-xl border border-line bg-white px-4 text-muted">
        <SearchIcon className="h-5 w-5 shrink-0" />
        <input
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          placeholder="Buscar..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results && setOpen(true)}
        />
      </div>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[380px] rounded-xl border border-line bg-white shadow-lg">
          {loading && (
            <p className="px-4 py-3 text-sm text-muted">Buscando...</p>
          )}

          {!loading && !hasResults && results && (
            <p className="px-4 py-3 text-sm text-muted">Nada encontrado.</p>
          )}

          {!loading && results && results.outputs.length > 0 && (
            <div className="border-b border-line px-4 py-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Conteúdos</p>
              {results.outputs.slice(0, 5).map((output) => (
                <Link
                  key={output.id}
                  href={`/content/${output.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink hover:bg-purple-soft"
                >
                  <FileIcon className="h-4 w-4 shrink-0 text-muted" />
                  <span className="truncate">{output.title}</span>
                </Link>
              ))}
            </div>
          )}

          {!loading && results && results.memory.length > 0 && (
            <div className="px-4 py-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Memória</p>
              {results.memory.slice(0, 4).map((item) => (
                <Link
                  key={item.id}
                  href={`/memory`}
                  onClick={() => setOpen(false)}
                  className="flex flex-col rounded-lg px-2 py-2 hover:bg-purple-soft"
                >
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
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  async function handleOpen() {
    setOpen((prev) => !prev)
    if (!loaded) {
      const token = getTokenFromCookie()
      if (!token) return
      try {
        const data = await apiFetch<AuditEvent[]>("/api/operations/audit-events?limit=10", token)
        setEvents(data)
      } catch {
        setEvents([])
      } finally {
        setLoaded(true)
      }
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={handleOpen}
        className="relative rounded-full p-2 text-ink/80 hover:bg-purple-soft"
        aria-label="Notificações"
      >
        <BellIcon className="h-6 w-6" />
        {events.length > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-purple" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[340px] rounded-xl border border-line bg-white shadow-lg">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Eventos recentes</p>
          </div>

          {!loaded && (
            <p className="px-4 py-3 text-sm text-muted">Carregando...</p>
          )}

          {loaded && events.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">Nenhum evento recente.</p>
          )}

          {loaded && events.length > 0 && (
            <ul className="max-h-[320px] overflow-y-auto">
              {events.map((event) => (
                <li key={event.id} className="border-b border-line/60 px-4 py-3 last:border-0">
                  <p className="text-sm text-ink">{event.summary}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {new Date(event.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const { brands, selected, setSelected } = useBrand()

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) return
    apiFetch<User>("/api/auth/me", token)
      .then(setUser)
      .catch(() => clearTokenCookie())
  }, [pathname])

  return (
    <main className="min-h-screen bg-panel text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[245px] border-r border-line bg-white px-5 py-7 text-ink lg:flex lg:flex-col">
        <div className="rounded-2xl border border-line bg-panel px-4 py-3">
          <DuofyLogo />
        </div>

        <nav className="mt-16 flex-1 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-4 rounded-xl px-4 py-3 text-[15px] transition ${
                  active
                    ? "bg-purple-soft font-semibold text-purple"
                    : "text-muted hover:bg-purple-soft/60 hover:text-purple"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-xl border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink">
            <span>Novidades</span>
            <span className="h-2 w-2 rounded-full bg-purple" />
          </div>
          <LogoutButton />
        </div>
      </aside>

      <section className="min-h-screen lg:pl-[245px]">
        <header className="sticky top-0 z-20 flex h-[86px] items-center justify-end gap-4 border-b border-line bg-white/92 px-8 backdrop-blur">
          <label className="hidden h-12 min-w-[210px] items-center gap-3 rounded-xl border border-line bg-white px-4 text-sm font-semibold md:flex">
            <BuildingIcon className="h-5 w-5 text-ink/70" />
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full bg-transparent outline-none"
            >
              {brands.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <GlobalSearch />

          <BellPopover />

          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-orange/30 to-purple/30 text-sm font-bold">
              {user?.name?.slice(0, 1) ?? "A"}
            </div>
            <span className="hidden text-sm font-semibold md:block">{user?.name ?? "Admin"}</span>
          </div>
        </header>

        <div className="px-8 py-7">{children}</div>
      </section>
    </main>
  )
}
