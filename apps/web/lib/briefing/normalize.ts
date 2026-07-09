/**
 * Camada única de normalização UI → API.
 *
 * A UI mostra rótulos/ids em português ("Rápida", "Instagram", "E-mail"); o backend
 * espera enums canônicos ("quick", "instagram", "email"). Toda tela (Pesquisa, Cocriação,
 * wizard do Calendário) deve passar por aqui em vez de fazer o próprio mapeamento — evita o
 * mismatch que gerava "Input should be 'quick' or 'deep'". O backend também coage por
 * segurança (app/enum_normalize.py), mas o contrato correto é enviar já normalizado.
 */

export type ResearchDepth = "quick" | "standard" | "deep"
export type CocreationDepth = "quick" | "deep"

const DEPTH_MAP: Record<string, ResearchDepth> = {
  quick: "quick", rapida: "quick", "rápida": "quick", rapido: "quick", "rápido": "quick",
  standard: "standard", padrao: "standard", "padrão": "standard", media: "standard", "média": "standard",
  deep: "deep", profunda: "deep", profundo: "deep", aprofundada: "deep", aprofundado: "deep",
  consultiva: "deep", executiva: "deep",
}

/** "Rápida"/"rapida"/"quick" → "quick"; "Padrão" → "standard"; "Profunda"/"Consultiva" → "deep". */
export function normalizeDepth(value: string | null | undefined): ResearchDepth {
  if (!value) return "standard"
  return DEPTH_MAP[value.trim().toLowerCase()] ?? "standard"
}

/** Profundidade para a Cocriação, cujo enum é só quick|deep ("Padrão" → deep). */
export function normalizeCocreationDepth(value: string | null | undefined): CocreationDepth {
  const d = normalizeDepth(value)
  return d === "quick" ? "quick" : "deep"
}

const CHANNEL_MAP: Record<string, string> = {
  instagram: "instagram", linkedin: "linkedin", facebook: "facebook", tiktok: "tiktok",
  whatsapp: "whatsapp", "e-mail": "email", email: "email", blog: "blog",
  release: "release", pitch: "pitch", "landing page": "landing_page", landing_page: "landing_page",
}

/** Canal único → token canônico do backend (minúsculo; "E-mail"→"email", "Landing page"→"landing_page"). */
export function normalizeChannel(value: string | null | undefined): string {
  if (!value) return ""
  const key = value.trim().toLowerCase()
  return CHANNEL_MAP[key] ?? key
}

/** Lista de canais → tokens canônicos, sem duplicatas e sem vazios. */
export function normalizeChannels(values: string[] | null | undefined): string[] {
  const out: string[] = []
  for (const v of values ?? []) {
    const n = normalizeChannel(v)
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

const PIECE_MAP: Record<string, string> = {
  carousel: "carousel", carrossel: "carousel",
  caption_instagram: "caption_instagram", caption_linkedin: "caption_linkedin",
  caption_facebook: "caption_facebook", caption_tiktok: "caption_tiktok",
  whatsapp: "whatsapp", whatsapp_image_prompt: "whatsapp_image_prompt",
  email: "email", "e-mail": "email", blog: "blog", release: "release",
  pitch: "pitch", landing_page: "landing_page", "landing page": "landing_page",
  visual_direction: "visual_direction",
}

/** Peça → kind canônico do backend (content_pieces). */
export function normalizePiece(value: string | null | undefined): string {
  if (!value) return ""
  const key = value.trim().toLowerCase()
  return PIECE_MAP[key] ?? key
}

export function normalizePieces(values: string[] | null | undefined): string[] {
  const out: string[] = []
  for (const v of values ?? []) {
    const n = normalizePiece(v)
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}
