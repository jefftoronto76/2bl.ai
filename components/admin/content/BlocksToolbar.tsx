'use client'

import {
  Button,
  Chip,
  Group,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import {
  IconChevronsDown,
  IconChevronsUp,
  IconSearch,
} from '@tabler/icons-react'
import {
  BLOCK_TYPES,
  TYPE_COLORS,
  TYPE_COMPILE_ORDER,
  TYPE_LABELS,
  type BlockType,
} from '@/services/prompt/block-types'
import type {
  StatusFilter,
  TypeFilter,
} from './useBlocksFilters'

export interface BlocksToolbarProps {
  query: string
  onQueryChange: (value: string) => void
  typeFilter: TypeFilter
  onTypeFilterChange: (value: TypeFilter) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (value: StatusFilter) => void
  allExpanded: boolean
  onToggleExpandAll: () => void
  filteredCount: number
  totalCount: number
}

// Type chips render in compile order so the toolbar matches the
// ordinal suffix on the row badges (GUARDRAIL 1st, IDENTITY 2nd, …).
// Single source of truth: TYPE_COMPILE_ORDER in @/services/prompt/block-types.
const ORDERED_TYPES: BlockType[] = [...BLOCK_TYPES].sort(
  (a, b) => TYPE_COMPILE_ORDER[a] - TYPE_COMPILE_ORDER[b],
)

/**
 * Desktop/tablet filter toolbar for the Blocks admin page.
 *
 * Pure presentational — owns no state, no fetches, no business logic.
 * Reads everything from props, fires callbacks. Mobile gets its own
 * filter UX via MobileBlocksView (PR 4); this component is intended
 * to render inside a <Box visibleFrom="md">.
 *
 * Observability: logs the three discrete user transactions (type
 * filter change, status filter change, expand-all toggle). Query
 * changes are NOT logged — per-keystroke console spam.
 */
export function BlocksToolbar({
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  allExpanded,
  onToggleExpandAll,
  filteredCount,
  totalCount,
}: BlocksToolbarProps) {
  // Mantine Chip.Group in single-select mode renders chips as native
  // radio inputs, so clicking the active chip can't fire onChange with
  // an empty string under current Mantine v7 behavior. The empty-string
  // guard is defensive — preserves the no-op intent if Mantine ever
  // adds a deselectable single-select variant. The explicit "All" chip
  // remains the reset path either way.
  function handleTypeChange(value: string) {
    if (value === '') return
    const narrowed = value as TypeFilter
    console.log('[BlocksToolbar] type filter', { value: narrowed })
    onTypeFilterChange(narrowed)
  }

  function handleStatusChange(value: string) {
    if (value === '') return
    const narrowed = value as StatusFilter
    console.log('[BlocksToolbar] status filter', { value: narrowed })
    onStatusFilterChange(narrowed)
  }

  function handleExpandToggle() {
    console.log('[BlocksToolbar] expand-all toggle', { allExpanded })
    onToggleExpandAll()
  }

  return (
    <Group justify="space-between" wrap="wrap" gap="sm" align="center">
      <TextInput
        value={query}
        onChange={e => onQueryChange(e.currentTarget.value)}
        placeholder="Search blocks"
        leftSection={<IconSearch size={14} />}
        size="sm"
        w={280}
        aria-label="Search blocks"
      />
      <Group gap="md" wrap="wrap">
        {/*
          Filter chips, not legend badges. The Step 8 SegmentedTokenMeter
          legend uses Mantine `Badge` (read-only labels). These are Mantine
          `Chip`s — toggle controls bound to the URL filter state. Both
          pull from TYPE_COLORS so the meter and filter share a visual
          language; do not consolidate the two primitives.

          Chip.Group renders no DOM of its own (context provider only); the
          inner <Group> handles layout + wrapping at narrow viewports.
        */}
        <Chip.Group multiple={false} value={typeFilter} onChange={handleTypeChange}>
          <Group gap="xs" wrap="wrap" role="group" aria-label="Filter by type">
            <Chip value="all" size="sm">
              All
            </Chip>
            {ORDERED_TYPES.map(t => (
              <Chip key={t} value={t} size="sm" color={TYPE_COLORS[t]}>
                {TYPE_LABELS[t]}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        <Chip.Group multiple={false} value={statusFilter} onChange={handleStatusChange}>
          <Group gap="xs" wrap="wrap" role="group" aria-label="Filter by status">
            <Chip value="all" size="sm">
              All
            </Chip>
            <Chip value="active" size="sm" color="green">
              Active
            </Chip>
            <Chip value="disabled" size="sm">
              Disabled
            </Chip>
          </Group>
        </Chip.Group>
      </Group>
      {/*
        Stacked counter + expand toggle. Counter renders as muted
        secondary text above the green-link expand button — vertical
        rhythm reads cleaner than the prior inline "47 / 47 · Expand
        all" row, especially on mobile. Right-aligned within the
        stack so both lines hug the toolbar's right edge.
      */}
      <Stack gap={2} align="flex-end">
        <Text size="sm" c="dimmed" aria-live="polite">
          {filteredCount} / {totalCount}
        </Text>
        <Button
          variant="subtle"
          size="xs"
          onClick={handleExpandToggle}
          leftSection={
            allExpanded ? (
              <IconChevronsUp size={14} />
            ) : (
              <IconChevronsDown size={14} />
            )
          }
        >
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </Button>
      </Stack>
    </Group>
  )
}
