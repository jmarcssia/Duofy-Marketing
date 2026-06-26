"use client"

import { FormEvent, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { EmptyState, PageTitle, PurpleButton, SectionCard, SoftButton } from "@/components/page-primitives"
import {
  apiFetch,
  type AgentTask,
  type Brand,
  type ChatMessage,
  type ChatMessageResponse,
  type ChatSession,
  type ChatSessionDetail
} from "@/lib/api"
import { getTokenFromCookie } from "@/lib/auth"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

const ARTIFACT_LINKS: Array<{ pattern: RegExp; href: string }> = [
  { pattern: /\/research/g, href: "/research" },
  { pattern: /\/approvals/g, href: "/approvals" },
  { pattern: /\/content/g, href: "/content" },
  { pattern: /\/calendar/g, href: "/calendar" },
]

function LogMessage({ message }: { message: string }) {
  const parts: Array<{ text: string; href?: string }> = []
  let remaining = message
  while (remaining.length > 0) {
    let earliest: { index: number; text: string; href: string } | null = null
    for (const { pattern, href } of ARTIFACT_LINKS) {
      pattern.lastIndex = 0
      const match = pattern.exec(remaining)
      if (match && (earliest === null || match.index < earliest.index)) {
        earliest = { index: match.index, text: match[0], href }
      }
    }
    if (!earliest) {
      parts.push({ text: remaining })
      break
    }
    if (earliest.index > 0) {
      parts.push({ text: remaining.slice(0, earliest.index) })
    }
    parts.push({ text: earliest.text, href: earliest.href })
    remaining = remaining.slice(earliest.index + earliest.text.length)
  }
  return (
    <>
      {parts.map((part, i) =>
        part.href ? (
          <Link key={i} href={part.href} className="font-semibold underline hover:text-purple">
            {part.text}
          </Link>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  )
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "Na fila",
    running: "Executando",
    completed: "Concluida",
    failed: "Falhou"
  }
  return labels[status] ?? status
}

async function streamTask(
  taskId: number,
  token: string,
  onUpdate: (task: AgentTask) => void
) {
  const response = await fetch(`${API_URL}/api/tasks/${taskId}/stream`, {
    headers: { Authorization: `Bearer ${token}` }
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

export default function ChatPage() {
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [selectedSession, setSelectedSession] = useState<ChatSessionDetail | null>(null)
  const [selectedBrand, setSelectedBrand] = useState("")
  const [prompt, setPrompt] = useState("")
  const [activeTask, setActiveTask] = useState<AgentTask | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadSessions(token: string, nextSessionId?: number) {
    const items = await apiFetch<ChatSession[]>("/api/chat/sessions", token)
    setSessions(items)
    const target = items.find((item) => item.id === nextSessionId) ?? items[0]
    if (target) {
      const detail = await apiFetch<ChatSessionDetail>(`/api/chat/sessions/${target.id}`, token)
      setSelectedSession(detail)
      setSelectedBrand(detail.brand_slug ?? selectedBrand)
    } else {
      setSelectedSession(null)
    }
  }

  useEffect(() => {
    const token = getTokenFromCookie()
    if (!token) {
      router.replace("/login")
      return
    }
    Promise.all([apiFetch<Brand[]>("/api/brands", token), loadSessions(token)])
      .then(([brandList]) => {
        setBrands(brandList)
        if (!selectedBrand) setSelectedBrand(brandList[0]?.slug ?? "")
      })
      .catch(() => setError("Nao foi possivel carregar o chat."))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function createSession(token: string) {
    const session = await apiFetch<ChatSession>("/api/chat/sessions", token, {
      method: "POST",
      body: JSON.stringify({
        title: "Nova conversa",
        brand_slug: selectedBrand || null
      })
    })
    await loadSessions(token, session.id)
    return session
  }

  async function selectSession(sessionId: number) {
    const token = getTokenFromCookie()
    if (!token) return
    const detail = await apiFetch<ChatSessionDetail>(`/api/chat/sessions/${sessionId}`, token)
    setSelectedSession(detail)
    setSelectedBrand(detail.brand_slug ?? selectedBrand)
    setActiveTask(null)
  }

  async function pollTask(taskId: number, token: string) {
    for (let index = 0; index < 120; index += 1) {
      const task = await apiFetch<AgentTask>(`/api/tasks/${taskId}`, token)
      setActiveTask(task)
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
      const session = selectedSession ?? await createSession(token)
      const response = await apiFetch<ChatMessageResponse>(
        `/api/chat/sessions/${session.id}/messages`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            content: prompt,
            brand_slug: selectedBrand || null
          })
        }
      )
      setPrompt("")
      setActiveTask(response.task)
      setSelectedSession((current) => current ? {
        ...current,
        messages: [...current.messages, response.message]
      } : current)
      try {
        await streamTask(response.task.id, token, setActiveTask)
      } catch {
        await pollTask(response.task.id, token)
      }
      await loadSessions(token, session.id)
    } catch (requestError) {
      setError(String(requestError).replace(/^Error:\s*/, ""))
    } finally {
      setIsSending(false)
    }
  }

  const messages: ChatMessage[] = selectedSession?.messages ?? []

  return (
    <div className="space-y-6">
      <PageTitle
        title="Chat Operacional"
        subtitle="Converse com o orquestrador, gere tarefas e acompanhe progresso do worker."
      />

      {error ? (
        <p className="rounded-2xl border border-red/20 bg-red/5 p-4 text-sm font-semibold text-red">
          {error}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.55fr_1.45fr_0.65fr]">
        <SectionCard
          title="Sessoes"
          action={
            <SoftButton
              type="button"
              onClick={async () => {
                const token = getTokenFromCookie()
                if (token) await createSession(token)
              }}
            >
              Nova
            </SoftButton>
          }
        >
          <div className="space-y-3">
            {sessions.length === 0 ? (
              <EmptyState title="Sem conversas" description="Crie uma conversa ou envie uma mensagem." />
            ) : null}
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => selectSession(session.id)}
                className={`w-full rounded-2xl border p-4 text-left ${
                  selectedSession?.id === session.id ? "border-purple bg-purple-soft" : "border-line bg-white"
                }`}
              >
                <strong className="line-clamp-2">{session.title}</strong>
                <p className="mt-2 text-xs text-muted">{session.brand_slug ?? "Sem marca"}</p>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Conversa">
          <div className="flex min-h-[560px] flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-line bg-slate-50 p-4">
              {messages.length === 0 ? (
                <EmptyState
                  title="Comece a demo"
                  description="Peça uma pesquisa, um post, uma pauta, um calendario ou um relatorio de metricas."
                />
              ) : null}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[86%] rounded-2xl p-4 text-sm leading-6 ${
                    message.role === "user"
                      ? "ml-auto bg-purple text-white"
                      : "border border-line bg-white text-ink"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              ))}
              {activeTask && !["completed", "failed"].includes(activeTask.status) ? (
                <div className="rounded-2xl border border-purple/20 bg-purple-soft p-4 text-sm text-purple">
                  <p className="font-semibold">{statusLabel(activeTask.status)}: {activeTask.task_type}</p>
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
            </div>

            <form onSubmit={sendMessage} className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-3">
                <select
                  value={selectedBrand}
                  onChange={(event) => setSelectedBrand(event.target.value)}
                  className="duofy-focus rounded-xl border border-line bg-white px-4 py-3 text-sm"
                >
                  {brands.map((brand) => (
                    <option key={brand.slug} value={brand.slug}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ex.: gere um post LinkedIn sobre inadimplencia em planos funerarios usando memoria e envie para rascunho."
                className="duofy-focus min-h-28 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
              />
              <div className="flex justify-end">
                <PurpleButton disabled={isSending || prompt.trim().length < 2}>
                  {isSending ? "Executando..." : "Enviar"}
                </PurpleButton>
              </div>
            </form>
          </div>
        </SectionCard>

        <SectionCard title="Tarefa">
          {activeTask ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-2xl border border-line bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Status</p>
                <p className="mt-2 font-bold">{statusLabel(activeTask.status)}</p>
              </div>
              <div className="rounded-2xl border border-line bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Tipo</p>
                <p className="mt-2 font-bold">{activeTask.task_type}</p>
              </div>
              {activeTask.output_id ? (
                <div className="rounded-2xl border border-line bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Saida</p>
                  <p className="mt-2 font-bold">
                    {activeTask.output_type} #{activeTask.output_id}
                  </p>
                </div>
              ) : null}
              {activeTask.logs.length > 0 ? (
                <div className="rounded-2xl border border-purple/20 bg-purple-soft p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-purple">
                    Progresso
                  </p>
                  <ol className="space-y-2">
                    {activeTask.logs.map((log) => (
                      <li key={log.id} className="flex items-start gap-2 text-xs">
                        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple" />
                        <span className="text-ink">
                          <LogMessage message={log.message} />
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState title="Sem tarefa ativa" description="Envie uma mensagem para criar uma tarefa." />
          )}
        </SectionCard>
      </div>
    </div>
  )
}
