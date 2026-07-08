/**
 * Cor de acento por marca — a "assinatura multimarca" do console. Cada marca ganha um matiz
 * estável que aparece no seletor de marca (swatch) e pode tingir realces daquela marca, para a
 * gestora sempre sentir em qual marca está trabalhando. Slugs conhecidos têm cor curada; qualquer
 * outra marca cai num matiz derivado do slug (determinístico, sem "cor aleatória" a cada render).
 */
const CURATED: Record<string, string> = {
  postos_combustiveis: "#2e73b8", // azul TOTVS/varejo
  deathcare: "#0d7d72", // teal sóbrio/respeitoso
  duofy_solucoes: "#5a34e0" // roxo-índigo da marca-mãe
}

const FALLBACK = ["#5a34e0", "#2e73b8", "#0d7d72", "#b7791f", "#c14a86", "#4a3fce"]

export function brandAccent(slug: string | null | undefined): string {
  if (!slug) return "#5a34e0"
  if (CURATED[slug]) return CURATED[slug]
  let h = 0
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0
  return FALLBACK[h % FALLBACK.length]
}
