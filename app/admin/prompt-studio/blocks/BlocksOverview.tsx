'use client'

// BlocksOverview — the summary card (details + guardrail meter + actions on the left,
// token donut + type legend on the right).
//
// LAYOUT PARITY (matches Combined Admin · Blocks design):
//  • Left column  : details grid → GuardrailMeter → New block + Compile & Publish
//  • Right column : TokenDonut → "Hover…" caption → type-chip legend (UNDER the donut)
//
// The action buttons used to live in the page header and the legend used to sit in the
// left column; both were moved here to match the design.

import { Badge, Card, Group, SimpleGrid, Stack } from '@mantine/core'
import { Text } from '@/components/admin/primitives/Text'
import type { BlockType } from '@/services/prompt/block-types'
import { TokenDonut } from './TokenDonut'
import { PublishButton } from './PublishButton'
import { GuardrailMeter } from '@/components/admin/content/GuardrailMeter'
import { NewBlockButton } from '@/components/admin/content/NewBlockButton'
import type { Topic } from '@/components/admin/content/BlockEditForm'
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
  // Passed down so the action buttons can live in this card (design position).
  topics: Topic[]
  activeSetId: string | null
  activeSetLabel: string | null
}

export function BlocksOverview({
  blocks,
  version = null,
  status = null,
  topics,
  activeSetId,
  activeSetLabel,
}: BlocksOverviewProps) {
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
        {/* Left — details + guardrail meter + actions */}
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

          {/* Actions — design position: left column, under the meter. */}
          <Group gap="sm">
            <NewBlockButton topics={topics} activeSetId={activeSetId} activeSetLabel={activeSetLabel} />
            <PublishButton activeSetId={activeSetId} activeSetLabel={activeSetLabel ?? 'Prompt'} />
          </Group>
        </Stack>

        {/* Right — donut + caption + type legend UNDER the donut */}
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
