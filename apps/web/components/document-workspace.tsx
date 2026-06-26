"use client"

import type { ReactNode } from "react"

import { EmptyState, SoftButton } from "@/components/page-primitives"

export type ExportFormat = "pdf" | "docx" | "md" | "html"
export type WorkspaceMode = "preview" | "edit"

export type MetadataItem = {
  label: string
  value: ReactNode
}

export type TimelineItem = {
  id: number | string
  title: string
  subtitle?: string | null
  active?: boolean
  onClick?: () => void
}

export type CompareLine = {
  change_type: "added" | "removed" | "unchanged"
  old_line_number: number | null
  new_line_number: number | null
  content: string
}

export type WorkspaceComment = {
  id: number
  author?: string | null
  anchor?: string | null
  selectedText?: string | null
  comment: string
  status: string
  createdAt: string
  onResolve?: () => void
}

export function DocumentWorkspace({
  sidebar,
  title,
  subtitle,
  toolbar,
  children,
  inspector
}: {
  sidebar: ReactNode
  title: string
  subtitle?: string
  toolbar?: ReactNode
  children: ReactNode
  inspector: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-line bg-[#f6f6fb] shadow-[0_28px_80px_rgba(18,20,30,0.08)]">
      <div className="grid min-h-[760px] xl:grid-cols-[330px_minmax(0,1fr)_330px]">
        <aside className="border-b border-line bg-white/94 p-5 xl:border-b-0 xl:border-r">
          {sidebar}
        </aside>
        <main className="min-w-0 bg-[radial-gradient(circle_at_20%_0%,rgba(109,53,238,0.08),transparent_34%),linear-gradient(180deg,#fbfbff_0%,#f3f4f8_100%)]">
          <div className="sticky top-[86px] z-10 border-b border-line bg-white/86 px-5 py-4 backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-extrabold tracking-[-0.04em] text-ink">{title}</h2>
                {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
              </div>
              {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
            </div>
          </div>
          <div className="p-5 md:p-8">{children}</div>
        </main>
        <aside className="border-t border-line bg-white/94 p-5 xl:border-l xl:border-t-0">
          {inspector}
        </aside>
      </div>
    </section>
  )
}

export function WorkspaceList({
  title,
  action,
  children
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-muted">{title}</h3>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

export function WorkspaceListItem({
  active,
  title,
  meta,
  excerpt,
  badge,
  onClick
}: {
  active?: boolean
  title: string
  meta?: string
  excerpt?: string
  badge?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        active
          ? "border-purple bg-purple-soft shadow-[0_14px_40px_rgba(109,53,238,0.12)]"
          : "border-line bg-white hover:border-purple/40 hover:shadow-[0_12px_34px_rgba(18,20,30,0.06)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <strong className="line-clamp-2 text-[15px] leading-5 tracking-[-0.02em]">{title}</strong>
        {badge ? (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-purple">
            {badge}
          </span>
        ) : null}
      </div>
      {meta ? <p className="mt-2 text-xs font-semibold text-muted">{meta}</p> : null}
      {excerpt ? <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted">{excerpt}</p> : null}
    </button>
  )
}

export function ModeToggle({
  mode,
  onChange
}: {
  mode: WorkspaceMode
  onChange: (mode: WorkspaceMode) => void
}) {
  return (
    <div className="flex rounded-xl border border-line bg-white p-1">
      {(["preview", "edit"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
            mode === item ? "bg-purple text-white shadow-lg shadow-purple/20" : "text-muted hover:text-ink"
          }`}
        >
          {item === "preview" ? "Prévia" : "Editar"}
        </button>
      ))}
    </div>
  )
}

export function ExportMenu({
  disabled,
  onExport
}: {
  disabled?: boolean
  onExport: (format: ExportFormat) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-white p-1">
      {(["pdf", "docx", "md", "html"] as const).map((format) => (
        <button
          key={format}
          type="button"
          disabled={disabled}
          onClick={() => onExport(format)}
          className="rounded-lg px-3 py-2 text-xs font-extrabold uppercase tracking-[0.08em] text-ink transition hover:bg-purple-soft hover:text-purple disabled:cursor-not-allowed disabled:opacity-50"
        >
          {format}
        </button>
      ))}
    </div>
  )
}

export function DocumentEditor({
  value,
  onChange,
  placeholder = "Edite o documento em Markdown..."
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="duofy-focus min-h-[640px] w-full resize-y rounded-[24px] border border-line bg-[#0f1220] px-6 py-5 font-mono text-[13px] leading-7 text-white shadow-[0_24px_70px_rgba(18,20,30,0.18)] placeholder:text-white/40"
    />
  )
}

export function DocumentPreview({
  title,
  subtitle,
  content,
  documentType = "editorial_document",
  qualityNotes = [],
  emptyTitle = "Sem documento selecionado",
  emptyDescription = "Selecione ou gere uma entrega para visualizar."
}: {
  title?: string
  subtitle?: string
  content?: string
  documentType?: string
  qualityNotes?: string[]
  emptyTitle?: string
  emptyDescription?: string
}) {
  if (!content?.trim()) {
    return (
      <div className="mx-auto max-w-[860px]">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    )
  }

  return (
    <article className="mx-auto min-h-[680px] max-w-[880px] rounded-[30px] border border-line bg-white px-8 py-9 shadow-[0_30px_90px_rgba(18,20,30,0.10)] md:px-12 md:py-12">
      <div className={`mb-9 rounded-[26px] border border-line px-6 py-6 ${coverClass(documentType)}`}>
        <div className="mb-4 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-gradient-to-br from-orange to-purple" />
          <span className="text-sm font-extrabold tracking-[-0.04em] text-ink">Duofy</span>
          <span className="ml-auto rounded-full bg-white/80 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-purple">
            {documentTypeLabel(documentType)}
          </span>
        </div>
        {title ? (
          <h1 className="text-[34px] font-black leading-[1.05] tracking-[-0.06em] text-ink md:text-[44px]">
            {title}
          </h1>
        ) : null}
        {subtitle ? <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted">{subtitle}</p> : null}
      </div>
      {qualityNotes.length > 0 ? (
        <div className="mb-8 grid gap-3 md:grid-cols-2">
          {qualityNotes.slice(0, 4).map((note) => (
            <div key={note} className="rounded-2xl border border-purple/15 bg-purple-soft px-4 py-3">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-purple">Qualidade</p>
              <p className="mt-1 text-sm leading-6 text-ink">{note}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="space-y-4">{renderDocumentBlocks(content, documentType)}</div>
    </article>
  )
}

export function MetadataInspector({ title = "Informações", items }: { title?: string; items: MetadataItem[] }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-muted">{title}</h3>
      <dl className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
            <dt className="text-muted">{item.label}</dt>
            <dd className="min-w-0 font-semibold text-ink">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function VersionTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-muted">Versões</h3>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted">Sem versões.</p>
        ) : null}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className={`rounded-2xl border p-4 ${
              item.active ? "border-purple bg-purple-soft" : "border-line bg-white"
            } w-full text-left transition hover:border-purple/40 disabled:cursor-default`}
            disabled={!item.onClick}
          >
            <strong className="text-sm">{item.title}</strong>
            {item.subtitle ? <p className="mt-1 text-xs leading-5 text-muted">{item.subtitle}</p> : null}
          </button>
        ))}
      </div>
    </section>
  )
}

export function VersionCompareView({
  title,
  subtitle,
  lines
}: {
  title: string
  subtitle?: string
  lines: CompareLine[]
}) {
  return (
    <article className="mx-auto min-h-[680px] max-w-[980px] rounded-[30px] border border-line bg-white p-6 shadow-[0_30px_90px_rgba(18,20,30,0.10)]">
      <div className="mb-5 rounded-[24px] border border-line bg-[#fbfbfd] px-5 py-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-purple">Comparação de versões</p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.05em] text-ink">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-[#101322] font-mono text-[12px] leading-6">
        {lines.length === 0 ? <p className="p-5 text-white/60">Nenhuma diferença encontrada.</p> : null}
        {lines.map((line, index) => {
          const colors = {
            added: "border-green/20 bg-green/15 text-green",
            removed: "border-red/20 bg-red/15 text-red",
            unchanged: "border-white/5 bg-transparent text-white/72"
          }
          const prefix = line.change_type === "added" ? "+" : line.change_type === "removed" ? "-" : " "
          return (
            <div key={`${index}-${line.change_type}`} className={`grid grid-cols-[74px_1fr] border-b px-3 py-1 ${colors[line.change_type]}`}>
              <span className="select-none text-white/35">
                {line.old_line_number ?? "-"} / {line.new_line_number ?? "-"}
              </span>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words">
                {prefix} {line.content || " "}
              </pre>
            </div>
          )
        })}
      </div>
    </article>
  )
}

export function CommentPanel({
  comments,
  draft,
  onDraftChange,
  onCreate,
  disabled
}: {
  comments: WorkspaceComment[]
  draft: string
  onDraftChange: (value: string) => void
  onCreate: () => void
  disabled?: boolean
}) {
  const openComments = comments.filter((comment) => comment.status !== "resolved")
  const resolvedComments = comments.filter((comment) => comment.status === "resolved")
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold uppercase tracking-[0.16em] text-muted">Comentários</h3>
        <span className="rounded-full bg-purple-soft px-2.5 py-1 text-xs font-bold text-purple">
          {openComments.length} abertos
        </span>
      </div>
      <textarea
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Registre um comentário editorial sobre o trecho ou versão atual."
        className="duofy-focus mt-4 min-h-24 w-full rounded-xl border border-line bg-white px-4 py-3 text-sm"
      />
      <button
        type="button"
        disabled={disabled || !draft.trim()}
        onClick={onCreate}
        className="mt-3 w-full rounded-xl bg-purple px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-purple/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Adicionar comentário
      </button>
      <div className="mt-5 space-y-3">
        {[...openComments, ...resolvedComments].map((item) => (
          <div
            key={item.id}
            className={`rounded-2xl border p-4 ${
              item.status === "resolved" ? "border-line bg-[#fbfbfd] opacity-75" : "border-orange/20 bg-orange/5"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <strong className="text-sm">{item.author ?? "Revisor"}</strong>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-muted">
                {item.status === "resolved" ? "Resolvido" : "Aberto"}
              </span>
            </div>
            {item.anchor ? <p className="mt-2 text-xs font-semibold text-purple">{item.anchor}</p> : null}
            {item.selectedText ? (
              <blockquote className="mt-2 rounded-xl border-l-4 border-purple bg-white px-3 py-2 text-xs leading-5 text-muted">
                {item.selectedText}
              </blockquote>
            ) : null}
            <p className="mt-3 text-sm leading-6 text-ink">{item.comment}</p>
            <p className="mt-2 text-[11px] font-semibold text-muted">{new Date(item.createdAt).toLocaleString("pt-BR")}</p>
            {item.status !== "resolved" && item.onResolve ? (
              <button
                type="button"
                onClick={item.onResolve}
                className="mt-3 text-xs font-extrabold uppercase tracking-[0.12em] text-purple"
              >
                Marcar como resolvido
              </button>
            ) : null}
          </div>
        ))}
        {comments.length === 0 ? <p className="text-sm text-muted">Nenhum comentário registrado.</p> : null}
      </div>
    </section>
  )
}

export function InspectorStack({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>
}

export function WorkspaceToolbarButton({
  children,
  disabled,
  onClick,
  variant = "soft"
}: {
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  variant?: "soft" | "primary" | "danger" | "success"
}) {
  if (variant === "soft") {
    return (
      <SoftButton type="button" disabled={disabled} onClick={onClick}>
        {children}
      </SoftButton>
    )
  }
  const colors = {
    primary: "bg-purple text-white shadow-lg shadow-purple/20",
    danger: "border border-red/30 bg-red/5 text-red",
    success: "border border-green/30 bg-green/5 text-green"
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${colors[variant]}`}
    >
      {children}
    </button>
  )
}

function renderDocumentBlocks(content: string, documentType: string) {
  const lines = content.split(/\r?\n/)
  const blocks: ReactNode[] = []
  let listItems: string[] = []
  let tableRows: string[][] = []

  function flushList(key: string) {
    if (listItems.length === 0) return
    blocks.push(
      <ul key={key} className="space-y-2 rounded-2xl bg-[#fbfbfd] px-5 py-4 text-[15px] leading-7 text-ink">
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`} className="flex gap-3">
            <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-purple" />
            <span>{stripInline(item)}</span>
          </li>
        ))}
      </ul>
    )
    listItems = []
  }

  function flushTable(key: string) {
    if (tableRows.length === 0) return
    const [header, ...rows] = tableRows
    blocks.push(
      <div key={key} className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_12px_34px_rgba(18,20,30,0.05)]">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-purple-soft text-purple">
            <tr>
              {header.map((cell) => (
                <th key={cell} className="px-4 py-3 font-extrabold">
                  {stripInline(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} className="border-t border-line">
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="px-4 py-3 leading-6 text-ink">
                    {stripInline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    tableRows = []
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim()
    const key = `line-${index}`
    if (!line) {
      flushList(`${key}-list`)
      flushTable(`${key}-table`)
      return
    }
    if (line === "---" || line === "***") {
      flushList(`${key}-list`)
      flushTable(`${key}-table`)
      blocks.push(<hr key={key} className="my-7 border-0 border-t border-line" />)
      return
    }
    if (isMarkdownTableRow(line)) {
      const cells = line.slice(1, -1).split("|").map((cell) => cell.trim())
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return
      flushList(`${key}-list`)
      tableRows.push(cells)
      return
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushTable(`${key}-table`)
      listItems.push(line.slice(2).trim())
      return
    }

    flushList(`${key}-list`)
    flushTable(`${key}-table`)

    if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={key} className="pt-3 text-xl font-extrabold tracking-[-0.04em] text-ink">
          {stripInline(line.slice(4))}
        </h3>
      )
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={key} className="pt-5 text-2xl font-black tracking-[-0.05em] text-ink">
          {stripInline(line.slice(3))}
        </h2>
      )
    } else if (line.startsWith("# ")) {
      blocks.push(
        <h2 key={key} className="pt-2 text-3xl font-black tracking-[-0.055em] text-ink">
          {stripInline(line.slice(2))}
        </h2>
      )
    } else if (/^slide\s*\d+/i.test(line) || /^#{1,3}\s*slide\s*\d+/i.test(line)) {
      blocks.push(
        <div key={key} className="rounded-[24px] border border-purple/20 bg-gradient-to-br from-purple-soft to-white px-5 py-5 shadow-[0_16px_40px_rgba(109,53,238,0.08)]">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-purple">Slide do carrossel</p>
          <p className="mt-2 text-lg font-black leading-6 tracking-[-0.04em] text-ink">{stripInline(line.replace(/^#{1,3}\s*/, ""))}</p>
        </div>
      )
    } else if (/^(prompt|cta|legenda|copy|hashtags|assunto|pre-header|preheader)/i.test(line)) {
      blocks.push(
        <div key={key} className="rounded-2xl border border-line bg-[#fbfbfd] px-5 py-4 shadow-[0_10px_30px_rgba(18,20,30,0.04)]">
          <p className="text-[15px] font-semibold leading-7 text-ink">{stripInline(line)}</p>
        </div>
      )
    } else if (/^(fato|interpretacao|interpretação|hipotese|hipótese|evidencia|evidência)/i.test(line)) {
      blocks.push(
        <div key={key} className="rounded-2xl border border-green/20 bg-green/5 px-5 py-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-green">Evidência</p>
          <p className="mt-2 text-[15px] leading-7 text-ink">{stripInline(line)}</p>
        </div>
      )
    } else if (line.startsWith(">")) {
      blocks.push(
        <blockquote key={key} className="rounded-r-2xl border-l-4 border-purple bg-purple-soft px-5 py-4 text-[15px] leading-7 text-ink">
          {stripInline(line.replace(/^>+\s*/, ""))}
        </blockquote>
      )
    } else {
      blocks.push(
        <p key={key} className={`text-[15px] leading-8 text-ink ${documentType === "linkedin_post" ? "max-w-2xl" : ""}`}>
          {stripInline(line)}
        </p>
      )
    }
  })
  flushList("final-list")
  flushTable("final-table")
  return blocks
}

function stripInline(value: string) {
  return value.replace(/\*\*/g, "").replace(/`/g, "")
}

function isMarkdownTableRow(line: string) {
  return line.startsWith("|") && line.endsWith("|") && line.split("|").length > 2
}

function documentTypeLabel(type: string) {
  const labels: Record<string, string> = {
    research_report: "Pesquisa",
    executive_report: "Relatório",
    carousel: "Carrossel",
    linkedin_post: "LinkedIn",
    instagram_post: "Instagram",
    email: "E-mail",
    blog_article: "Blog",
    webinar: "Webinar",
    reels_script: "Reels",
    campaign: "Campanha",
    visual_prompts: "Prompts"
  }
  return labels[type] ?? "Documento"
}

function coverClass(type: string) {
  if (type === "research_report" || type === "executive_report") {
    return "bg-[radial-gradient(circle_at_80%_20%,rgba(249,115,22,0.16),transparent_28%),linear-gradient(135deg,#ffffff,#f5f2ff)]"
  }
  if (type === "carousel" || type === "visual_prompts") {
    return "bg-[radial-gradient(circle_at_85%_20%,rgba(109,53,238,0.22),transparent_32%),linear-gradient(135deg,#ffffff,#fff7ed)]"
  }
  if (type === "linkedin_post" || type === "blog_article") {
    return "bg-[linear-gradient(135deg,#ffffff,#f8fafc)]"
  }
  return "bg-[linear-gradient(135deg,#ffffff,#fbfbfd)]"
}
