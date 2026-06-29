'use client'

// Stat tiles + conversion-funnel bar chart for the Inbound Chats admin page.
// Accepts live ChatSession[] from the server component; no fixture data.

import { useMemo } from 'react'
import { Card, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { StatTile } from '@/components/admin/lib/primitives'
import type { ChatSession } from '@/services/crm/inbound'

// Anthropic pricing (claude-sonnet-4-6): $3 / 1M input, $15 / 1M output.
const IN_COST = 3
const OUT_COST = 15

function fmtK(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)
}

const FUNNEL = [
  { key: 'started',   label: 'Chats started',  color: 'var(--mantine-color-blue-7)' },
  { key: 'cta',       label: 'Presented CTA',   color: 'var(--mantine-color-orange-8)' },
  { key: 'converted', label: 'Converted',        color: 'var(--mantine-color-brand-6)' },
  { key: 'abandoned', label: 'Abandoned',        color: 'var(--mantine-color-gray-6)' },
] as const

export function InboundChartsDashboard({ rows }: { rows: ChatSession[] }) {
  const stats = useMemo(() => {
    let tin = 0, tout = 0, totalMsgs = 0
    const dist = { in_progress: 0, active: 0, abandoned: 0 }
    for (const s of rows) {
      tin += s.input_tokens ?? 0
      tout += s.output_tokens ?? 0
      totalMsgs += Array.isArray(s.messages) ? s.messages.length : 0
      const st = s.derived_status
      if (st in dist) dist[st as keyof typeof dist]++
    }
    const msgs = (s: ChatSession) => Array.isArray(s.messages) ? s.messages.length : 0
    const presentedCTA = rows.filter((s) => msgs(s) >= 6).length
    const converted    = rows.filter((s) => msgs(s) >= 12).length
    return { tin, tout, totalMsgs, dist, presentedCTA, converted }
  }, [rows])

  const started = rows.length
  const totalTokens = stats.tin + stats.tout
  const cost = '$' + ((stats.tin * IN_COST + stats.tout * OUT_COST) / 1e6).toFixed(2)
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
