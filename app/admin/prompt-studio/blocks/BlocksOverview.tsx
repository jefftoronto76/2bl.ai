'use client'

// BlocksOverview — the summary. Mirrors the design (Combined Admin · Blocks) structure
// EXACTLY: an outer 2-col SimpleGrid holding TWO separate bordered cards.
//
//   Left card  : borderless 2-col detail grid (Status / Live version / Active blocks /
//                Last updated) → GuardrailMeter → New block + Compile & Publish
//   Right card : TokenDonut → "Hover…" caption

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

const mono = 'var(--mantine-font-family-monospace)'
const sm = 'var(--mantine-font-size-sm)'

export interface BlocksOverviewProps {
  blocks: BlockRow[]
  status?: string | null
  /** compiled_prompts.updated_at for this slot (view-derived) — cut-off for the publish modal's "changed since" list. */
  lastCompiledAt?: string | null
  /**
   * compiled_prompts.version for this slot (view-derived) — the real,
   * live-incrementing source, both for the "Live version" badge below and
   * for PublishButton's next-version math. Do NOT source either from
   * prompt_sets.version — that column is never incremented after row
   * creation and silently drifts from reality (see promptSet.ts).
   */
  compiledVersion?: number | null
  // Passed down so the action buttons live in the left card (design position).
  topics: Topic[]
  activeSetId: string | null
  activeSetLabel: string | null
}

export function BlocksOverview({
  blocks,
  status = null,
  lastCompiledAt = null,
  compiledVersion = null,
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
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      {/* Left card — details + guardrail meter + actions */}
      <Card withBorder radius="md" p="lg" style={{ background: 'transparent' }}>
        <Stack gap="md" justify="space-between" style={{ height: '100%' }}>
          <SimpleGrid cols={2} spacing="xs" verticalSpacing={10}>
            <Text variant="muted" style={{ fontSize: sm }}>Status</Text>
            <div>
              {status ? (
                <Badge color={isLive ? 'green' : 'yellow'} variant="light" size="sm" radius="sm">
                  {isLive ? 'Live' : 'Draft'}
                </Badge>
              ) : (
                <Text variant="muted">—</Text>
              )}
            </div>

            <Text variant="muted" style={{ fontSize: sm }}>Live version</Text>
            <Text style={{ fontSize: sm, fontFamily: mono }}>{compiledVersion != null ? `v${compiledVersion}` : '—'}</Text>

            <Text variant="muted" style={{ fontSize: sm }}>Active blocks</Text>
            <Text style={{ fontSize: sm, fontFamily: mono }}>{active.length}</Text>

            <Text variant="muted" style={{ fontSize: sm }}>Last updated</Text>
            <Text style={{ fontSize: sm }}>{lastUpdated ? relTime(lastUpdated) : '—'}</Text>
          </SimpleGrid>

          <GuardrailMeter count={guardrailCount} />

          <Group gap="sm">
            <NewBlockButton topics={topics} activeSetId={activeSetId} activeSetLabel={activeSetLabel} />
            <PublishButton
              activeSetId={activeSetId}
              activeSetLabel={activeSetLabel ?? 'Prompt'}
              activeSetVersion={compiledVersion ?? 0}
              lastCompiledAt={lastCompiledAt}
              blocks={active.map((b) => ({
                id: b.id,
                title: b.title,
                type: b.type as BlockType,
                updated_at: b.updated_at,
              }))}
            />
          </Group>
        </Stack>
      </Card>

      {/* Right card — donut + caption */}
      <Card withBorder radius="md" p="lg" style={{ background: 'transparent' }}>
        <Stack gap={4} align="center" justify="center" style={{ height: '100%' }}>
          <TokenDonut blocks={donutBlocks} />
          <Text variant="muted" style={{ fontSize: 'var(--mantine-font-size-xs)' }}>
            Hover a segment for its breakdown
          </Text>
        </Stack>
      </Card>
    </SimpleGrid>
  )
}
