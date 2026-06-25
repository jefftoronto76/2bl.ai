'use client'

import { useRef, useState } from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Highlight,
  Popover,
  Progress,
  TextInput,
  Stack,
  Switch,
  Table,
  Tooltip,
} from '@mantine/core'
import { IconCheck, IconChevronRight, IconClipboard, IconCopy, IconPencil, IconTrash } from '@tabler/icons-react'
import { Text } from '@/components/admin/primitives/Text'
import {
  TYPE_COLORS,
  formatTypeBadgeLabel,
  type BlockType,
} from '@/services/prompt/block-types'
import { orderPrefix, isOrdered } from '@/services/prompt/block-order'
import { tokensFor } from '@/services/prompt/tokenize'
import { formatRelativeTime } from '@/services/shared/time'

const PREVIEW_LINE_LIMIT = 8
const COLUMN_COUNT = 7 // checkbox · chevron · title · type · tokens · status · actions (copy+edit+dup+delete)

// Metadata entry inside the right-hand panel of the expanded row.
// Label-on-top muted/uppercase, value below. Mono toggle for numeric
// fields (Tokens, Order). suppressHydrationWarning only used by the
// Updated row whose value crosses bucket boundaries between SSR and
// client hydration — see formatRelativeTime in services/shared/time.ts.
function MetaItem({
  label,
  value,
  mono = false,
  hydrationSensitive = false,
  title,
}: {
  label: string
  value: string
  mono?: boolean
  hydrationSensitive?: boolean
  title?: string
}) {
  return (
    <Stack gap={2}>
      <Text
        variant="muted"
        style={{
          fontSize: 'var(--mantine-font-size-xs)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 'var(--mantine-font-size-sm)',
          fontFamily: mono
            ? 'var(--mantine-font-family-monospace)'
            : undefined,
          cursor: title ? 'default' : undefined,
        }}
        suppressHydrationWarning={hydrationSensitive}
        title={title}
      >
        {value}
      </Text>
    </Stack>
  )
}

function DupConfirmContent({
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
          id="dup-skip-confirm"
          checked={skip}
          onChange={e => setSkip(e.currentTarget.checked)}
          style={{ cursor: 'pointer' }}
        />
        <label
          htmlFor="dup-skip-confirm"
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

function ExpandedRowPanel({
  block,
  highlight,
  onEdit,
}: {
  block: BlockRowBlock
  highlight: string
  onEdit: () => void
}) {
  const lines = block.body.split('\n')
  const preview = lines.slice(0, PREVIEW_LINE_LIMIT).join('\n')
  const hasMore = lines.length > PREVIEW_LINE_LIMIT
  const previewText = preview + (hasMore ? '\n…' : '')
  const tokens = tokensFor(block.body)

  return (
    <Group align="flex-start" wrap="nowrap" gap="xl" py="md">
      {/* Left — block content + Edit button */}
      <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
        <Text
          variant="muted"
          style={{
            fontSize: 'var(--mantine-font-size-xs)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Block content
        </Text>
        {block.body ? (
          <pre
            style={{
              fontFamily: 'var(--mantine-font-family-monospace)',
              fontSize: 'var(--mantine-font-size-xs)',
              color: 'var(--mantine-color-dark-7)',
              backgroundColor: 'var(--mantine-color-gray-0)',
              padding: 'var(--mantine-spacing-sm)',
              borderRadius: 'var(--mantine-radius-sm)',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {/*
              Step 18 — search highlighting. When a query is active,
              wrap the preview in Mantine Highlight (rendered inline
              as a span so the <pre>'s whitespace-preservation
              context still applies through the child). Empty /
              whitespace query short-circuits to the plain string.
            */}
            {highlight.trim() ? (
              <Highlight component="span" highlight={highlight}>
                {previewText}
              </Highlight>
            ) : (
              previewText
            )}
          </pre>
        ) : (
          <Text variant="muted">(empty)</Text>
        )}
        <Button
          variant="default"
          size="sm"
          leftSection={<IconPencil size={14} />}
          onClick={onEdit}
          style={{ alignSelf: 'flex-start' }}
        >
          Edit
        </Button>
      </Stack>

      {/* Right — metadata panel */}
      <Stack gap="md" w={220} style={{ flexShrink: 0 }}>
        <MetaItem label="Tokens" value={tokens.toLocaleString()} mono />
        <MetaItem label="Author" value={block.author?.name ?? '—'} />
        <MetaItem
          label="Updated"
          value={formatRelativeTime(block.updated_at)}
          hydrationSensitive
          title={new Date(block.updated_at).toLocaleString()}
        />
        <MetaItem
          label="Order"
          value={isOrdered(block.order) ? String(block.order) : '—'}
          mono
        />
      </Stack>
    </Group>
  )
}

export interface BlockRowBlock {
  id: string
  title: string
  type: BlockType
  body: string
  status: 'active' | 'disabled' | 'deleted'
  order: number | null
  updated_at: string
  topics: { name: string } | null
  author: { name: string } | null
}

export interface BlockRowProps {
  block: BlockRowBlock
  selected: boolean
  isSaving?: boolean
  isExpanded?: boolean
  /**
   * Highest token count among the currently visible (filtered) blocks.
   * Drives the Tokens column bar width — each row's bar is rendered as
   * (this row's tokens / maxVisibleTokens) * 100. Computed once at the
   * parent and passed down so rows don't all re-iterate the visible set.
   */
  maxVisibleTokens: number
  /**
   * Active search query. When non-empty, the title and the expanded
   * body preview wrap their text in Mantine `Highlight` so matches
   * render with a yellow `<mark>` background. Empty / whitespace
   * skips the regex machinery and renders plain text. Match
   * semantics mirror useBlocksFilters' `hay.includes(q)` — single
   * substring (phrase), not per-word.
   */
  highlight: string
  onToggleSelect: (blockId: string) => void
  onToggleStatus: (blockId: string, nextStatus: 'active' | 'disabled') => void
  onEdit: (blockId: string) => void
  onRename: (blockId: string, newTitle: string) => void
  onDuplicate: (blockId: string) => void
  onDelete: (blockId: string) => void
  onToggleExpand?: (blockId: string) => void
}

/**
 * Desktop-only table row for a single block. Owns no API calls — all
 * mutations dispatch via callbacks.
 *
 * Title cell carries an order-prefix span ("01", "02", …) for ordered
 * blocks; unordered blocks reserve the gutter via a 2ch-wide empty
 * span so titles stay vertically aligned across the table.
 *
 * Order edit lives in the drawer/sheet form (Step 12 of PR 2) — there
 * is no inline NumberInput on the row anymore. Feedback for rejected
 * commits (duplicate order in the same type) is surfaced by the
 * parent via a Mantine notification, raised from the form's save
 * path.
 */
export function BlockRow({
  block,
  selected,
  isSaving = false,
  isExpanded = false,
  maxVisibleTokens,
  highlight,
  onToggleSelect,
  onToggleStatus,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
  onToggleExpand,
}: BlockRowProps) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const [dupPopoverOpen, setDupPopoverOpen] = useState(false)
  const [skipDupConfirm, setSkipDupConfirm] = useState(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem('block-admin:skip-dup-confirm') === 'true'
      : false
  )

  const tokens = tokensFor(block.body)
  const barPct = maxVisibleTokens > 0 ? (tokens / maxVisibleTokens) * 100 : 0

  function handleStatusToggle(checked: boolean) {
    const nextStatus = checked ? 'active' : 'disabled'
    console.log('[BlockRow] status toggle', {
      blockId: block.id,
      to: nextStatus,
    })
    onToggleStatus(block.id, nextStatus)
  }

  function handleEdit() {
    console.log('[BlockRow] edit', { blockId: block.id })
    onEdit(block.id)
  }

  function handleDuplicateClick() {
    if (skipDupConfirm) {
      console.log('[BlockRow] duplicate (skip confirm)', { blockId: block.id })
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
    console.log('[BlockRow] duplicate confirmed', { blockId: block.id, skipNext })
    onDuplicate(block.id)
  }

  function handleDelete() {
    console.log('[BlockRow] delete', { blockId: block.id })
    onDelete(block.id)
  }

  async function handleCopyBody() {
    try {
      await navigator.clipboard.writeText(block.body)
      console.log('[BlockRow] body copied', { blockId: block.id })
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error('[BlockRow] clipboard write failed')
    }
  }

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

  return (
    <>
    <Table.Tr>
      <Table.Td>
        <Checkbox
          checked={selected}
          onChange={() => onToggleSelect(block.id)}
          disabled={isSaving}
          aria-label={`Select ${block.title}`}
        />
      </Table.Td>
      <Table.Td style={{ width: 28 }}>
        <Tooltip label={isExpanded ? 'Collapse' : 'Expand'} openDelay={300} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={() => onToggleExpand?.(block.id)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <IconChevronRight
              size={14}
              style={{
                transform: isExpanded ? 'rotate(90deg)' : 'none',
                transition: 'transform 120ms ease',
              }}
            />
          </ActionIcon>
        </Tooltip>
      </Table.Td>
      <Table.Td>
        <Stack gap={2}>
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
              style={{ cursor: 'text' }}
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
            covers the rare case where the row crosses a bucket
            boundary (e.g., 59s → 1m) between SSR and client hydration.
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
      </Table.Td>
      <Table.Td>
        <Badge
          variant="light"
          color={TYPE_COLORS[block.type]}
          size="sm"
          radius="sm"
        >
          {formatTypeBadgeLabel(block.type)}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap" align="center">
          <Text
            style={{
              fontFamily: 'var(--mantine-font-family-monospace)',
              fontSize: 'var(--mantine-font-size-xs)',
              color: 'var(--mantine-color-dimmed)',
              minWidth: '4ch',
              textAlign: 'right',
            }}
          >
            {tokens.toLocaleString()}
          </Text>
          <Progress
            value={barPct}
            color="gray"
            size="sm"
            radius="sm"
            w={80}
            aria-label={`${tokens} tokens`}
          />
        </Group>
      </Table.Td>
      <Table.Td>
        {/*
          Status cell — Switch followed by a visible label ("Active" /
          "Disabled"). The Switch's aria-label is the canonical
          accessible name; the label is decorative for sighted users
          and aria-hidden so screen readers don't double-read.
        */}
        <Group gap="xs" wrap="nowrap" align="center">
          <Switch
            checked={block.status === 'active'}
            onChange={e => handleStatusToggle(e.currentTarget.checked)}
            color="green"
            disabled={isSaving}
            aria-label={`${
              block.status === 'active' ? 'Disable' : 'Enable'
            } ${block.title}`}
          />
          <Text
            aria-hidden
            variant={block.status === 'active' ? 'body' : 'muted'}
            style={{
              fontSize: 'var(--mantine-font-size-sm)',
              color:
                block.status === 'active'
                  ? 'var(--mantine-color-green-7)'
                  : undefined,
            }}
          >
            {block.status === 'active' ? 'Active' : 'Disabled'}
          </Text>
        </Group>
      </Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Tooltip label={copied ? 'Copied!' : 'Copy block body'} openDelay={300} withArrow>
            <ActionIcon
              variant="subtle"
              color={copied ? 'green' : 'gray'}
              size="md"
              onClick={handleCopyBody}
              disabled={isSaving}
              aria-label="Copy block body"
            >
              {copied ? <IconCheck size={16} /> : <IconClipboard size={16} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Edit block" openDelay={300} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              onClick={handleEdit}
              disabled={isSaving}
              aria-label="Edit block"
            >
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
          <Popover
            opened={dupPopoverOpen}
            onClose={() => setDupPopoverOpen(false)}
            position="bottom-end"
            withArrow
            shadow="md"
            width={220}
          >
            <Popover.Target>
              <Tooltip label="Duplicate block" openDelay={300} withArrow disabled={dupPopoverOpen}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="md"
                  onClick={handleDuplicateClick}
                  disabled={isSaving}
                  aria-label="Duplicate block"
                >
                  <IconCopy size={16} />
                </ActionIcon>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
              <DupConfirmContent
                onConfirm={confirmDuplicate}
                onCancel={() => setDupPopoverOpen(false)}
              />
            </Popover.Dropdown>
          </Popover>
          <Tooltip label="Delete block" openDelay={300} withArrow>
            <ActionIcon
              variant="subtle"
              color="red"
              size="md"
              onClick={handleDelete}
              disabled={isSaving}
              aria-label="Delete block"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
    {isExpanded && (
      <Table.Tr>
        {/*
          Two empty leading cells inherit the Checkbox + Chevron
          column widths (40 + 28). The colSpan starts at column 3,
          aligning the expanded panel content with the Title column
          above. Cleaner than a magic-number paddingLeft on the
          panel itself.
        */}
        <Table.Td />
        <Table.Td />
        <Table.Td colSpan={COLUMN_COUNT - 2}>
          <ExpandedRowPanel
            block={block}
            highlight={highlight}
            onEdit={handleEdit}
          />
        </Table.Td>
      </Table.Tr>
    )}
    </>
  )
}
