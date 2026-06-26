"use client"

import { useState } from "react"

import { Badge, GhostButton, Segmented, StatCard, type Tone } from "@/components/ui"
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  ExternalLinkIcon,
  MoveIcon,
  PencilIcon,
  PlusIcon,
  SheetIcon
} from "@/components/icons"
import {
  calendarDayDetail,
  calendarEvents,
  calendarKindMeta,
  calendarStats,
  importedThemes,
  type CalendarKind
} from "@/lib/mock"

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const statIcons = [CalendarIcon, ClockIcon, ClockIcon, CalendarIcon]

function buildMonthGrid() {
  // Maio/2025: 1º = quinta (getDay 4)
  const firstDay = 4
  const daysInMonth = 31
  const cells: { day: number; current: boolean }[] = []
  for (let i = 0; i < firstDay; i += 1) cells.push({ day: 27 + i, current: false })
  for (let d = 1; d <= daysInMonth; d += 1) cells.push({ day: d, current: true })
  let trailing = 1
  while (cells.length % 7 !== 0) cells.push({ day: trailing++, current: false })
  return cells
}

export default function CalendarPage() {
  const [view, setView] = useState<"mes" | "semana" | "agenda">("mes")
  const grid = buildMonthGrid()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-extrabold tracking-[-0.04em] text-ink">Calendário</h1>
          <p className="mt-1 text-sm text-muted">Organize sua agenda editorial e operacional conectada à cocriação e aos planos importados.</p>
        </div>
        <div className="flex gap-2.5">
          <GhostButton><CalendarIcon className="h-4 w-4" /> Importar calendário externo</GhostButton>
          <button className="inline-flex items-center gap-2 rounded-xl bg-purple px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple/20 transition hover:bg-purple-deep">
            <PlusIcon className="h-4 w-4" /> Nova publicação
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {calendarStats.map((s, i) => {
          const Icon = statIcons[i]
          return (
            <StatCard key={s.label} icon={<Icon className="h-5 w-5" />} iconTone={s.tone} label={s.label} value={s.value} delta={s.delta} deltaDir={s.dir} />
          )
        })}
      </div>

      <div className="duofy-card flex flex-wrap items-end gap-3 rounded-2xl p-4">
        {["Marca", "Canal", "Formato", "Responsável", "Status"].map((f, i) => (
          <label key={f} className="flex min-w-[150px] flex-1 flex-col gap-1">
            <span className="text-xs font-semibold text-muted">{f}</span>
            <div className="flex h-10 items-center justify-between rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink">
              {i === 0 ? "Duofy" : "Todos"}
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" strokeLinecap="round" /></svg>
            </div>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="duofy-card rounded-2xl p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { id: "mes", label: "Mês" },
                { id: "semana", label: "Semana" },
                { id: "agenda", label: "Agenda" }
              ]}
            />
            <div className="flex items-center gap-2">
              <button className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:text-purple"><ChevronLeftIcon className="h-4 w-4" /></button>
              <span className="min-w-[130px] text-center text-base font-bold text-ink">Maio de 2025</span>
              <button className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:text-purple"><ChevronRightIcon className="h-4 w-4" /></button>
            </div>
            <GhostButton>Hoje</GhostButton>
          </div>

          <div className="grid grid-cols-7 border-b border-line pb-2 text-center text-xs font-semibold text-muted">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((cell, i) => {
              const events = cell.current ? calendarEvents[cell.day] ?? [] : []
              const isToday = cell.current && cell.day === 15
              return (
                <div key={i} className="min-h-[92px] border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0">
                  <span className={`inline-grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${isToday ? "bg-purple text-white" : cell.current ? "text-ink" : "text-muted/40"}`}>
                    {cell.day}
                  </span>
                  <div className="mt-1 space-y-1">
                    {events.map((kind: CalendarKind, idx) => {
                      const meta = calendarKindMeta[kind]
                      return (
                        <div key={idx} className={`truncate rounded-md px-1.5 py-1 text-[11px] font-semibold ${toneBg(meta.tone)}`}>
                          {meta.label}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <div className="space-y-5">
          <section className="duofy-card rounded-2xl p-5">
            <h3 className="text-base font-bold text-ink">Importar calendário externo</h3>
            <p className="mt-1 text-xs text-muted">Importe seus planos e tópicos para alimentar o Banco de temas e organize no calendário.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: "Importar via", name: "Excel", sub: ".xlsx" },
                { label: "Importar via", name: "Google Planilhas", sub: "Google Sheets" }
              ].map((opt) => (
                <button key={opt.name} className="flex flex-col items-start gap-2 rounded-xl border border-line bg-white p-3 text-left transition hover:border-purple/40">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-green/10 text-green"><SheetIcon className="h-5 w-5" /></span>
                  <span className="text-xs text-muted">{opt.label}</span>
                  <span className="text-sm font-bold text-ink">{opt.name}</span>
                  <span className="text-[11px] text-muted">{opt.sub}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 rounded-lg bg-purple-soft/60 p-2.5 text-[11px] text-ink/70">
              Os tópicos importados serão adicionados ao Banco de temas, de onde você pode arrastar para o calendário e agendar publicações.
            </p>
          </section>

          <section className="duofy-card rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">{calendarDayDetail.day}</h3>
              <Badge tone="purple">{calendarDayDetail.items.length} itens</Badge>
            </div>
            <ul className="mt-3 space-y-3">
              {calendarDayDetail.items.map((item) => (
                <li key={item.time} className="flex items-start gap-3">
                  <span className="w-12 shrink-0 text-xs font-semibold text-muted">{item.time}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink">{item.title}</span>
                    <span className="block text-xs text-muted">{item.owner}</span>
                  </span>
                  <span className={`text-xs font-semibold ${toneText(item.tone)}`}>{item.status}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <GhostButton className="text-xs"><PencilIcon className="h-4 w-4" /> Editar</GhostButton>
              <GhostButton className="text-xs"><MoveIcon className="h-4 w-4" /> Mover</GhostButton>
              <GhostButton className="text-xs"><CopyIcon className="h-4 w-4" /> Duplicar</GhostButton>
            </div>
            <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-purple py-2.5 text-sm font-semibold text-white transition hover:bg-purple-deep">
              Abrir na cocriação <ExternalLinkIcon className="h-4 w-4" />
            </button>
          </section>

          <section className="duofy-card rounded-2xl p-5">
            <h3 className="text-base font-bold text-ink">Relacionada à cocriação</h3>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div><dt className="text-xs font-semibold text-muted">Objetivo</dt><dd className="text-ink">{calendarDayDetail.cocriacao.objetivo}</dd></div>
              <div><dt className="text-xs font-semibold text-muted">Persona</dt><dd className="text-ink">{calendarDayDetail.cocriacao.persona}</dd></div>
              <div><dt className="text-xs font-semibold text-muted">Legenda sugerida</dt><dd className="text-ink">{calendarDayDetail.cocriacao.legenda}</dd></div>
              <div><dt className="text-xs font-semibold text-muted">Prompt do conteúdo</dt><dd className="rounded-lg bg-purple-soft/50 p-2.5 text-xs text-ink/80">{calendarDayDetail.cocriacao.prompt}</dd></div>
            </dl>
            <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-sm font-semibold text-purple transition hover:bg-purple-soft">
              Abrir na cocriação <ExternalLinkIcon className="h-4 w-4" />
            </button>
          </section>
        </div>
      </div>

      <section className="duofy-card rounded-2xl p-5">
        <h3 className="text-base font-bold text-ink">Banco de temas importados</h3>
        <p className="mt-1 text-xs text-muted">Arraste os temas para o calendário para agendar publicações.</p>
        <div className="mt-4 overflow-x-auto duofy-scroll">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="py-2.5 pr-4 font-semibold">Tema</th>
                <th className="py-2.5 pr-4 font-semibold">Canal sugerido</th>
                <th className="py-2.5 pr-4 font-semibold">Formato</th>
                <th className="py-2.5 pr-4 font-semibold">Prioridade</th>
                <th className="py-2.5 pr-4 font-semibold">Origem</th>
                <th className="py-2.5 pr-4 font-semibold">Importado em</th>
                <th className="py-2.5 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {importedThemes.map((t) => (
                <tr key={t.theme} className="border-b border-line/70 last:border-0">
                  <td className="py-3 pr-4 font-medium text-ink">{t.theme}</td>
                  <td className="py-3 pr-4 text-muted">{t.channel}</td>
                  <td className="py-3 pr-4 text-muted">{t.format}</td>
                  <td className="py-3 pr-4"><Badge tone={t.priorityTone}>{t.priority}</Badge></td>
                  <td className="py-3 pr-4 text-muted">{t.origin}</td>
                  <td className="py-3 pr-4 text-muted">{t.importedAt}</td>
                  <td className="py-3">
                    <button className="grid h-7 w-7 place-items-center rounded-lg border border-line text-muted hover:text-purple"><PlusIcon className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function toneBg(tone: Tone) {
  const map: Partial<Record<Tone, string>> = {
    pink: "bg-pink/10 text-pink",
    green: "bg-green/10 text-green",
    blue: "bg-blue/10 text-blue",
    amber: "bg-amber/10 text-amber",
    purple: "bg-purple-soft text-purple-deep",
    orange: "bg-orange/10 text-orange"
  }
  return map[tone] ?? "bg-purple-soft text-purple-deep"
}

function toneText(tone: Tone) {
  const map: Partial<Record<Tone, string>> = {
    green: "text-green",
    orange: "text-orange",
    purple: "text-purple",
    amber: "text-amber"
  }
  return map[tone] ?? "text-muted"
}
