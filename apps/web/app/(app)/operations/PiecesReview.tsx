"use client"

import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/ui"
import {
  createContentPiece,
  deleteContentPiece,
  listContentPieces,
  refineContentPiece,
  setContentPieceStatus,
  type ContentPiece
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { friendlyError } from "@/lib/friendly-error"

const MANUAL_KINDS: [string, string][] = [
  ["whatsapp", "WhatsApp"],
  ["whatsapp_image_prompt", "WhatsApp — prompt de imagem"],
  ["email", "E-mail"],
  ["blog", "Blog"],
  ["release", "Release"],
  ["pitch", "Pitch de imprensa"],
  ["custom", "Outro"]
]

function statusTone(s: string): "green" | "red" | "amber" {
  return s === "approved" ? "green" : s === "rejected" ? "red" : "amber"
}
function statusLabel(s: string): string {
  return s === "approved" ? "Aprovada" : s === "rejected" ? "Rejeitada" : "Pendente"
}

export function PiecesReview({ outputId, onChanged }: { outputId: number; onChanged?: () => void }) {
  const [pieces, setPieces] = useState<ContentPiece[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [newKind, setNewKind] = useState("email")
  const [newContent, setNewContent] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [refiningId, setRefiningId] = useState<number | null>(null)
  const [instr, setInstr] = useState("")
  const [refineBusy, setRefineBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) return
    setLoading(true)
    try {
      setPieces(await listContentPieces(outputId, token))
      setError(null)
    } catch (e: unknown) {
      setError(friendlyError(e, "Falha ao carregar peças."))
    }
    setLoading(false)
  }, [outputId])

  useEffect(() => {
    load()
  }, [load])

  async function decide(piece: ContentPiece, status: "approved" | "rejected") {
    const token = getTokenFromCookie()
    if (!token) return
    setBusy(piece.id)
    try {
      await setContentPieceStatus(piece.id, status, null, token)
      await load()
      onChanged?.()
    } catch (e: unknown) {
      setError(friendlyError(e, "Falha ao atualizar a peça."))
    }
    setBusy(null)
  }

  async function removePiece(piece: ContentPiece) {
    const token = getTokenFromCookie()
    if (!token) return
    setBusy(piece.id)
    try {
      await deleteContentPiece(piece.id, token)
      await load()
      onChanged?.()
    } catch { /* ignore */ }
    setBusy(null)
  }

  async function refine(piece: ContentPiece) {
    const token = getTokenFromCookie()
    if (!token || instr.trim().length < 3) return
    setRefineBusy(piece.id)
    setError(null)
    try {
      await refineContentPiece(piece.id, instr.trim(), token)
      setRefiningId(null)
      setInstr("")
      await load()
      onChanged?.()
    } catch (e: unknown) {
      setError(friendlyError(e, "Falha ao refinar a peça."))
    }
    setRefineBusy(null)
  }

  async function addManual() {
    const token = getTokenFromCookie()
    if (!token || newContent.trim().length < 1) return
    setAdding(true)
    try {
      const label = MANUAL_KINDS.find(([k]) => k === newKind)?.[1] ?? newKind
      await createContentPiece(outputId, { kind: newKind, label, content: newContent, required: false }, token)
      setNewContent("")
      await load()
      onChanged?.()
    } catch (e: unknown) {
      setError(friendlyError(e, "Falha ao adicionar peça."))
    }
    setAdding(false)
  }

  const approvedRequired = pieces.filter((p) => p.required && p.status === "approved").length
  const totalRequired = pieces.filter((p) => p.required).length

  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Peças — aprovação individual</h3>
        {totalRequired > 0 && (
          <span className="text-xs text-muted">
            Obrigatórias aprovadas: <span className="font-semibold text-ink">{approvedRequired}/{totalRequired}</span>
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">Quando todas as obrigatórias forem aprovadas, o conteúdo é aprovado e a publicação libera.</p>

      {error && <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}

      {loading ? (
        <div className="mt-3 space-y-2"><div className="duofy-skeleton h-16 rounded-lg" /><div className="duofy-skeleton h-16 rounded-lg" /></div>
      ) : pieces.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nenhuma peça ainda.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {pieces.map((p) => (
            <li key={p.id} className="rounded-xl border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    {p.label}
                    {p.required ? <span className="rounded bg-purple/10 px-1 py-0.5 text-[9px] font-bold text-purple">obrigatória</span> : <span className="rounded bg-panel px-1 py-0.5 text-[9px] font-bold text-muted">opcional</span>}
                    {p.origin === "manual" && <span className="rounded bg-panel px-1 py-0.5 text-[9px] font-bold text-muted">manual</span>}
                  </p>
                  {p.channel && <p className="text-[11px] text-muted">{p.channel}</p>}
                </div>
                <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-ink/80">{p.content || "—"}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => decide(p, "approved")} disabled={busy === p.id || refineBusy === p.id || p.status === "approved"} className="duofy-tap rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">Aprovar</button>
                <button onClick={() => decide(p, "rejected")} disabled={busy === p.id || refineBusy === p.id || p.status === "rejected"} className="duofy-tap rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-red hover:border-red/40 disabled:opacity-50">Rejeitar</button>
                <button onClick={() => { setRefiningId((cur) => (cur === p.id ? null : p.id)); setInstr(""); setError(null) }} disabled={busy === p.id || refineBusy === p.id} className="duofy-tap rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-purple hover:border-purple/40 disabled:opacity-50">{refiningId === p.id ? "Cancelar" : "Refinar"}</button>
                {p.origin === "manual" && <button onClick={() => removePiece(p)} disabled={busy === p.id || refineBusy === p.id} className="duofy-tap rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted hover:border-red/40 hover:text-red disabled:opacity-50">Remover</button>}
              </div>
              {refiningId === p.id && (
                <div className="mt-2 rounded-xl border border-purple/30 bg-purple-soft/30 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-purple-deep">Refinar esta peça com o agente</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={instr}
                      onChange={(e) => setInstr(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && refine(p)}
                      disabled={refineBusy === p.id}
                      placeholder="Ex.: encurte, CTA mais direto, tom mais formal…"
                      className="w-full rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink focus:border-purple focus:outline-none disabled:opacity-50"
                    />
                    <button onClick={() => refine(p)} disabled={refineBusy === p.id || instr.trim().length < 3} className="duofy-tap inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-purple px-4 py-2 text-xs font-semibold text-white hover:bg-purple-deep disabled:opacity-50">
                      {refineBusy === p.id ? (<><svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Refinando…</>) : "Refinar"}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">O agente regenera só esta peça — costuma levar 30 a 60 s. Ela volta para “pendente” ao concluir.</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 rounded-xl border border-dashed border-line p-3">
        <p className="text-xs font-semibold text-ink">Adicionar peça manual</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={newKind} onChange={(e) => setNewKind(e.target.value)} className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink focus:border-purple focus:outline-none">
            {MANUAL_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="Conteúdo da peça (ex.: texto do WhatsApp)" className="min-w-[200px] flex-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink focus:border-purple focus:outline-none" />
          <button onClick={addManual} disabled={adding || newContent.trim().length < 1} className="duofy-tap rounded-lg bg-purple px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-deep disabled:opacity-50">{adding ? "..." : "Adicionar"}</button>
        </div>
      </div>
    </div>
  )
}
