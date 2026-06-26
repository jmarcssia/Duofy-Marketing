"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { apiFetch, type Brand, type User } from "@/lib/api"
import { clearTokenCookie, getTokenFromCookie } from "@/lib/auth"
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [brands, setBrands] = useState<Brand[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [brand, setBrand] = useState("")

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) return
    Promise.all([apiFetch<User>("/api/auth/me", token), apiFetch<Brand[]>("/api/brands", token)])
      .then(([currentUser, brandList]) => {
        setUser(currentUser)
        setBrands(brandList)
        setBrand(brandList[0]?.slug ?? "")
      })
      .catch(() => clearTokenCookie())
  }, [pathname])

  return (
    <main className="min-h-screen bg-panel text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[245px] border-r border-slate-800/70 bg-[#080914] px-5 py-7 text-white lg:flex lg:flex-col">
        <div className="rounded-2xl bg-[#11131f] px-4 py-3 shadow-lg shadow-black/20">
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
                    ? "bg-white/10 text-white"
                    : "text-white/78 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white">
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
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              className="w-full bg-transparent outline-none"
            >
              {brands.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <div className="hidden h-12 w-[320px] items-center gap-3 rounded-xl border border-line bg-white px-4 text-muted md:flex">
            <SearchIcon className="h-5 w-5" />
            <input className="w-full bg-transparent outline-none" placeholder="Buscar..." />
          </div>

          <button className="relative rounded-full p-2 text-ink/80">
            <BellIcon className="h-6 w-6" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-purple" />
          </button>

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
