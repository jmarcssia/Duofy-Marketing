"use client"

import { Fragment, type ReactNode } from "react"

/**
 * Renderizador Markdown leve, sem dependências externas, alinhado ao estilo Duofy.
 * Cobre o que os agentes produzem: títulos, negrito/itálico, código, links,
 * listas, tabelas, citações, linha horizontal e parágrafos.
 *
 * Seguro contra XSS: produz nós React (texto vira text node), nunca usa
 * dangerouslySetInnerHTML. URLs só são linkadas se http(s) ou mailto.
 */

function safeHref(url: string): string | null {
  const u = url.trim()
  if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) return u
  return null
}

// Parse inline: negrito, italico, codigo `code` e links [texto](url).
function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // Regex única alternando os padrões; processa na ordem de aparição.
  const pattern =
    /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const key = `${keyPrefix}-${i++}`
    if (m[2] !== undefined) nodes.push(<strong key={key} className="font-semibold text-ink">{m[2]}</strong>)
    else if (m[3] !== undefined) nodes.push(<strong key={key} className="font-semibold text-ink">{m[3]}</strong>)
    else if (m[4] !== undefined) nodes.push(<em key={key} className="italic">{m[4]}</em>)
    else if (m[5] !== undefined) nodes.push(<em key={key} className="italic">{m[5]}</em>)
    else if (m[6] !== undefined)
      nodes.push(
        <code key={key} className="rounded bg-purple-soft/70 px-1 py-0.5 font-mono text-[0.85em] text-purple-deep">
          {m[6]}
        </code>
      )
    else if (m[7] !== undefined && m[8] !== undefined) {
      const href = safeHref(m[8])
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" className="font-medium text-purple underline underline-offset-2 hover:text-purple-deep">
            {m[7]}
          </a>
        ) : (
          <span key={key}>{m[7]}</span>
        )
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  | { t: "quote"; text: string }
  | { t: "code"; text: string }
  | { t: "hr" }
  | { t: "table"; head: string[]; rows: string[][] }

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim())
}

function isTableSep(line: string): boolean {
  return /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-")
}

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0
  let para: string[] = []

  const flushPara = () => {
    if (para.length) {
      blocks.push({ t: "p", text: para.join(" ") })
      para = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // code fence
    if (trimmed.startsWith("```")) {
      flushPara()
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i])
        i++
      }
      i++ // skip closing fence
      blocks.push({ t: "code", text: buf.join("\n") })
      continue
    }

    // blank line
    if (trimmed === "") {
      flushPara()
      i++
      continue
    }

    // hr
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      flushPara()
      blocks.push({ t: "hr" })
      i++
      continue
    }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (h) {
      flushPara()
      blocks.push({ t: "h", level: h[1].length, text: h[2] })
      i++
      continue
    }

    // table: current line has |, next line is separator
    if (trimmed.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara()
      const head = splitRow(trimmed)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i].trim()))
        i++
      }
      blocks.push({ t: "table", head, rows })
      continue
    }

    // blockquote
    if (trimmed.startsWith(">")) {
      flushPara()
      const buf: string[] = []
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""))
        i++
      }
      blocks.push({ t: "quote", text: buf.join(" ") })
      continue
    }

    // unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      flushPara()
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ""))
        i++
      }
      blocks.push({ t: "ul", items })
      continue
    }

    // ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flushPara()
      const items: string[] = []
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""))
        i++
      }
      blocks.push({ t: "ol", items })
      continue
    }

    // paragraph accumulation
    para.push(trimmed)
    i++
  }
  flushPara()
  return blocks
}

const H_CLASS: Record<number, string> = {
  1: "mt-1 mb-2 text-lg font-extrabold tracking-[-0.02em] text-ink",
  2: "mt-3 mb-1.5 text-base font-bold tracking-[-0.01em] text-ink",
  3: "mt-3 mb-1 text-sm font-bold text-ink",
  4: "mt-2 mb-1 text-sm font-semibold text-ink",
  5: "mt-2 mb-1 text-xs font-semibold uppercase tracking-wide text-muted",
  6: "mt-2 mb-1 text-xs font-semibold uppercase tracking-wide text-muted"
}

export function Markdown({ content, className = "" }: { content: string; className?: string }) {
  if (!content?.trim()) return null
  const blocks = parseBlocks(content)
  return (
    <div className={`text-sm leading-relaxed text-ink/90 ${className}`}>
      {blocks.map((b, idx) => {
        const key = `b${idx}`
        switch (b.t) {
          case "h": {
            const Tag = (`h${Math.min(b.level, 6)}` as keyof JSX.IntrinsicElements)
            return (
              <Tag key={key} className={H_CLASS[b.level] ?? H_CLASS[6]}>
                {parseInline(b.text, key)}
              </Tag>
            )
          }
          case "p":
            return (
              <p key={key} className="my-2 first:mt-0">
                {parseInline(b.text, key)}
              </p>
            )
          case "ul":
            return (
              <ul key={key} className="my-2 ml-1 space-y-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-purple/60" />
                    <span>{parseInline(it, `${key}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            )
          case "ol":
            return (
              <ol key={key} className="my-2 ml-1 space-y-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="mt-px text-xs font-bold text-purple">{j + 1}.</span>
                    <span>{parseInline(it, `${key}-${j}`)}</span>
                  </li>
                ))}
              </ol>
            )
          case "quote":
            return (
              <blockquote key={key} className="my-2 border-l-2 border-purple/40 bg-purple-soft/30 px-3 py-1.5 text-ink/80">
                {parseInline(b.text, key)}
              </blockquote>
            )
          case "code":
            return (
              <pre key={key} className="duofy-scroll my-2 overflow-x-auto rounded-lg bg-ink/[0.04] p-3 font-mono text-[0.8rem] leading-relaxed text-ink">
                <code>{b.text}</code>
              </pre>
            )
          case "hr":
            return <hr key={key} className="my-3 border-line" />
          case "table":
            return (
              <div key={key} className="duofy-scroll my-2 overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-xs">
                  <thead className="bg-surface/60">
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j} className="border-b border-line px-3 py-2 text-left font-semibold text-ink">
                          {parseInline(h, `${key}-h${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r} className="border-b border-line last:border-0">
                        {row.map((c, j) => (
                          <td key={j} className="px-3 py-1.5 align-top text-ink/85">
                            {parseInline(c, `${key}-r${r}-${j}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          default:
            return <Fragment key={key} />
        }
      })}
    </div>
  )
}
