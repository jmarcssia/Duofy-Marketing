"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import {
  CommentPanel,
  DocumentEditor,
  DocumentPreview,
  DocumentWorkspace,
  ExportMenu,
  InspectorStack,
  MetadataInspector,
  ModeToggle,
  VersionTimeline,
  WorkspaceList,
  WorkspaceListItem,
  WorkspaceToolbarButton,
  type ExportFormat,
  type WorkspaceComment,
  type WorkspaceMode
} from "@/components/document-workspace"
import { EmptyState, PageTitle, SoftButton } from "@/components/page-primitives"
import {
  apiFetch,
  type ContentOutput,
  type OutputComment,
  type OutputWorkflowDetail
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { downloadFile, exportPath } from "@/lib/download"

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  review: "Em revisão",
  approved: "Aprovado",
  needs_adjustment: "Ajuste solicitado",
  rejected: "Rejeitado",
  archived: "Arquivado"
}

function parseError(error: unknown) {
  const raw = String(error).replace(/^Error:\s*/, "")
  try {
    const parsed = JSON.parse(raw)
    return parsed.detail ?? raw
  } catch {
    return raw
  }
}

export default function ApprovalsPage() {
  const router = useRouter()
  const [outputs, setOutputs] = useState<ContentOutput[]>([])
  const [selectedOutput, setSelectedOutput] = useState<OutputWorkflowDetail | null>(null)
  const [comments, setComments] = useState<OutputComment[]>([])
  const [editableContent, setEditableContent] = useState("")
  const [feedback, setFeedback] = useState("")
  const [status, setStatus] = useState("review")
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<WorkspaceMode>("preview")
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState("")
  const [commentAnchor, setCommentAnchor] = useState("")

  async function loadComments(token: string, outputId: number) {
    const items = await apiFetch<OutputComment[]>(`/api/outputs/${outputId}/comments`, token)
    setComments(items)
  }

  async function loadOutputDetail(token: string, outputId: number) {
    const detail = await apiFetch<OutputWorkflowDetail>(`/api/outputs/${outputId}`, token)
    setSelectedOutput(detail)
    setEditableContent(detail.current_content)
    setFeedback(detail.latest_feedback ?? "")
    await loadComments(token, detail.id)
    return detail
  }

  async function loadOutputs(token: string, nextSelectedId?: number) {
    const params = new URLSearchParams({ limit: "50" })
    if (status) params.set("status", status)
    if (query.trim()) params.set("query", query.trim())
    const items = await apiFetch<ContentOutput[]>(`/api/outputs?${params}`, token)
    setOutputs(items)

    const targetId = nextSelectedId ?? selectedOutput?.id ?? items[0]?.id
    if (!targetId || !items.some((item) => item.id === targetId)) {
      setSelectedOutput(null)
      setEditableContent("")
      setComments([])
      return
    }
    await loadOutputDetail(token, targetId)
  }

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) {
      router.replace("/login")
      return
    }
    loadOutputs(token).catch(() => setError("Não foi possível carregar aprovações."))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = getTokenFromCookie()
    if (token) await loadOutputs(token)
  }

  async function selectOutput(outputId: number) {
    const token = getTokenFromCookie()
    if (!token) return
    await loadOutputDetail(token, outputId)
    setMode("preview")
  }

  async function saveEdit() {
    const token = getTokenFromCookie()
    if (!token || !selectedOutput) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await apiFetch<OutputWorkflowDetail>(`/api/outputs/${selectedOutput.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          content: editableContent,
          editor_note: "Edição salva na revisão editorial."
        })
      })
      setNotice(`Versão ${updated.current_version_number} salva.`)
      await loadOutputs(token, updated.id)
      setMode("preview")
    } catch (requestError) {
      setError(parseError(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  async function runQualityReview() {
    const token = getTokenFromCookie()
    if (!token || !selectedOutput) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await apiFetch<OutputWorkflowDetail>(
        `/api/outputs/${selectedOutput.id}/quality-review`,
        token,
        { method: "POST" }
      )
      const review = updated.latest_quality_review
      setNotice(
        review
          ? `Guardião: ${review.score}/100 (${review.passed ? "aprovado" : "ajuste necessário"}).`
          : "Revisão de qualidade concluída."
      )
      await loadOutputs(token, updated.id)
    } catch (requestError) {
      setError(parseError(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  async function runAction(action: "approve" | "reject" | "request-adjustment" | "archive") {
    const token = getTokenFromCookie()
    if (!token || !selectedOutput) return
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
      const updated = await apiFetch<OutputWorkflowDetail>(
        `/api/outputs/${selectedOutput.id}/${action}`,
        token,
        init
      )
      if (action === "approve") {
        setNotice(`Aprovado. Memória permanente: #${updated.approved_memory_id ?? "criada"}.`)
      }
      if (action === "reject") {
        setNotice(`Rejeitado. Aprendizado temporário: #${updated.temporary_learning_id ?? "criado"}.`)
      }
      if (action === "request-adjustment") setNotice("Ajuste solicitado com feedback registrado.")
      if (action === "archive") setNotice("Output arquivado.")
      await loadOutputs(token, updated.id)
    } catch (requestError) {
      setError(parseError(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  async function exportOutput(format: ExportFormat) {
    const token = getTokenFromCookie()
    if (!token || !selectedOutput) return
    try {
      await downloadFile(
        exportPath(`/api/outputs/${selectedOutput.id}`, format),
        token,
        `duofy-output-${selectedOutput.id}.${format}`
      )
    } catch (requestError) {
      setError(parseError(requestError))
    }
  }

  async function createComment() {
    const token = getTokenFromCookie()
    if (!token || !selectedOutput || !commentDraft.trim()) return
    setIsSaving(true)
    setError(null)
    try {
      await apiFetch<OutputComment>(`/api/outputs/${selectedOutput.id}/comments`, token, {
        method: "POST",
        body: JSON.stringify({
          version_id: selectedOutput.current_version_id,
          anchor_text: commentAnchor.trim() || null,
          selected_text: commentAnchor.trim() || null,
          comment: commentDraft
        })
      })
      setCommentDraft("")
      setCommentAnchor("")
      await loadComments(token, selectedOutput.id)
    } catch (requestError) {
      setError(parseError(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  async function resolveComment(commentId: number) {
    const token = getTokenFromCookie()
    if (!token || !selectedOutput) return
    await apiFetch<OutputComment>(`/api/outputs/${selectedOutput.id}/comments/${commentId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved" })
    })
    await loadComments(token, selectedOutput.id)
  }

  const review = selectedOutput?.latest_quality_review
  const selectedSubtitle = selectedOutput
    ? `${selectedOutput.brand_slug} / ${selectedOutput.channel} / ${selectedOutput.format}`
    : "Selecione uma entrega em revisão."
  const workspaceComments: WorkspaceComment[] = comments.map((comment) => ({
    id: comment.id,
    author: comment.user_name,
    anchor: comment.anchor_text,
    selectedText: comment.selected_text,
    comment: comment.comment,
    status: comment.status,
    createdAt: comment.created_at,
    onResolve: comment.status === "resolved" ? undefined : () => resolveComment(comment.id)
  }))

  return (
    <div className="space-y-6">
      <PageTitle
        title="Aprovações / Revisão"
        subtitle="Revise, comente, aprove e use o Guardião de Qualidade antes da aprovação humana."
      />

      {error ? <p className="rounded-2xl border border-red/20 bg-red/5 p-4 text-sm font-semibold text-red">{error}</p> : null}
      {notice ? <p className="rounded-2xl border border-green/20 bg-green/5 p-4 text-sm font-semibold text-green">{notice}</p> : null}

      <form onSubmit={applyFilters} className="duofy-card grid gap-3 rounded-2xl p-5 md:grid-cols-[1fr_220px_auto]">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar outputs..." className="duofy-focus rounded-xl border border-line bg-white px-4 py-3" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="duofy-focus rounded-xl border border-line bg-white px-4 py-3">
          <option value="">Todos os status</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <SoftButton type="submit">Filtrar</SoftButton>
      </form>

      <DocumentWorkspace
        title={selectedOutput?.title ?? "Revisão editorial"}
        subtitle={selectedSubtitle}
        sidebar={
          <WorkspaceList title="Fila de revisão">
            {outputs.length === 0 ? <EmptyState title="Nenhuma atividade" description="Gere um conteúdo e envie para aprovação." /> : null}
            {outputs.map((item) => (
              <WorkspaceListItem
                key={item.id}
                active={selectedOutput?.id === item.id}
                title={item.title}
                meta={`${item.brand_slug} / ${item.channel} / ${item.format}`}
                excerpt={item.briefing}
                badge={statusLabels[item.status] ?? item.status}
                onClick={() => selectOutput(item.id)}
              />
            ))}
          </WorkspaceList>
        }
        toolbar={
          <>
            <ModeToggle mode={mode} onChange={setMode} />
            <WorkspaceToolbarButton disabled={!selectedOutput || isSaving || mode !== "edit"} onClick={saveEdit}>Salvar versão</WorkspaceToolbarButton>
            <WorkspaceToolbarButton disabled={!selectedOutput || isSaving} onClick={runQualityReview}>Rodar Guardião</WorkspaceToolbarButton>
            <ExportMenu disabled={!selectedOutput} onExport={exportOutput} />
            <WorkspaceToolbarButton disabled={!selectedOutput || isSaving} onClick={() => runAction("approve")} variant="success">Aprovar</WorkspaceToolbarButton>
            <WorkspaceToolbarButton disabled={!selectedOutput || isSaving} onClick={() => runAction("archive")}>Arquivar</WorkspaceToolbarButton>
          </>
        }
        inspector={
          <InspectorStack>
            <MetadataInspector
              title="Workflow"
              items={selectedOutput ? [
                { label: "Status", value: statusLabels[selectedOutput.status] ?? selectedOutput.status },
                { label: "Versão atual", value: selectedOutput.current_version_number ?? "-" },
                { label: "Memória", value: selectedOutput.approved_memory_id ?? "não criada" },
                { label: "Aprendizado", value: selectedOutput.temporary_learning_id ?? "não criado" }
              ] : []}
            />
            <section className="rounded-2xl border border-line bg-white p-5">
              <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-muted">Guardião de Qualidade</h3>
              {review ? (
                <div className="mt-4 space-y-4 text-sm">
                  <div className={`rounded-2xl border p-4 ${review.passed ? "border-green/30 bg-green/5 text-green" : "border-orange/30 bg-orange/5 text-orange"}`}>
                    <strong>{review.score}/100</strong> · {review.passed ? "Aprovado" : "Ajuste necessário"}
                    <p className="mt-2 text-ink">{review.summary}</p>
	                  </div>
	                  <div className="grid gap-2 rounded-2xl border border-line bg-slate-50 p-4 text-xs text-muted">
	                    <span><strong className="text-ink">Modo:</strong> {review.review_mode}</span>
	                    <span><strong className="text-ink">Provedor:</strong> {review.llm_provider ?? "local"}</span>
	                    <span><strong className="text-ink">Modelo:</strong> {review.llm_model ?? "determinístico local"}</span>
	                    <span><strong className="text-ink">Confiança:</strong> {review.confidence == null ? "-" : `${Math.round(review.confidence * 100)}%`}</span>
	                    {review.llm_error ? <span className="text-orange"><strong>Fallback/erro LLM:</strong> {review.llm_error}</span> : null}
	                  </div>
	                  {[...review.critical_failures, ...review.required_fixes].length > 0 ? (
                    <div>
                      <p className="font-bold text-ink">Correções obrigatórias</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                        {[...review.critical_failures, ...review.required_fixes].map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {review.optional_improvements.length > 0 ? (
                    <div>
                      <p className="font-bold text-ink">Melhorias opcionais</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                        {review.optional_improvements.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
	                  ) : null}
	                  <details className="rounded-2xl border border-line bg-white p-4">
	                    <summary className="cursor-pointer text-sm font-bold text-ink">Relatório técnico</summary>
	                    <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted">{review.raw_report}</pre>
	                  </details>
	                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-muted">Nenhuma revisão de qualidade registrada para a versão atual.</p>
              )}
            </section>
            <CommentPanel
              comments={workspaceComments}
              draft={commentDraft}
              onDraftChange={setCommentDraft}
              onCreate={createComment}
              disabled={!selectedOutput || isSaving}
            />
            <section className="rounded-2xl border border-line bg-white p-5">
              <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-muted">Âncora do comentário</h3>
              <input
                value={commentAnchor}
                onChange={(event) => setCommentAnchor(event.target.value)}
                placeholder="Cole aqui o trecho comentado."
                className="duofy-focus mt-4 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
              />
            </section>
            <section className="rounded-2xl border border-line bg-white p-5">
              <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-muted">Feedback de decisão</h3>
              <textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="Feedback obrigatório para rejeitar ou solicitar ajuste."
                className="duofy-focus mt-4 min-h-28 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
              />
              <div className="mt-4 grid gap-2">
                <WorkspaceToolbarButton disabled={!selectedOutput || isSaving} onClick={() => runAction("request-adjustment")}>Solicitar ajuste</WorkspaceToolbarButton>
                <WorkspaceToolbarButton disabled={!selectedOutput || isSaving} onClick={() => runAction("reject")} variant="danger">Rejeitar</WorkspaceToolbarButton>
              </div>
            </section>
            <VersionTimeline
              items={(selectedOutput?.versions ?? []).map((version) => ({
                id: version.id,
                title: `Versão ${version.version_number}`,
                subtitle: version.editor_note ?? "Sem nota editorial.",
                active: version.id === selectedOutput?.current_version_id
              }))}
            />
          </InspectorStack>
        }
      >
        {mode === "edit" ? (
          selectedOutput ? <DocumentEditor value={editableContent} onChange={setEditableContent} /> : <EmptyState title="Selecione uma entrega" description="A prévia editável aparece quando um output real for selecionado." />
        ) : (
          <DocumentPreview
            title={selectedOutput?.title}
            subtitle={`${selectedSubtitle} / Versão ${selectedOutput?.current_version_number ?? "-"}`}
            content={selectedOutput?.current_content}
            documentType={selectedOutput?.document_type}
            qualityNotes={selectedOutput?.quality_notes}
            emptyTitle="Selecione uma entrega"
            emptyDescription="A prévia aparece quando um output real for selecionado."
          />
        )}
      </DocumentWorkspace>
    </div>
  )
}
