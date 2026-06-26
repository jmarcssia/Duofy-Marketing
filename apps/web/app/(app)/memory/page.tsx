"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import {
  DocumentPreview,
  DocumentWorkspace,
  ExportMenu,
  InspectorStack,
  MetadataInspector,
  WorkspaceList,
  WorkspaceListItem,
  WorkspaceToolbarButton,
  type ExportFormat
} from "@/components/document-workspace"
import { EmptyState, PageTitle, PurpleButton, SectionCard, SoftButton } from "@/components/page-primitives"
import {
  apiFetch,
  type Brand,
  type DocumentChunk,
  type DocumentItem,
  type MemorySearchResult
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"
import { downloadFile, exportPath } from "@/lib/download"

const categories = [
  { value: "", label: "Categoria: Todas" },
  { value: "brand", label: "Marca" },
  { value: "policy", label: "Politicas" },
  { value: "content", label: "Conteudo" },
  { value: "sales", label: "Comercial" },
  { value: "support", label: "Suporte" }
]

export default function MemoryPage() {
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>([])
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [chunks, setChunks] = useState<DocumentChunk[]>([])
  const [results, setResults] = useState<MemorySearchResult[]>([])
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null)
  const [brand, setBrand] = useState("")
  const [category, setCategory] = useState("")
  const [query, setQuery] = useState("")
  const [uploadBrand, setUploadBrand] = useState("")
  const [uploadCategory, setUploadCategory] = useState("brand")
  const [sourceType, setSourceType] = useState("upload")
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadDocuments(token: string) {
    const params = new URLSearchParams()
    if (brand) params.set("brand_slug", brand)
    if (category) params.set("category", category)
    if (query.trim()) params.set("query", query.trim())
    const items = await apiFetch<DocumentItem[]>(`/api/documents?${params}`, token)
    setDocuments(items)
    setSelectedDocument((current) => {
      if (current && items.some((item) => item.id === current.id)) return current
      return items[0] ?? null
    })
  }

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) {
      router.replace("/login")
      return
    }
    Promise.all([apiFetch<Brand[]>("/api/brands", token), apiFetch<DocumentItem[]>("/api/documents", token)])
      .then(([brandList, documentList]) => {
        setBrands(brandList)
        setUploadBrand(brandList[0]?.slug ?? "")
        setDocuments(documentList)
        setSelectedDocument(documentList[0] ?? null)
      })
      .catch(() => setError("Nao foi possivel carregar memoria."))
  }, [router])

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token || !selectedDocument) {
      setChunks([])
      return
    }
    apiFetch<DocumentChunk[]>(`/api/documents/${selectedDocument.id}/chunks`, token)
      .then(setChunks)
      .catch(() => setChunks([]))
  }, [selectedDocument])

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = getTokenFromCookie()
    if (!token) return
    await loadDocuments(token)
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = getTokenFromCookie()
    if (!token) return
    const form = new FormData(event.currentTarget)
    const file = form.get("file")
    if (!(file instanceof File) || !file.name) {
      setError("Selecione um arquivo PDF, DOCX, TXT ou MD.")
      return
    }

    form.set("brand_slug", uploadBrand)
    form.set("category", uploadCategory)
    form.set("source_type", sourceType)

    setIsUploading(true)
    setError(null)
    try {
      const uploaded = await apiFetch<DocumentItem>("/api/documents/upload", token, {
        method: "POST",
        body: form
      })
      setSelectedDocument(uploaded)
      await loadDocuments(token)
      if (uploaded.status === "failed") {
        setError(uploaded.error ?? "Falha ao indexar documento.")
      }
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsUploading(false)
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = getTokenFromCookie()
    if (!token || !query.trim()) return
    const payload = {
      query,
      brand_slug: brand || null,
      category: category || null,
      source_type: null,
      limit: 8
    }
    const items = await apiFetch<MemorySearchResult[]>("/api/memory/search", token, {
      method: "POST",
      body: JSON.stringify(payload)
    })
    setResults(items)
  }

  async function exportDocument(format: ExportFormat) {
    const token = getTokenFromCookie()
    if (!token || !selectedDocument) return
    setError(null)
    try {
      await downloadFile(
        exportPath(`/api/documents/${selectedDocument.id}`, format),
        token,
        `duofy-document-${selectedDocument.id}.${format}`
      )
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    }
  }

  async function downloadOriginal() {
    const token = getTokenFromCookie()
    if (!token || !selectedDocument) return
    setError(null)
    try {
      await downloadFile(
        `/api/documents/${selectedDocument.id}/download`,
        token,
        selectedDocument.filename
      )
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    }
  }

  const selectedContent = chunks
    .map((chunk) => `## Chunk ${chunk.chunk_index + 1}\n\n${chunk.content}`)
    .join("\n\n")

  return (
    <div className="space-y-6">
      <PageTitle
        title="Memória / Documentos"
        subtitle="Carregue documentos, indexe chunks em pgvector e consulte memoria via RAG."
      />

      {error ? (
        <p className="rounded-2xl border border-red/20 bg-red/5 p-4 text-sm font-semibold text-red">
          {error}
        </p>
      ) : null}

      <form onSubmit={uploadDocument} className="duofy-card grid gap-4 rounded-2xl p-5 xl:grid-cols-[1fr_220px_180px_160px_auto]">
        <input
          name="file"
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3"
        />
        <select
          value={uploadBrand}
          onChange={(event) => setUploadBrand(event.target.value)}
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3"
        >
          {brands.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          value={uploadCategory}
          onChange={(event) => setUploadCategory(event.target.value)}
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3"
        >
          {categories.filter((item) => item.value).map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          value={sourceType}
          onChange={(event) => setSourceType(event.target.value)}
          placeholder="source_type"
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3"
        />
        <PurpleButton disabled={isUploading || !uploadBrand}>
          {isUploading ? "Indexando..." : "Enviar documento"}
        </PurpleButton>
      </form>

      <form onSubmit={applyFilters} className="duofy-card flex flex-wrap gap-4 rounded-2xl p-5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar documentos ou consultar RAG..."
          className="duofy-focus min-w-[280px] flex-1 rounded-xl border border-line bg-white px-4 py-3"
        />
        <select
          value={brand}
          onChange={(event) => setBrand(event.target.value)}
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3"
        >
          <option value="">Marca: Todas</option>
          {brands.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="duofy-focus rounded-xl border border-line bg-white px-4 py-3"
        >
          {categories.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <SoftButton type="submit">Filtrar docs</SoftButton>
        <PurpleButton type="button" disabled={!query.trim()} onClick={(event) => search(event as unknown as FormEvent<HTMLFormElement>)}>
          Buscar RAG
        </PurpleButton>
      </form>

      <DocumentWorkspace
        title={selectedDocument?.filename ?? "Memória / Documento"}
        subtitle={selectedDocument ? `${selectedDocument.brand_slug} / ${selectedDocument.category} / ${chunks.length} chunks` : "Selecione ou envie um documento real."}
        sidebar={
          <WorkspaceList title="Documentos">
            {documents.length === 0 ? <EmptyState title="Nenhum documento indexado" description="Envie um PDF, DOCX, TXT ou MD para criar chunks e embeddings." /> : null}
            {documents.map((document) => (
              <WorkspaceListItem
                key={document.id}
                active={selectedDocument?.id === document.id}
                title={document.filename}
                meta={`${document.brand_slug} / ${document.category} / ${(document.file_size / 1024).toFixed(1)} KB`}
                badge={document.status}
                excerpt={document.error ?? undefined}
                onClick={() => setSelectedDocument(document)}
              />
            ))}
          </WorkspaceList>
        }
        toolbar={
          <>
            <ExportMenu disabled={!selectedDocument} onExport={exportDocument} />
            <WorkspaceToolbarButton disabled={!selectedDocument} onClick={downloadOriginal}>Baixar original</WorkspaceToolbarButton>
          </>
        }
        inspector={
          <InspectorStack>
            <MetadataInspector
              title="Documento"
              items={selectedDocument ? [
                { label: "Marca", value: selectedDocument.brand_slug },
                { label: "Categoria", value: selectedDocument.category },
                { label: "Tipo", value: selectedDocument.content_type },
                { label: "Status", value: selectedDocument.status },
                { label: "Chunks", value: chunks.length },
                { label: "Tamanho", value: `${(selectedDocument.file_size / 1024).toFixed(1)} KB` }
              ] : []}
            />
            <SectionCard title="Busca RAG">
              <div className="space-y-3">
                {results.length === 0 ? <p className="text-sm text-muted">Digite uma consulta e clique em Buscar RAG.</p> : null}
                {results.map((item) => (
                  <article key={`${item.kind}-${item.id}`} className="rounded-2xl border border-line bg-white p-4">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-purple">
                      <span className="line-clamp-2">{item.title}</span>
                      <span>{item.score.toFixed(3)}</span>
                    </div>
                    <p className="line-clamp-5 text-xs leading-5 text-muted">{item.content}</p>
                  </article>
                ))}
              </div>
            </SectionCard>
            {selectedDocument?.error ? (
              <SectionCard title="Erro de indexação">
                <p className="text-sm leading-6 text-red">{selectedDocument.error}</p>
              </SectionCard>
            ) : null}
          </InspectorStack>
        }
      >
        <DocumentPreview
          title={selectedDocument?.filename}
          subtitle={selectedDocument ? `${selectedDocument.brand_slug} / ${selectedDocument.category}` : undefined}
          content={selectedContent}
          documentType="memory_document"
          qualityNotes={selectedDocument ? [
            `${chunks.length} chunks indexados`,
            `Status: ${selectedDocument.status}`,
            "Conteúdo disponível para RAG"
          ] : []}
          emptyTitle="Nenhum documento selecionado"
          emptyDescription="Selecione um documento indexado para ver chunks."
        />
      </DocumentWorkspace>
    </div>
  )
}
