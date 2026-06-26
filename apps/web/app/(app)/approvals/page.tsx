"use client"

import { useState } from "react"

import { Avatar, Badge, ChecklistRow, GhostButton, Tabs } from "@/components/ui"
import {
  AlertTriangleIcon,
  BookIcon,
  CheckCircleIcon,
  FilterIcon,
  MoreIcon,
  SendIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon
} from "@/components/icons"
import { reviewDetail, reviewQueue } from "@/lib/mock"
import type { Tone } from "@/components/ui"

const TOOLBAR = ["B", "I", "U", "S"]

function chTone(tone: Tone) {
  const map: Partial<Record<Tone, string>> = {
    pink: "bg-pink/10 text-pink",
    purple: "bg-purple-soft text-purple",
    blue: "bg-blue/10 text-blue",
    red: "bg-red/10 text-red"
  }
  return map[tone] ?? "bg-purple-soft text-purple"
}

export default function ReviewPage() {
  const [tab, setTab] = useState<"todos" | "pesquisas" | "conteudos">("todos")
  const [selected, setSelected] = useState("rv1")

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-[30px] font-extrabold tracking-[-0.04em] text-ink">
          <ShieldCheckIcon className="h-7 w-7 text-purple" /> Revisão
        </h1>
        <p className="mt-1 text-sm text-muted">Revise e aprove os outputs gerados pelos agentes antes de enviá-los para a Memória ou para as Operações.</p>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "todos", label: "Todos" },
          { id: "pesquisas", label: "Pesquisas" },
          { id: "conteudos", label: "Conteúdos" }
        ]}
      />

      <div className="duofy-card flex flex-wrap items-end gap-3 rounded-2xl p-4">
        {["Marca", "Agente", "Status", "Responsável", "Data"].map((f) => (
          <label key={f} className="flex min-w-[150px] flex-1 flex-col gap-1">
            <span className="text-xs font-semibold text-muted">{f}</span>
            <div className="flex h-10 items-center justify-between rounded-xl border border-line bg-white px-3 text-sm font-medium text-muted">
              {f === "Marca" ? "Todas as marcas" : f === "Agente" ? "Todos os agentes" : f === "Status" ? "Todos os status" : f === "Responsável" ? "Todos os responsáveis" : "Período"}
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" strokeLinecap="round" /></svg>
            </div>
          </label>
        ))}
        <button className="flex h-10 items-center gap-1.5 text-sm font-medium text-muted hover:text-purple"><FilterIcon className="h-4 w-4" /> Limpar filtros</button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)_316px]">
        {/* Fila */}
        <section className="duofy-card h-fit rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-base font-bold text-ink">Fila de revisão</h2>
            <Badge tone="purple">12 itens</Badge>
          </div>
          <ul className="space-y-2.5">
            {reviewQueue.map((item) => {
              const active = selected === item.id
              return (
                <li key={item.id}>
                  <button onClick={() => setSelected(item.id)} className={`w-full rounded-xl border p-3 text-left transition ${active ? "border-purple bg-purple-soft/40 ring-1 ring-purple/20" : "border-line hover:border-purple/40"}`}>
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md ${chTone(item.channelTone)}`}>
                        <BookIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-ink">{item.title}</p>
                        <p className="text-xs text-muted">{item.kind}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Avatar name={item.owner} size={18} />
                          <span className="text-xs text-muted">{item.owner}</span>
                          <Badge tone={item.statusTone} className="ml-auto">{item.status}</Badge>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          <button className="mt-3 w-full rounded-xl border border-line py-2.5 text-sm font-semibold text-purple hover:bg-purple-soft">Ver mais itens ⌄</button>
        </section>

        {/* Editor */}
        <section className="duofy-card rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-[-0.02em] text-ink">
              <ShieldCheckIcon className="h-5 w-5 text-purple" /> {reviewDetail.title}
              <Badge tone="pink">{reviewDetail.kind}</Badge>
            </h2>
            <button className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-purple-soft hover:text-purple"><MoreIcon className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <Meta label="Responsável" value={reviewDetail.owner} avatar />
            <Meta label="Agente" value={reviewDetail.agent} />
            <Meta label="Marca" value={reviewDetail.brand} />
            <Meta label="Criado em" value={reviewDetail.createdAt} />
            <Meta label="Atualizado em" value={reviewDetail.updatedAt} />
            <Meta label="ID" value={reviewDetail.id} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-panel p-1.5">
            <button className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink hover:bg-white">Parágrafo <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg></button>
            <span className="mx-1 h-5 w-px bg-line" />
            {TOOLBAR.map((b) => (
              <button key={b} className="grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-ink hover:bg-white">{b}</button>
            ))}
            <span className="mx-1 h-5 w-px bg-line" />
            {["≡", "•", "“", "↺", "↻"].map((b, i) => (
              <button key={i} className="grid h-8 w-8 place-items-center rounded-lg text-sm text-muted hover:bg-white">{b}</button>
            ))}
          </div>

          <div className="mt-4 space-y-4">
            {reviewDetail.body.map((block, i) => (
              <div key={i}>
                <h3 className="text-base font-bold text-ink">{block.h}</h3>
                {block.p ? <p className="mt-1.5 text-sm leading-relaxed text-ink/80">{block.p}</p> : null}
                {block.list ? (
                  <ul className="mt-1.5 space-y-1.5 text-sm text-ink/80">
                    {block.list.map((li) => (
                      <li key={li} className="flex items-start gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink/50" />{li}</li>
                    ))}
                  </ul>
                ) : null}
                {i === 0 ? (
                  <Suggestion text="Adicionar exemplo de gancho para aumentar a aplicabilidade." />
                ) : null}
                {i === 2 ? (
                  <Suggestion text="Recomendar horários sugeridos com base em dados da marca." />
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-line p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-ink">Histórico de versões <span className="ml-1 text-xs font-normal text-muted">3 versões</span></p>
              <span className="flex items-center gap-2 text-xs font-medium text-muted">Comparar versões <span className="grid h-5 w-9 items-center rounded-full bg-purple p-0.5"><span className="h-4 w-4 translate-x-4 rounded-full bg-white transition" /></span></span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-green/5 p-3">
                <p className="text-xs font-semibold text-ink">Versão atual ({reviewDetail.versionDiff.current.v})</p>
                <p className="text-xs text-muted">{reviewDetail.versionDiff.current.at} · {reviewDetail.versionDiff.current.by}</p>
                <p className="mt-2 text-sm text-green">• {reviewDetail.versionDiff.current.line}</p>
              </div>
              <div className="rounded-lg bg-red/5 p-3">
                <p className="text-xs font-semibold text-ink">Versão anterior ({reviewDetail.versionDiff.previous.v})</p>
                <p className="text-xs text-muted">{reviewDetail.versionDiff.previous.at} · {reviewDetail.versionDiff.previous.by}</p>
                <p className="mt-2 text-sm text-red line-through">• {reviewDetail.versionDiff.previous.line}</p>
              </div>
            </div>
            <div className="mt-3 flex justify-center">
              <GhostButton className="text-xs">↺ Ver todas as versões</GhostButton>
            </div>
          </div>
        </section>

        {/* Guardião */}
        <aside className="duofy-card h-fit rounded-2xl p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink"><ShieldCheckIcon className="h-5 w-5 text-purple" /> Guardião</h2>
          <p className="mt-4 text-sm font-semibold text-muted">Pontuação de qualidade</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-3xl font-extrabold text-ink">{reviewDetail.guardian.score}</span>
            <span className="text-sm text-muted">/100</span>
            <Badge tone="green" className="ml-1">{reviewDetail.guardian.label}</Badge>
          </div>

          <div className="mt-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">Pontos de atenção <Badge tone="amber">{reviewDetail.guardian.attention.length}</Badge></p>
            <ul className="space-y-2">
              {reviewDetail.guardian.attention.map((a) => (
                <li key={a} className="flex items-start gap-2 text-sm text-ink/80"><AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" />{a}</li>
              ))}
            </ul>
            <button className="mt-2 text-xs font-semibold text-purple">Ver todos (2)</button>
          </div>

          <div className="mt-4 rounded-xl bg-green/5 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><SparklesIcon className="h-4 w-4 text-green" /> Recomendação do Guardião</p>
            <p className="mt-1 text-xs text-muted">Ajustes sugeridos aumentam a clareza e a aplicabilidade do conteúdo.</p>
            <button className="mt-2 text-xs font-semibold text-purple">› Ver detalhes da análise</button>
          </div>

          <div className="mt-4 space-y-2.5">
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-green py-3 text-sm font-semibold text-white transition hover:brightness-105"><CheckCircleIcon className="h-5 w-5" /> Aprovar</button>
            <GhostButton className="w-full justify-center"><SettingsIcon className="h-4 w-4" /> Solicitar ajuste</GhostButton>
            <GhostButton className="w-full justify-center"><SendIcon className="h-4 w-4" /> Enviar ao Orquestrador</GhostButton>
            <GhostButton className="w-full justify-center"><BookIcon className="h-4 w-4" /> Publicar na memória</GhostButton>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2.5 text-sm font-bold text-ink">Checklist de verificação</p>
            <ul className="space-y-2">
              {reviewDetail.guardian.checklist.map((c) => (
                <ChecklistRow key={c} label={c} state="done" />
              ))}
            </ul>
          </div>
          <p className="mt-4 text-center text-[11px] text-muted">Ações registradas no histórico de auditoria.</p>
        </aside>
      </div>
    </div>
  )
}

function Meta({ label, value, avatar }: { label: string; value: string; avatar?: boolean }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className="flex items-center gap-1.5 font-semibold text-ink">
        {avatar ? <Avatar name={value} size={18} /> : null}
        {value}
      </p>
    </div>
  )
}

function Suggestion({ text }: { text: string }) {
  return (
    <div className="mt-2 rounded-lg border border-purple/20 bg-purple-soft/40 p-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-purple"><SparklesIcon className="h-4 w-4" /> Sugestão do Guardião</p>
      <p className="mt-1 text-xs text-ink/80">{text}</p>
      <button className="mt-1.5 text-xs font-semibold text-purple">› Aplicar sugestão</button>
    </div>
  )
}
