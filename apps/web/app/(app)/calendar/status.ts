// Metadados de status/tipo do evento — compartilhados entre a página e o painel de detalhe.

export type Tone = "amber" | "blue" | "green" | "purple" | "red" | "slate"

export const STATUS_META: Record<string, { label: string; tone: Tone; dot: string }> = {
  draft: { label: "Rascunho", tone: "slate", dot: "#94a3b8" },
  briefing_incomplete: { label: "Briefing incompleto", tone: "amber", dot: "#f59e0b" },
  ready: { label: "Pronto para executar", tone: "blue", dot: "#2563eb" },
  planned: { label: "Planejado", tone: "slate", dot: "#94a3b8" },
  scheduled: { label: "Agendado", tone: "blue", dot: "#2563eb" },
  in_progress: { label: "Em andamento", tone: "amber", dot: "#f97316" },
  running: { label: "Em execução", tone: "amber", dot: "#f97316" },
  awaiting_approval: { label: "Aguardando aprovação", tone: "purple", dot: "#7c3aed" },
  approved: { label: "Aprovado", tone: "green", dot: "#16a34a" },
  completed: { label: "Concluído", tone: "green", dot: "#16a34a" },
  cancelled: { label: "Cancelado", tone: "slate", dot: "#cbd5e1" },
  failed: { label: "Falhou", tone: "red", dot: "#ef4444" }
}

export function statusMeta(s: string): { label: string; tone: Tone; dot: string } {
  return STATUS_META[s] ?? { label: s, tone: "slate", dot: "#94a3b8" }
}

export const EVENT_TYPE_META: Record<string, { label: string }> = {
  research: { label: "Pesquisa" },
  content: { label: "Conteúdo" },
  task: { label: "Tarefa" },
  meeting: { label: "Reunião" },
  event: { label: "Evento" },
  delivery: { label: "Entrega" },
  campaign: { label: "Campanha" },
  press: { label: "Imprensa" },
  milestone: { label: "Marco" },
  other: { label: "Outro" }
}

export function eventTypeLabel(t: string): string {
  return EVENT_TYPE_META[t]?.label ?? t
}

// Tipos oferecidos na criação (V1 — pesquisa é o fluxo vertical completo).
export const CREATE_EVENT_TYPES = ["research", "content", "task", "meeting", "event", "delivery"]

// Estados oferecidos no formulário conforme o tipo.
export const WORKFLOW_STATUSES = ["draft", "briefing_incomplete", "ready", "scheduled"]
export const GENERIC_STATUSES = ["planned", "scheduled", "in_progress", "completed", "failed"]

export const STEP_STYLE: Record<string, { ring: string; bg: string; text: string; dot: string }> = {
  done: { ring: "border-green-300", bg: "bg-green-50", text: "text-green-700", dot: "#16a34a" },
  current: { ring: "border-purple/40", bg: "bg-purple/5", text: "text-purple", dot: "#7c3aed" },
  pending: { ring: "border-line", bg: "bg-white", text: "text-muted", dot: "#cbd5e1" },
  locked: { ring: "border-line", bg: "bg-panel/50", text: "text-muted", dot: "#e2e8f0" }
}
