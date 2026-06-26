"use client"

import { useState } from "react"

import { Badge, GhostButton, StatCard } from "@/components/ui"
import {
  BookIcon,
  BookmarkIcon,
  ChevronDownIcon,
  ClockIcon,
  FileIcon,
  LayersIcon,
  MoreIcon,
  PencilIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  UploadIcon,
  UsersIcon
} from "@/components/icons"
import {
  memoryActivity,
  memoryCollections,
  memoryDetail,
  memoryDocs,
  memoryStats
} from "@/lib/mock"

const statIcons = [FileIcon, LayersIcon, ClockIcon, UsersIcon]
const activityIcons: Record<string, typeof FileIcon> = {
  upload: UploadIcon,
  edit: PencilIcon,
  search: SearchIcon,
  users: UsersIcon
}

export default function MemoryPage() {
  const [selected, setSelected] = useState("d1")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-[30px] font-extrabold tracking-[-0.04em] text-ink">
          <SparklesIcon className="h-7 w-7 text-purple" /> Memória
        </h1>
        <p className="mt-1 text-sm text-muted">Base de conhecimento confiável para agentes e para todo o time.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {memoryStats.map((s, i) => {
          const Icon = statIcons[i]
          return (
            <StatCard key={s.label} icon={<Icon className="h-5 w-5" />} iconTone={s.tone} label={s.label} value={s.value} delta={s.delta} hint={s.hint} />
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <section className="duofy-card rounded-2xl p-5">
            <h2 className="text-lg font-bold tracking-[-0.02em] text-ink">Biblioteca de memória</h2>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <div className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 text-muted">
                <SearchIcon className="h-4 w-4" />
                <input className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted" placeholder="Buscar documentos..." />
              </div>
              {["Tipo", "Marca", "Fonte"].map((f) => (
                <button key={f} className="flex h-10 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink">
                  {f} <ChevronDownIcon className="h-4 w-4 text-muted" />
                </button>
              ))}
              <GhostButton className="h-10">+ Filtros</GhostButton>
              <button className="grid h-10 w-10 place-items-center rounded-xl border border-line text-muted hover:text-purple"><RefreshIcon className="h-4 w-4" /></button>
              <button className="grid h-10 w-10 place-items-center rounded-xl border border-line text-muted hover:text-purple"><SettingsIcon className="h-4 w-4" /></button>
            </div>

            <div className="mt-4 overflow-x-auto duofy-scroll">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="py-2.5 pr-4">Documento</th>
                    <th className="py-2.5 pr-4">Tipo</th>
                    <th className="py-2.5 pr-4">Marca</th>
                    <th className="py-2.5 pr-4">Tags</th>
                    <th className="py-2.5 pr-4">Fonte</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {memoryDocs.map((d) => {
                    const active = selected === d.id
                    return (
                      <tr key={d.id} onClick={() => setSelected(d.id)} className={`cursor-pointer border-b border-line/70 last:border-0 ${active ? "bg-purple-soft/40" : "hover:bg-panel"}`}>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2.5">
                            <span className={`h-2 w-2 rounded-full ${active ? "bg-purple" : "bg-line"}`} />
                            <span className="grid h-7 w-7 place-items-center rounded-md bg-red/10 text-red"><FileIcon className="h-4 w-4" /></span>
                            <span className="font-semibold text-ink">{d.name}</span>
                            <span className="text-xs text-muted">{d.version}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted">{d.type}</td>
                        <td className="py-3 pr-4 text-muted">{d.brand}</td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-1">
                            {d.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} tone="slate">{tag}</Badge>
                            ))}
                            {d.tags.length > 2 ? <span className="text-xs text-muted">+{d.tags.length - 2}</span> : null}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted">{d.source}</td>
                        <td className="py-3 pr-4">
                          <Badge tone={d.status === "Indexado" ? "green" : "amber"}>{d.status}</Badge>
                        </td>
                        <td className="py-3"><MoreIcon className="h-4 w-4 text-muted" /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-muted">
              <span>Exibindo 1–7 de 1.248 documentos</span>
              <div className="flex items-center gap-1">
                {["1", "2", "3", "4", "5", "…", "178"].map((p) => (
                  <button key={p} className={`grid h-8 min-w-[32px] place-items-center rounded-lg px-2 text-xs font-semibold ${p === "1" ? "bg-purple text-white" : "border border-line text-muted hover:text-purple"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="duofy-card rounded-2xl p-5">
              <h3 className="text-base font-bold text-ink">Coleções e contexto</h3>
              <ul className="mt-4 space-y-4">
                {memoryCollections.map((c) => (
                  <li key={c.name} className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-soft text-purple"><LayersIcon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{c.name}</p>
                      <p className="text-xs text-muted">{c.desc}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink">{c.docs}</p>
                      <p className="text-xs text-green">↑ {c.delta}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <button className="mt-4 flex items-center gap-1 text-sm font-semibold text-purple">Ver todas as coleções →</button>
            </section>

            <section className="duofy-card rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-ink">Atividade recente</h3>
                <button className="text-sm font-semibold text-purple">Ver todas</button>
              </div>
              <ul className="mt-4 space-y-4">
                {memoryActivity.map((a, i) => {
                  const Icon = activityIcons[a.icon] ?? FileIcon
                  return (
                    <li key={i} className="flex items-start gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-soft text-purple"><Icon className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">{a.title}</p>
                        <p className="text-xs text-muted">{a.desc}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted">{a.time}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          </div>
        </div>

        {/* Painel de detalhe */}
        <aside className="duofy-card h-fit rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-red/10 text-red"><FileIcon className="h-5 w-5" /></span>
            <div className="flex-1">
              <p className="flex items-center gap-2 text-base font-bold text-ink">
                {memoryDetail.name} <Badge tone="purple">{memoryDetail.version}</Badge>
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-deep">
              <BookmarkIcon className="h-4 w-4" /> Usar como referência
            </button>
            <GhostButton className="px-3"><LayersIcon className="h-4 w-4" /> Ver chunks</GhostButton>
            <GhostButton className="px-3"><ClockIcon className="h-4 w-4" /> Versionar</GhostButton>
            <button className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted"><MoreIcon className="h-4 w-4" /></button>
          </div>

          <Section title="Metadados">
            <dl className="grid grid-cols-2 gap-y-2.5 text-sm">
              <Meta label="Tipo" value={memoryDetail.meta.tipo} />
              <Meta label="Criado em" value={memoryDetail.meta.criadoEm} />
              <Meta label="Fonte" value={memoryDetail.meta.fonte} />
              <Meta label="Atualizado em" value={memoryDetail.meta.atualizadoEm} />
              <Meta label="Tamanho" value={memoryDetail.meta.tamanho} />
              <Meta label="Idioma" value={memoryDetail.meta.idioma} />
            </dl>
          </Section>

          <Section title="Tags">
            <div className="flex flex-wrap gap-1.5">
              {memoryDetail.tags.map((t) => (
                <Badge key={t} tone="purple">{t}</Badge>
              ))}
            </div>
          </Section>

          <Section title="Permissões" action="Gerenciar">
            <p className="flex items-center gap-2 text-sm text-ink"><BookIcon className="h-4 w-4 text-muted" /> Privado para o workspace</p>
          </Section>

          <Section title="Histórico de versões" action="Ver todas">
            <ul className="space-y-2.5">
              {memoryDetail.versions.map((v) => (
                <li key={v.v} className="flex items-center gap-3 text-sm">
                  <span className="font-semibold text-ink">{v.v}</span>
                  {v.current ? <Badge tone="green">Atual</Badge> : null}
                  <span className="ml-auto text-xs text-muted">{v.at}</span>
                  <span className="text-xs font-medium text-ink">{v.by}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Permissões por agente" action="Ver todas">
            <ul className="space-y-2.5">
              {memoryDetail.agentPerms.map((p) => (
                <li key={p.agent} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{p.agent}</span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-green">
                    Pode usar
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-green/10"><svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m4 8 2.5 2.5L12 5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Prévia do conteúdo">
            <p className="text-sm leading-relaxed text-ink/80">{memoryDetail.preview}</p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>{memoryDetail.previewPages}</span>
              <button className="font-semibold text-purple">Ver prévia completa ↗</button>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-sm font-bold text-ink">{title}</p>
        {action ? <button className="text-xs font-semibold text-purple">{action}</button> : null}
      </div>
      {children}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  )
}
