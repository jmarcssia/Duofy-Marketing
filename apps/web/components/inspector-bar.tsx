"use client"

import { useState } from "react"
import Link from "next/link"

import { type AgentTask } from "@/lib/api"

type Phase = "Pesquisando" | "Gerando" | "Revisando" | "Concluido" | "Falhou"

const PHASE_ORDER: Phase[] = ["Pesquisando", "Gerando", "Revisando", "Concluido"]

function derivePhase(task: AgentTask): Phase {
  if (task.status === "failed") return "Falhou"
  if (task.status === "completed") return "Concluido"

  const logMessages = task.logs.map((log) => log.message.toLowerCase()).join(" ")
  const taskType = task.task_type.toLowerCase()

  if (
    logMessages.includes("revis") ||
    logMessages.includes("qualidade") ||
    logMessages.includes("review")
  ) {
    return "Revisando"
  }
  if (
    logMessages.includes("gera") ||
    logMessages.includes("escrev") ||
    logMessages.includes("redigindo") ||
    taskType.includes("content") ||
    taskType.includes("write")
  ) {
    return "Gerando"
  }
  if (
    logMessages.includes("pesquis") ||
    logMessages.includes("busca") ||
    logMessages.includes("search") ||
    taskType.includes("research")
  ) {
    return "Pesquisando"
  }

  return "Gerando"
}

function phaseProgress(phase: Phase): number {
  if (phase === "Falhou") return 100
  const index = PHASE_ORDER.indexOf(phase)
  if (index === -1) return 0
  return Math.round(((index + 1) / PHASE_ORDER.length) * 100)
}

function LogLine({ message }: { message: string }) {
  return <span className="text-ink">{message}</span>
}

export function InspectorBar({ task }: { task: AgentTask | null }) {
  const [expanded, setExpanded] = useState(false)

  if (!task) return null

  const phase = derivePhase(task)
  const progress = phaseProgress(phase)
  const isDone = task.status === "completed"
  const isFailed = task.status === "failed"
  const isActive = !isDone && !isFailed

  return (
    <div className="border-t border-line bg-white">
      {/* Main bar */}
      <div className="flex items-center gap-4 px-5 py-3">
        {/* Phase indicator */}
        <div className="flex items-center gap-2.5 shrink-0">
          {isActive ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-purple" />
            </span>
          ) : isFailed ? (
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
          )}
          <span
            className={`text-sm font-bold ${
              isFailed ? "text-red-600" : isDone ? "text-green-700" : "text-purple"
            }`}
          >
            {phase}
          </span>
        </div>

        {/* Task type */}
        <span className="hidden text-xs font-semibold text-muted sm:block">
          {task.task_type}
        </span>

        {/* Progress bar */}
        <div className="flex-1 min-w-0">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-purple/10">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isFailed ? "bg-red-400" : isDone ? "bg-green-400" : "bg-purple"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Phase steps */}
        <div className="hidden items-center gap-1.5 lg:flex">
          {PHASE_ORDER.map((p, i) => {
            const currentIndex = PHASE_ORDER.indexOf(phase)
            const isPast = i < currentIndex
            const isCurrent = p === phase && isActive
            const isCompleted = isDone || isPast
            return (
              <span
                key={p}
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors ${
                  isCurrent
                    ? "bg-purple text-white"
                    : isCompleted
                    ? "bg-purple/10 text-purple"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {p}
              </span>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isDone && task.output_type && task.output_id ? (
            <Link
              href={
                task.output_type === "content_output"
                  ? `/content/${task.output_id}`
                  : task.output_type === "research_report"
                  ? `/research/${task.output_id}`
                  : `/content`
              }
              className="rounded-xl border border-purple/30 bg-purple-soft px-3 py-1.5 text-xs font-bold text-purple transition hover:bg-purple hover:text-white"
            >
              Ver artefato
            </Link>
          ) : null}
          {task.logs.length > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-purple/40 hover:text-purple"
            >
              {expanded ? "Fechar" : "Detalhes"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Expanded logs */}
      {expanded && task.logs.length > 0 ? (
        <div className="border-t border-line bg-[#fbfbfd] px-5 py-4">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.14em] text-purple">
            Progresso da tarefa
          </p>
          <ol className="space-y-2">
            {task.logs.map((log) => (
              <li key={log.id} className="flex items-start gap-2.5 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple" />
                <span className="leading-5">
                  <LogLine message={log.message} />
                </span>
                <span className="ml-auto shrink-0 text-muted">
                  {new Date(log.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ol>
          {task.error ? (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              Erro: {task.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
