'use client'

import { useState } from 'react'
import {
  ORDERED_TYPES,
  TYPE_COLORS,
  TYPE_LABELS,
  type BlockType,
} from '@/services/prompt/block-types'
import { tokensFor, TOKEN_LIMIT } from '@/services/prompt/tokenize'

const typeColorVar = (t: BlockType) => `var(--mantine-color-${TYPE_COLORS[t]}-6)`

export interface TokenDonutBlock {
  type: BlockType
  body: string
}

export interface TokenDonutProps {
  blocks: TokenDonutBlock[]
  limit?: number
  size?: number
}

export function TokenDonut({ blocks, limit = TOKEN_LIMIT, size = 200 }: TokenDonutProps) {
  const [hover, setHover] = useState<BlockType | null>(null)

  const byType: Record<BlockType, number> = {
    identity: 0,
    knowledge: 0,
    guardrail: 0,
    process: 0,
    output_format: 0,
  }
  for (const b of blocks) byType[b.type] += tokensFor(b.body ?? '')
  const total = ORDERED_TYPES.reduce((s, t) => s + byType[t], 0)

  const sw = 28
  const r = (size - sw) / 2
  const C = 2 * Math.PI * r
  const cx = size / 2
  const cy = size / 2
  const over = total > limit

  let offset = 0
  const segs = ORDERED_TYPES.map(t => {
    const len = total > 0 ? (byType[t] / total) * C : 0
    const seg = { t, len, off: offset }
    offset += len
    return seg
  })

  const hv = hover
    ? {
        label: TYPE_LABELS[hover],
        tokens: byType[hover],
        pct: total > 0 ? Math.round((byType[hover] / total) * 100) : 0,
        color: typeColorVar(hover),
      }
    : null

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${total.toLocaleString()} of ${limit.toLocaleString()} tokens used`}
    >
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--mantine-color-gray-2)" strokeWidth={sw} />

      {/* Segments */}
      {total > 0 &&
        segs.map(s => (
          <circle
            key={s.t}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={typeColorVar(s.t)}
            strokeWidth={sw}
            strokeDasharray={`${s.len} ${C - s.len}`}
            strokeDashoffset={-s.off}
            transform={`rotate(-90 ${cx} ${cy})`}
            opacity={hover && hover !== s.t ? 0.28 : 1}
            onMouseEnter={() => setHover(s.t)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'pointer', transition: 'opacity 130ms ease' }}
          >
            <title>{`${TYPE_LABELS[s.t]}: ${byType[s.t].toLocaleString()} tokens`}</title>
          </circle>
        ))}

      {/* Center readout */}
      {hv ? (
        <>
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            style={{ fontFamily: 'var(--mantine-font-family)', fontSize: 15, fontWeight: 600, fill: hv.color }}
          >
            {hv.label}
          </text>
          <text
            x={cx}
            y={cy + 16}
            textAnchor="middle"
            style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 13, fill: 'var(--mantine-color-text)' }}
          >
            {hv.tokens.toLocaleString()}
          </text>
          <text
            x={cx}
            y={cy + 33}
            textAnchor="middle"
            style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}
          >
            {hv.pct}% of prompt
          </text>
        </>
      ) : (
        <>
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            style={{
              fontFamily: 'var(--mantine-font-family-monospace)',
              fontSize: 26,
              fontWeight: 500,
              fill: over ? 'var(--mantine-color-red-7)' : 'var(--mantine-color-text)',
            }}
          >
            {total.toLocaleString()}
          </text>
          <text
            x={cx}
            y={cy + 18}
            textAnchor="middle"
            style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}
          >
            / {limit.toLocaleString()} tokens
          </text>
        </>
      )}
    </svg>
  )
}
