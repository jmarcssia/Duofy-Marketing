"use client"

import type { ReactNode } from "react"

export const CHART_COLORS = ["#6d35ee", "#8b5cf6", "#2563eb", "#0d9488", "#f97316", "#db2777", "#cbd0dd"]

/* ---------------- Donut ---------------- */

export function DonutChart({
  segments,
  size = 168,
  thickness = 26,
  centerTop,
  centerBottom
}: {
  segments: { label: string; value: number; color: string }[]
  size?: number
  thickness?: number
  centerTop?: ReactNode
  centerBottom?: ReactNode
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1
  const radius = (size - thickness) / 2
  const circ = 2 * Math.PI * radius
  let acc = 0
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#f0eef6" strokeWidth={thickness} fill="none" />
        {segments.map((s, i) => {
          const len = (s.value / total) * circ
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={s.color}
              strokeWidth={thickness}
              fill="none"
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-acc}
              strokeLinecap="butt"
            />
          )
          acc += len
          return el
        })}
      </svg>
      <div className="absolute text-center">
        {centerTop ? <div className="text-xl font-extrabold leading-none text-ink">{centerTop}</div> : null}
        {centerBottom ? <div className="mt-0.5 text-[11px] text-muted">{centerBottom}</div> : null}
      </div>
    </div>
  )
}

export function Legend({
  segments,
  format
}: {
  segments: { label: string; value: number; color: string }[]
  format?: (value: number) => string
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1
  return (
    <ul className="space-y-2.5">
      {segments.map((s, i) => (
        <li key={i} className="flex items-center gap-2.5 text-sm">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
          <span className="flex-1 truncate text-ink">{s.label}</span>
          <span className="font-semibold text-muted">
            {format ? format(s.value) : `${Math.round((s.value / total) * 100)}%`}
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ---------------- Horizontal bars ---------------- */

export function HBarChart({
  data,
  format,
  color = "#6d35ee"
}: {
  data: { label: string; value: number; color?: string }[]
  format?: (value: number) => string
  color?: string
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <ul className="space-y-3.5">
      {data.map((d, i) => (
        <li key={i} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm text-ink">{d.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line/70">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? color }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-xs font-semibold text-muted">
            {format ? format(d.value) : d.value.toLocaleString("pt-BR")}
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ---------------- Area line ---------------- */

export function AreaLineChart({
  points,
  labels,
  height = 200,
  color = "#6d35ee",
  format
}: {
  points: number[]
  labels?: string[]
  height?: number
  color?: string
  format?: (value: number) => string
}) {
  const width = 640
  const pad = { t: 16, r: 12, b: 26, l: 40 }
  const max = Math.max(...points) * 1.15 || 1
  const min = Math.min(...points, 0)
  const iw = width - pad.l - pad.r
  const ih = height - pad.t - pad.b
  const x = (i: number) => pad.l + (i / Math.max(points.length - 1, 1)) * iw
  const y = (v: number) => pad.t + ih - ((v - min) / (max - min || 1)) * ih
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ")
  const area = `${line} L${x(points.length - 1).toFixed(1)},${pad.t + ih} L${x(0).toFixed(1)},${pad.t + ih} Z`
  const ticks = 4
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const gy = pad.t + (i / ticks) * ih
        const val = max - (i / ticks) * (max - min)
        return (
          <g key={i}>
            <line x1={pad.l} y1={gy} x2={width - pad.r} y2={gy} stroke="#eeedf4" strokeWidth="1" />
            <text x={pad.l - 8} y={gy + 3} textAnchor="end" className="fill-muted" fontSize="10">
              {format ? format(val) : Math.round(val)}
            </text>
          </g>
        )
      })}
      <path d={area} fill="url(#areaFill)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p)} r="2.6" fill="#fff" stroke={color} strokeWidth="2" />
      ))}
      {labels?.map((l, i) =>
        i % Math.ceil(labels.length / 6) === 0 ? (
          <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="fill-muted" fontSize="10">
            {l}
          </text>
        ) : null
      )}
    </svg>
  )
}
