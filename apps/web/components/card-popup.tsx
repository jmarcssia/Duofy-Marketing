"use client"

import { useEffect, useState } from "react"

import {
  CommentPanel,
  DocumentEditor,
  DocumentPreview,
  ExportMenu,
  InspectorStack,
  MetadataInspector,
  ModeToggle,
  VersionTimeline,
  VersionCompareView,
  WorkspaceToolbarButton,
  type CompareLine,
  type ExportFormat,
  type TimelineItem,
  type WorkspaceComment,
  type WorkspaceMode
} from "@/components/document-workspace"
import {
  apiFetch,
  type ContentOutputDetail,
  type OutputComment,
  type OutputVersionCompare,
  type QualityReview,
  type ResearchReport
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { downloadFile, exportPath } from "@/lib/download"
import { statusLabel } from "@/lib/ui"

// ── Type aliases ──────────────────────────────────────────────────────────────

type ArtifactData = ContentOutputDetail | ResearchReport

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseError(error: unknown): string {
  const raw = String(error).replace(/^Error:\s*/, "")
  try {
    const parsed = JSON.parse(raw) as { detail?: string }
    return parsed.detail ?? raw
  } catch {
    return raw
  }
}

function typeIcon(type: string): string {
  const icons: Record<string, string> = {
    pesquisa: "🔍",
    research: "🔍",
    blog_article: "📝",
    linkedin_post: "💼",
    instagram_post: "📸",
    email: "✉️",
    carousel: "🎠",
    reels_script: "🎬",
    campaign: "🚀",
    visual_prompts: "🎨",
    webinar: "🎤",
    executive_report: "📊"
  }
  return icons[type] ?? "📄"
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    pesquisa: "Pesquisa",
    research: "Pesquisa",
    blog_article: "Blog",
    linkedin_post: "LinkedIn",
    instagram_post: "Instagram",
    email: "E-mail",
    carousel: "Carrossel",
    reels_script: "Reels",
    campaign: "Campanha",
    visual_prompts: "Prompts Visuais",
    webinar: "Webinar",
    executive_report: "Relatório Executivo",
    research_report: "Pesquisa"
  }
  return labels[type] ?? type
}

// ── Main component ────────────────────────────────────────────────────────────

export function CardPopup({
  outputId,
  type,
  onClose,
  onChanged
}: {
  outputId: number
  type: string
  onClose: () => void
  onChanged: () => void
}) {
  const isResearch = type === "pesquisa"

  // ── Data state ────────────────────────────────────────────────────────────
  const [artifact, setArtifact] = useState<ArtifactData | null>(null)
  const [qualityReview, setQualityReview] = useState<QualityReview | null>(null)
  const [comments, setComments] = useState<OutputComment[]>([])
  const [compareData, setCompareData] = useState<OutputVersionCompare | null>(null)
  const [compareFromId, setCompareFromId] = useState<number | null>(null)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<WorkspaceMode>("preview")
  const [editableContent, setEditableContent] = useState("")
  const [commentDraft, setCommentDraft] = useState("")
  const [feedback, setFeedback] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Loaders ───────────────────────────────────────────────────────────────

  async function loadComments(token: string) {
    try {
      const items = await apiFetch<OutputComment[]>(`/api/outputs/${outputId}/comments`, token)
      setComments(items)
    } catch {
      // non-fatal
    }
  }

  async function loadQualityReview(token: string) {
    try {
      const review = await apiFetch<QualityReview>(`/api/outputs/${outputId}/quality-review`, token)
      setQualityReview(review)
    } catch {
      setQualityReview(null)
    }
  }

  async function loadArtifact(token: string) {
    const data = isResearch
      ? await apiFetch<ResearchReport>(`/api/research/reports/${outputId}`, token)
      : await apiFetch<ContentOutputDetail>(`/api/content/outputs/${outputId}`, token)
    setArtifact(data)
    setEditableContent(data.current_content)
  }

  async function loadAll(token: string) {
    await loadArtifact(token)
    await Promise.all([loadQualityReview(token), loadComments(token)])
  }

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) return
    loadAll(token).catch(() => setError("Não foi possível carregar o artefato."))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputId])

  // ── Version compare ────────────────────────────────────────────────────────

  async function loadCompare(fromVersionId: number, toVersionId: number) {
    const token = getTokenFromCookie()
    if (!token) return
    try {
      const data = await apiFetch<OutputVersionCompare>(
        `/api/outputs/${outputId}/versions/${fromVersionId}/compare/${toVersionId}`,
        token
      )
      setCompareData(data)
    } catch {
      setCompareData(null)
    }
  }

  async function selectVersion(versionId: number) {
    if (!artifact) return
    const currentVersionId = artifact.current_version_id
    if (currentVersionId && versionId !== currentVersionId) {
      setCompareFromId(versionId)
      await loadCompare(versionId, currentVersionId)
    } else {
      setCompareFromId(null)
      setCompareData(null)
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function saveEdit() {
    const token = getTokenFromCookie()
    if (!token || !artifact) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await apiFetch<ContentOutputDetail>(`/api/outputs/${outputId}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          content: editableContent,
          editor_note: "Edição salva no CardPopup."
        })
      })
      setNotice(`Versão ${updated.current_version_number} salva.`)
      setArtifact(updated)
      setMode("preview")
      onChanged()
    } catch (requestError) {
      setError(parseError(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  async function runAction(action: "approve" | "reject" | "request-adjustment") {
    const token = getTokenFromCookie()
    if (!token || !artifact) return
    if ((action === "reject" || action === "request-adjustment") && !feedback.trim()) {
      setError("Feedback é obrigatório para rejeitar ou solicitar ajuste.")
      return
    }
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const init: RequestInit = { method: "POST" }
      if (action === "reject" || action === "request-adjustment") {
        init.body = JSON.stringify({ feedback })
      }
      await apiFetch<ContentOutputDetail>(`/api/outputs/${outputId}/${action}`, token, init)
      onChanged()
      onClose()
    } catch (requestError) {
      setError(parseError(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleExport(format: ExportFormat) {
    const token = getTokenFromCookie()
    if (!token) return
    try {
      await downloadFile(
        exportPath(`/api/outputs/${outputId}`, format),
        token,
        `duofy-output-${outputId}.${format}`
      )
    } catch (requestError) {
      setError(parseError(requestError))
    }
  }

  async function createComment() {
    const token = getTokenFromCookie()
    if (!token || !commentDraft.trim()) return
    setIsSaving(true)
    setError(null)
    try {
      await apiFetch<OutputComment>(`/api/outputs/${outputId}/comments`, token, {
        method: "POST",
        body: JSON.stringify({
          version_id: artifact?.current_version_id ?? null,
          anchor_text: null,
          selected_text: null,
          comment: commentDraft
        })
      })
      setCommentDraft("")
      const t = getTokenFromCookie()
      if (t) await loadComments(t)
    } catch (requestError) {
      setError(parseError(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  async function resolveComment(commentId: number) {
    const token = getTokenFromCookie()
    if (!token) return
    try {
      await apiFetch<OutputComment>(`/api/outputs/${outputId}/comments/${commentId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved" })
      })
      const t = getTokenFromCookie()
      if (t) await loadComments(t)
    } catch {
      // non-fatal
    }
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const versions = (artifact as ContentOutputDetail | null)?.versions ?? []

  const timelineItems: TimelineItem[] = versions.map((v) => ({
    id: v.id,
    title: `Versão ${v.version_number}`,
    subtitle: v.editor_note ?? "Sem nota editorial.",
    active: v.id === artifact?.current_version_id || v.id === compareFromId,
    onClick: () => selectVersion(v.id)
  }))

  const workspaceComments: WorkspaceComment[] = comments.map((c) => ({
    id: c.id,
    author: c.user_name,
    anchor: c.anchor_text,
    selectedText: c.selected_text,
    comment: c.comment,
    status: c.status,
    createdAt: c.created_at,
    onResolve: c.status === "resolved" ? undefined : () => resolveComment(c.id)
  }))

  const compareLines: CompareLine[] = (compareData?.lines ?? []).map((l) => ({
    change_type: l.change_type,
    old_line_number: l.old_line_number,
    new_line_number: l.new_line_number,
    content: l.content
  }))

  const review = qualityReview

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    // Overlay: não usa position fixed — usa min-height + flex center em fluxo normal
    <div
      className="flex min-h-screen w-full items-center justify-center px-4 py-12"
      style={{ background: "rgba(38,33,92,0.28)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Modal surface: branco, rounded-2xl, borda line */}
      <div className="w-full max-w-7xl rounded-2xl border border-line bg-white shadow-[0_40px_100px_rgba(18,20,30,0.22)]">
        {/* ── Header ── */}
        <div className="flex items-center gap-3 rounded-t-2xl border-b border-line bg-white px-6 py-4">
          <span className="text-2xl leading-none" aria-hidden>
            {typeIcon(type)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-extrabold tracking-[-0.04em] text-ink">
                {artifact?.title ?? typeLabel(type)}
              </h2>
              {artifact?.status ? (
                <span className="shrink-0 rounded-full bg-purple-soft px-3 py-1 text-xs font-bold text-purple">
                  {statusLabel(artifact.status)}
                </span>
              ) : null}
            </div>
            {artifact ? (
              <p className="mt-0.5 text-xs font-semibold text-muted">
                {artifact.brand_slug} / {artifact.channel} / {artifact.format}
              </p>
            ) : null}
          </div>
          {/* Toolbar controls in header */}
          <div className="flex flex-wrap items-center gap-2">
            <ModeToggle mode={mode} onChange={setMode} />
            {mode === "edit" ? (
              <WorkspaceToolbarButton
                disabled={isSaving || !artifact}
                onClick={saveEdit}
              >
                Salvar versão
              </WorkspaceToolbarButton>
            ) : null}
            <ExportMenu disabled={!artifact} onExport={handleExport} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="ml-2 flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white text-muted transition hover:bg-red/5 hover:text-red"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Notices ── */}
        {error ? (
          <div className="border-b border-red/20 bg-red/5 px-6 py-3 text-sm font-semibold text-red">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="border-b border-green/20 bg-green/5 px-6 py-3 text-sm font-semibold text-green">
            {notice}
          </div>
        ) : null}

        {/* ── Body: left content + right inspector ── */}
        <div className="grid min-h-[640px] xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Left: document body */}
          <div className="overflow-y-auto border-r border-line p-6 md:p-8">
            {!artifact ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Carregando artefato…
              </div>
            ) : mode === "edit" ? (
              <DocumentEditor
                value={editableContent}
                onChange={setEditableContent}
              />
            ) : compareData ? (
              <VersionCompareView
                title={artifact.title}
                subtitle={`Comparando com versão atual`}
                lines={compareLines}
              />
            ) : (
              <DocumentPreview
                title={artifact.title}
                subtitle={`${artifact.brand_slug} / ${artifact.channel} / ${artifact.format}`}
                content={artifact.current_content}
                documentType={artifact.document_type}
                qualityNotes={artifact.quality_notes}
                emptyTitle="Sem conteúdo"
                emptyDescription="O artefato não possui conteúdo gerado ainda."
              />
            )}
          </div>

          {/* Right: inspector */}
          <div className="overflow-y-auto bg-white p-5">
            <InspectorStack>
              {/* Guardião de Qualidade */}
              <section className="rounded-2xl border border-line bg-white p-5">
                <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-muted">
                  Guardião de Qualidade
                </h3>
                {review ? (
                  <div className="mt-4 space-y-4 text-sm">
                    <div
                      className={`rounded-2xl border p-4 ${
                        review.passed
                          ? "border-green/30 bg-green/5 text-green"
                          : "border-orange/30 bg-orange/5 text-orange"
                      }`}
                    >
                      <strong>{review.score}/100</strong> ·{" "}
                      {review.passed ? "Aprovado" : "Ajuste necessário"}
                      <p className="mt-2 text-ink">{review.summary}</p>
                    </div>
                    {[...review.critical_failures, ...review.required_fixes].length > 0 ? (
                      <div>
                        <p className="font-bold text-ink">Correções obrigatórias</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                          {[...review.critical_failures, ...review.required_fixes].map(
                            (item) => (
                              <li key={item}>{item}</li>
                            )
                          )}
                        </ul>
                      </div>
                    ) : null}
                    {review.optional_improvements.length > 0 ? (
                      <div>
                        <p className="font-bold text-ink">Melhorias opcionais</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                          {review.optional_improvements.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-muted">
                    Nenhuma revisão de qualidade registrada.
                  </p>
                )}
              </section>

              {/* Metadata */}
              <MetadataInspector
                title="Informações"
                items={
                  artifact
                    ? [
                        { label: "Status", value: statusLabel(artifact.status) },
                        { label: "Versão atual", value: artifact.current_version_number ?? "-" },
                        { label: "Tipo", value: typeLabel(artifact.document_type ?? type) },
                        { label: "Canal", value: artifact.channel },
                        { label: "Formato", value: artifact.format },
                        { label: "Marca", value: artifact.brand_slug }
                      ]
                    : []
                }
              />

              {/* Version Timeline */}
              <VersionTimeline items={timelineItems} />

              {/* Comments */}
              <CommentPanel
                comments={workspaceComments}
                draft={commentDraft}
                onDraftChange={setCommentDraft}
                onCreate={createComment}
                disabled={!artifact || isSaving}
              />

              {/* Decision actions */}
              <section className="rounded-2xl border border-line bg-white p-5">
                <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-muted">
                  Decisão
                </h3>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Feedback obrigatório para rejeitar ou solicitar ajuste."
                  className="mt-4 min-h-24 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-purple"
                />
                <div className="mt-4 grid gap-2">
                  <WorkspaceToolbarButton
                    variant="success"
                    disabled={!artifact || isSaving}
                    onClick={() => runAction("approve")}
                  >
                    Aprovar
                  </WorkspaceToolbarButton>
                  <WorkspaceToolbarButton
                    disabled={!artifact || isSaving}
                    onClick={() => runAction("request-adjustment")}
                  >
                    Solicitar ajuste
                  </WorkspaceToolbarButton>
                  <WorkspaceToolbarButton
                    variant="danger"
                    disabled={!artifact || isSaving}
                    onClick={() => runAction("reject")}
                  >
                    Rejeitar
                  </WorkspaceToolbarButton>
                </div>
              </section>
            </InspectorStack>
          </div>
        </div>
      </div>
    </div>
  )
}
