'use client'

import { type KeyboardEvent, type MouseEvent } from 'react'
import {
  ActionIcon,
  Badge,
  Checkbox,
  Group,
  Highlight,
  Paper,
  Progress,
  Stack,
  Switch,
} from '@mantine/core'
import { IconCopy, IconTrash } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'
import {
  TYPE_COLORS,
  formatTypeBadgeLabel,
} from '@/services/prompt/block-types'
import { orderPrefix } from '@/services/prompt/block-order'
import { tokensFor } from '@/services/prompt/tokenize'
import { formatRelativeTime } from '@/lib/time'
import type { BlockRowBlock } from './BlockRow'

export type BlockCardBlock = BlockRowBlock

export interface BlockCardProps {
  block: BlockCardBlock
  selected: boolean
  isSaving?: boolean
  /**
   * Highest token count among the currently visible (filtered) blocks.
   * Drives the metadata-row bar width — same normalization as the
   * desktop Tokens column. Computed once at the parent and passed down.
   */
  maxVisibleTokens: number
  /**
   * Active search query. When non-empty, the title wraps in Mantine
   * `Highlight` for the matching substring. Empty / whitespace skips
   * the regex machinery and renders plain text. Body is NOT
   * highlighted on mobile cards — there's no body preview surface
   * here (Step 11 dropped it). Mobile body-match visibility is
   * tracked as a design decision in FRIDAY.md.
   */
  highlight: string
  onToggleSelect: (blockId: string) => void
  onToggleStatus: (blockId: string, nextStatus: 'active' | 'disabled') => void
  onOpenEdit: (blockId: string) => void
  onDuplicate: (blockId: string) => void
  onDelete: (blockId: string) => void
}

/**
 * Mobile card for a single block. Own shape — not a mobile-ified row.
 * Information hierarchy:
 *   Primary  — checkbox · type badge · order-prefix + title · status Switch
 *   Actions  — Delete icon (Edit is implicit via tap-body)
 *
 * The "01" / "02" prefix on the title is monospace, muted, zero-padded
 * to 2 digits — same convention as the desktop row. Unordered blocks
 * (order = null / 0) render an empty 2ch gutter so titles stay
 * vertically aligned across the card stack.
 *
 * Tap anywhere that's not an interactive control opens the edit
 * sheet. All interactive zones (checkbox, switch, delete) stopPropagation
 * to prevent the tap-body handler from firing.
 *
 * No inline preview — Step 11's Fragment+sibling pattern doesn't
 * work in a card layout, so preview is dropped entirely on mobile.
 * Tapping the card routes to the edit sheet which has the full body
 * and (Step 12) the editable Order field.
 *
 * Checkbox wrapper uses padding + negative margin to guarantee a
 * 44px tap target around Mantine's ~24px Checkbox without affecting
 * visual layout.
 */
export function BlockCard({
  block,
  selected,
  isSaving = false,
  maxVisibleTokens,
  highlight,
  onToggleSelect,
  onToggleStatus,
  onOpenEdit,
  onDuplicate,
  onDelete,
}: BlockCardProps) {
  const tokens = tokensFor(block.body)
  const barPct = maxVisibleTokens > 0 ? (tokens / maxVisibleTokens) * 100 : 0

  function handleStatusToggle(checked: boolean) {
    const nextStatus = checked ? 'active' : 'disabled'
    console.log('[BlockCard] status toggle', {
      blockId: block.id,
      to: nextStatus,
    })
    onToggleStatus(block.id, nextStatus)
  }

  function handleTapBody() {
    console.log('[BlockCard] tap to open edit', { blockId: block.id })
    onOpenEdit(block.id)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleTapBody()
    }
  }

  function handleDuplicate(e: MouseEvent) {
    e.stopPropagation()
    console.log('[BlockCard] duplicate', { blockId: block.id })
    onDuplicate(block.id)
  }

  function handleDelete(e: MouseEvent) {
    e.stopPropagation()
    console.log('[BlockCard] delete', { blockId: block.id })
    onDelete(block.id)
  }

  function stop(e: MouseEvent) {
    e.stopPropagation()
  }

  return (
    <Paper
      p="md"
      withBorder
      radius="sm"
      onClick={handleTapBody}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Edit ${block.title}`}
      style={{ cursor: 'pointer' }}
    >
      <Stack gap="sm">
        {/* Primary row */}
        <Group justify="space-between" wrap="nowrap" align="center">
          <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            <div
              onClick={stop}
              style={{
                padding: 10,
                margin: -10,
                display: 'inline-flex',
              }}
            >
              <Checkbox
                checked={selected}
                onChange={() => onToggleSelect(block.id)}
                disabled={isSaving}
                size="md"
                aria-label={`Select ${block.title}`}
              />
            </div>
            <Badge
              variant="light"
              color={TYPE_COLORS[block.type]}
              size="sm"
              radius="sm"
            >
              {formatTypeBadgeLabel(block.type)}
            </Badge>
            <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
              <Text
                variant="label"
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    fontFamily: 'var(--mantine-font-family-monospace)',
                    fontSize: 'var(--mantine-font-size-xs)',
                    color: 'var(--mantine-color-dimmed)',
                    display: 'inline-block',
                    width: '2ch',
                    marginRight: 8,
                    flexShrink: 0,
                  }}
                >
                  {orderPrefix(block.order)}
                </span>
                {/*
                  Step 18 — search highlighting. Same pattern as the
                  desktop row: prefix stays plain so numeric queries
                  don't tag the prefix digits, only the title text is
                  wrapped. Empty query short-circuits to plain.
                */}
                {highlight.trim() ? (
                  <Highlight component="span" highlight={highlight}>
                    {block.title}
                  </Highlight>
                ) : (
                  block.title
                )}
              </Text>
              {/*
                Relative timestamp under the title. Pure render-time
                computation — no interval tick. suppressHydrationWarning
                covers boundary-crossing edge cases between SSR and
                client hydration.
              */}
              <Text
                variant="muted"
                style={{ fontSize: 'var(--mantine-font-size-xs)' }}
                suppressHydrationWarning
              >
                Updated {formatRelativeTime(block.updated_at)}
              </Text>
            </Stack>
          </Group>
          {/*
            Status — Switch followed by visible label ("Active" /
            "Disabled"). Same composition as the desktop row; xs label
            on mobile to keep the primary row light. aria-hidden on the
            label since the Switch's aria-label is the canonical
            accessible name. Wrapper div stops tap-bubble to the
            edit-on-tap handler.
          */}
          <div onClick={stop} style={{ display: 'inline-flex' }}>
            <Group gap="xs" wrap="nowrap" align="center">
              <Switch
                checked={block.status === 'active'}
                onChange={e => handleStatusToggle(e.currentTarget.checked)}
                color="green"
                size="md"
                disabled={isSaving}
                aria-label={`${
                  block.status === 'active' ? 'Disable' : 'Enable'
                } ${block.title}`}
              />
              <Text
                aria-hidden
                variant={block.status === 'active' ? 'body' : 'muted'}
                style={{
                  fontSize: 'var(--mantine-font-size-xs)',
                  color:
                    block.status === 'active'
                      ? 'var(--mantine-color-green-7)'
                      : undefined,
                }}
              >
                {block.status === 'active' ? 'Active' : 'Disabled'}
              </Text>
            </Group>
          </div>
        </Group>

        {/* Tokens metadata — count + bar, same normalization as the
            desktop Tokens column (max-of-visible). Bar fills remaining
            width so the count reads as a small label on the left. */}
        <Group gap="xs" wrap="nowrap" align="center">
          <Text
            variant="muted"
            style={{
              fontFamily: 'var(--mantine-font-family-monospace)',
              fontSize: 'var(--mantine-font-size-xs)',
            }}
          >
            {tokens.toLocaleString()} tokens
          </Text>
          <Progress
            value={barPct}
            color="gray"
            size="xs"
            radius="sm"
            style={{ flex: 1 }}
            aria-label={`${tokens} tokens`}
          />
        </Group>

        {/* Actions — Duplicate (non-destructive) before Delete (destructive) */}
        <Group justify="flex-end">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            onClick={handleDuplicate}
            disabled={isSaving}
            aria-label="Duplicate block"
          >
            <IconCopy size={18} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="red"
            size="lg"
            onClick={handleDelete}
            disabled={isSaving}
            aria-label="Delete block"
          >
            <IconTrash size={18} />
          </ActionIcon>
        </Group>
      </Stack>
    </Paper>
  )
}
