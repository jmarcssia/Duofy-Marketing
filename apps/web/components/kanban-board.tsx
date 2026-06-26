"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { FileIcon, MegaphoneIcon, SearchIcon } from "@/components/icons"
import { EmptyState, PurpleButton, Skeleton } from "@/components/page-primitives"
import { apiFetch, type ContentOutput, type ContentOutputDetail, type ResearchReport } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { statusLabel } from "@/lib/ui"

// ─── Types ────────────────────────────────────────────────────────────────────

type CardType = "research" | "content" | "press"

interface KanbanCard {
  id: number
  title: string
  brandSlug: string
  status: string
  type: CardType
  qualityScore: number | null
  qualityPassed: boolean | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLUMNS: { status: string; label: string }[] = [
  { status: "draft", label: "Rascunho" },
  { status: "review", label: "Em revisão" },
  { status: "approved", label: "Aprovado" },
]

type FilterTab = "all" | "research" | "content"

function parseError(err: unknown): string {
  return String(err).replace(/^Error:\s*/, "")
}

function cardType(output: ContentOutput): CardType {
  if (output.category === "research") return "research"
  if (output.channel === "Press" || output.format === "Press Release") return "press"
  return "content"
}

function buildCards(outputs: ContentOutput[], reports: ResearchReport[]): KanbanCard[] {
  const outputCards: KanbanCard[] = outputs.map((o) => ({
    id: o.id,
    title: o.title,
    brandSlug: o.brand_slug,
    status: o.status,
    type: cardType(o),
    qualityScore: null,
    qualityPassed: null,
  }))

  // Research reports (ResearchReport extends ContentOutput) also go into draft column if status is draft
  const reportIds = new Set(reports.map((r) => r.id))
  const filteredOutputCards = outputCards.filter((c) => !reportIds.has(c.id))

  const reportCards: KanbanCard[] = reports.map((r) => ({
    id: r.id,
    title: r.title,
    brandSlug: r.brand_slug,
    status: r.status ?? "draft",
    type: "research" as CardType,
    qualityScore: null,
    qualityPassed: null,
  }))

  return [...filteredOutputCards, ...reportCards]
}

// ─── Card icon ────────────────────────────────────────────────────────────────

function CardTypeIcon({ type }: { type: CardType }) {
  if (type === "research") return <SearchIcon className="h-4 w-4 shrink-0 text-purple" />
  if (type === "press") return <MegaphoneIcon className="h-4 w-4 shrink-0 text-purple" />
  return <FileIcon className="h-4 w-4 shrink-0 text-purple" />
}

// ─── Move menu ────────────────────────────────────────────────────────────────

interface MoveMenuProps {
  card: KanbanCard
  onMove: (card: KanbanCard, targetStatus: string) => Promise<void>
  moving: boolean
}

function MoveMenu({ card, onMove, moving }: MoveMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [open])

  const targets = COLUMNS.filter((col) => col.status !== card.status)

  if (card.type === "research") return null

  return (
    <div ref={ref} className="relative">
      <button
        disabled={moving}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold text-muted transition hover:border-purple/30 hover:text-purple disabled:opacity-50"
        aria-label="Mover card"
      >
        Mover
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-xl border border-line bg-white py-1 shadow-lg">
          {targets.map((col) => (
            <button
              key={col.status}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                void onMove(card, col.status)
              }}
              className="w-full px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-purple-soft hover:text-purple"
            >
              {col.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ─── Single kanban card ───────────────────────────────────────────────────────

interface KanbanCardProps {
  card: KanbanCard
  onClick: () => void
  onMove: (card: KanbanCard, targetStatus: string) => Promise<void>
  moving: boolean
  moveError: string | null
}

function KanbanCardItem({ card, onClick, onMove, moving, moveError }: KanbanCardProps) {
  return (
    <div
      className="group cursor-pointer rounded-xl border border-line bg-white p-4 transition hover:border-purple/30 hover:shadow-sm"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick() }}
    >
      <div className="mb-2 flex items-start gap-2">
        <CardTypeIcon type={card.type} />
        <p className="flex-1 text-sm font-semibold leading-snug text-ink line-clamp-2">{card.title}</p>
      </div>

      <p className="mb-3 text-xs text-muted">{card.brandSlug}</p>

      <div className="flex items-center justify-between gap-2">
        {card.qualityScore !== null ? (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
              card.qualityPassed
                ? "bg-green/10 text-green-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {card.qualityScore}/100
          </span>
        ) : (
          <span />
        )}
        <MoveMenu card={card} onMove={onMove} moving={moving} />
      </div>

      {moveError ? (
        <p className="mt-2 text-xs font-medium text-red-600">{moveError}</p>
      ) : null}
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  status: string
  label: string
  cards: KanbanCard[]
  onOpenCard: (id: number, type: string) => void
  onMove: (card: KanbanCard, targetStatus: string) => Promise<void>
  movingId: number | null
  moveErrors: Record<number, string>
}

function KanbanColumn({ status, label, cards, onOpenCard, onMove, movingId, moveErrors }: KanbanColumnProps) {
  return (
    <div className="duofy-card flex min-h-[200px] flex-col rounded-2xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-sm font-bold tracking-[-0.02em] text-ink">{label}</h3>
        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-purple-soft text-xs font-bold text-purple">
          {cards.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3">
        {cards.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">Sem itens</p>
        ) : (
          cards.map((card) => (
            <KanbanCardItem
              key={`${card.type}-${card.id}`}
              card={card}
              onClick={() => onOpenCard(card.id, card.type)}
              onMove={onMove}
              moving={movingId === card.id}
              moveError={moveErrors[card.id] ?? null}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

function FilterTabs({ active, onChange }: { active: FilterTab; onChange: (tab: FilterTab) => void }) {
  const tabs: { value: FilterTab; label: string }[] = [
    { value: "all", label: "Tudo" },
    { value: "research", label: "Pesquisas" },
    { value: "content", label: "Conteúdos" },
  ]
  return (
    <div className="flex gap-1 rounded-2xl border border-line bg-panel p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            active === tab.value
              ? "bg-purple text-white shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ─── Skeleton board ───────────────────────────────────────────────────────────

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {COLUMNS.map((col) => (
        <div key={col.status} className="duofy-card rounded-2xl p-4">
          <Skeleton className="mb-4 h-5 w-28 rounded-lg" />
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function KanbanBoard({
  brandSlug,
  onOpenCard,
}: {
  brandSlug?: string
  onOpenCard: (id: number, type: string) => void
}) {
  const [cards, setCards] = useState<KanbanCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FilterTab>("all")
  const [movingId, setMovingId] = useState<number | null>(null)
  const [moveErrors, setMoveErrors] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) return

    setLoading(true)
    setError(null)
    try {
      const outputParams = new URLSearchParams({ limit: "100" })
      if (brandSlug) outputParams.set("brand_slug", brandSlug)

      const reportParams = new URLSearchParams({ limit: "50" })
      if (brandSlug) reportParams.set("brand_slug", brandSlug)

      const [outputs, reports] = await Promise.all([
        apiFetch<ContentOutput[]>(`/api/outputs?${outputParams}`, token),
        apiFetch<ResearchReport[]>(`/api/research/reports?${reportParams}`, token),
      ])

      // Fetch quality review detail for outputs in review/approved status
      const detailIds = outputs
        .filter((o) => o.status === "review" || o.status === "approved")
        .map((o) => o.id)
        .slice(0, 20)

      const details = await Promise.allSettled(
        detailIds.map((id) =>
          apiFetch<ContentOutputDetail>(`/api/outputs/${id}`, token)
        )
      )

      const reviewMap: Record<number, { score: number; passed: boolean }> = {}
      details.forEach((result, idx) => {
        if (result.status === "fulfilled" && result.value.latest_quality_review) {
          const qr = result.value.latest_quality_review
          reviewMap[detailIds[idx]] = { score: qr.score, passed: qr.passed }
        }
      })

      const built = buildCards(outputs, reports).map((card) => ({
        ...card,
        qualityScore: reviewMap[card.id]?.score ?? null,
        qualityPassed: reviewMap[card.id]?.passed ?? null,
      }))

      setCards(built)
    } catch (err) {
      setError(parseError(err))
    } finally {
      setLoading(false)
    }
  }, [brandSlug])

  useEffect(() => {
    void load()
  }, [load])

  async function handleMove(card: KanbanCard, targetStatus: string) {
    const token = getTokenFromCookie()
    if (!token) return

    setMovingId(card.id)
    setMoveErrors((prev) => {
      const next = { ...prev }
      delete next[card.id]
      return next
    })

    try {
      let endpoint = ""
      if (targetStatus === "review") {
        endpoint = `/api/content/outputs/${card.id}/submit-review`
      } else if (targetStatus === "approved") {
        endpoint = `/api/outputs/${card.id}/approve`
      } else if (targetStatus === "draft") {
        endpoint = `/api/outputs/${card.id}/request-adjustment`
      }

      if (!endpoint) return

      await apiFetch<ContentOutputDetail>(endpoint, token, { method: "POST" })
      await load()
    } catch (err) {
      setMoveErrors((prev) => ({ ...prev, [card.id]: parseError(err) }))
    } finally {
      setMovingId(null)
    }
  }

  function filteredCards(status: string): KanbanCard[] {
    return cards.filter((card) => {
      if (card.status !== status) return false
      if (activeTab === "research") return card.type === "research"
      if (activeTab === "content") return card.type === "content" || card.type === "press"
      return true
    })
  }

  if (loading) return <BoardSkeleton />

  if (error) {
    return (
      <div className="rounded-2xl border border-red/20 bg-red/5 p-6 text-center">
        <p className="mb-3 text-sm font-semibold text-red-700">{error}</p>
        <PurpleButton onClick={() => void load()}>Tentar novamente</PurpleButton>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="space-y-4">
        <FilterTabs active={activeTab} onChange={setActiveTab} />
        <EmptyState
          title="Sem itens ainda"
          description="Nenhum conteúdo ou pesquisa encontrado. Peça ao assistente para criar algo."
          action={
            <PurpleButton onClick={() => onOpenCard(0, "chat")}>
              Pedir no chat
            </PurpleButton>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <FilterTabs active={activeTab} onChange={setActiveTab} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            status={col.status}
            label={statusLabel(col.status)}
            cards={filteredCards(col.status)}
            onOpenCard={onOpenCard}
            onMove={handleMove}
            movingId={movingId}
            moveErrors={moveErrors}
          />
        ))}
      </div>
    </div>
  )
}
