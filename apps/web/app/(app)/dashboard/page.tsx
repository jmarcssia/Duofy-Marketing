"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { EmptyState, PageTitle, SectionCard, SoftButton } from "@/components/page-primitives"
import { apiFetch, type Agent, type Brand, type User } from "@/lib/api"
import { clearTokenCookie, getTokenFromCookie } from "@/lib/auth"

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [brands, setBrands] = useState<Brand[]>([])
  const [agents, setAgents] = useState<Agent[]>([])

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) {
      router.replace("/login")
      return
    }

    Promise.all([
      apiFetch<User>("/api/auth/me", token),
      apiFetch<Brand[]>("/api/brands", token),
      apiFetch<Agent[]>("/api/admin/agents", token)
    ])
      .then(([currentUser, brandList, agentList]) => {
        setUser(currentUser)
        setBrands(brandList)
        setAgents(agentList)
      })
      .catch(() => {
        clearTokenCookie()
        router.replace("/login")
      })
  }, [router])

  return (
    <div className="space-y-6">
      <PageTitle
        title="Visão Geral"
        subtitle="Resumo operacional com dados reais disponíveis no banco local."
      />

      <div className="grid gap-5 md:grid-cols-3">
        <SectionCard title="Marcas cadastradas">
          <div className="text-5xl font-extrabold tracking-[-0.06em]">{brands.length}</div>
          <p className="mt-2 text-sm text-muted">Vêm de `/api/brands`.</p>
        </SectionCard>
        <SectionCard title="Agentes configurados">
          <div className="text-5xl font-extrabold tracking-[-0.06em]">{agents.length}</div>
          <p className="mt-2 text-sm text-muted">Vêm de `/api/admin/agents`.</p>
        </SectionCard>
        <SectionCard title="Sessão">
          <div className="text-xl font-bold tracking-[-0.04em]">{user?.name ?? "Carregando"}</div>
          <p className="mt-2 text-sm text-muted">{user?.email}</p>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Marcas" action={<SoftButton>Gerenciar</SoftButton>}>
          <div className="space-y-3">
            {brands.map((brand) => (
              <div key={brand.slug} className="rounded-2xl border border-line bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold tracking-[-0.03em]">{brand.name}</h3>
                  <span className="rounded-full bg-purple-soft px-3 py-1 text-xs font-bold text-purple">
                    {brand.niche}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{brand.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <EmptyState
          title="Fluxos operacionais ainda sem registros"
          description="Aprovações, documentos, pesquisas e conteúdos serão exibidos aqui quando existirem tabelas e registros reais desses módulos."
        />
      </div>
    </div>
  )
}
