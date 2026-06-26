"use client"

import { FormEvent, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"

import { WorkspaceListItem } from "@/components/document-workspace"
import { FileIcon, SearchIcon } from "@/components/icons"
import { EmptyState, PurpleButton, SoftButton } from "@/components/page-primitives"
import {
  apiFetch,
  type AgentTask,
  type ChatMessage,
  type ChatMessageResponse,
  type ChatSession,
  type ChatSessionDetail,
  type DocumentItem,
  type MemorySearchResult,
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

const ARTIFACT_LINKS: Array<{ token: string; href: string }> = [
  { token: "/research", href: "/research" },
  { token: "/approvals", href: "/approvals" },
  { token: "/content", href: "/content" },
  { token: "/calendar", href: "/calendar" },
]

function LogMessage({ message }: { message: string }) {
  const parts: Array<{ text: string; href?: string }> = []
  let remaining = message
  while (remaining.length > 0) {
    let earliest: { index: number; token: string; href: string } | null = null
    for (const { token, href } of ARTIFACT_LINKS) {
      const index = remaining.indexOf(token)
      if (index !== -1 && (earliest === null || index < earliest.index)) {
        earliest = { index, token, href }
      }
    }
    if (!earliest) {
      parts.push({ text: remaining })
      break
    }
    if (earliest.index > 0) {
      parts.push({ text: remaining.slice(0, earliest.index) })
    }
    parts.push({ text: earliest.token, href: earliest.href })
    remaining = remaining.slice(earliest.index + earliest.token.length)
  }
  return (
    <>
      {parts.map((part, i) =>
        part.href ? (
          <Link key={i} href={part.href} className="font-semibold underline hover:text-purple-700">
            {part.text}
          </Link>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  )
}

async function streamTask(
  taskId: number,
  token: string,
  onUpdate: (task: AgentTask) => void
) {
  const response = await fetch(`${API_URL}/api/tasks/${taskId}/stream`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok || !response.body) throw new Error("Stream indisponivel.")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split("\n\n")
    buffer = events.pop() ?? ""
    for (const event of events) {
      const dataLine = event.split("\n").find((line) => line.startsWith("data: "))
      if (!dataLine) continue
      const task = JSON.parse(dataLine.slice(6)) as AgentTask
      onUpdate(task)
    }
  }
}

function artifactLabel(outputType: string): string {
  const labels: Record<string, string> = {
    content_output: "Conteudo gerado",
    research_report: "Pesquisa",
    internal_report: "Relatorio",
    calendar_event: "Evento de calendario",
  }
  return labels[outputType] ?? outputType
}

function artifactHref(outputType: string, outputId: number): string {
  if (outputType === "content_output") return `/content/${outputId}`
  if (outputType === "research_report") return `/research/${outputId}`
  if (outputType === "internal_report") return `/reports/${outputId}`
  if (outputType === "calendar_event") return `/calendar`
  return `/content`
}

function MemoryChip({
  onInject,
}: {
  onInject: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const token = getTokenFromCookie()
    if (!token) return
    apiFetch<DocumentItem[]>("/api/documents", token)
      .then(setDocuments)
      .catch(() => {/* silent */})
  }, [open])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  async function handleSearch() {
    if (!searchQuery.trim()) return
    const token = getTokenFromCookie()
    if (!token) return
    setIsSearching(true)
    try {
      const results = await apiFetch<MemorySearchResult[]>("/api/memory/search", token, {
        method: "POST",
        body: JSON.stringify({ query: searchQuery, limit: 8 }),
      })
      setSearchResults(results)
    } catch {
      // silent
    } finally {
      setIsSearching(false)
    }
  }

  function injectDocument(doc: DocumentItem) {
    onInject(`[Documento: ${doc.filename}]`)
    setOpen(false)
  }

  function injectMemory(result: MemorySearchResult) {
    onInject(`[Contexto: ${result.title}] ${result.content.slice(0, 200)}`)
    setOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
          open
            ? "border-purple bg-purple-soft text-purple"
            : "border-line bg-white text-ink hover:border-purple/40 hover:text-purple"
        }`}
      >
        <FileIcon className="h-3.5 w-3.5" />
        Memoria
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-80 rounded-2xl border border-line bg-white shadow-[0_20px_60px_rgba(18,20,30,0.14)]">
          <div className="p-4">
            <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.14em] text-purple">
              Injetar contexto
            </p>

            {/* Search */}
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Buscar na memoria..."
                className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-purple"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={isSearching}
                className="rounded-xl border border-line bg-white px-3 py-2 text-ink transition hover:border-purple/40 hover:text-purple disabled:opacity-50"
              >
                <SearchIcon className="h-4 w-4" />
              </button>
            </div>

            {searchResults.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted">Resultados</p>
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => injectMemory(result)}
                    className="w-full rounded-xl border border-line bg-white p-3 text-left text-xs transition hover:border-purple/40 hover:bg-purple-soft"
                  >
                    <strong className="line-clamp-1 text-ink">{result.title}</strong>
                    <p className="mt-1 line-clamp-2 text-muted">{result.content}</p>
                    <p className="mt-1 font-semibold text-purple">
                      Score: {result.score.toFixed(2)}
                    </p>
                  </button>
                ))}
              </div>
            ) : null}

            {documents.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted">Documentos disponiveis</p>
                {documents.slice(0, 6).map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => injectDocument(doc)}
                    className="w-full rounded-xl border border-line bg-white p-3 text-left text-xs transition hover:border-purple/40 hover:bg-purple-soft"
                  >
                    <strong className="line-clamp-1 text-ink">{doc.filename}</strong>
                    <p className="mt-0.5 text-muted">{doc.category} · {doc.brand_slug}</p>
                  </button>
                ))}
              </div>
            ) : null}

            {documents.length === 0 && searchResults.length === 0 ? (
              <p className="mt-3 text-center text-xs text-muted">
                Nenhum documento encontrado. Use a busca acima.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function ChatPanel({
  brandSlug,
  onArtifact,
  onTaskActivity,
}: {
  brandSlug?: string
  onArtifact: (outputType: string, outputId: number) => void
  onTaskActivity: (task: AgentTask | null) => void
}) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [selectedSession, setSelectedSession] = useState<ChatSessionDetail | null>(null)
  const [prompt, setPrompt] = useState("")
  const [activeTask, setActiveTask] = useState<AgentTask | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeBrandSlug = brandSlug ?? ""

  const handleTaskUpdate = useCallback(
    (task: AgentTask) => {
      setActiveTask(task)
      onTaskActivity(task)
    },
    [onTaskActivity]
  )

  async function loadSessions(token: string, nextSessionId?: number) {
    const items = await apiFetch<ChatSession[]>("/api/chat/sessions", token)
    setSessions(items)
    const target = items.find((item) => item.id === nextSessionId) ?? items[0]
    if (target) {
      const detail = await apiFetch<ChatSessionDetail>(`/api/chat/sessions/${target.id}`, token)
      setSelectedSession(detail)
    } else {
      setSelectedSession(null)
    }
  }

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) return
    loadSessions(token).catch(() => setError("Nao foi possivel carregar as sessoes."))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [selectedSession?.messages, activeTask])

  async function createSession(token: string) {
    const session = await apiFetch<ChatSession>("/api/chat/sessions", token, {
      method: "POST",
      body: JSON.stringify({
        title: "Nova conversa",
        brand_slug: activeBrandSlug || null,
      }),
    })
    await loadSessions(token, session.id)
    return session
  }

  async function selectSession(sessionId: number) {
    const token = getTokenFromCookie()
    if (!token) return
    const detail = await apiFetch<ChatSessionDetail>(`/api/chat/sessions/${sessionId}`, token)
    setSelectedSession(detail)
    setActiveTask(null)
    onTaskActivity(null)
  }

  async function pollTask(taskId: number, token: string) {
    for (let index = 0; index < 120; index += 1) {
      const task = await apiFetch<AgentTask>(`/api/tasks/${taskId}`, token)
      handleTaskUpdate(task)
      if (["completed", "failed"].includes(task.status)) return task
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    return null
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = getTokenFromCookie()
    if (!token || !prompt.trim()) return
    setIsSending(true)
    setError(null)
    try {
      const session = selectedSession ?? (await createSession(token))
      const response = await apiFetch<ChatMessageResponse>(
        `/api/chat/sessions/${session.id}/messages`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            content: prompt,
            brand_slug: activeBrandSlug || null,
          }),
        }
      )
      setPrompt("")
      handleTaskUpdate(response.task)
      setSelectedSession((current) =>
        current
          ? { ...current, messages: [...current.messages, response.message] }
          : current
      )
      let finalTask: AgentTask | null = response.task
      try {
        await streamTask(response.task.id, token, handleTaskUpdate)
        // After stream ends, fetch the final state
        finalTask = await apiFetch<AgentTask>(`/api/tasks/${response.task.id}`, token)
        handleTaskUpdate(finalTask)
      } catch {
        finalTask = await pollTask(response.task.id, token)
      }
      if (
        finalTask?.status === "completed" &&
        finalTask.output_type &&
        finalTask.output_id
      ) {
        onArtifact(finalTask.output_type, finalTask.output_id)
      }
      await loadSessions(token, session.id)
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsSending(false)
    }
  }

  function injectContext(text: string) {
    setPrompt((prev) => (prev ? `${prev}\n${text}` : text))
  }

  const messages: ChatMessage[] = selectedSession?.messages ?? []
  const taskDone = activeTask && ["completed", "failed"].includes(activeTask.status)

  return (
    <div className="flex h-full flex-col rounded-2xl border border-line bg-white">
      {/* Sessions sidebar */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted">Sessoes</span>
        <SoftButton
          type="button"
          className="py-1.5 text-xs"
          onClick={async () => {
            const token = getTokenFromCookie()
            if (token) await createSession(token)
          }}
        >
          + Nova
        </SoftButton>
      </div>

      <div className="grid flex-1 overflow-hidden xl:grid-cols-[220px_minmax(0,1fr)]">
        {/* Session list */}
        <aside className="overflow-y-auto border-b border-line bg-[#fbfbfd] p-3 xl:border-b-0 xl:border-r">
          {sessions.length === 0 ? (
            <p className="p-2 text-center text-xs text-muted">Nenhuma sessao ainda.</p>
          ) : null}
          <div className="space-y-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => selectSession(session.id)}
                className={`w-full rounded-xl border p-3 text-left text-xs transition ${
                  selectedSession?.id === session.id
                    ? "border-purple bg-purple-soft text-purple"
                    : "border-line bg-white hover:border-purple/40"
                }`}
              >
                <strong className="line-clamp-2 text-[13px] leading-5">{session.title}</strong>
                <p className="mt-1 text-muted">{session.brand_slug ?? "Sem marca"}</p>
              </button>
            ))}
          </div>
        </aside>

        {/* Conversation */}
        <div className="flex min-h-0 flex-col">
          {error ? (
            <p className="m-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
              {error}
            </p>
          ) : null}

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && !activeTask ? (
              <EmptyState
                title="Comece uma conversa"
                description="Peca uma pesquisa, um post, uma pauta, um calendario ou um relatorio."
              />
            ) : null}

            {messages.map((message) => (
              <div key={message.id} className="space-y-2">
                <div
                  className={`max-w-[88%] rounded-2xl p-3 text-sm leading-6 ${
                    message.role === "user"
                      ? "ml-auto bg-purple text-white"
                      : "border border-line bg-white text-ink"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}

            {/* Active task progress */}
            {activeTask && !taskDone ? (
              <div className="rounded-2xl border border-purple/20 bg-purple-soft p-4 text-sm text-purple">
                <p className="font-semibold">
                  {activeTask.task_type} — Em andamento
                </p>
                {activeTask.logs.length > 0 ? (
                  <ol className="mt-3 space-y-1.5 border-t border-purple/20 pt-3">
                    {activeTask.logs.map((log) => (
                      <li key={log.id} className="flex items-start gap-2 text-xs">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple" />
                        <span>
                          <LogMessage message={log.message} />
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            ) : null}

            {/* Completed task artifact card */}
            {activeTask?.status === "completed" &&
            activeTask.output_type &&
            activeTask.output_id ? (
              <div className="max-w-[88%]">
                <WorkspaceListItem
                  title={artifactLabel(activeTask.output_type)}
                  meta={`${activeTask.output_type} #${activeTask.output_id}`}
                  badge="Novo"
                  onClick={() => {
                    if (activeTask.output_type && activeTask.output_id) {
                      onArtifact(activeTask.output_type, activeTask.output_id)
                    }
                  }}
                />
              </div>
            ) : null}

            {/* Failed task */}
            {activeTask?.status === "failed" ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <p className="font-semibold">Tarefa falhou</p>
                {activeTask.error ? (
                  <p className="mt-1 text-xs">{activeTask.error}</p>
                ) : null}
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <form onSubmit={sendMessage} className="border-t border-line p-4 space-y-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder="Ex.: gere um post LinkedIn sobre inadimplencia usando memoria..."
              className="duofy-focus min-h-20 w-full resize-none rounded-xl border border-line bg-white px-4 py-3 text-sm"
            />
            <div className="flex items-center justify-between gap-3">
              <MemoryChip onInject={injectContext} />
              <PurpleButton disabled={isSending || prompt.trim().length < 2}>
                {isSending ? "Executando..." : "Enviar"}
              </PurpleButton>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
