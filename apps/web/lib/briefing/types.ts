/**
 * Tipo do briefing estruturado compartilhado (FASE 2/3).
 *
 * Este objeto viaja como `briefing_filters` para o backend (pesquisa/cocriação)
 * e como `execution_payload.briefing` no evento do calendário. As chaves casam
 * com apps/api/app/briefing_filters.py — valores são ids/rótulos da taxonomia.
 */

import {
  CANAIS,
  CTAS,
  DECISORES,
  ENTREGAVEIS,
  ESCOPOS_GEO,
  FINALIDADES,
  FONTES,
  FORMATOS,
  JORNADAS_MARKETING,
  jornadasPara,
  labelOf,
  labelsOf,
  OBJETIVOS,
  type Option,
  PECAS,
  PERIODOS,
  PERSONAS,
  PROFUNDIDADES,
  RESTRICOES,
  SEGMENTOS,
  subsegmentosPara,
  TIPOS_PESQUISA,
  TONS
} from "./taxonomy"

export type StructuredBriefing = {
  segmento?: string
  subsegmentos?: string[]
  personas?: string[]
  decisores?: string[]
  jornadas?: string[]
  funil?: string[]
  objetivos?: string[]
  tipos_pesquisa?: string[]
  escopo_geografico?: string
  periodo?: string
  profundidade?: string
  fontes?: string[]
  entregaveis?: string[]
  canais?: string[]
  formatos?: string[]
  pecas?: string[]
  finalidade?: string
  tom?: string
  cta?: string
  restricoes?: string[]
  nutricao?: { canais?: string[]; opcoes?: string[] }
  imprensa?: { entregas?: string[] }
  publicacao?: { modo?: string; requisitos?: string[] }
  concorrentes?: string
  temas_relacionados?: string
  contexto?: string
  observacoes?: string
}

/** Remove chaves vazias (o backend também normaliza, mas mandamos limpo). */
export function cleanBriefing(briefing: StructuredBriefing): StructuredBriefing | undefined {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(briefing)) {
    if (value == null || value === "") continue
    if (Array.isArray(value) && value.length === 0) continue
    if (typeof value === "object" && !Array.isArray(value)) {
      const inner = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([, v]) =>
          Array.isArray(v) ? v.length > 0 : v != null && v !== ""
        )
      )
      if (Object.keys(inner).length === 0) continue
      out[key] = inner
      continue
    }
    out[key] = value
  }
  return Object.keys(out).length > 0 ? (out as StructuredBriefing) : undefined
}

export type SummaryRow = { label: string; values: string[] }

/**
 * Resumo legível do briefing (para BriefingSummary e para a etapa "Resumo" do wizard).
 * Traduz ids da taxonomia em rótulos; campos vazios ficam de fora.
 */
export function briefingSummaryRows(briefing: StructuredBriefing): SummaryRow[] {
  const seg = briefing.segmento
  const jornadaOpts: Option[] = [...jornadasPara(seg), ...JORNADAS_MARKETING]
  const rows: (SummaryRow | null)[] = [
    seg ? { label: "Segmento", values: [labelOf(SEGMENTOS, seg)] } : null,
    row("Subsegmentos", labelsOf(subsegmentosPara(seg), briefing.subsegmentos)),
    row("Personas", labelsOf(PERSONAS, briefing.personas)),
    row("Decisores", labelsOf(DECISORES, briefing.decisores)),
    row("Jornadas", labelsOf(jornadaOpts, briefing.jornadas)),
    row("Funil", labelsOf(JORNADAS_MARKETING, briefing.funil)),
    row("Objetivos", labelsOf(OBJETIVOS, briefing.objetivos)),
    row("Tipo de pesquisa", labelsOf(TIPOS_PESQUISA, briefing.tipos_pesquisa)),
    briefing.escopo_geografico
      ? { label: "Escopo", values: [labelOf(ESCOPOS_GEO, briefing.escopo_geografico)] }
      : null,
    // profundidade/periodo podem chegar como id (pesquisa) ou label (calendário);
    // labelOf devolve o rótulo quando é id e mantém o texto quando já é label/custom.
    briefing.periodo ? { label: "Período", values: [labelOf(PERIODOS, briefing.periodo)] } : null,
    briefing.profundidade
      ? { label: "Profundidade", values: [labelOf(PROFUNDIDADES, briefing.profundidade)] }
      : null,
    row("Fontes", labelsOf(FONTES, briefing.fontes)),
    row("Entregáveis", labelsOf(ENTREGAVEIS, briefing.entregaveis)),
    row("Canais", labelsOf(CANAIS, briefing.canais)),
    row("Formatos", labelsOf(FORMATOS, briefing.formatos)),
    row("Peças", labelsOf(PECAS, briefing.pecas)),
    briefing.finalidade
      ? { label: "Finalidade", values: [labelOf(FINALIDADES, briefing.finalidade)] }
      : null,
    briefing.tom ? { label: "Tom", values: [labelOf(TONS, briefing.tom)] } : null,
    briefing.cta ? { label: "CTA", values: [labelOf(CTAS, briefing.cta)] } : null,
    row("Restrições", labelsOf(RESTRICOES, briefing.restricoes)),
    briefing.nutricao?.canais?.length
      ? { label: "Nutrição", values: briefing.nutricao.canais }
      : null,
    briefing.imprensa?.entregas?.length
      ? { label: "Imprensa", values: briefing.imprensa.entregas }
      : null,
    briefing.concorrentes ? { label: "Concorrentes", values: [briefing.concorrentes] } : null,
    briefing.contexto ? { label: "Contexto", values: [truncate(briefing.contexto)] } : null,
    briefing.observacoes ? { label: "Observações", values: [truncate(briefing.observacoes)] } : null
  ]
  return rows.filter((r): r is SummaryRow => r !== null)
}

function row(label: string, values: string[]): SummaryRow | null {
  return values.length > 0 ? { label, values } : null
}

function truncate(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export type CompletenessField = {
  key: string
  label: string
  required: boolean
  filled: boolean
}

export type Completeness = {
  fields: CompletenessField[]
  requiredTotal: number
  requiredFilled: number
  percent: number
  ready: boolean
  missing: string[]
}

/**
 * Completude do briefing: `fields` descreve cada campo (obrigatório ou não) e se está
 * preenchido; "Pronto para executar" = todos os obrigatórios preenchidos.
 */
export function computeCompleteness(
  fields: { key: string; label: string; required: boolean; filled: boolean }[]
): Completeness {
  const required = fields.filter((f) => f.required)
  const requiredFilled = required.filter((f) => f.filled).length
  const optional = fields.filter((f) => !f.required)
  const optionalFilled = optional.filter((f) => f.filled).length
  // Obrigatórios pesam o essencial; opcionais completam a barra.
  const base = required.length > 0 ? (requiredFilled / required.length) * 70 : 70
  const extra = optional.length > 0 ? (optionalFilled / optional.length) * 30 : 30
  return {
    fields,
    requiredTotal: required.length,
    requiredFilled,
    percent: Math.round(base + extra),
    ready: requiredFilled === required.length,
    missing: required.filter((f) => !f.filled).map((f) => f.label)
  }
}
