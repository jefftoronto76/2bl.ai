'use client'

// Presentational primitives shared across dashboards: StatTile, MetaRow, the
// segmented Donut (+ legend), and a notify() helper over Mantine notifications.

import { useState, type ReactNode } from 'react'
import { Paper, Stack, Text, Group } from '@mantine/core'
import { notifications } from '@mantine/notifications'

/* ── notify — thin wrapper; brand colour by default ── */
export interface Toast {
  color?: string
  title: string
  message: string
}
export function notify(t: Toast) {
  notifications.show({ color: t.color || 'brand', title: t.title, message: t.message, autoClose: 3200 })
}

/* ── StatTile — a labelled metric for dashboard headers ── */
export function StatTile({
  label, value, sub, accent,
}: { label: string; value: ReactNode; sub?: string; accent?: string }) {
  return (
    <Paper withBorder radius="md" p="md" style={{ background: 'transparent' }}>
      <Stack gap={2}>
        <Text c="dimmed" size="xs" tt="uppercase" fw={600} style={{ letterSpacing: '0.06em' }}>
          {label}
        </Text>
        <Text
          style={{
            fontFamily: 'var(--mantine-font-family-monospace)',
            fontSize: 26, fontWeight: 500, lineHeight: 1.1,
            color: accent || 'var(--mantine-color-text)',
          }}
        >
          {value}
        </Text>
        {sub && <Text c="dimmed" size="xs">{sub}</Text>}
      </Stack>
    </Paper>
  )
}

/* ── MetaRow — label + value row used on detail cards ── */
export function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="xs" wrap="wrap" align="baseline">
      <Text c="dimmed" style={{ fontSize: 'var(--mantine-font-size-xs)', minWidth: 110 }}>{label}</Text>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </Group>
  )
}

/* ── mono / dim text helpers ── */
export const Mono = ({ children, size }: { children: ReactNode; size?: number | string }) => (
  <Text span style={{ fontSize: size ?? 'var(--mantine-font-size-sm)', fontFamily: 'var(--mantine-font-family-monospace)', wordBreak: 'break-all' }}>
    {children}
  </Text>
)
export const Dim = ({ children }: { children: ReactNode }) => (
  <Text span c="dimmed" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{children}</Text>
)

/* ── Donut — generic segmented ring ──
   Hover a segment to see its detail in the centre; otherwise shows the total. ── */
export interface DonutSegment {
  key: string
  label: string
  value: number
  color: string
}
export interface DonutProps {
  segments: DonutSegment[]
  total?: number
  centerSub?: string
  size?: number
  formatCenter?: (n: number) => string
}
export function Donut({ segments, total, centerSub, size = 180, formatCenter }: DonutProps) {
  const [hover, setHover] = useState<string | null>(null)
  const sw = 26
  const r = (size - sw) / 2
  const C = 2 * Math.PI * r
  const cx = size / 2
  const cy = size / 2
  const sum = total != null ? total : segments.reduce((s, x) => s + x.value, 0)
  let offset = 0
  const segs = segments.map((s) => {
    const len = sum > 0 ? (s.value / sum) * C : 0
    const seg = { ...s, len, off: offset }
    offset += len
    return seg
  })
  const hv = hover ? segments.find((s) => s.key === hover) ?? null : null
  const hvPct = hv && sum > 0 ? Math.round((hv.value / sum) * 100) : 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--mantine-color-gray-2)" strokeWidth={sw} />
      {sum > 0 && segs.map((s) => (
        <circle
          key={s.key} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={sw}
          strokeDasharray={`${s.len} ${C - s.len}`} strokeDashoffset={-s.off} transform={`rotate(-90 ${cx} ${cy})`}
          opacity={hover && hover !== s.key ? 0.28 : 1}
          onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)}
          style={{ cursor: 'pointer', transition: 'opacity 130ms ease' }}
        />
      ))}
      {hv ? (
        <>
          <text x={cx} y={cy - 5} textAnchor="middle" style={{ fontFamily: 'var(--mantine-font-family)', fontSize: 14, fontWeight: 600, fill: hv.color }}>{hv.label}</text>
          <text x={cx} y={cy + 15} textAnchor="middle" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 13, fill: 'var(--mantine-color-text)' }}>{hv.value.toLocaleString()}</text>
          <text x={cx} y={cy + 32} textAnchor="middle" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}>{hvPct}%</text>
        </>
      ) : (
        <>
          <text x={cx} y={cy - 1} textAnchor="middle" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 25, fontWeight: 500, fill: 'var(--mantine-color-text)' }}>
            {formatCenter ? formatCenter(sum) : sum.toLocaleString()}
          </text>
          {centerSub && (
            <text x={cx} y={cy + 18} textAnchor="middle" style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}>{centerSub}</text>
          )}
        </>
      )}
    </svg>
  )
}

/* ── DonutLegend — clickable swatch list to pair with a Donut ── */
export function DonutLegend({ segments, total }: { segments: DonutSegment[]; total: number }) {
  return (
    <Stack gap={7}>
      {segments.map((s) => {
        const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
        return (
          <Group key={s.key} gap="xs" wrap="nowrap" justify="space-between">
            <Group gap={8} wrap="nowrap">
              <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: '0 0 auto' }} />
              <Text size="sm">{s.label}</Text>
            </Group>
            <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
              {s.value.toLocaleString()} · {pct}%
            </Text>
          </Group>
        )
      })}
    </Stack>
  )
}
