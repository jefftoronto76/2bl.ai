'use client'

import { Badge, Group, Progress, Stack, Tooltip } from '@mantine/core'
import { Text } from '@/components/admin/primitives/Text'
import {
  ORDERED_TYPES,
  TYPE_COLORS,
  TYPE_LABELS,
  type BlockType,
} from '@/services/prompt/block-types'
import { tokensFor, TOKEN_LIMIT, YELLOW_THRESHOLD } from '@/services/prompt/tokenize'

export interface SegmentedTokenMeterBlock {
  id: string
  title: string
  type: BlockType
  body: string
}

export interface SegmentedTokenMeterProps {
  blocks: SegmentedTokenMeterBlock[]
}

/**
 * Segmented progress meter for the Blocks page header.
 *
 * Renders five segments — one per block type, in compile order —
 * sized by total tokens contributed by that type's enabled blocks.
 * Below the bar, a legend of five Badges (label + matching color)
 * for non-interactive type identification.
 *
 * Disabled blocks are excluded upstream by BlocksTable; this meter
 * receives only active blocks. Empty types still render a zero-
 * width segment + a labeled Badge — five segments and five legend
 * entries always.
 *
 * Color rules:
 * - Per-segment color: TYPE_COLORS[type].
 * - Over-budget (> TOKEN_LIMIT): every segment recolors red as a
 *   wash; the label tints red.
 * - Warning band (>= YELLOW_THRESHOLD, < TOKEN_LIMIT): segments
 *   keep their per-type color; label tints yellow.
 *
 * Tooltip per segment: "{Type}: {N} tokens ({X}% of 8,000)".
 * Zero-token types render the tooltip but the section has no hover
 * area (value=0); the legend Badge always carries the type label.
 */
export function SegmentedTokenMeter({ blocks }: SegmentedTokenMeterProps) {
  // Tokens-per-type aggregation. Explicit literal so all five types
  // are guaranteed present (TypeScript enforces via Record<BlockType,
  // number> — adding a new BlockType to BLOCK_TYPES would fail this
  // literal until updated).
  const tokensByType: Record<BlockType, number> = {
    identity: 0,
    knowledge: 0,
    guardrail: 0,
    process: 0,
    output_format: 0,
  }
  for (const b of blocks) {
    tokensByType[b.type] += tokensFor(b.body ?? '')
  }

  const totalTokens = ORDERED_TYPES.reduce(
    (sum, t) => sum + tokensByType[t],
    0,
  )
  const overBudget = totalTokens > TOKEN_LIMIT
  const warning = !overBudget && totalTokens >= YELLOW_THRESHOLD

  const labelColor = overBudget
    ? 'var(--mantine-color-red-7)'
    : warning
      ? 'var(--mantine-color-yellow-8)'
      : undefined

  return (
    <Stack gap={6}>
      <Text
        variant="muted"
        style={{
          fontSize: 'var(--mantine-font-size-xs)',
          fontFamily: 'var(--mantine-font-family-monospace)',
          color: labelColor,
        }}
      >
        {totalTokens.toLocaleString()} / {TOKEN_LIMIT.toLocaleString()} tokens used
      </Text>
      <Progress.Root size="sm" radius="sm">
        {ORDERED_TYPES.map(type => {
          const tokens = tokensByType[type]
          const value = Math.min((tokens / TOKEN_LIMIT) * 100, 100)
          const pct = Math.round((tokens / TOKEN_LIMIT) * 100)
          const color = overBudget ? 'red' : TYPE_COLORS[type]
          return (
            <Tooltip
              key={type}
              label={`${TYPE_LABELS[type]}: ${tokens.toLocaleString()} tokens (${pct}% of ${TOKEN_LIMIT.toLocaleString()})`}
              withArrow
              openDelay={150}
            >
              <Progress.Section
                value={value}
                color={color}
                aria-label={`${TYPE_LABELS[type]} tokens`}
              />
            </Tooltip>
          )
        })}
      </Progress.Root>
      <Group gap="xs" wrap="wrap">
        {ORDERED_TYPES.map(type => (
          <Badge
            key={type}
            color={TYPE_COLORS[type]}
            variant="light"
            size="sm"
            radius="sm"
          >
            {TYPE_LABELS[type]}
          </Badge>
        ))}
      </Group>
    </Stack>
  )
}
