"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  RefreshIcon,
  ShieldCheckIcon,
  UsersIcon
} from "@/components/icons"
import {
  Badge,
  FieldSelect,
  GhostButton,
  PageHeader,
  SectionHeader,
  type Tone
} from "@/components/ui"
import { apiFetch, type AuditEvent, type Brand } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"

type AdminUser = {
  id: number
  email: string
  name: string
  role: string
  is_active: boolean
  brand_scope: string[] | null
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export default function AcessosPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)

  // brand_scope editor
  const [userId, setUserId] = useState<string>("")
  const [allBrands, setAllBrands] = useState(true)
  const [scope, setScope] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // filtros de auditoria
  const [fAction, setFAction] = useState("")
  const [fBrand, setFBrand] = useState("")

  const loadBase = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    setLoading(true)
    try {
      const [u, b] = await Promise.all([
        apiFetch<AdminUser[]>("/api/admin/users", token).catch(() => []),
        apiFetch<Brand[]>("/api/brands", token).catch(() => [])
      ])
      setUsers(u)
      setBrands(b)
    } catch { /* vazio */ }
    setLoading(false)
  }, [])

  const loadAudit = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) return
    const qs = new URLSearchParams({ limit: "40" })
    if (fAction) qs.set("action", fAction)
    if (fBrand) qs.set("brand_slug", fBrand)
    try {
      setEvents(await apiFetch<AuditEvent[]>(`/api/operations/audit-events?${qs.toString()}`, token))
    } catch { setEvents([]) }
  }, [fAction, fBrand])

  useEffect(() => { void loadBase() }, [loadBase])
  useEffect(() => { void loadAudit() }, [loadAudit])

  const selectedUser = useMemo(() => users.find((u) => String(u.id) === userId) ?? null, [users, userId])

  function pickUser(id: string) {
    setUserId(id)
    setMsg(null)
    const u = users.find((x) => String(x.id) === id)
    if (!u) { setAllBrands(true); setScope(new Set()); return }
    if (!u.brand_scope || u.brand_scope.length === 0) { setAllBrands(true); setScope(new Set()) }
    else { setAllBrands(false); setScope(new Set(u.brand_scope)) }
  }

  function toggleBrand(slug: string) {
    setScope((s) => {
      const n = new Set(s)
      if (n.has(slug)) n.delete(slug)
      else n.add(slug)
      return n
    })
  }

  async function saveScope() {
    if (!selectedUser) return
    const token = getTokenFromCookie()
    if (!token) return
    const brand_scope = allBrands ? null : Array.from(scope)
    if (!allBrands && brand_scope!.length === 0) { setMsg("Selecione ao menos uma marca ou marque “todas”."); return }
    setSaving(true); setMsg(null)
    try {
      await apiFetch(`/api/admin/users/${selectedUser.id}/brand-scope`, token, {
        method: "PUT", body: JSON.stringify({ brand_scope })
      })
      setMsg(allBrands ? "Escopo salvo: acesso a todas as marcas." : `Escopo salvo: ${brand_scope!.join(", ")}.`)
      await loadBase()
      await loadAudit()
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar o escopo.")
    }
    setSaving(false)
  }

  const auditActions = useMemo(
    () => Array.from(new Set(events.map((e) => e.action))).sort(),
    [events]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Acessos e Auditoria"
        subtitle="Controle de escopo de marca por usuário (C1) e trilha de ações administrativas."
        icon={<ShieldCheckIcon className="h-5 w-5" />}
        right={
          <Link href="/admin" className="duofy-tap inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple">
            ← Administração
          </Link>
        }
      />

      {/* Brand scope */}
      <section className="duofy-card space-y-4 rounded-2xl p-5">
        <SectionHeader title="Escopo de marca por usuário" subtitle="Sem escopo = acesso a todas as marcas. Atribuir marcas ativa o isolamento (C1)." />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <FieldSelect
            label="Usuário"
            value={userId}
            onChange={pickUser}
            options={[{ value: "", label: "Selecione um usuário…" }, ...users.map((u) => ({ value: String(u.id), label: `${u.name} (${u.role})` }))]}
          />

          {selectedUser ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <UsersIcon className="h-4 w-4 text-muted" />
                <span className="font-semibold text-ink">{selectedUser.email}</span>
                <Badge tone={selectedUser.role === "admin" ? "purple" : "slate"}>{selectedUser.role}</Badge>
                <Badge tone={selectedUser.brand_scope && selectedUser.brand_scope.length ? "amber" : "green"}>
                  {selectedUser.brand_scope && selectedUser.brand_scope.length ? `${selectedUser.brand_scope.length} marca(s)` : "todas as marcas"}
                </Badge>
              </div>

              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={allBrands} onChange={(e) => setAllBrands(e.target.checked)} className="h-4 w-4 rounded border-line accent-purple" />
                Acesso a <strong>todas as marcas</strong> (escopo nulo)
              </label>

              {!allBrands && (
                <div className="flex flex-wrap gap-2">
                  {brands.map((b) => {
                    const on = scope.has(b.slug)
                    return (
                      <button
                        key={b.slug}
                        onClick={() => toggleBrand(b.slug)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${on ? "border-purple bg-purple-soft text-purple-deep" : "border-line text-muted hover:border-purple/40"}`}
                      >
                        {on ? "✓ " : ""}{b.name}
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <button onClick={saveScope} disabled={saving} className="duofy-tap inline-flex items-center gap-2 rounded-xl bg-purple px-4 py-2 text-sm font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
                  <CheckCircleIcon className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar escopo"}
                </button>
                {msg && <span className="text-xs font-medium text-purple">{msg}</span>}
              </div>
            </div>
          ) : (
            <div className="grid place-items-center rounded-xl border border-dashed border-line py-10 text-center text-sm text-muted">
              Selecione um usuário para gerenciar o acesso por marca.
            </div>
          )}
        </div>
      </section>

      {/* Auditoria */}
      <section className="duofy-card rounded-2xl p-5">
        <SectionHeader
          title="Logs de auditoria"
          subtitle="Ações registradas (admin, workflow, publicações…)"
          right={<GhostButton onClick={() => void loadAudit()}><RefreshIcon className="h-4 w-4" /> Atualizar</GhostButton>}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="w-56"><FieldSelect value={fAction} onChange={setFAction} options={[{ value: "", label: "Ação: todas" }, ...auditActions.map((a) => ({ value: a, label: a }))]} /></div>
          <div className="w-48"><FieldSelect value={fBrand} onChange={setFBrand} options={[{ value: "", label: "Marca: todas" }, ...brands.map((b) => ({ value: b.slug, label: b.name }))]} /></div>
          <span className="ml-auto text-xs text-muted">{events.length} evento(s)</span>
        </div>

        <div className="mt-3 overflow-x-auto duofy-scroll">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold text-muted">
                <th className="py-2 pr-3">Quando</th>
                <th className="py-2 pr-3">Ação</th>
                <th className="py-2 pr-3">Autor</th>
                <th className="py-2 pr-3">Marca</th>
                <th className="py-2">Resumo</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="py-4 text-muted">Carregando…</td></tr>}
              {!loading && events.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">Sem eventos para os filtros atuais.</td></tr>}
              {events.map((e) => {
                const tone: Tone = e.status === "success" ? "green" : e.status === "failed" ? "red" : "slate"
                return (
                  <tr key={e.id} className="border-b border-line/60 align-top">
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted"><span className="inline-flex items-center gap-1"><ClockIcon className="h-3.5 w-3.5" />{fmt(e.created_at)}</span></td>
                    <td className="py-2 pr-3"><span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full`} style={{ background: tone === "green" ? "#16a34a" : tone === "red" ? "#ef4444" : "#94a3b8" }} /><code className="text-xs text-ink">{e.action}</code></span></td>
                    <td className="py-2 pr-3 text-xs text-ink">{e.user_email ?? "—"}</td>
                    <td className="py-2 pr-3">{e.brand_slug ? <Badge tone="slate">{e.brand_slug}</Badge> : <span className="text-xs text-muted">—</span>}</td>
                    <td className="py-2 text-xs text-ink/90">{e.summary}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <ArrowRightIcon className="h-3.5 w-3.5" /> Provedores, modelos e limites continuam nas abas de Administração.
      </p>
    </div>
  )
}
