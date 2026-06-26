const LLM_PROVIDERS = new Set(["openrouter", "anthropic", "openai"])

export function isLlmProvider(provider: string): boolean {
  return LLM_PROVIDERS.has(provider)
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  review: "Em revisão",
  approved: "Aprovado",
  needs_adjustment: "Ajustes",
  rejected: "Rejeitado",
  archived: "Arquivado",
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}
