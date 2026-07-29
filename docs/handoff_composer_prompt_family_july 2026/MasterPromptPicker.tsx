'use client'

// MasterPromptPicker — the cross-tenant prompt-set selector on Platform Settings.
// Presentational only: options, the pending selection, the live masterId, and onSelect are all
// driven by page.tsx (which owns the fetch + Save).
//
// July 2026 changes:
//   1. The list is FILTERED to composer-family sets. It used to list every prompt set in every
//      tenant, which made choosing one guesswork. Filtering happens in page.tsx (the fetch
//      owner); this component renders what it is handed and shows a distinct empty state.
//   2. Each row carries an EDIT action (pencil) routing to Blocks with that set selected.
//
// Layout note: every right-hand item is flexShrink:0 and the label truncates. Adding the pencil
// without this squeezes the badges — "Live" renders as "L.", "v7" wraps to two lines.

import { ActionIcon, Badge, Box, Group, Paper, Select, Text, Tooltip } from '@mantine/core'
import { IconPencil } from '@tabler/icons-react'
import { type MasterPromptOption, statusLabel } from './types'

const NO_SHRINK = { flexShrink: 0 } as const

interface MasterPromptPickerProps {
  /**
   * Composer-family sets ONLY — page.tsx filters (see DIFF.md §3a).
   * TODO(UK-1): the filter predicate depends on how the family is stored.
   */
  options: MasterPromptOption[]
  /** The pending selection (defaults to the current master on load). */
  selectedId: string | null
  /** The set currently live as the Composer Prompt — gets the "Composer Prompt" badge. */
  masterId: string | null
  onSelect: (id: string) => void
  /**
   * Route to the Blocks screen for this set. page.tsx supplies navigation so this component
   * stays presentational.
   * TODO(UK-5): the Blocks page is tenant-scoped. If the set belongs to another tenant,
   * resolveActiveSet silently falls back to that tenant's Live set and the user lands on the
   * WRONG prompt set with no error. Resolve before shipping the pencil.
   */
  onEdit?: (option: MasterPromptOption) => void
  disabled?: boolean
}

export function MasterPromptPicker({
  options,
  selectedId,
  masterId,
  onSelect,
  onEdit,
  disabled,
}: MasterPromptPickerProps) {
  const byId = new Map(options.map((o) => [o.id, o]))

  // Search matches on label OR tenant name (the dropdown spans every tenant).
  const data = options.map((o) => ({ value: o.id, label: `${o.label} — ${o.tenantName}` }))

  return (
    <Select
      label="Composer prompt set"
      description="Only prompt sets built for the Composer appear here."
      placeholder={options.length ? 'Select a prompt set…' : 'No composer prompt sets yet'}
      data={data}
      value={selectedId}
      onChange={(value) => {
        if (value) onSelect(value)
      }}
      searchable
      nothingFoundMessage="No matching composer prompt sets"
      disabled={disabled || options.length === 0}
      maxDropdownHeight={320}
      comboboxProps={{ withinPortal: true }}
      renderOption={({ option }) => {
        const o = byId.get(option.value)
        if (!o) return <Text size="sm">{option.label}</Text>
        const isLive = o.status.toLowerCase() === 'live'
        return (
          <Group justify="space-between" wrap="nowrap" w="100%" gap="sm">
            {/* Only the label + tenant name may shrink. */}
            <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {o.label}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                · {o.tenantName}
              </Text>
            </Group>
            <Group gap={6} wrap="nowrap" style={NO_SHRINK}>
              {o.version != null && (
                <Text size="xs" c="dimmed" ff="monospace" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                  v{o.version}
                </Text>
              )}
              <Badge size="sm" radius="sm" variant="light" color={isLive ? 'green' : 'yellow'} style={NO_SHRINK}>
                {statusLabel(o.status)}
              </Badge>
              {o.id === masterId && (
                <Badge
                  size="sm"
                  radius="sm"
                  variant="filled"
                  color="green"
                  style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  Composer Prompt
                </Badge>
              )}
              {onEdit && (
                <Tooltip label="Edit blocks" withArrow position="left" openDelay={400}>
                  <ActionIcon
                    component="span"
                    role="button"
                    tabIndex={0}
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`Edit ${o.label} in Blocks`}
                    style={NO_SHRINK}
                    // stopPropagation: the row's own click selects the set.
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(o)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        onEdit(o)
                      }
                    }}
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Group>
        )
      }}
    />
  )
}

// CurrentSystemPromptPill — unchanged from the shipped version. Included so the file drops in
// whole; no edits below this line.
interface CurrentSystemPromptPillProps {
  set: MasterPromptOption | null
  setByName?: string | null
  setAt?: number | null
}

export function CurrentSystemPromptPill({ set, setByName, setAt }: CurrentSystemPromptPillProps) {
  if (!set) {
    return (
      <Paper withBorder radius="xl" px="sm" py={6} w="fit-content">
        <Group gap="xs" wrap="nowrap" align="center">
          <Box aria-hidden w={8} h={8} style={{ borderRadius: '50%', backgroundColor: 'var(--mantine-color-gray-5)' }} />
          <Text size="sm" c="dimmed">
            Current Composer Prompt
          </Text>
          <Text size="sm" c="dimmed">
            ·
          </Text>
          <Text size="sm" fw={600}>
            Using system fallback
          </Text>
          <Badge size="sm" radius="sm" variant="light" color="gray">
            Fallback
          </Badge>
        </Group>
      </Paper>
    )
  }

  const isLive = set.status.toLowerCase() === 'live'
  const setByLabel = setByName
    ? `Set by ${setByName}${setAt ? ` · ${new Date(setAt).toLocaleDateString()}` : ''}`
    : null

  return (
    <Paper withBorder radius="xl" px="sm" py={6} w="fit-content" style={{ maxWidth: '100%' }}>
      <Group gap="xs" wrap="nowrap" align="center" style={{ minWidth: 0 }}>
        <Box
          aria-hidden
          w={8}
          h={8}
          style={{ flexShrink: 0, borderRadius: '50%', backgroundColor: 'var(--mantine-color-green-6)' }}
        />
        <Text size="sm" fw={600} truncate>
          {set.label}
        </Text>
        <Text size="sm" c="dimmed" truncate>
          {set.tenantName}
        </Text>
        <Badge size="sm" radius="sm" variant="light" color={isLive ? 'green' : 'yellow'} style={{ flexShrink: 0 }}>
          {statusLabel(set.status)}
        </Badge>
        {setByLabel && (
          <Text size="xs" c="dimmed" truncate>
            {setByLabel}
          </Text>
        )}
      </Group>
    </Paper>
  )
}
