/**
 * Fonte única de verdade para distinguir pesquisa de conteúdo a partir de um `ContentOutput`
 * (ou de qualquer objeto com os mesmos três campos). Antes desta função, a mesma lógica existia
 * duplicada — e levemente divergente — em content/page.tsx, operations/page.tsx e
 * approvals/page.tsx.
 */
export function isResearchOutput(o: {
  format?: string | null
  channel?: string | null
  category?: string | null
}): boolean {
  return o.format === "research_report" || o.channel === "Pesquisa" || o.category === "research"
}

/** URL da tela de resultado (pesquisa ou conteúdo) para um output — abre direto no item, sem
 * exigir que o usuário procure na lista depois. */
export function resultHref(o: {
  id: number
  format?: string | null
  channel?: string | null
  category?: string | null
}): string {
  return isResearchOutput(o) ? `/research?id=${o.id}` : `/content?id=${o.id}`
}
