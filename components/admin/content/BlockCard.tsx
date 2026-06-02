'use client'

import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Highlight,
  Paper,
  Popover,
  Progress,
  Stack,
  Switch,
  TextInput,
} from '@mantine/core'
import { IconCopy, IconTrash } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'
import {
  TYPE_COLORS,
  formatTypeBadgeLabel,
} from '@/services/prompt/block-types'
import { orderPrefix } from '@/services/prompt/block-order'
import { tokensFor } from '@/services/prompt/tokenize'
import { formatRelativeTime } from '@/services/shared/time'
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
  onRename: (blockId: string, newTitle: string) => void
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
function CardDupConfirmContent({
  onConfirm,
  onCancel,
}: {
  onConfirm: (skipNext: boolean) => void
  onCancel: () => void
}) {
  const [skip, setSkip] = useState(false)
  return (
    <Stack gap="sm">
      <Text variant="body" style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
        Duplicate this block?
      </Text>
      <Group gap="xs" wrap="nowrap">
        <input
          type="checkbox"
          id="card-dup-skip-confirm"
          checked={skip}
          onChange={e => setSkip(e.currentTarget.checked)}
          style={{ cursor: 'pointer' }}
        />
        <label
          htmlFor="card-dup-skip-confirm"
          style={{
            fontSize: 'var(--mantine-font-size-xs)',
            color: 'var(--mantine-color-dimmed)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          Don&apos;t ask again
        </label>
      </Group>
      <Group gap="xs" justify="flex-end">
        <Button variant="default" size="xs" onClick={onCancel}>Cancel</Button>
        <Button size="xs" onClick={() => onConfirm(skip)}>Duplicate</Button>
      </Group>
    </Stack>
  )
}

export function BlockCard({
  block,
  selected,
  isSaving = false,
  maxVisibleTokens,
  highlight,
  onToggleSelect,
  onToggleStatus,
  onOpenEdit,
  onRename,
  onDuplicate,
  onDelete,
}: BlockCardProps) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [dupPopoverOpen, setDupPopoverOpen] = useState(false)
  const [skipDupConfirm, setSkipDupConfirm] = useState(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem('block-admin:skip-dup-confirm') === 'true'
      : false
  )

  const tokens = tokensFor(block.body)
  const barPct = maxVisibleTokens > 0 ? (tokens / maxVisibleTokens) * 100 : 0

  function startRename() {
    setRenameValue(block.title)
    setRenaming(true)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  function commitRename() {
    setRenaming(false)
    onRename(block.id, renameValue)
  }

  function cancelRename() {
    setRenaming(false)
  }

  function handleStatusToggle(checked: boolean) {
    const nextStatus = checked ? 'active' : 'disabled'
    console.log('[BlockCard] status toggle', {
      blockId: block.id,
      to: nextStatus,
    })
    onToggleStatus(block.id, nextStatus)
  }

  function handleTapBody() {
    if (renaming) return
    console.log('[BlockCard] tap to open edit', { blockId: block.id })
    onOpenEdit(block.id)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (renaming) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleTapBody()
    }
  }

  function handleDuplicateClick(e: MouseEvent) {
    e.stopPropagation()
    if (skipDupConfirm) {
      console.log('[BlockCard] duplicate (skip confirm)', { blockId: block.id })
      onDuplicate(block.id)
    } else {
      setDupPopoverOpen(true)
    }
  }

  function confirmDuplicate(skipNext: boolean) {
    if (skipNext) {
      localStorage.setItem('block-admin:skip-dup-confirm', 'true')
      setSkipDupConfirm(true)
    }
    setDupPopoverOpen(false)
    console.log('[BlockCard] duplicate confirmed', { blockId: block.id, skipNext })
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
              {renaming ? (
                <TextInput
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={e => setRenameValue(e.currentTarget.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitRename() }
                    if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
                  }}
                  size="xs"
                  style={{ width: '100%' }}
                  aria-label="Block title"
                />
              ) : (
              <Text
                variant="label"
                onDoubleClick={startRename}
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  cursor: 'text',
                }}
                title="Double-click to rename"
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
                {highlight.trim() ? (
                  <Highlight component="span" highlight={highlight}>
                    {block.title}
                  </Highlight>
                ) : (
                  block.title
                )}
              </Text>
              )}
              {/*
                Relative timestamp under the title. Pure render-time
                computation — no interval tick. suppressHydrationWarning
                covers boundary-crossing edge cases between SSR and
                client hydration.
              */}
              <Text
                variant="muted"
                style={{ fontSize: 'var(--mantine-font-size-xs)', cursor: 'default' }}
                suppressHydrationWarning
                title={new Date(block.updated_at).toLocaleString()}
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
          <Popover
            opened={dupPopoverOpen}
            onClose={() => setDupPopoverOpen(false)}
            position="bottom-end"
            withArrow
            shadow="md"
            width={220}
          >
            <Popover.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                onClick={handleDuplicateClick}
                disabled={isSaving}
                aria-label="Duplicate block"
              >
                <IconCopy size={18} />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              <CardDupConfirmContent
                onConfirm={confirmDuplicate}
                onCancel={() => setDupPopoverOpen(false)}
              />
            </Popover.Dropdown>
          </Popover>
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
