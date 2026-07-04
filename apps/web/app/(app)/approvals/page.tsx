"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  FileIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  ShieldCheckIcon
} from "@/components/icons"
import {
  Badge,
  FieldSelect,
  GhostButton,
  PageHeader,
  Tabs,
  type Tone
} from "@/components/ui"
import { apiFetch, type CalendarEvent, type ContentOutput } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"

type Kind = "pesquisa" | "conteudo" | "evento" | "publicacao"
type Bucket = "pendente" | "ajuste" | "aprovado" | "concluido"
type Priority = "alta" | "media" | "baixa"

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "slate" },
  review: { label: "Em revisão", tone: "blue" },
  awaiting_approval: { label: "Aguardando aprovação", tone: "amber" },
  approved: { label: "Aprovado", tone: "green" },
  needs_adjustment: { label: "Ajuste solicitado", tone: "amber" },
  rejected: { label: "Rejeitado", tone: "red" },
  archived: { label: "Arquivado", tone: "slate" },
  completed: { label: "Concluído", tone: "green" }
}

const KIND_META: Record<Kind, { label: string; tone: Tone; href: string }> = {
  pesquisa: { label: "Pesquisa", tone: "purple", href: "/research" },
  conteudo: { label: "Conteúdo", tone: "blue", href: "/content" },
  evento: { label: "Evento", tone: "indigo", href: "/calendar" },
  publicacao: { label: "Publicação", tone: "teal", href: "/publicacoes" }
}

const PRIORITY_TONE: Record<Priority, Tone> = { alta: "red", media: "amber", baixa: "slate" }

type Item = {
  key: string
  kind: Kind
  outputId: number | null // aprovável em lote quando não-nulo
  title: string
  brand: string
  status: string
  priority: Priority
  bucket: Bucket
  updatedAt: string
}

function isResearch(o: ContentOutput): boolean {
  return o.category === "research" || (o.format?.includes("research") ?? false)
}
function ageDays(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}
function ageLabel(iso: string): string {
  const d = ageDays(iso)
  return d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`
}

export default function ReviewPage() {
  const { selected: brand } = useBrand()
  const [outputs, setOutputs] = useState<ContentOutput[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"todos" | Bucket>("pendente")
  const [fKind, setFKind] = useState<"" | Kind>("")
  const [fPriority, setFPriority] = useState<"" | Priority>("")
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [acting, setActing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    setLoading(true)
    const bq = brand ? `&brand_slug=${encodeURIComponent(brand)}` : ""
    try {
      const [o, e] = await Promise.all([
        apiFetch<ContentOutput[]>(`/api/outputs?limit=100${bq}`, token).catch(() => []),
        apiFetch<CalendarEvent[]>(`/api/calendar?limit=300${bq}`, token).catch(() => [])
      ])
      setOutputs(o)
      setEvents(e)
    } catch {
      setOutputs([]); setEvents([])
    }
    setSelected(new Set())
    setLoading(false)
  }, [brand])

  useEffect(() => { void load() }, [load])

  const items = useMemo<Item[]>(() => {
    const list: Item[] = []
    // Outputs (pesquisas + conteúdos) — marca do topo escopa a visão.
    for (const o of outputs) {
      if (brand && o.brand_slug !== brand) continue
      const kind: Kind = isResearch(o) ? "pesquisa" : "conteudo"
      const bucket: Bucket =
        o.status === "needs_adjustment" ? "ajuste"
          : o.status === "approved" ? "aprovado"
            : o.status === "archived" ? "concluido"
              : "pendente"
      const priority: Priority =
        o.status === "review" || o.status === "awaiting_approval" ? "alta"
          : o.status === "needs_adjustment" ? "media" : "baixa"
      list.push({
        key: `o${o.id}`, kind, outputId: o.id, title: o.title, brand: o.brand_slug,
        status: o.status, priority, bucket, updatedAt: o.updated_at
      })
    }
    // Eventos + publicações (do calendário)
    for (const e of events) {
      if (e.status === "cancelled") continue
      if (brand && e.brand_slug !== brand) continue
      let kind: Kind | null = null
      let bucket: Bucket = "pendente"
      if (e.published_at) { kind = "publicacao"; bucket = "concluido" }
      else if (e.current_step === "publish") { kind = "publicacao"; bucket = "pendente" }
      else if (e.status === "awaiting_approval" || e.current_step === "research_approval" || e.current_step === "review") { kind = "evento" }
      if (!kind) continue
      const priority: Priority = bucket === "pendente" ? "alta" : "baixa"
      list.push({
        key: `e${e.id}`, kind, outputId: null, title: e.title, brand: e.brand_slug,
        status: e.published_at ? "completed" : (e.status === "awaiting_approval" ? "awaiting_approval" : "review"),
        priority, bucket, updatedAt: e.updated_at
      })
    }
    return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  }, [outputs, events, brand])

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: items.length, pendente: 0, ajuste: 0, aprovado: 0, concluido: 0 }
    for (const it of items) c[it.bucket]++
    return c
  }, [items])

  const filtered = useMemo(() => items.filter((it) => {
    if (tab !== "todos" && it.bucket !== tab) return false
    if (fKind && it.kind !== fKind) return false
    if (fPriority && it.priority !== fPriority) return false
    return true
  }), [items, tab, fKind, fPriority])

  const selectableIds = useMemo(() => filtered.filter((it) => it.outputId && it.bucket !== "concluido").map((it) => it.outputId as number), [filtered])

  function toggle(id: number) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  function toggleAll() {
    setSelected((s) => s.size === selectableIds.length ? new Set() : new Set(selectableIds))
  }

  async function batch(kind: "approve" | "request-adjustment") {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    const token = getTokenFromCookie()
    if (!token) return
    let body = "{}"
    if (kind === "request-adjustment") {
      const feedback = window.prompt("Ajuste a solicitar para os itens selecionados:")
      if (feedback == null) return
      body = JSON.stringify({ feedback })
    }
    setActing(true); setMsg(null)
    let ok = 0
    for (const id of ids) {
      try { await apiFetch(`/api/outputs/${id}/${kind}`, token, { method: "POST", body }); ok++ } catch { /* segue */ }
    }
    setMsg(`${ok}/${ids.length} item(ns) processado(s).`)
    await load()
    setActing(false)
  }

  const TABS = [
    { id: "pendente" as const, label: `Pendentes (${counts.pendente})` },
    { id: "ajuste" as const, label: `Ajustes (${counts.ajuste})` },
    { id: "aprovado" as const, label: `Aprovados (${counts.aprovado})` },
    { id: "concluido" as const, label: `Concluídos (${counts.concluido})` },
    { id: "todos" as const, label: `Todos (${counts.todos})` }
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Central de Revisão"
        subtitle="Pendências consolidadas de pesquisas, conteúdos, eventos e publicações — aprove em lote ou abra no local certo."
        icon={<ShieldCheckIcon className="h-5 w-5" />}
        right={<GhostButton onClick={() => void load()}><RefreshIcon className="h-4 w-4" /> Atualizar</GhostButton>}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={setTab} tabs={TABS} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-3">
        <div className="w-40"><FieldSelect value={fKind} onChange={(v) => setFKind(v as "" | Kind)} options={[{ value: "", label: "Tipo: todos" }, { value: "pesquisa", label: "Pesquisas" }, { value: "conteudo", label: "Conteúdos" }, { value: "evento", label: "Eventos" }, { value: "publicacao", label: "Publicações" }]} /></div>
        <div className="w-40"><FieldSelect value={fPriority} onChange={(v) => setFPriority(v as "" | Priority)} options={[{ value: "", label: "Prioridade: todas" }, { value: "alta", label: "Alta" }, { value: "media", label: "Média" }, { value: "baixa", label: "Baixa" }]} /></div>
        {selectableIds.length > 0 && (
          <button onClick={toggleAll} className="text-xs font-semibold text-muted hover:text-purple">
            {selected.size === selectableIds.length ? "Limpar seleção" : `Selecionar ${selectableIds.length} aprováveis`}
          </button>
        )}
        <span className="ml-auto text-xs text-muted">{filtered.length} item(ns)</span>
      </div>

      {/* Barra de ações em lote */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-purple/30 bg-purple-soft/40 p-3">
          <span className="text-sm font-semibold text-purple-deep">{selected.size} selecionado(s)</span>
          <button onClick={() => batch("approve")} disabled={acting} className="duofy-tap inline-flex items-center gap-1.5 rounded-lg bg-purple px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
            <CheckCircleIcon className="h-4 w-4" /> Aprovar selecionados
          </button>
          <button onClick={() => batch("request-adjustment")} disabled={acting} className="duofy-tap inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-purple/40 hover:text-purple disabled:opacity-50">
            <SettingsIcon className="h-4 w-4" /> Solicitar ajuste
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs font-semibold text-muted hover:text-purple">Limpar</button>
          {msg && <span className="text-xs text-muted">{msg}</span>}
        </div>
      )}

      {/* Lista consolidada */}
      <div className="duofy-card rounded-2xl p-3">
        {loading ? (
          <div className="space-y-2 p-2">{[1, 2, 3, 4].map((i) => <div key={i} className="duofy-skeleton h-16 rounded-xl" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center">
            <CheckCircleIcon className="h-8 w-8 text-green" />
            <p className="text-sm text-muted">Nada nesta visão. Tudo em dia por aqui.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((it) => {
              const km = KIND_META[it.kind]
              const sm = STATUS_META[it.status] ?? { label: it.status, tone: "slate" as Tone }
              const canSelect = it.outputId != null && it.bucket !== "concluido"
              return (
                <li key={it.key} className="flex items-center gap-3 px-2 py-3">
                  <input
                    type="checkbox"
                    disabled={!canSelect}
                    checked={it.outputId != null && selected.has(it.outputId)}
                    onChange={() => it.outputId && toggle(it.outputId)}
                    className="h-4 w-4 shrink-0 rounded border-line accent-purple disabled:opacity-30"
                    aria-label="Selecionar"
                  />
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full`} title={`Prioridade ${it.priority}`} style={{ background: it.priority === "alta" ? "#ef4444" : it.priority === "media" ? "#d97706" : "#cbd5e1" }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{it.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={km.tone}>{km.label}</Badge>
                      <Badge tone={sm.tone}>{sm.label}</Badge>
                      <span className="text-[11px] text-muted">{it.brand} · {ageLabel(it.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {it.outputId != null && it.bucket !== "concluido" && it.bucket !== "aprovado" && (
                      <button
                        onClick={async () => {
                          const token = getTokenFromCookie()
                          if (!token) return
                          try { await apiFetch(`/api/outputs/${it.outputId}/approve`, token, { method: "POST", body: "{}" }); await load() } catch { /* ignore */ }
                        }}
                        className="duofy-tap hidden rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-green hover:border-green/40 sm:inline-flex"
                      >
                        Aprovar
                      </button>
                    )}
                    <Link href={km.href} className="duofy-tap inline-flex items-center gap-1 rounded-lg bg-purple/10 px-2.5 py-1.5 text-xs font-semibold text-purple hover:bg-purple/20">
                      Abrir <ArrowRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5"><SearchIcon className="h-3.5 w-3.5" /> Pesquisa → Agente de Pesquisa</span>
        <span className="inline-flex items-center gap-1.5"><FileIcon className="h-3.5 w-3.5" /> Conteúdo → Agente de Cocriação</span>
        <span className="inline-flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5" /> Evento → Calendário</span>
        <span className="inline-flex items-center gap-1.5"><SendIcon className="h-3.5 w-3.5" /> Publicação → Publicações</span>
      </div>
    </div>
  )
}
