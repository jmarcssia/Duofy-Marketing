/**
 * Traduz erros da API em mensagens amigáveis. A UI NUNCA deve exibir JSON técnico bruto
 * (ex.: erro Pydantic "Input should be 'quick' or 'deep'"). O detalhe técnico vai só para o
 * console em desenvolvimento.
 */

const isDev = process.env.NODE_ENV !== "production"

/** Extrai uma mensagem amigável de um erro do `apiFetch` (que lança Error com o corpo cru). */
export function friendlyError(
  e: unknown,
  fallback = "Não foi possível concluir a ação. Revise os dados e tente novamente."
): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : ""
  if (isDev && raw) console.error("[Duofy API error]", raw)

  const trimmed = raw.trim()
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as { detail?: unknown }
      const detail = parsed?.detail
      // Erro de validação Pydantic: lista de campos. Nunca expor cru.
      if (Array.isArray(detail)) {
        const fields = detail
          .map((d) => {
            const loc = (d as { loc?: unknown[] })?.loc
            return Array.isArray(loc) && loc.length ? String(loc[loc.length - 1]) : ""
          })
          .filter((f) => f && f !== "body")
        const campos = fields.length ? ` Verifique: ${Array.from(new Set(fields)).join(", ")}.` : ""
        return `Não foi possível gerar o conteúdo. Revise os filtros selecionados e tente novamente.${campos}`
      }
      // Detalhe em string do backend já costuma ser amigável (em pt-BR).
      if (typeof detail === "string" && detail.trim()) return detail.trim()
    } catch {
      /* não era JSON válido — segue para o fallback */
    }
    return fallback
  }

  // Texto curto e não-JSON pode ser exibido; senão, fallback.
  if (trimmed && trimmed.length <= 200) return trimmed
  return fallback
}
