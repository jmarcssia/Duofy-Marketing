"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { Avatar, Badge, GhostButton, Tabs } from "@/components/ui"
import {
  AlertTriangleIcon,
  BookIcon,
  CheckCircleIcon,
  RefreshIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon
} from "@/components/icons"
import {
  apiFetch,
  type ContentOutput,
  type OutputWorkflowDetail
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { useBrand } from "@/lib/brand-context"
import type { Tone } from "@/components/ui"

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "amber" },
  review: { label: "Em revisão", tone: "blue" },
  approved: { label: "Aprovado", tone: "green" },
  needs_adjustment: { label: "Ajuste solicitado", tone: "amber" },
  rejected: { label: "Rejeitado", tone: "red" },
  archived: { label: "Arquivado", tone: "slate" }
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) } catch { return iso }
}

export default function ReviewPage() {
  const { selected: brand } = useBrand()
  const [tab, setTab] = useState<"todos" | "pesquisas" | "conteudos">("todos")
  const [outputs, setOutputs] = useState<ContentOutput[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<OutputWorkflowDetail | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = getTokenFromCookie()
    if (!token) { setLoading(false); return }
    setLoading(true)
    try {
      const data = await apiFetch<ContentOutput[]>("/api/outputs?limit=100", token)
      const filtered = brand ? data.filter((o) => o.brand_slug === brand) : data
      setOutputs(filtered)
      setSelectedId((prev) => (prev && filtered.some((o) => o.id === prev) ? prev : filtered[0]?.id ?? null))
    } catch {
      setOutputs([])
    }
    setLoading(false)
  }, [brand])

  useEffect(() => { load() }, [load])

  const loadDetail = useCallback(async (id: number) => {
    const token = getTokenFromCookie()
    if (!token) return
    setDetail(null)
    try {
      const d = await apiFetch<OutputWorkflowDetail>(`/api/outputs/${id}`, token)
      setDetail(d)
    } catch { setDetail(null) }
  }, [])

  useEffect(() => {
    if (selectedId != null) loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail])

  const queue = useMemo(() => {
    if (tab === "pesquisas") return outputs.filter((o) => o.category === "research" || o.format?.includes("research"))
    if (tab === "conteudos") return outputs.filter((o) => o.category !== "research" && !o.format?.includes("research"))
    return outputs
  }, [outputs, tab])

  async function act(kind: "approve" | "request-adjustment" | "reject" | "quality-review" | "archive") {
    if (selectedId == null) return
    const token = getTokenFromCookie()
    if (!token) return
    let body = "{}"
    if (kind === "request-adjustment" || kind === "reject") {
      const feedback = window.prompt(kind === "reject" ? "Motivo da rejeição:" : "O que precisa ser ajustado?")
      if (feedback == null) return
      body = JSON.stringify({ feedback })
    }
    setActing(kind)
    try {
      const d = await apiFetch<OutputWorkflowDetail>(`/api/outputs/${selectedId}/${kind}`, token, { method: "POST", body })
      setDetail(d)
      await load()
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : "Falha na ação.")
    }
    setActing(null)
  }

  const selected = outputs.find((o) => o.id === selectedId) ?? null
  const review = detail?.latest_quality_review ?? null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-[30px] font-extrabold tracking-[-0.04em] text-ink">
          <ShieldCheckIcon className="h-7 w-7 text-purple" /> Revisão
        </h1>
        <p className="mt-1 text-sm text-muted">Revise e aprove os outputs gerados pelos agentes antes de enviá-los para a Memória ou para as Operações.</p>
      </div>

      <div className="flex items-center justify-between">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "todos", label: `Todos (${outputs.length})` },
            { id: "pesquisas", label: "Pesquisas" },
            { id: "conteudos", label: "Conteúdos" }
          ]}
        />
        <button onClick={load} className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-purple">
          <RefreshIcon className="h-4 w-4" /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)_316px]">
        {/* Fila */}
        <section className="duofy-card h-fit rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-base font-bold text-ink">Fila de revisão</h2>
            <Badge tone="purple">{queue.length} itens</Badge>
          </div>
          {loading ? (
            <div className="space-y-2.5">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-line/50" />)}</div>
          ) : queue.length === 0 ? (
            <p className="px-1 py-8 text-center text-sm text-muted">Nada na fila desta categoria.</p>
          ) : (
            <ul className="max-h-[640px] space-y-2.5 overflow-y-auto duofy-scroll pr-1">
              {queue.map((item) => {
                const active = selectedId === item.id
                const st = STATUS_META[item.status] ?? { label: item.status, tone: "slate" as Tone }
                return (
                  <li key={item.id}>
                    <button onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-purple bg-purple-soft/40 ring-1 ring-purple/20" : "border-line hover:border-purple/40"}`}>
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-purple-soft text-purple">
                          <BookIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{item.title}</p>
                          <p className="text-xs text-muted">{item.channel} · {item.category}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-muted">#{item.id}</span>
                            <Badge tone={st.tone} className="ml-auto">{st.label}</Badge>
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Editor */}
        <section className="duofy-card rounded-2xl p-5">
          {!selected ? (
            <div className="grid place-items-center py-20 text-center text-sm text-muted">Selecione um item da fila.</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-0.02em] text-ink">
                  <ShieldCheckIcon className="h-5 w-5 text-purple" /> {selected.title}
                  <Badge tone={(STATUS_META[selected.status]?.tone) ?? "slate"}>{STATUS_META[selected.status]?.label ?? selected.status}</Badge>
                </h2>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                <Meta label="Agente" value={`run #${selected.agent_run_id ?? "—"}`} />
                <Meta label="Marca" value={selected.brand_slug} />
                <Meta label="Canal" value={selected.channel} />
                <Meta label="Modelo" value={selected.model.replace("~", "")} />
                <Meta label="Atualizado" value={fmtDate(selected.updated_at)} />
                <Meta label="Versão" value={`v${selected.current_version_number ?? 1}`} />
              </div>

              {/* Conteúdo */}
              <div className="mt-4 rounded-xl border border-line bg-white p-4">
                {!detail ? (
                  <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-line/50" />)}</div>
                ) : (
                  <article className="prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
                    {detail.current_content || "Sem conteúdo."}
                  </article>
                )}
              </div>

              {/* Briefing */}
              <div className="mt-4 rounded-xl border border-line bg-panel p-3">
                <p className="text-xs font-semibold text-muted">Briefing original</p>
                <p className="mt-1 text-sm text-ink/80">{selected.briefing}</p>
              </div>

              {/* Versões */}
              {detail && detail.versions.length > 0 && (
                <div className="mt-4 rounded-xl border border-line p-4">
                  <p className="mb-3 text-sm font-bold text-ink">Histórico de versões <span className="ml-1 text-xs font-normal text-muted">{detail.versions.length} versão(ões)</span></p>
                  <ul className="space-y-2">
                    {detail.versions.slice().reverse().map((v) => (
                      <li key={v.id} className="flex items-center gap-3 text-sm">
                        <span className="font-semibold text-ink">v{v.version_number}</span>
                        {v.id === detail.current_version_id ? <Badge tone="green">Atual</Badge> : null}
                        {v.editor_note ? <span className="truncate text-xs text-muted">{v.editor_note}</span> : null}
                        <span className="ml-auto text-xs text-muted">{fmtDate(v.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        {/* Guardião */}
        <aside className="duofy-card h-fit rounded-2xl p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink"><ShieldCheckIcon className="h-5 w-5 text-purple" /> Guardião</h2>

          {review ? (
            <>
              <p className="mt-4 text-sm font-semibold text-muted">Pontuação de qualidade</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-3xl font-extrabold text-ink">{Math.round(review.score)}</span>
                <span className="text-sm text-muted">/100</span>
                <Badge tone={review.passed ? "green" : "amber"} className="ml-1">{review.passed ? "Aprovado" : "Atenção"}</Badge>
              </div>
              {review.summary && <p className="mt-2 text-xs text-muted">{review.summary}</p>}

              {review.required_fixes?.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">Correções necessárias <Badge tone="amber">{review.required_fixes.length}</Badge></p>
                  <ul className="space-y-2">
                    {review.required_fixes.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-ink/80"><AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" />{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {review.optional_improvements?.length > 0 && (
                <div className="mt-3 rounded-xl bg-green/5 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink"><SparklesIcon className="h-4 w-4 text-green" /> Melhorias sugeridas</p>
                  <ul className="mt-1 space-y-1 text-xs text-muted">
                    {review.optional_improvements.slice(0, 3).map((s, i) => <li key={i}>• {s}</li>)}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="mt-4 grid place-items-center rounded-xl border border-dashed border-line py-8 text-center">
              <ShieldCheckIcon className="h-6 w-6 text-muted" />
              <p className="mt-1.5 text-xs text-muted">Sem avaliação do Guardião ainda.</p>
              <button
                onClick={() => act("quality-review")}
                disabled={!selected || acting === "quality-review"}
                className="mt-2 rounded-lg bg-purple px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {acting === "quality-review" ? "Avaliando…" : "Rodar Guardião"}
              </button>
            </div>
          )}

          <div className="mt-5 space-y-2.5 border-t border-line pt-4">
            <button
              onClick={() => act("approve")}
              disabled={!selected || acting != null || selected?.status === "approved"}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
            >
              <CheckCircleIcon className="h-5 w-5" /> {acting === "approve" ? "Aprovando…" : selected?.status === "approved" ? "Aprovado" : "Aprovar"}
            </button>
            <GhostButton className="w-full justify-center" onClick={() => act("request-adjustment")} disabled={!selected || acting != null}>
              <SettingsIcon className="h-4 w-4" /> Solicitar ajuste
            </GhostButton>
            <GhostButton className="w-full justify-center" onClick={() => act("quality-review")} disabled={!selected || acting != null}>
              <ShieldCheckIcon className="h-4 w-4" /> Rodar Guardião
            </GhostButton>
            <GhostButton className="w-full justify-center" onClick={() => act("reject")} disabled={!selected || acting != null}>
              <AlertTriangleIcon className="h-4 w-4" /> Rejeitar
            </GhostButton>
          </div>
          <p className="mt-4 text-center text-[11px] text-muted">Ações registradas no histórico de auditoria.</p>
        </aside>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className="flex items-center gap-1.5 font-semibold text-ink">{value}</p>
    </div>
  )
}
