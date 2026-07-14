'use client'

// Stat tiles + conversion-funnel bar chart for the Inbound Chats admin page.
// Accepts live ChatSession[] from the server component; no fixture data.

import { useMemo } from 'react'
import { Badge, Card, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core'
import { StatTile, Sparkline } from '@/components/admin/lib/primitives'
import type { ChatSession, TtftTrendPoint } from '@/services/crm/inbound'
import { INPUT_COST_PER_MILLION, OUTPUT_COST_PER_MILLION } from '@/services/crm/formatting'

// Matches InboundChatsTable's TTFT_FLAG_MS — kept as a separate constant since
// the two files have no shared home for UI thresholds yet.
const TTFT_FLAG_MS = 1000

function fmtK(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)
}

/**
 * Response-time tile: not a plain StatTile because it also carries an
 * "Over 1s" flag and a trend sparkline. The headline number and the flag
 * both derive from the 7-day trend average (getTtftTrend), matching the
 * "avg TTFT · last 7 days" caption — see the day-bucketing caveat on
 * getTtftTrend (services/crm/inbound.ts) for what this average does and
 * doesn't represent.
 */
function ResponseTimeTile({ trend }: { trend: TtftTrendPoint[] }) {
  const known = trend.map((p) => p.avgMs).filter((v): v is number => v != null)
  const avg = known.length > 0 ? Math.round(known.reduce((sum, v) => sum + v, 0) / known.length) : null
  const latest = trend.length > 0 ? trend[trend.length - 1].avgMs : null
  const overThreshold = avg != null && avg > TTFT_FLAG_MS
  const sparkColor =
    latest != null && latest > TTFT_FLAG_MS ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-brand-6)'

  return (
    <Paper withBorder radius="md" p="md" style={{ background: 'transparent' }}>
      <Stack gap={2}>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text c="dimmed" size="xs" tt="uppercase" fw={600} style={{ letterSpacing: '0.06em' }}>
            Response time
          </Text>
          {overThreshold && (
            <Badge color="red" variant="light" size="xs">Over 1s</Badge>
          )}
        </Group>
        <Group justify="space-between" align="flex-end" wrap="nowrap" gap="xs">
          <Text
            style={{
              fontFamily: 'var(--mantine-font-family-monospace)',
              fontSize: 26, fontWeight: 500, lineHeight: 1.1,
              color: overThreshold ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-text)',
            }}
          >
            {avg != null ? `${avg}ms` : '—'}
          </Text>
          <Sparkline values={trend.map((p) => p.avgMs)} color={sparkColor} />
        </Group>
        <Text c="dimmed" size="xs">avg TTFT · last 7 days</Text>
      </Stack>
    </Paper>
  )
}

const FUNNEL = [
  { key: 'started',   label: 'Chats started',  color: 'var(--mantine-color-blue-7)' },
  { key: 'cta',       label: 'Presented CTA',   color: 'var(--mantine-color-orange-8)' },
  { key: 'converted', label: 'Converted',        color: 'var(--mantine-color-brand-6)' },
  { key: 'abandoned', label: 'Abandoned',        color: 'var(--mantine-color-gray-6)' },
] as const

export function InboundChartsDashboard({
  rows, ttftTrend,
}: { rows: ChatSession[]; ttftTrend: TtftTrendPoint[] }) {
  const stats = useMemo(() => {
    let tin = 0, tout = 0, totalMsgs = 0, negativeFeedback = 0
    const dist = { in_progress: 0, active: 0, abandoned: 0 }
    for (const s of rows) {
      tin += s.input_tokens ?? 0
      tout += s.output_tokens ?? 0
      totalMsgs += Array.isArray(s.messages) ? s.messages.length : 0
      negativeFeedback += s.feedback_counts?.down ?? 0
      const st = s.derived_status
      if (st in dist) dist[st as keyof typeof dist]++
    }
    const msgs = (s: ChatSession) => Array.isArray(s.messages) ? s.messages.length : 0
    const presentedCTA = rows.filter((s) => msgs(s) >= 6).length
    const converted    = rows.filter((s) => msgs(s) >= 12).length
    return { tin, tout, totalMsgs, dist, presentedCTA, converted, negativeFeedback }
  }, [rows])

  const started = rows.length
  const totalTokens = stats.tin + stats.tout
  const cost =
    '$' + ((stats.tin * INPUT_COST_PER_MILLION + stats.tout * OUTPUT_COST_PER_MILLION) / 1e6).toFixed(2)
  const convPct = started > 0 ? Math.round((stats.converted / started) * 100) : 0

  const funnelValues: Record<string, number> = {
    started,
    cta:       stats.presentedCTA,
    converted: stats.converted,
    abandoned: stats.dist.abandoned,
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      <SimpleGrid cols={2} spacing="md">
        <StatTile label="Sessions"  value={started}          sub={`${stats.totalMsgs} messages`} />
        <StatTile label="Tokens"    value={fmtK(totalTokens)} sub="input + output" />
        <StatTile label="Est. cost" value={cost}             sub="sonnet-4-6 rates" />
        <StatTile
          label="Converted"
          value={`${convPct}%`}
          sub={`${stats.converted} of ${started}`}
          accent="var(--mantine-color-brand-6)"
        />
        <StatTile
          label="Negative feedback"
          value={stats.negativeFeedback}
          sub={stats.negativeFeedback > 0 ? 'thumbs down' : 'none yet'}
          accent={stats.negativeFeedback > 0 ? 'var(--mantine-color-orange-7)' : undefined}
        />
        <ResponseTimeTile trend={ttftTrend} />
      </SimpleGrid>

      <Card withBorder radius="md" p="lg" style={{ background: 'transparent' }}>
        <Stack gap="sm">
          <Text fw={600} size="sm">Conversion pipeline</Text>
          <Stack gap={12}>
            {FUNNEL.map((f) => {
              const value = funnelValues[f.key] ?? 0
              const pct = started > 0 ? Math.round((value / started) * 100) : 0
              return (
                <Stack key={f.key} gap={4}>
                  <Group justify="space-between" align="baseline">
                    <Group gap={8} align="center" wrap="nowrap">
                      <span
                        style={{ width: 9, height: 9, borderRadius: 3, background: f.color, flex: '0 0 auto' }}
                      />
                      <Text size="sm">{f.label}</Text>
                    </Group>
                    <Text size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
                      {value}{' '}
                      <Text span c="dimmed" size="xs">· {pct}%</Text>
                    </Text>
                  </Group>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--mantine-color-gray-2)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: f.color, transition: 'width 200ms ease' }} />
                  </div>
                </Stack>
              )
            })}
          </Stack>
        </Stack>
      </Card>
    </SimpleGrid>
  )
}
