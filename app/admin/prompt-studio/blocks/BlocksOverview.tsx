'use client'

import { Badge, Card, Group, SimpleGrid, Stack } from '@mantine/core'
import { Text } from '@/components/admin/primitives/Text'
import {
  ORDERED_TYPES,
  TYPE_COLORS,
  TYPE_LABELS,
  type BlockType,
} from '@/services/prompt/block-types'
import { TokenDonut } from './TokenDonut'
import { GuardrailMeter } from '@/components/admin/content/GuardrailMeter'
import type { BlockRow } from './BlocksTable'

function relTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (Number.isNaN(d)) return '—'
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

const LINE = 'var(--mantine-color-gray-2)'
const defGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  border: `1px solid ${LINE}`,
  borderRadius: 'var(--mantine-radius-md)',
  overflow: 'hidden',
}
const dCell: React.CSSProperties = { padding: '9px 12px', fontSize: 13.5, borderBottom: `1px solid ${LINE}` }
const dk: React.CSSProperties = {
  ...dCell,
  color: 'var(--mantine-color-dimmed)',
  background: 'var(--mantine-color-gray-0)',
  whiteSpace: 'nowrap',
}
const dv: React.CSSProperties = { ...dCell, display: 'flex', alignItems: 'center', gap: 8 }
const mono = 'var(--mantine-font-family-monospace)'

export interface BlocksOverviewProps {
  blocks: BlockRow[]
  version?: number | null
  status?: string | null
}

export function BlocksOverview({ blocks, version = null, status = null }: BlocksOverviewProps) {
  const active = blocks.filter((b) => b.status === 'active')
  const guardrailCount = active.filter((b) => b.type === 'guardrail').length
  const donutBlocks = active.map((b) => ({ type: b.type as BlockType, body: b.body ?? '' }))
  const lastUpdated = blocks.length
    ? blocks.reduce((a, b) => (a > b.updated_at ? a : b.updated_at), blocks[0].updated_at)
    : null

  const isLive = (status ?? '').toLowerCase() === 'live'

  return (
    <Card withBorder radius="md" p="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" style={{ alignItems: 'center' }}>
        {/* Details */}
        <Stack gap="sm">
          <div style={defGrid}>
            <div style={dk}>Status</div>
            <div style={dv}>
              {status ? (
                <Badge color={isLive ? 'green' : 'yellow'} variant="light" size="sm" radius="sm">
                  {isLive ? 'Live' : 'Draft'}
                </Badge>
              ) : (
                <Text variant="muted">—</Text>
              )}
            </div>

            <div style={dk}>Live version</div>
            <div style={{ ...dv, fontFamily: mono }}>{version != null ? `v${version}` : '—'}</div>

            <div style={dk}>Active blocks</div>
            <div style={{ ...dv, fontFamily: mono }}>{active.length}</div>

            <div style={{ ...dk, borderBottom: 'none' }}>Last updated</div>
            <div style={{ ...dv, borderBottom: 'none' }}>{lastUpdated ? relTime(lastUpdated) : '—'}</div>
          </div>

          <GuardrailMeter count={guardrailCount} />

          <Group gap="xs" wrap="wrap">
            {ORDERED_TYPES.map((t) => (
              <Badge key={t} color={TYPE_COLORS[t]} variant="light" size="sm" radius="sm">
                {TYPE_LABELS[t]}
              </Badge>
            ))}
          </Group>
        </Stack>

        {/* Donut */}
        <Stack gap={6} align="center">
          <TokenDonut blocks={donutBlocks} />
          <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)' }}>
            Hover a segment for its breakdown
          </Text>
        </Stack>
      </SimpleGrid>
    </Card>
  )
}
