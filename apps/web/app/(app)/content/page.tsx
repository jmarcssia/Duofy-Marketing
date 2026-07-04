"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

import { CalendarIcon, SparklesIcon } from "@/components/icons"
import { PageHeader, Spinner } from "@/components/ui"

import { CocreationPanel } from "../operations/CocreationPanel"

function CocreationInner() {
  const params = useSearchParams()
  const research = params.get("research") ?? undefined

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agente de Cocriação"
        subtitle="Gere pacotes de conteúdo por canal a partir de um briefing ou de uma pesquisa aprovada."
        icon={<SparklesIcon className="h-5 w-5" />}
        right={
          <Link
            href="/calendar"
            className="duofy-tap inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink hover:border-purple/40 hover:text-purple"
          >
            <CalendarIcon className="h-4 w-4" /> Voltar ao Calendário
          </Link>
        }
      />

      <div className="flex items-start gap-3 rounded-2xl border border-purple/20 bg-purple-soft/40 p-4">
        <SparklesIcon className="mt-0.5 h-5 w-5 shrink-0 text-purple" />
        <div className="text-sm text-ink">
          <p className="font-semibold">A cocriação pode começar de duas formas.</p>
          <p className="mt-0.5 text-muted">
            Por <strong>briefing manual</strong> (sem pesquisa vinculada) ou por uma{" "}
            <strong>pesquisa aprovada</strong> associada (informe o ID no campo “Pesquisa associada”). O sistema gera
            roteiro, legendas e <strong>prompts visuais</strong> — não gera a imagem final nem insere hashtags na arte.
          </p>
          {research && (
            <p className="mt-1 text-xs font-semibold text-purple">
              Pesquisa #{research} pré-vinculada a este pacote.
            </p>
          )}
        </div>
      </div>

      <CocreationPanel initialResearchId={research} />
    </div>
  )
}

export default function CocreationPage() {
  return (
    <Suspense
      fallback={
        <div className="grid place-items-center py-20">
          <Spinner size={22} className="text-purple" />
        </div>
      }
    >
      <CocreationInner />
    </Suspense>
  )
}
