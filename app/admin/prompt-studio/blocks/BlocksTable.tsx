'use client'

import { useState } from 'react'
import {
  Table,
  Box,
  Center,
  Group,
  Paper,
  Stack,
  Modal,
  Button,
  Checkbox,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { Text } from '@/components/admin/primitives/Text'
import { BlocksOverview } from './BlocksOverview'
import { SummarySection } from './SummarySection'
import toolbarStyles from '@/components/admin/lib/stickyToolbar.module.css'
import { BulkActionsBar } from '@/components/admin/content/BulkActionsBar'
import { BlockRow as DesktopBlockRow } from '@/components/admin/content/BlockRow'
import { BlockCard } from '@/components/admin/content/BlockCard'
import { BlockEditDrawer } from '@/components/admin/content/BlockEditDrawer'
import { BlockEditSheet } from '@/components/admin/content/BlockEditSheet'
import { BlockEditForm } from '@/components/admin/content/BlockEditForm'
import { useBlocksFilters } from '@/components/admin/content/useBlocksFilters'
import {
  FilterBar,
  FilterPopover,
  FilterRail,
  ResultMeta,
  FILTER_LAYOUT,
  type TypeCounts,
  type StatusCounts,
} from '@/components/admin/content/BlocksFilters'
import type { BlockType } from '@/services/prompt/block-types'
import type { Topic } from '@/components/admin/content/BlockEditForm'
import { isOrdered } from '@/services/prompt/block-order'
import { tokensFor } from '@/services/prompt/tokenize'
import type { PromptSet } from './promptSets'

type BlockStatus = 'active' | 'disabled' | 'deleted'

export interface BlockRow {
  id: string
  title: string
  type: string
  body: string
  status: BlockStatus
  is_default: boolean
  order: number | null
  prompt_set_id?: string | null
  created_at: string
  updated_at: string
  topics: { name: string } | null
  author: { name: string } | null
}

// Shape of the bare block row returned by POST /api/admin/blocks/duplicate.
// Step 16's endpoint matches POST /save's `.select()` posture — no joins —
// so the UI synthesizes `topics: null` and `author: null` when prepending
// the new row to local state. Neither field is rendered on the row after
// Step 11 (Topic dropped) or Step 14 (Author display deferred), so null
// is visually correct. They populate on the next page-level refresh.
type DuplicateResponse = {
  id: string
  title: string
  type: string
  body: string
  status: BlockStatus
  is_default: boolean
  order: number | null
  created_at: string
  updated_at: string
}

export function BlocksTable({
  rows,
  sets,
  topics,
  activeSetId,
  activeSetLabel,
  overview,
}: {
  rows: BlockRow[]
  sets?: PromptSet[]
  topics: Topic[]
  activeSetId: string | null
  activeSetLabel: string | null
  overview?: { version?: number | null; status?: string | null }
}) {
  const [items, setItems] = useState<BlockRow[]>(rows)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkInFlight, setBulkInFlight] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // URL-synced filter state — query/type/status come from ?q=, ?type=,
  // ?status=. Filtering below uses these values; the toolbar consumes
  // them for controlled inputs.
  const {
    query,
    setQuery,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    clearAll,
  } = useBlocksFilters()

  // useMediaQuery returns undefined on first render (SSR) and true/false
  // after mount. Treat undefined as "not mobile" so the drawer is the
  // first-paint default. Mobile visitors see a brief flash of the drawer
  // before it swaps to the sheet on hydration — acceptable trade.
  const isMobile = useMediaQuery('(max-width: 48em)') ?? false
  const EditContainer = isMobile ? BlockEditSheet : BlockEditDrawer

  const editingBlock = editingId
    ? items.find(b => b.id === editingId) ?? null
    : null

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedCount = selectedIds.size

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // allSelected / someSelected / toggleSelectAll are defined below,
  // after `filtered` is derived — select-all is scoped to the
  // currently-visible (filtered) set, not the full items list.

  async function handleBulkStatusChange(value: string | null) {
    if (value !== 'active' && value !== 'disabled') return
    const ids = Array.from(selectedIds)
    console.log('[BlocksTable] bulk status change:', { count: ids.length, status: value })
    setBulkInFlight(true)
    const succeeded: string[] = []
    for (const id of ids) {
      console.log('[BlocksTable] bulk PATCH dispatch:', { id, status: value })
      const ok = await patchBlock(id, { status: value })
      if (ok) {
        console.log('[BlocksTable] bulk PATCH success:', { id, status: value })
        succeeded.push(id)
      } else {
        console.error('[BlocksTable] bulk PATCH failure:', { id, status: value })
      }
    }
    if (succeeded.length > 0) {
      const updatedSet = new Set(succeeded)
      setItems(prev => prev.map(b => (updatedSet.has(b.id) ? { ...b, status: value } : b)))
    }
    setSelectedIds(new Set())
    setBulkInFlight(false)
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    console.log('[BlocksTable] bulk delete:', { count: ids.length })
    setBulkInFlight(true)
    const succeeded: string[] = []
    for (const id of ids) {
      console.log('[BlocksTable] bulk DELETE dispatch:', { id })
      const ok = await patchBlock(id, { status: 'deleted' })
      if (ok) {
        console.log('[BlocksTable] bulk DELETE success:', { id })
        succeeded.push(id)
      } else {
        console.error('[BlocksTable] bulk DELETE failure:', { id })
      }
    }
    if (succeeded.length > 0) {
      const removedSet = new Set(succeeded)
      setItems(prev => prev.filter(b => !removedSet.has(b.id)))
    }
    setSelectedIds(new Set())
    setBulkInFlight(false)
    setBulkDeleteOpen(false)
  }

  async function patchBlock(
    id: string,
    updates: { status?: BlockStatus; title?: string; body?: string; order?: number },
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/blocks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      return res.ok
    } catch (err) {
      console.error('[BlocksTable] patch failed:', err)
      return false
    }
  }

  async function handleStatusChange(id: string, value: string | null) {
    if (value !== 'active' && value !== 'disabled') return
    setSavingId(id)
    const ok = await patchBlock(id, { status: value })
    if (ok) {
      setItems(prev => prev.map(b => (b.id === id ? { ...b, status: value } : b)))
    }
    setSavingId(null)
  }

  function handleEdit(id: string) {
    setEditingId(id)
  }

  async function handleRename(id: string, newTitle: string) {
    const trimmed = newTitle.trim()
    if (!trimmed) return
    const current = items.find(b => b.id === id)
    if (!current || current.title === trimmed) return
    console.log('[BlocksTable] rename dispatch:', { id, newTitle: trimmed })
    setSavingId(id)
    const ok = await patchBlock(id, { title: trimmed })
    if (ok) {
      console.log('[BlocksTable] rename success:', { id, newTitle: trimmed })
      setItems(prev => prev.map(b => (b.id === id ? { ...b, title: trimmed } : b)))
    } else {
      console.error('[BlocksTable] rename failed:', { id })
      notifications.show({
        color: 'red',
        title: 'Rename failed',
        message: 'Could not rename this block. Try again.',
      })
    }
    setSavingId(null)
  }

  function handleCancelEdit() {
    setEditingId(null)
  }

  // POST /api/admin/blocks/duplicate, prepend the response to items.
  // Response-driven (not optimistic) — single round-trip, the new row
  // is small and the API is fast enough that local-mutate-on-200 is
  // simpler than reconciling an optimistic insert. The endpoint
  // returns the bare block (no joined topics/author per Step 16); UI
  // synthesizes null for those — they're not rendered on the row.
  async function handleDuplicate(id: string) {
    console.log('[BlocksTable] duplicate dispatch:', { id })
    setDuplicatingId(id)
    try {
      const res = await fetch('/api/admin/blocks/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: id }),
      })
      if (!res.ok) {
        console.error('[BlocksTable] duplicate failed:', { id, status: res.status })
        throw new Error('Duplicate failed')
      }
      const data = (await res.json()) as DuplicateResponse
      const newRow: BlockRow = { ...data, topics: null, author: null }
      console.log('[BlocksTable] duplicate success:', { sourceId: id, newId: newRow.id })
      setItems(prev => [newRow, ...prev])
    } catch (err) {
      console.error('[BlocksTable] duplicate error:', err)
      notifications.show({
        color: 'red',
        title: 'Duplicate failed',
        message: 'Could not duplicate this block. Try again.',
      })
    } finally {
      setDuplicatingId(null)
    }
  }

  // Shared PATCH logic for both save paths from BlockEditForm's hook.
  // Atomic: body and order persist together in a single PATCH (Step 12
  // of PR 2 — moved here from the inline NumberInput's onBlur path).
  // Runs the per-type duplicate-order check before dispatch; on
  // conflict, fires a red Mantine notification and throws so the
  // form treats it as a failure (drawer stays open, user can fix).
  // Throws on PATCH failure too — useBlockEditForm awaits this
  // callback and treats a resolved promise as "saved ok".
  async function persistEdit({
    body,
    order,
    type,
  }: {
    body: string
    order: number | null
    type: string | null
  }): Promise<void> {
    if (!editingId) return

    const current = items.find(b => b.id === editingId)
    if (!current) {
      console.error('[BlocksTable] persistEdit — block not found in state:', { id: editingId })
      throw new Error('Block not found')
    }

    // Only run the uniqueness check when the user is setting a meaningful
    // ordinal. 0 and null are "unset" (see src/lib/blockOrder.ts) and
    // multiple blocks of the same type can legitimately share them.
    const orderChanged = order !== current.order
    const conflict =
      orderChanged && isOrdered(order)
        ? items.find(
            b => b.id !== editingId && b.type === current.type && b.order === order,
          )
        : null
    console.log('[BlocksTable] persistEdit duplicate check:', {
      id: editingId,
      type: current.type,
      nextOrder: order,
      orderChanged,
      hasConflict: Boolean(conflict),
      conflictTitle: conflict?.title ?? null,
      conflictId: conflict?.id ?? null,
    })
    if (conflict) {
      notifications.show({
        color: 'red',
        title: 'Duplicate order number',
        message: `Order number already used by ${conflict.title} in this type. Please choose a different number.`,
      })
      throw new Error('Duplicate order number')
    }

    // Send only the fields that actually changed. The PATCH route
    // requires at least one update, so we always send body (it's the
    // dominant field; the form's primary purpose is body editing).
    //
    // Clearing order to null is intentionally a no-op against the API
    // — the PATCH route accepts integer order only, matching the
    // inline NumberInput's prior behavior (null was treated as
    // "invalid, skip"). To avoid local-state desync, we only flip the
    // local order when we actually sent the change.
    const willSendOrder = orderChanged && order !== null
    const typeChanged = type !== null && type !== current.type
    const updates: { body: string; order?: number; type?: string } = { body }
    if (willSendOrder) updates.order = order
    if (typeChanged) updates.type = type

    console.log('[BlocksTable] persistEdit PATCH dispatch:', { id: editingId, willSendOrder, typeChanged })
    const ok = await patchBlock(editingId, updates)
    if (!ok) {
      console.error('[BlocksTable] persistEdit PATCH failed:', { id: editingId })
      throw new Error('Save failed')
    }
    console.log('[BlocksTable] persistEdit PATCH success:', { id: editingId })
    setItems(prev =>
      prev.map(b =>
        b.id === editingId
          ? { ...b, body, order: willSendOrder ? order : b.order, type: typeChanged ? type! : b.type }
          : b,
      ),
    )
    setEditingId(null)
  }

  async function handleFormSave({ body, order, type }: { body: string; order: number | null; type: string | null }) {
    await persistEdit({ body, order, type })
  }

  async function handleFormSaveAnyway({ body, order, type }: { body: string; order: number | null; type: string | null }) {
    await persistEdit({ body, order, type })
  }

  async function handleConfirmDelete() {
    if (!deleteTargetId) return
    setDeleting(true)
    const ok = await patchBlock(deleteTargetId, { status: 'deleted' })
    if (ok) {
      setItems(prev => prev.filter(b => b.id !== deleteTargetId))
    }
    setDeleting(false)
    setDeleteTargetId(null)
  }

  // View-level filter. Runs synchronously on every render — `query` is
  // local to useBlocksFilters (instant keystroke feedback), and the
  // three filter guards short-circuit in cheapest-first order. The
  // meter above is intentionally NOT filtered; it measures reality,
  // not the current view.
  const filtered = items.filter(b => {
    if (typeFilter !== 'all' && b.type !== typeFilter) return false
    if (statusFilter !== 'all' && b.status !== statusFilter) return false
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      const hay = `${b.title} ${b.body ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // Bar-width normalization for the per-row Tokens column (Step 13 of
  // PR 2). Bars are sized relative to the heaviest currently-visible
  // block, not the 8000-token budget — the page-level meter already
  // covers absolute budget. Single pass over `filtered`; cheap enough
  // at typical scale (~50 rows) that no useMemo is needed. Falls back
  // to 0 when nothing is visible to avoid divide-by-zero downstream.
  const maxVisibleTokens = filtered.length > 0
    ? Math.max(0, ...filtered.map(b => tokensFor(b.body)))
    : 0

  // Summary recall stats — shown in the collapsed bar when the summary is hidden.
  // Active-only, matching BlocksOverview (the meter measures reality, not the view).
  const activeBlocks = items.filter(b => b.status === 'active')
  const guardrailActiveCount = activeBlocks.filter(b => b.type === 'guardrail').length
  const summaryStats = {
    status: overview?.status ?? null,
    count: activeBlocks.length,
    tokens: activeBlocks.reduce((sum, b) => sum + tokensFor(b.body), 0),
    guardrailCount: guardrailActiveCount,
  }

  // Facet counts — scoped to all items in the set (before type/status filtering).
  const typeCounts: TypeCounts = {}
  for (const b of items) typeCounts[b.type as keyof TypeCounts] = (typeCounts[b.type as keyof TypeCounts] ?? 0) + 1
  const statusCounts: StatusCounts = { active: 0, disabled: 0 }
  for (const b of items) {
    if (b.status === 'active') statusCounts.active++
    else if (b.status === 'disabled') statusCounts.disabled++
  }

  const hasFilters =
    typeFilter !== 'all' || statusFilter !== 'all' || query.trim().length > 0

  // The filter state object passed to all three filter presentations.
  const filterState = { query, setQuery, typeFilter, setTypeFilter, statusFilter, setStatusFilter }

  // Select-all is scoped to the currently-visible (filtered) set.
  // Bulk actions still operate on all selectedIds — so selections
  // made outside the current filter persist when filters change.
  const filteredSelectedCount = filtered.reduce(
    (n, b) => (selectedIds.has(b.id) ? n + 1 : n),
    0,
  )
  const allSelected =
    filtered.length > 0 && filteredSelectedCount === filtered.length
  const someSelected =
    filteredSelectedCount > 0 && filteredSelectedCount < filtered.length

  function toggleSelectAll() {
    console.log('[BlocksTable] toggle select-all (filtered)', {
      filteredCount: filtered.length,
      filteredSelectedCount,
    })
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (filteredSelectedCount > 0) {
        // Any visible selection → clear ALL visible (both full and partial).
        for (const b of filtered) next.delete(b.id)
      } else {
        // None visible selected → select all visible.
        for (const b of filtered) next.add(b.id)
      }
      return next
    })
  }

  // Expand-all / Collapse-all operates on the currently-filtered set.
  // "Expand all" in a filter context means "expand everything I can
  // see." Collapse wipes the expanded set entirely (no point keeping
  // hidden rows expanded).
  const allExpanded =
    filtered.length > 0 && filtered.every(b => expandedIds.has(b.id))

  function handleExpandAll() {
    console.log('[BlocksTable] expand all', { count: filtered.length })
    setExpandedIds(new Set(filtered.map(b => b.id)))
  }

  function handleCollapseAll() {
    console.log('[BlocksTable] collapse all')
    setExpandedIds(new Set())
  }

  return (
    <>
      <SummarySection stats={summaryStats}>
        <BlocksOverview
          blocks={items}
          version={overview?.version}
          status={overview?.status}
          topics={topics}
          activeSetId={activeSetId}
          activeSetLabel={activeSetLabel}
        />
      </SummarySection>

      {/* Filter region — switched by FILTER_LAYOUT constant */}
      {items.length > 0 && FILTER_LAYOUT === 'rail' ? (
        <Box style={{ display: 'grid', gridTemplateColumns: '208px minmax(0, 1fr)', gap: 'var(--mantine-spacing-xl)', alignItems: 'start' }}>
          <FilterRail
            f={filterState}
            typeCounts={typeCounts}
            statusCounts={statusCounts}
            total={items.length}
          />
          <Stack gap="md">
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <ResultMeta
                filteredCount={filtered.length}
                totalCount={items.length}
                allExpanded={allExpanded}
                onToggleExpand={allExpanded ? handleCollapseAll : handleExpandAll}
              />
            </Group>
            {selectedCount > 0 && (
              <BulkActionsBar
                selectedCount={selectedCount}
                disabled={bulkInFlight}
                onEnable={() => handleBulkStatusChange('active')}
                onDisable={() => handleBulkStatusChange('disabled')}
                onDelete={() => setBulkDeleteOpen(true)}
                onClear={() => setSelectedIds(new Set())}
              />
            )}
          </Stack>
        </Box>
      ) : items.length > 0 ? (
        <>
          <Box className={toolbarStyles.stickyToolbar}>
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              {FILTER_LAYOUT === 'popover'
                ? <FilterPopover f={filterState} typeCounts={typeCounts} statusCounts={statusCounts} />
                : <FilterBar f={filterState} typeCounts={typeCounts} statusCounts={statusCounts} />}
              <ResultMeta
                filteredCount={filtered.length}
                totalCount={items.length}
                allExpanded={allExpanded}
                onToggleExpand={allExpanded ? handleCollapseAll : handleExpandAll}
              />
            </Group>
          </Box>

          {/* Bulk action bar */}
          {selectedCount > 0 && (
            <BulkActionsBar
              selectedCount={selectedCount}
              disabled={bulkInFlight}
              onEnable={() => handleBulkStatusChange('active')}
              onDisable={() => handleBulkStatusChange('disabled')}
              onDelete={() => setBulkDeleteOpen(true)}
              onClear={() => setSelectedIds(new Set())}
            />
          )}
        </>
      ) : null}

      {/* Empty state — no items at all OR no items matching current filters */}
      {filtered.length === 0 ? (
        items.length === 0 ? (
          <Center h={200}>
            <Text variant="muted">No blocks yet.</Text>
          </Center>
        ) : (
          <Paper withBorder radius="md" p="xl" style={{ borderStyle: 'dashed', background: 'var(--mantine-color-gray-0)' }}>
            <Stack align="center" gap={7} py="lg">
              <Text variant="body" style={{ fontWeight: 600, fontSize: 14 }}>No blocks to show</Text>
              <Text variant="muted" style={{ fontSize: 14 }}>No blocks in this set match your filters.</Text>
              {hasFilters && (
                <Button variant="subtle" color="gray" size="xs" onClick={clearAll}>
                  Clear filters
                </Button>
              )}
            </Stack>
          </Paper>
        )
      ) : (
        // Items exist and some match — render the table/card list
        <>

          {/* Desktop: Table */}
          <Box visibleFrom="md">
            <Table striped highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 40 }}>
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={toggleSelectAll}
                      disabled={bulkInFlight}
                      aria-label="Select all blocks"
                    />
                  </Table.Th>
                  <Table.Th style={{ width: 28 }} aria-hidden />
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Tokens</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map(block => (
                  <DesktopBlockRow
                    key={block.id}
                    block={{ ...block, type: block.type as BlockType }}
                    selected={selectedIds.has(block.id)}
                    isSaving={savingId === block.id || duplicatingId === block.id}
                    isExpanded={expandedIds.has(block.id)}
                    maxVisibleTokens={maxVisibleTokens}
                    highlight={query}
                    onToggleSelect={toggleSelect}
                    onToggleStatus={handleStatusChange}
                    onEdit={handleEdit}
                    onRename={handleRename}
                    onDuplicate={handleDuplicate}
                    onDelete={setDeleteTargetId}
                    onToggleExpand={toggleExpand}
                  />
                ))}
              </Table.Tbody>
            </Table>
          </Box>

          {/* Mobile: Card stack */}
          <Stack gap="sm" hiddenFrom="md">
            {filtered.map(block => (
              <BlockCard
                key={block.id}
                block={{ ...block, type: block.type as BlockType }}
                selected={selectedIds.has(block.id)}
                isSaving={savingId === block.id || duplicatingId === block.id}
                maxVisibleTokens={maxVisibleTokens}
                highlight={query}
                onToggleSelect={toggleSelect}
                onToggleStatus={handleStatusChange}
                onOpenEdit={handleEdit}
                onRename={handleRename}
                onDuplicate={handleDuplicate}
                onDelete={setDeleteTargetId}
              />
            ))}
          </Stack>
        </>
      )}

      {/* Edit surface — Drawer on desktop (≥ md), bottom Sheet on mobile (< md).
          Both render <BlockEditForm> as their only child; form owns all
          save/safety-check state via useBlockEditForm. */}
      <EditContainer
        opened={editingBlock !== null}
        onClose={handleCancelEdit}
        title={editingBlock ? `Edit: ${editingBlock.title}` : undefined}
      >
        {editingBlock && (
          <BlockEditForm
            key={editingBlock.id}
            block={{
              id: editingBlock.id,
              title: editingBlock.title,
              body: editingBlock.body,
              type: editingBlock.type,
              order: editingBlock.order,
            }}
            promptSetLabel={
              editingBlock.prompt_set_id
                ? (sets?.find(s => s.id === editingBlock.prompt_set_id)?.label ?? null)
                : null
            }
            onSave={handleFormSave}
            onSaveAnyway={handleFormSaveAnyway}
            onCancel={handleCancelEdit}
            onRename={newTitle => handleRename(editingBlock.id, newTitle)}
          />
        )}
      </EditContainer>

      {/* Delete confirmation modal */}
      <Modal
        opened={deleteTargetId !== null}
        onClose={() => { if (!deleting) setDeleteTargetId(null) }}
        title="Delete block?"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text variant="muted">
            This block will be permanently removed from your prompt.
          </Text>
          <Group gap="xs" justify="flex-end">
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => setDeleteTargetId(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              color="red"
              size="sm"
              onClick={handleConfirmDelete}
              loading={deleting}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Bulk delete confirmation modal */}
      <Modal
        opened={bulkDeleteOpen}
        onClose={() => { if (!bulkInFlight) setBulkDeleteOpen(false) }}
        title={`Delete ${selectedCount} block${selectedCount === 1 ? '' : 's'}?`}
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text variant="muted">
            Delete {selectedCount} block{selectedCount === 1 ? '' : 's'}? This cannot be undone.
          </Text>
          <Group gap="xs" justify="flex-end">
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => setBulkDeleteOpen(false)}
              disabled={bulkInFlight}
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              color="red"
              size="sm"
              onClick={handleBulkDelete}
              loading={bulkInFlight}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
