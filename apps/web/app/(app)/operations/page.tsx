"use client"

import { useState } from "react"

import { Badge, ChecklistRow, GhostButton } from "@/components/ui"
import {
  AlertTriangleIcon,
  BookIcon,
  CheckCircleIcon,
  CopyIcon,
  FileIcon,
  FilterIcon,
  PlusIcon,
  SendIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShuffleIcon,
  SparklesIcon,
  TargetIcon,
  UsersIcon
} from "@/components/icons"
import {
  cocriacaoAngles,
  cocriacaoPrompts,
  formatRules,
  operationsGuardian,
  orchestratorMessages,
  researchCards,
  researchDetail
} from "@/lib/mock"

const columns = [
  { id: "analise" as const, label: "Em análise" },
  { id: "revisao" as const, label: "Em revisão" },
  { id: "aprovado" as const, label: "Aprovado" }
]

const formatIcons: Record<string, typeof FileIcon> = {
  post: FileIcon,
  carousel: BookIcon,
  linkedin: UsersIcon,
  blog: FileIcon
}

const formatSub: Record<string, string> = {
  "Post único": "Imagem + legenda",
  Carrossel: "Até 10 slides",
  LinkedIn: "Post profissional",
  Blog: "Artigo completo"
}

export default function OperationsPage() {
  const [selected, setSelected] = useState("r3")
  const [activeFormat, setActiveFormat] = useState("Carrossel")
  const [activeTab, setActiveTab] = useState<"Resumo" | "Insights" | "Anexos">("Resumo")

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[336px_minmax(0,1fr)_372px]">
        {/* Orquestrador */}
        <section className="duofy-card flex flex-col rounded-2xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-purple" />
            <h2 className="text-base font-bold tracking-[-0.02em] text-ink">Orquestrador</h2>
          </div>
          <div className="flex-1 space-y-3">
            {orchestratorMessages.map((m) => (
              <div key={m.id} className={`max-w-[88%] ${m.me ? "ml-auto" : ""}`}>
                <div className={`rounded-2xl px-4 py-3 text-sm ${m.me ? "bg-purple text-white" : "bg-purple-soft/70 text-ink"}`}>
                  {m.text}
                </div>
                <p className={`mt-1 text-[11px] text-muted ${m.me ? "text-right" : ""}`}>{m.time}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <GhostButton className="text-xs"><PlusIcon className="h-4 w-4" /> Nova pesquisa</GhostButton>
            <GhostButton className="text-xs"><SparklesIcon className="h-4 w-4" /> Gerar conteúdo</GhostButton>
            <GhostButton className="text-xs"><ShuffleIcon className="h-4 w-4" /> Refinar tema</GhostButton>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
            <input className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted" placeholder="Pergunte algo ao Orquestrador..." />
            <button className="grid h-8 w-8 place-items-center rounded-lg bg-purple text-white" aria-label="Enviar">
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* Kanban */}
        <section className="duofy-card rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold tracking-[-0.02em] text-ink">Kanban de Pesquisas</h2>
            <button className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-purple">
              <FilterIcon className="h-4 w-4" /> Filtrar
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {columns.map((col) => {
              const cards = researchCards.filter((c) => c.column === col.id)
              return (
                <div key={col.id} className="flex flex-col">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <span className="text-sm font-semibold text-ink">{col.label}</span>
                    <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-line/70 px-1 text-xs font-semibold text-muted">{cards.length}</span>
                  </div>
                  <div className="space-y-3">
                    {cards.map((card) => {
                      const active = selected === card.id
                      return (
                        <button
                          key={card.id}
                          onClick={() => setSelected(card.id)}
                          className={`w-full rounded-xl border bg-white p-3.5 text-left transition ${active ? "border-purple shadow-soft ring-1 ring-purple/30" : "border-line hover:border-purple/40"}`}
                        >
                          <p className="text-sm font-semibold leading-snug text-ink">{card.title}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {card.tags.map((t) => (
                              <Badge key={t.label} tone={t.tone}>{t.label}</Badge>
                            ))}
                          </div>
                          <p className="mt-2.5 text-xs text-muted">Fonte: {card.source}</p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-ink">{card.owner}</span>
                            <span className="text-xs text-muted">{card.date}</span>
                          </div>
                          <div className="mt-2.5 border-t border-line pt-2">
                            <span className={`text-xs font-semibold ${card.guardian.tone === "green" ? "text-green" : "text-amber"}`}>◈ {card.guardian.label}</span>
                          </div>
                        </button>
                      )
                    })}
                    <button className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2.5 text-xs font-medium text-muted transition hover:border-purple/40 hover:text-purple">
                      <PlusIcon className="h-4 w-4" /> Adicionar pesquisa
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Detalhe */}
        <section className="duofy-card flex flex-col rounded-2xl p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold leading-snug tracking-[-0.02em] text-ink">{researchDetail.title}</h2>
            <button className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-purple-soft hover:text-purple" aria-label="Fechar">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" /></svg>
            </button>
          </div>
          <p className="text-xs text-muted">Fonte: {researchDetail.source} · Criada em {researchDetail.createdAt} por {researchDetail.author}</p>

          <div className="mt-4 flex items-center gap-5 border-b border-line">
            {(["Resumo", "Insights", "Anexos"] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`relative -mb-px pb-2.5 text-sm font-semibold transition ${activeTab === tab ? "text-purple" : "text-muted hover:text-ink"}`}>
                {tab}
                {activeTab === tab ? <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-purple" /> : null}
              </button>
            ))}
          </div>

          <div className="mt-4 flex-1">
            <p className="text-sm leading-relaxed text-ink/80">{researchDetail.summary}</p>
            <dl className="mt-4 space-y-2.5">
              {researchDetail.meta.map((m) => (
                <div key={m.label} className="flex gap-2 text-sm">
                  <dt className="font-semibold text-ink">{m.label}:</dt>
                  <dd className="text-muted">{m.value}</dd>
                </div>
              ))}
            </dl>
            <button className="mt-4 flex items-center gap-1 text-sm font-semibold text-purple">
              Ver mais detalhes
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" strokeLinecap="round" /></svg>
            </button>
          </div>

          <div className="mt-4 space-y-2.5">
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-green py-3 text-sm font-semibold text-white transition hover:brightness-105">
              <CheckCircleIcon className="h-5 w-5" /> Aprovar
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <GhostButton className="justify-center"><SettingsIcon className="h-4 w-4" /> Solicitar ajuste</GhostButton>
              <GhostButton className="justify-center"><BookIcon className="h-4 w-4" /> Salvar na memória</GhostButton>
            </div>
          </div>
        </section>
      </div>

      {/* Cocriação contextual */}
      <section className="duofy-card rounded-2xl p-5">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Cocriação contextual</h2>
          <Badge tone="purple">Baseada na pesquisa selecionada</Badge>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {[
            { label: "Marca", value: "Duofy" },
            { label: "Canal", value: "Instagram" },
            { label: "Tipo de entrega", value: "Carrossel" },
            { label: "Objetivo", value: "Engajamento" }
          ].map((f) => (
            <label key={f.label} className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted">{f.label}</span>
              <div className="flex h-10 min-w-[150px] items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink">
                {f.value}
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" strokeLinecap="round" /></svg>
              </div>
            </label>
          ))}
          <button className="ml-auto flex h-10 items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 text-sm font-medium text-muted hover:text-purple">
            <ShuffleIcon className="h-4 w-4" /> Redefinir filtros
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[200px_minmax(0,1fr)_300px]">
          <div className="space-y-2.5">
            {formatRules.map((f) => {
              const Icon = formatIcons[f.icon] ?? FileIcon
              const active = f.format === activeFormat
              return (
                <button key={f.format} onClick={() => setActiveFormat(f.format)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${active ? "border-purple bg-purple-soft/50" : "border-line bg-white hover:border-purple/40"}`}>
                  <span className={`grid h-9 w-9 place-items-center rounded-lg ${active ? "bg-purple text-white" : "bg-purple-soft text-purple"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{f.format}</span>
                    <span className="block text-xs text-muted">{formatSub[f.format]}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <AngleCard icon={<TargetIcon className="h-4 w-4" />} title="a) Ângulo estratégico" text={cocriacaoAngles.strategic} />
              <AngleCard icon={<UsersIcon className="h-4 w-4" />} title="b) Persona utilizada" text={cocriacaoAngles.persona} />
              <AngleCard icon={<FileIcon className="h-4 w-4" />} title="c) Legenda sugerida" text={cocriacaoAngles.legend} />
              <AngleCard icon={<SparklesIcon className="h-4 w-4" />} title="d) CTA e hashtags" text={`${cocriacaoAngles.cta} ${cocriacaoAngles.hashtags}`} />
            </div>

            <div className="rounded-xl border border-line bg-white">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="text-sm font-bold text-ink">Prompts refinados para geração externa</p>
                <button className="flex items-center gap-1.5 text-xs font-semibold text-purple"><CopyIcon className="h-4 w-4" /> Copiar todos</button>
              </div>
              <ul className="divide-y divide-line">
                {cocriacaoPrompts.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="w-32 shrink-0 text-sm font-semibold text-ink">{p.label}</span>
                    <span className="flex-1 text-sm text-muted">{p.text}</span>
                    <button className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line text-muted hover:text-purple" aria-label="Copiar"><CopyIcon className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-white p-4">
              <p className="mb-3 text-sm font-bold text-ink">Regras por formato</p>
              <ul className="space-y-3">
                {formatRules.map((f) => {
                  const Icon = formatIcons[f.icon] ?? FileIcon
                  return (
                    <li key={f.format} className="flex gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-soft text-purple"><Icon className="h-4 w-4" /></span>
                      <span>
                        <span className="block text-sm font-semibold text-ink">{f.format}</span>
                        <span className="block text-xs leading-snug text-muted">{f.text}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="rounded-xl border border-line bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheckIcon className="h-5 w-5 text-purple" />
                <p className="text-sm font-bold text-ink">Guardião</p>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-extrabold leading-none text-green">{operationsGuardian.score}</span>
                <span className="pb-1 text-sm text-muted">/100</span>
              </div>
              <p className="text-xs text-muted">Qualidade da entrega</p>
              <ul className="mt-3 space-y-2">
                {operationsGuardian.checklist.map((c) => (
                  <ChecklistRow key={c} label={c} state="done" />
                ))}
              </ul>
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber/10 p-2.5">
                <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
                <p className="text-xs text-ink"><span className="font-semibold">Sugestão:</span> {operationsGuardian.suggestion}.</p>
              </div>
              <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-purple py-2.5 text-sm font-semibold text-white transition hover:bg-purple-deep">
                Abrir revisão
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m0 0-6-6m6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <p className="mt-2 text-center text-[11px] text-muted">Última verificação: {operationsGuardian.lastCheck}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function AngleCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3.5">
      <p className="flex items-center gap-2 text-sm font-bold text-ink">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-purple-soft text-purple">{icon}</span>
        {title}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted">{text}</p>
    </div>
  )
}
