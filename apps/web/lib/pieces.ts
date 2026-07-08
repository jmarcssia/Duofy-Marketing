/**
 * Mapa canal → peças (kinds do backend). Fonte ÚNICA compartilhada entre a Cocriação e o wizard
 * do Calendário — antes estava duplicada byte-a-byte nos dois arquivos.
 */

/** Peças pré-selecionadas quando o canal entra na seleção. */
export const PIECES_BY_CHANNEL: Record<string, string[]> = {
  Instagram: ["carousel", "caption_instagram", "visual_direction"],
  LinkedIn: ["carousel", "caption_linkedin", "visual_direction"],
  WhatsApp: ["whatsapp"],
  "E-mail": ["email"],
  Blog: ["blog"],
  Release: ["release"],
  Pitch: ["pitch"],
  "Landing page": ["landing_page"]
}

/** Peças visíveis/coerentes com os canais selecionados. */
export function allowedPiecesFor(channels: string[]): Set<string> {
  const set = new Set<string>()
  if (channels.includes("Instagram") || channels.includes("LinkedIn")) {
    for (const p of ["carousel", "caption_instagram", "caption_linkedin", "visual_direction"]) set.add(p)
  }
  if (channels.includes("WhatsApp")) {
    set.add("whatsapp")
    set.add("whatsapp_image_prompt")
  }
  if (channels.includes("E-mail")) set.add("email")
  if (channels.includes("Blog")) set.add("blog")
  if (channels.includes("Release")) set.add("release")
  if (channels.includes("Pitch")) set.add("pitch")
  if (channels.includes("Landing page")) set.add("landing_page")
  return set
}
