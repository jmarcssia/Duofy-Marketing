"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import {
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
  type WorkspaceMode
} from "@/components/document-workspace"
import { EmptyState, PageTitle, PurpleButton, SectionCard, SoftButton } from "@/components/page-primitives"
import { apiFetch, type Brand, type ContentOutput, type ContentOutputDetail, type ProviderCredential } from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { downloadFile, exportPath } from "@/lib/download"

const channels = ["Instagram", "LinkedIn", "E-mail", "Blog", "Webinar", "Campanha"]
const formats = ["Carrossel", "Post Instagram", "Post LinkedIn", "Reels", "Blog", "E-mail", "Webinar", "Campanha", "Prompts visuais"]
const categories = ["general", "brand", "sales", "product", "policy", "research"]

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  review: "Em revisão",
  approved: "Aprovado",
  needs_adjustment: "Ajuste solicitado",
  rejected: "Rejeitado",
  archived: "Arquivado"
}

function isLlmProvider(provider: ProviderCredential) {
  return !["apify", "openai_embeddings"].includes(provider.provider)
}

export default function ContentPage() {
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>([])
  const [providers, setProviders] = useState<ProviderCredential[]>([])
  const [outputs, setOutputs] = useState<ContentOutput[]>([])
  const [brand, setBrand] = useState("")
  const [category, setCategory] = useState("general")
  const [provider, setProvider] = useState("openrouter")
  const [channel, setChannel] = useState("Instagram")
  const [format, setFormat] = useState("Carrossel")
  const [briefing, setBriefing] = useState("")
  const [selectedOutput, setSelectedOutput] = useState<ContentOutputDetail | null>(null)
  const [editableContent, setEditableContent] = useState("")
  const [mode, setMode] = useState<WorkspaceMode>("preview")
  const [isRunning, setIsRunning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function loadOutputs(token: string, nextSelectedId?: number) {
    const items = await apiFetch<ContentOutput[]>("/api/content/outputs?limit=30", token)
    setOutputs(items)
    const targetId = nextSelectedId ?? selectedOutput?.id ?? items[0]?.id
    if (!targetId) {
      setSelectedOutput(null)
      setEditableContent("")
      return
    }
    const detail = await apiFetch<ContentOutputDetail>(`/api/content/outputs/${targetId}`, token)
    setSelectedOutput(detail)
    setEditableContent(detail.current_content)
  }

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) {
      router.replace("/login")
      return
    }

    Promise.all([
      apiFetch<Brand[]>("/api/brands", token),
      apiFetch<ProviderCredential[]>("/api/admin/providers", token)
    ])
      .then(async ([brandList, providerList]) => {
        const prefillRaw = window.localStorage.getItem("duofy.content.prefill")
        const prefill = prefillRaw ? JSON.parse(prefillRaw) as Partial<{
          brand_slug: string
          category: string
          channel: string
          format: string
          briefing: string
        }> : null
        if (prefillRaw) window.localStorage.removeItem("duofy.content.prefill")

        const llmProviders = providerList.filter(isLlmProvider)
        setBrands(brandList)
        setProviders(llmProviders)
        setBrand(prefill?.brand_slug ?? brandList[0]?.slug ?? "")
        setCategory(prefill?.category ?? "general")
        setChannel(prefill?.channel ?? "Instagram")
        setFormat(prefill?.format ?? "Carrossel")
        setBriefing(prefill?.briefing ?? "")
        setProvider(llmProviders.find((item) => item.is_enabled)?.provider ?? "openrouter")
        await loadOutputs(token)
      })
      .catch(() => setError("Não foi possível carregar a co-criação."))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function selectOutput(outputId: number) {
    const token = getTokenFromCookie()
    if (!token) return
    const detail = await apiFetch<ContentOutputDetail>(`/api/content/outputs/${outputId}`, token)
    setSelectedOutput(detail)
    setEditableContent(detail.current_content)
    setMode("preview")
  }

  async function generateContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = getTokenFromCookie()
    if (!token) return
    setIsRunning(true)
    setError(null)
    setNotice(null)
    try {
      const result = await apiFetch<ContentOutput>("/api/content/generate", token, {
        method: "POST",
        body: JSON.stringify({ brand_slug: brand, category, channel, format, briefing, provider, status: "draft" })
      })
      setNotice("Conteúdo gerado e salvo como versão 1.")
      await loadOutputs(token, result.id)
      setMode("preview")
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsRunning(false)
    }
  }

  async function saveEdit() {
    const token = getTokenFromCookie()
    if (!token || !selectedOutput) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const detail = await apiFetch<ContentOutputDetail>(`/api/content/outputs/${selectedOutput.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          content: editableContent,
          editor_note: "Edição realizada no workspace editorial."
        })
      })
      setSelectedOutput(detail)
      setEditableContent(detail.current_content)
      setNotice(`Versão ${detail.current_version_number} salva.`)
      await loadOutputs(token, detail.id)
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsSaving(false)
    }
  }

  async function submitReview() {
    const token = getTokenFromCookie()
    if (!token || !selectedOutput) return
    setIsSaving(true)
    setError(null)
    setNotice(null)
    try {
      const detail = await apiFetch<ContentOutputDetail>(
        `/api/content/outputs/${selectedOutput.id}/submit-review`,
        token,
        { method: "POST" }
      )
      setSelectedOutput(detail)
      setNotice("Output enviado para aprovação.")
      await loadOutputs(token, detail.id)
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsSaving(false)
    }
  }

  async function exportOutput(exportFormat: ExportFormat) {
    const token = getTokenFromCookie()
    if (!token || !selectedOutput) return
    setError(null)
    try {
      await downloadFile(
        exportPath(`/api/outputs/${selectedOutput.id}`, exportFormat),
        token,
        `duofy-output-${selectedOutput.id}.${exportFormat}`
      )
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    }
  }

  const selectedSubtitle = selectedOutput
    ? `${selectedOutput.channel} / ${selectedOutput.format} / ${statusLabels[selectedOutput.status] ?? selectedOutput.status}`
    : "Gere ou selecione uma entrega real."

  return (
    <div className="space-y-6">
      <PageTitle
        title="Co-criação de Conteúdo"
        subtitle="Gere conteúdos com RAG, edite versões, visualize como documento e exporte entregas profissionais."
      />

      {error ? <p className="rounded-2xl border border-red/20 bg-red/5 p-4 text-sm font-semibold text-red">{error}</p> : null}
      {notice ? <p className="rounded-2xl border border-green/20 bg-green/5 p-4 text-sm font-semibold text-green">{notice}</p> : null}

      <form onSubmit={generateContent} className="grid gap-5 xl:grid-cols-[1.2fr_0.6fr_0.6fr_0.6fr]">
        <SectionCard title="Briefing do projeto" className="min-h-[230px]">
          <textarea
            value={briefing}
            onChange={(event) => setBriefing(event.target.value)}
            placeholder="Descreva objetivo, público, dor, solução, CTA e qualquer restrição."
            className="duofy-focus min-h-36 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm leading-6"
            required
          />
        </SectionCard>
        <SectionCard title="Marca e contexto">
          <select value={brand} onChange={(event) => setBrand(event.target.value)} className="duofy-focus w-full rounded-xl border border-line bg-white px-4 py-3">
            {brands.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="duofy-focus mt-3 w-full rounded-xl border border-line bg-white px-4 py-3">
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </SectionCard>
        <SectionCard title="Canal">
          <select value={channel} onChange={(event) => setChannel(event.target.value)} className="duofy-focus w-full rounded-xl border border-line bg-white px-4 py-3">
            {channels.map((item) => <option key={item}>{item}</option>)}
          </select>
        </SectionCard>
        <SectionCard title="Formato">
          <select value={format} onChange={(event) => setFormat(event.target.value)} className="duofy-focus w-full rounded-xl border border-line bg-white px-4 py-3">
            {formats.map((item) => <option key={item}>{item}</option>)}
          </select>
        </SectionCard>
        <div className="flex flex-wrap justify-end gap-4 xl:col-span-4">
          <select value={provider} onChange={(event) => setProvider(event.target.value)} className="duofy-focus rounded-xl border border-line bg-white px-4 py-3">
            {providers.map((item) => (
              <option key={item.provider} value={item.provider}>
                {item.display_name} {item.is_enabled ? "" : "(off)"}
              </option>
            ))}
          </select>
          <PurpleButton disabled={isRunning || !briefing.trim() || !brand}>
            {isRunning ? "Gerando..." : "Gerar conteúdo"}
          </PurpleButton>
        </div>
      </form>

      <DocumentWorkspace
        title={selectedOutput?.title ?? "Workspace editorial"}
        subtitle={selectedSubtitle}
        sidebar={
          <WorkspaceList title="Saídas">
            {outputs.length === 0 ? (
              <EmptyState title="Nenhum conteúdo" description="Preencha o briefing e gere a primeira entrega." />
            ) : null}
            {outputs.map((item) => (
              <WorkspaceListItem
                key={item.id}
                active={selectedOutput?.id === item.id}
                title={item.title}
                meta={`${item.channel} / ${item.format} / v${item.current_version_number ?? 1}`}
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
            <WorkspaceToolbarButton disabled={!selectedOutput || isSaving} onClick={saveEdit}>Salvar versão</WorkspaceToolbarButton>
            <ExportMenu disabled={!selectedOutput} onExport={exportOutput} />
            <WorkspaceToolbarButton disabled={!selectedOutput || isSaving} onClick={submitReview} variant="primary">Enviar para aprovação</WorkspaceToolbarButton>
          </>
        }
        inspector={
          <InspectorStack>
            <MetadataInspector
              items={selectedOutput ? [
                { label: "Marca", value: selectedOutput.brand_slug },
                { label: "Categoria", value: selectedOutput.category },
                { label: "Canal", value: selectedOutput.channel },
                { label: "Formato", value: selectedOutput.format },
                { label: "Status", value: statusLabels[selectedOutput.status] ?? selectedOutput.status },
                { label: "Modelo", value: selectedOutput.model }
              ] : []}
            />
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
          selectedOutput ? (
            <DocumentEditor value={editableContent} onChange={setEditableContent} />
          ) : (
            <EmptyState title="Sem entrega selecionada" description="Selecione um output ou gere um novo." />
          )
        ) : (
          <DocumentPreview
            title={selectedOutput?.title}
            subtitle={selectedSubtitle}
            content={editableContent}
            documentType={selectedOutput?.document_type}
            qualityNotes={selectedOutput?.quality_notes}
            emptyTitle="Sem entrega selecionada"
            emptyDescription="Selecione um output do histórico ou gere um novo."
          />
        )}
      </DocumentWorkspace>
    </div>
  )
}
