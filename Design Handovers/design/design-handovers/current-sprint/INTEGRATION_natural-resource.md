# Integration Guide — Phase 2 on `jefftoronto76/natural-resource`

**Baseline branch:** `claude/blocks-redesign-phase-1-6GTgQ`
**Target file:** `app/admin/prompt-studio/blocks/BlocksTable.tsx` (extend)
**Stack:** Next.js 15 App Router · React 19 · Mantine 7.17 · Tabler Icons · Supabase · Clerk
**Phase 1 companion doc:** `design_handoff_blocks_redesign/INTEGRATION_natural-resource.md`

This guide extends Phase 1. Read Phase 1's INTEGRATION file first —
the component architecture, theme rules, and order semantics defined
there all carry forward.

---

## 0. What Phase 1 shipped (the baseline)

Phase 1 ships these files on the branch:

```
app/admin/prompt-studio/blocks/BlocksTable.tsx
components/admin/content/BlockRow.tsx
components/admin/content/BlockCard.tsx
components/admin/content/BlockEditDrawer.tsx
components/admin/content/BlockEditSheet.tsx
components/admin/content/BlockEditForm.tsx
components/admin/content/useBlockEditForm.ts
components/admin/content/SafetyCheckAlert.tsx
components/admin/content/BulkActionsBar.tsx
components/admin/content/SegmentedTokenMeter.tsx
```

Phase 2 **extends** these — do not rewrite. Treat their prop
contracts and file boundaries as load-bearing.

---

## 1. Phase 2 file plan

### Modify

```
app/admin/prompt-studio/blocks/BlocksTable.tsx
  + filter state (query, typeFilter, statusFilter) + URL sync
  + wrap desktop Table.Tbody in DndContext + SortableContext
  + toolbar row (search, segmented controls, expand-all)
  + pass dragHandleProps to <BlockRow>
  + gate <BlockCard> behind new MobileBlocksView (see below)

components/admin/content/BlockRow.tsx
  + grip column (useSortable listeners/attributes)
  + per-row Progress bar in the Tokens column
  + "Updated by {author}" meta line under title
  + leading order-index display ("01", "02" mono padded)
  + Duplicate action icon
  + Expanded content: meta sidecar (desktop) + "View raw" button

components/admin/content/BlockCard.tsx
  + selected/reorder visual states
  + drag grip (shown only in reorder mode)
  + delegate tap behavior to parent via new onOpenDetail prop
  (keep the existing prop contract intact — additive only)

components/admin/content/SegmentedTokenMeter.tsx
  + optional `collapsible` prop; when true, renders the per-type
    legend beneath the bar and a chevron toggle
  + used by the new MobileBlocksView with collapsible=true
```

### Add

```
components/admin/content/BlocksToolbar.tsx
  Desktop/tablet toolbar: SearchInput, TypeFilter SegmentedControl,
  StatusFilter SegmentedControl, ExpandAllButton. Owns no state —
  reads from props, fires callbacks.

components/admin/content/BlockDetailSheet.tsx
  Mobile read-only preview sheet. Same Drawer.Root pattern as
  BlockEditSheet but for reading, not editing. Footer has status
  Switch, Duplicate, Delete, Edit (Edit fires onRequestEdit and lets
  the parent swap this sheet for BlockEditSheet).

components/admin/content/MobileBlocksView.tsx
  Orchestrator for the mobile screen. Owns searchOpen, selectMode,
  reorderMode, detailId, meterExpanded, menuOpen. Renders the
  contextual app bar (plain / select / reorder), the collapsible
  meter, the search overlay, filter chips + overflow menu, the card
  stack, FAB, BlockDetailSheet, BlockEditSheet.

components/admin/content/MobileAppBar.tsx
  Three-mode header: 'default' | 'select' | 'reorder'. Pure
  presentational.

components/admin/content/FilterChipsRow.tsx
  Horizontal-scroll Chip.Group with overflow (•••) menu. Menu items:
  Select, Reorder, New block.

components/admin/content/useBlocksFilters.ts
  Hook: reads ?q=, ?type=, ?status= from useSearchParams, returns
  { query, typeFilter, statusFilter, setQuery, setTypeFilter,
  setStatusFilter }. setX writes back via router.replace with
  scroll: false. Debounces query updates at 200ms for URL writes
  (but the input value is controlled locally and synchronous).

lib/blockTypes.ts
  + add 'guardrail' | 'escalation' to BlockType union (if not already)
  + ensure TYPE_COLORS and TYPE_LABELS cover all five types
```

### Delete

Nothing. Phase 2 is purely additive.

---

## 2. Drag-to-reorder (feature 4)

Install:
```bash
npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

`BlocksTable.tsx` wraps the desktop `<Table.Tbody>` in:

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragEnd={handleDragEnd}
  modifiers={[restrictToVerticalAxis]}
>
  <SortableContext items={filteredIds} strategy={verticalListSortingStrategy}>
    <Table.Tbody>
      {filtered.map(block => <BlockRow key={block.id} ... />)}
    </Table.Tbody>
  </SortableContext>
</DndContext>
```

`handleDragEnd` computes the new full list, assigns contiguous `order`
values (1..N across ALL blocks — global order, same rule as Phase 1),
optimistically sets `items`, then dispatches one PATCH per changed row
through the existing `patchBlock` helper. On any failure, revert.

`BlockRow` becomes a `useSortable` consumer:
```tsx
const { setNodeRef, transform, transition, attributes, listeners } =
  useSortable({ id: block.id });
const style = { transform: CSS.Transform.toString(transform), transition };
return <Table.Tr ref={setNodeRef} style={style}>...</Table.Tr>;
```

The grip cell renders:
```tsx
<Table.Td style={{ width: 28 }}>
  <ActionIcon variant="subtle" {...attributes} {...listeners}
    style={{ cursor: 'grab' }} aria-label="Drag to reorder">
    <IconGripVertical size={14} />
  </ActionIcon>
</Table.Td>
```

Mobile: `BlockCard` gets a grip on the left, visible only when the
parent's `reorderMode === true`. Use `TouchSensor` with a 250ms delay
so taps don't start drags.

---

## 3. Filtering & URL sync (features 1–3, 13–14)

```tsx
// components/admin/content/useBlocksFilters.ts
export function useBlocksFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [query, setQueryLocal] = useState(params.get('q') ?? '')
  const typeFilter = (params.get('type') ?? 'all') as 'all' | BlockType
  const statusFilter = (params.get('status') ?? 'all') as 'all' | 'active' | 'disabled'

  // Debounce URL writes for query only
  useEffect(() => {
    const t = setTimeout(() => writeParam('q', query || null), 200)
    return () => clearTimeout(t)
  }, [query])

  function writeParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value === null || value === 'all' || value === '') next.delete(key)
    else next.set(key, value)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  return {
    query,
    setQuery: setQueryLocal,
    typeFilter,
    setTypeFilter: (v: string) => writeParam('type', v),
    statusFilter,
    setStatusFilter: (v: string) => writeParam('status', v),
  }
}
```

Filtering runs client-side over the full `rows` passed from the server
component (same as today). Do not move filtering to the server for
Phase 2 — the dataset is small enough.

---

## 4. Mobile modes (features 13–20)

`MobileBlocksView.tsx` is the sole owner of mobile mode state. It's
a drop-in replacement for the current mobile card stack in
`BlocksTable.tsx`:

```tsx
// BlocksTable.tsx — mobile branch
<Stack gap="sm" hiddenFrom="md">
  <MobileBlocksView
    items={items}
    selectedIds={selectedIds}
    savingId={savingId}
    filters={filters}
    onToggleSelect={toggleSelect}
    onToggleStatus={handleStatusChange}
    onOrderCommit={handleOrderBlur}
    onOpenEdit={handleEdit}
    onDelete={setDeleteTargetId}
    onReorder={handleReorder}
    onBulkStatus={handleBulkStatusChange}
    onBulkDelete={handleBulkDelete}
  />
</Stack>
```

Internally it renders:
- `<MobileAppBar mode={mode} />` — one of 'default' | 'select' | 'reorder'
- `<SegmentedTokenMeter collapsible />` when `mode === 'default'`
- `<Transition>`-gated search overlay when `searchOpen`
- `<FilterChipsRow>` when `mode === 'default'` — overflow menu enters select/reorder modes
- Card stack — `BlockCard` in 'default' mode; card in 'select' mode with checkbox visible + tap-to-select; card in 'reorder' mode with grip + drag sensors
- `<ActionIcon>` FAB (`position: fixed; bottom: 16px; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom))`) when `mode === 'default'`
- `<BlockDetailSheet>` when `detailId !== null`
- `<BlockEditSheet>` when `editingId !== null` (state stays owned by `BlocksTable.tsx`, passed in)

**Detail → Edit transition:** on tap Edit inside detail sheet, call
`setDetailId(null)` and `requestAnimationFrame(() => onOpenEdit(id))`.
This prevents stacked bottom sheets during the 200ms scrim fade.

---

## 5. Data-layer change

`app/admin/prompt-studio/blocks/page.tsx` currently selects:
```
id, title, type, body, status, is_default, order, created_at, topics(name)
```

Add `updated_at` and an author relationship:
```
id, title, type, body, status, is_default, order,
created_at, updated_at,
topics(name),
author:users!blocks_updated_by_fkey(name)
```

Exact join syntax depends on your existing `blocks.updated_by` /
`users` relationship. Confirm before writing. If `updated_by` doesn't
exist, surface that to the user and stop — don't invent a column.

Extend `BlockRow` (the interface, not the component) in both
`BlocksTable.tsx` and `BlockRow.tsx` / `BlockCard.tsx`:
```ts
export interface BlockRow {
  // ...existing
  updated_at: string
  author: { name: string } | null
}
```

---

## 6. Tablet density (feature 12)

Mantine's `visibleFrom` / `hiddenFrom` are two-state. For the three
breakpoints in the mock, add an explicit media query band using
Mantine's `useMatches`:

```tsx
const density = useMatches({
  base: 'mobile',      // < sm
  md: 'tablet',        // 768–1023
  lg: 'desktop',       // ≥ 1024
})
```

In `BlockRow`, conditionally omit:
- Grip column when `density === 'tablet'`
- Topic column when `density === 'tablet'`
- Per-row Progress bar (keep tokens number, drop the bar) when `density === 'tablet'`
- Duplicate + View-raw icons — collapse to a single `•••` menu when `density === 'tablet'`

The mobile card layout kicks in at `base`; the tablet-adjusted table
at `md`; the full desktop layout at `lg`.

---

## 7. Duplicate (feature 9)

Add `POST /api/admin/blocks/duplicate` taking `{ id: string }`,
returning the new block row. The route:
1. Fetches the source block.
2. Inserts a copy with title = `{original} (copy)`, status = `disabled`, order = max+1 for that type.
3. Returns the new row.

Client: optimistic — insert a placeholder row with temp id at the top,
swap to server row on 200.

Bulk duplicate: loop sequential calls (same pattern as bulk status).
Acceptable for Phase 2; batch endpoint is Phase 3.

---

## 8. Prompt for Claude Code

Paste this when you open the repo in Claude Code:

> Read `design_handoff_blocks_phase_2/README.md` then
> `design_handoff_blocks_phase_2/INTEGRATION_natural-resource.md`.
> Baseline is branch `claude/blocks-redesign-phase-1-6GTgQ`. Phase 1
> components (`BlockRow`, `BlockCard`, `BlockEditForm`, the two edit
> shells, `useBlockEditForm`, `BulkActionsBar`, `SegmentedTokenMeter`)
> already exist — extend them, do not rewrite. Implement Phase 2 in
> the order listed in INTEGRATION section 1. Use `@mantine/core`
> primitives; install `@dnd-kit/core @dnd-kit/sortable
> @dnd-kit/utilities` for drag. Do not change the
> `PATCH /api/admin/blocks/[id]` contract. Add the new duplicate
> route per section 7. Confirm the `blocks.updated_by` → `users`
> relationship exists before adding `author` to the select; if not,
> stop and ask. Where README and INTEGRATION conflict, INTEGRATION
> wins. Produce PRs in this order: (1) filters + URL sync,
> (2) drag reorder, (3) per-row meta + token bar + tablet density,
> (4) mobile modes (select/reorder/detail-sheet), (5) duplicate.
> After each PR, run `npm run build` and `npm test`.

---

## 9. Acceptance checklist

### Desktop / tablet
- [ ] Search input filters by title + body substring, debounced 200ms, URL-synced via `?q=`.
- [ ] Type and Status segmented controls filter the list and URL-sync via `?type=` / `?status=`.
- [ ] Rows reorder by drag handle AND by NumberInput; both paths PATCH `order`. Order is GLOBAL across all blocks.
- [ ] Expand-all / collapse-all toolbar button toggles every row's inline preview.
- [ ] Each row shows a per-row tokens mini Progress bar at `density === 'desktop'`; just the number at `density === 'tablet'`.
- [ ] Each row shows "Updated {relative date} by {author name}" beneath the title.
- [ ] Inline-expanded row has a right-hand meta sidecar (Tokens / Author / Updated / Order) at desktop density; stacked above the content at tablet density.
- [ ] "View raw" button in the inline preview opens a lightweight modal (or just the edit drawer scrolled to the textarea — either acceptable).
- [ ] Duplicate works per-row and in the bulk bar.
- [ ] Tablet density (768–1023) renders a compact column set; desktop (≥1024) renders all columns.

### Mobile
- [ ] Search icon in app bar opens an overlay input; typing filters the list.
- [ ] Filter chips row is horizontally scrollable; active chip snaps into view.
- [ ] Overflow menu (•••) on chips row opens Select / Reorder / New block.
- [ ] Select mode swaps to a contextual app bar (Cancel · "{N} selected" · Enable · Disable · Delete). Tap-through to edit is disabled.
- [ ] Reorder mode swaps to a "Reorder blocks" header with Done button. Each card shows a grip on the left; long-press + drag reorders.
- [ ] Token meter is collapsible: tapping toggles the per-type legend (token count + % of budget per type).
- [ ] FAB visible in default mode only; positioned with `env(safe-area-inset-bottom)`.
- [ ] Tapping a card in default mode opens a **read-only** `BlockDetailSheet`.
- [ ] Tapping Edit inside the detail sheet closes the detail sheet, then opens the `BlockEditSheet` on the next frame (no stacking).

### Data / API
- [ ] `page.tsx` Supabase select includes `updated_at` and an author relationship.
- [ ] `POST /api/admin/blocks/duplicate` exists and returns the new row.
- [ ] No changes to `PATCH /api/admin/blocks/[id]`.

### Build / tests
- [ ] `npm run build` clean.
- [ ] `npm test` clean — Phase 1 tests still pass.
- [ ] New tests: `useBlocksFilters` round-trips URL params; `MobileBlocksView` mode transitions; drag-reorder handler computes correct new order.

---

## 10. Out of scope for Phase 2

Explicitly NOT in this phase — resist the urge:

- Batch reorder endpoint (Phase 3).
- Optimistic-mutation library (react-query / SWR).
- Compile-preview modal redesign.
- Per-block comments / history / version pinning.
- Server-side filtering / pagination.
- Collaborative editing / presence.

If any of these feel necessary to finish Phase 2, stop and raise a
concern — they're deliberately deferred.
