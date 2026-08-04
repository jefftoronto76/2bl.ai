# Blocks Redesign — Phase 2 Implementation Plan

**Base branch:** `redesign/blocks-phase-2` (off `main` at `bf75301 Merge Phase 1 blocks redesign`)
**Baseline:** Phase 1 complete. Components at `components/admin/content/` (`BlockRow`, `BlockCard`, `BlockEditForm` + `useBlockEditForm` + `SafetyCheckAlert`, `BlockEditDrawer`, `BlockEditSheet`, `BulkActionsBar`, `SegmentedTokenMeter`). Shared utilities at `src/lib/blockOrder.ts` and `src/lib/blockTypes.ts`. Test infrastructure (Vitest + Testing Library + happy-dom) at `vitest.config.ts`, `vitest.setup.ts`, `test/render.tsx`. 25 existing tests across 5 files.

**This document is produced incrementally** — one PR plan per commit to keep each section reviewable and avoid producing a wall of text. See "Status" below.

---

## Status

- [x] **PR 1 — Filters + URL sync** *(this document)*
- [ ] PR 2 — Drag reorder *(planned after PR 1 approval)*
- [ ] PR 3 — Per-row meta + token bar + tablet density
- [ ] PR 4 — Mobile modes (select / reorder / detail-sheet)
- [ ] PR 5 — Duplicate

---

## Flags surfaced before any PR starts

1. **Mantine docs fetch failed.** `https://mantine.dev/llms.txt` returned 403 during the planning read. Proceeding on Phase 1 working knowledge of Mantine v7 (SegmentedControl, TextInput, Chip.Group, Drawer compound API, ActionIcon, Progress, useMatches, TouchSensor, etc.). If any specific Mantine API detail is unclear during implementation, I'll stop and ask rather than guess.

2. **PR 3 has a schema gate.** INTEGRATION §5 requires `blocks.updated_at` and a `blocks.updated_by → users(id)` fkey. Neither is documented in `CLAUDE.md`'s blocks schema row. If the fkey doesn't exist, the user instruction is "stop and ask" — that gate lives inside PR 3, not here.

3. **PR 4 has a product-decision gate.** README §Phase 2 scope item 20 flags a mental-model change for mobile (tap card → read-only detail sheet → Edit button → edit sheet, instead of today's tap card → edit sheet). This adds a tap for every edit. Will confirm with product before building PR 4.

None of these gates affect PR 1. Proceeding with PR 1.

---

## PR 1 — Filters + URL sync

### Goal

Add client-side search and filter controls to the Blocks page, with filter state URL-synced so a filtered view is shareable. Filtering runs in the browser over the full tenant dataset loaded by the server component — no server-side changes.

### What this PR does NOT do

- Does not touch mobile UI. The mobile card stack will still render but without interactive filter controls. A filter set via URL (`?type=guardrail`) does still affect mobile rendering because the filtering happens at the shared `items` → `filtered` stage. Full mobile filter UX (search overlay, chip row) arrives in PR 4.
- Does not add drag (PR 2), per-row meta (PR 3), or duplicate (PR 5).
- Does not alter any API route.

### Files

**New:**
- `components/admin/content/useBlocksFilters.ts` — hook
- `components/admin/content/useBlocksFilters.test.ts` — hook tests
- `components/admin/content/BlocksToolbar.tsx` — desktop/tablet toolbar

**Modified:**
- `app/admin/prompt-studio/blocks/BlocksTable.tsx` — consume hook + toolbar, thread filtered items, wire expand-all

### Step-by-step

Ordering principle matches Phase 1: foundation before consumers before the rewrite. Existing `BlocksTable.tsx` keeps working throughout — each commit leaves the page shippable.

---

#### Step 1 — Add `useBlocksFilters` hook

**Files:**
- `components/admin/content/useBlocksFilters.ts` (new, ~60–80 lines)

**Build:**
Hook returns `{ query, setQuery, typeFilter, setTypeFilter, statusFilter, setStatusFilter }`.
- `query: string` — local state, initialized from `useSearchParams().get('q') ?? ''`. User-facing value is synchronous (controlled input updates instantly); URL writes are debounced 200ms via a `setTimeout` in `useEffect`.
- `typeFilter: 'all' | BlockType` — derived from `useSearchParams().get('type') ?? 'all'`. Setter writes immediately (no debounce — segmented control clicks are discrete).
- `statusFilter: 'all' | 'active' | 'disabled'` — same pattern as type.
- URL writes via `router.replace(\`${pathname}?${params.toString()}\`, { scroll: false })`.
- Empty-string / `'all'` values remove the param key (clean URL).
- `useRouter`, `usePathname`, `useSearchParams` from `next/navigation`.

**Observability:**
- `console.log('[useBlocksFilters] url write', { key, value })` on each param write. Per the Phase 1 principle: async/user-transaction operations log, pure-view derivations don't. URL writes are side effects, so they log.

**Acceptance:** `npm run build` compiles; hook is importable; not yet consumed.

**Depends on:** nothing.

---

#### Step 2 — Tests for `useBlocksFilters`

**Files:**
- `components/admin/content/useBlocksFilters.test.ts` (new, ~120 lines)

**Build:**
`renderHook` from `@testing-library/react`. Mock `next/navigation`'s `useRouter`, `usePathname`, `useSearchParams` (vi.mock of the module). Tests:

1. **Defaults when URL is empty** — `query === ''`, `typeFilter === 'all'`, `statusFilter === 'all'`.
2. **Reads initial state from URL** — mock `useSearchParams` to return `?q=hello&type=guardrail&status=disabled`; expect the three values.
3. **`setQuery` updates local state synchronously** — typing 'foo' sets `query` immediately.
4. **`setQuery` writes URL after 200ms debounce** — use `vi.useFakeTimers()`, call `setQuery('foo')`, advance 199ms → no `router.replace` call, advance 1ms more → call fires with `?q=foo`.
5. **`setTypeFilter` writes URL immediately** — no debounce.
6. **Setting value to `'all'` removes the param** — sets `q` first, then calls `setTypeFilter('all')`; expect URL to not include `type`.
7. **Setting empty string removes `?q=`** — same pattern as above.

**Acceptance:** `npm test` green; 7 new tests pass.

**Depends on:** Step 1.

---

#### Step 3 — Add `BlocksToolbar` component

**Files:**
- `components/admin/content/BlocksToolbar.tsx` (new, ~80 lines)

**Build:**
Pure presentational Mantine component. Props:
```ts
interface BlocksToolbarProps {
  query: string
  onQueryChange: (value: string) => void
  typeFilter: 'all' | BlockType
  onTypeFilterChange: (value: 'all' | BlockType) => void
  statusFilter: 'all' | 'active' | 'disabled'
  onStatusFilterChange: (value: 'all' | 'active' | 'disabled') => void
  allExpanded: boolean
  onToggleExpandAll: () => void
}
```

Layout (`<Group justify="space-between" wrap="wrap">`):
- Left cluster: `TextInput` with `leftSection={<IconSearch />}` (placeholder "Search title or body", `size="sm"`, `w={280}`).
- Middle cluster: two `SegmentedControl`s (`size="xs"`):
  - Type: `[All, Guardrail, Identity, Process, Knowledge, Escalation]` — labels from `TYPE_LABELS` via `src/lib/blockTypes.ts`, values are the raw keys + `'all'`.
  - Status: `[All, Active, Disabled]`.
- Right cluster: `Button variant="subtle" size="xs"` labeled `"Collapse all"` when `allExpanded`, else `"Expand all"`, with `IconChevronsDown` / `IconChevronsUp` left section.

**Observability:** Logs per user-click — `[BlocksToolbar] type filter`, `[BlocksToolbar] status filter`, `[BlocksToolbar] expand-all toggle`. Query changes are noisy (one log per keystroke would be spam), so skip query-input logs.

**Gated visibility:** Wrap in `<Box visibleFrom="md">` at the call site in Step 4 — mobile gets nothing this PR.

**Acceptance:** Build green. Not yet consumed.

**Depends on:** `src/lib/blockTypes.ts` (`TYPE_LABELS`, `BlockType`).

---

#### Step 4 — Wire `useBlocksFilters` + filtering into `BlocksTable`

**Files:**
- `app/admin/prompt-studio/blocks/BlocksTable.tsx` (modified, ~25-line delta)

**Build:**
- Import `useBlocksFilters`, `BlocksToolbar`.
- Call `useBlocksFilters()` at top of component.
- Derive `filtered`:
  ```tsx
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
  ```
- Swap desktop `items.map` → `filtered.map` inside the Table.Tbody.
- Swap mobile `items.map` → `filtered.map` inside the Stack.
- Render `<BlocksToolbar>` wrapped in `<Box visibleFrom="md" mb="md">` between the `<SegmentedTokenMeter>` and the bulk bar. Pass expand-all stub for now — wiring lands in Step 5.

**Behavioral guarantees:**
- `selectedIds`, `expandedIds`, `editingId` still reference `block.id` — filtering hides rows but doesn't mutate these sets. If a user selects a row, filters it out, changes filters back — selection persists. Intentional.
- Empty filter result: the existing "No blocks yet" empty state won't trigger because `items.length > 0` is still true. For PR 1 scope, no new "No matches" empty state — a visibly empty table is acceptable; a dedicated empty state is a polish ticket.

**Acceptance:** Live — typing in search filters rows, segmented controls filter, URL reflects state (copy URL → reload → same filter). Build green, existing 25 tests still pass.

**Depends on:** Steps 1, 3.

---

#### Step 5 — Wire expand-all / collapse-all

**Files:**
- `app/admin/prompt-studio/blocks/BlocksTable.tsx` (modified, ~10-line delta)

**Build:**
- Add handlers:
  ```tsx
  function handleExpandAll() {
    console.log('[BlocksTable] expand all', { count: filtered.length })
    setExpandedIds(new Set(filtered.map(b => b.id)))
  }
  function handleCollapseAll() {
    console.log('[BlocksTable] collapse all')
    setExpandedIds(new Set())
  }
  ```
  Note: `expand all` operates over the **currently-filtered** set, not the full items. Collapsing is global (empties the set). Rationale: "expand all" in a filter context means "expand everything I can see," not "expand things I can't see too."
- Derive `allExpanded = filtered.length > 0 && filtered.every(b => expandedIds.has(b.id))`.
- Wire toolbar props: `allExpanded`, `onToggleExpandAll={allExpanded ? handleCollapseAll : handleExpandAll}`.

**Acceptance:** Live — toolbar button toggles preview for all filtered rows; label flips between "Expand all" / "Collapse all" based on current state. Build green, tests pass.

**Depends on:** Step 4.

---

### PR 1 acceptance criteria (end-to-end)

- [ ] Search input filters the visible rows by title + body substring (case-insensitive), debounced 200ms for URL writes.
- [ ] Type segmented control filters by block type; URL-syncs via `?type=`.
- [ ] Status segmented control filters by active/disabled; URL-syncs via `?status=`.
- [ ] Setting a filter to "All" removes the param from the URL (clean URLs).
- [ ] Refreshing the page preserves filter state.
- [ ] Expand all / Collapse all toggles all filtered rows' inline preview.
- [ ] Mobile card stack is still visible; filters set via URL affect what's rendered there too. No mobile filter UI yet (arrives PR 4).
- [ ] Selection and editing state persist across filter changes (selected rows that get filtered out remain selected if they reappear).
- [ ] `npm run build` clean. `npm test` — 25 existing + 7 new (useBlocksFilters tests) = 32 tests, all pass.

---

### Per-step verification protocol (reused from Phase 1 Steps 13–18)

After each commit, report:

1. Full `npm run build` output.
2. Full `npm test` output.
3. Explicit manual test list — clicks / inputs / URLs actually tested (deferred to reviewer where I can't run a browser).
4. Regression checks against adjacent behavior.
5. Console observations.

Wait for explicit approval before the next step.

---

### Out of scope for PR 1

Explicitly deferred to later PRs:

- Mobile search overlay + filter chip row (**PR 4**).
- Drag handle column (**PR 2**).
- Per-row meta ("Updated by …") (**PR 3**).
- Duplicate action (**PR 5**).
- "No matches" empty state for an empty filter result (polish — not on any PR).

---

*PR 2 plan arrives in a subsequent commit after PR 1 approval.*
