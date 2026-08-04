# Blocks Redesign — Phase 2 PR 2 (Page Rework)

**Base branch:** `redesign/blocks-page-rework` (off `main` at `491819b Merge PR 1`)
**Baseline:** PR 1 merged to main. `BlocksTable.tsx` consumes `useBlocksFilters`, `BlocksToolbar`, the existing Phase 1 components (`BlockRow`, `BlockCard`, `BlockEditForm`, etc.), and renders the desktop toolbar with search + type/status SegmentedControls + filter counter + expand-all. 32 tests pass.

**This PR replaces the original Phase 2 drag-reorder plan** with a focused redesign aligned to the design target at `docs/design/design-handovers/current-sprint/Blocks Redesign.html`. Drag-and-drop is explicitly out — AI-driven ordering will handle that later. Mobile-specific UX (filter overlay, FAB, reorder mode) is also deferred.

---

## Status

- [x] PR 1 — Filters + URL sync (merged to main as `491819b`)
- [ ] **PR 2 — Page rework** (this document)

---

## Resolved decisions (recorded from review)

- **F1 — Schema migration:** No migrations file in the repo. SQL output to chat for manual execution against Supabase before Step 12.
- **F2 — New-block flow:** Approach (a) approved. Extend `BlockEditForm` with `mode: 'edit' | 'new'`. One form, two modes; reuses safety-check flow.
- **F3 — Duplicate endpoint:** Path is `POST /api/admin/blocks/duplicate` (not `/api/admin/blocks`). New file `app/api/admin/blocks/duplicate/route.ts`.
- **F4 — Page header migration:** Migrate `page.tsx` header to Mantine in Step 6, dropping the Tailwind wrapper.
- **Item 5 — Manual order edit:** Move from inline `NumberInput` to `BlockEditForm` order field. Drop the inline NumberInput entirely. Form gains an `order` field rendered in both `'edit'` and `'new'` modes. Per-type uniqueness check still fires on save (parent-side, before PATCH). Conflict surfacing details resolved in Step 12 implementation.
- **Item 6 — Null author display:** Omit "by …" entirely when `author` is null. Display reduces to "Updated 2d ago". The `updated_at` backfill from `created_at` keeps the timestamp meaningful even on legacy rows.

A new FOLLOWUPS entry has been added (2026-05-05) for the duplicate-endpoint order-accumulation concern.

---

## Out of scope

Explicitly NOT in this PR:

- Drag-and-drop reordering. Deferred to a future AI-ordering phase. Manual `NumberInput` order override stays (already shipped).
- Mobile-specific changes: filter overlay, FAB, reorder mode, multi-select mode, detail sheet. The existing `BlockCard` keeps its current behavior (tap → opens edit sheet).
- Bulk Duplicate. Per-row Duplicate is in scope; bulk-bar Duplicate is not.

---

## Flags surfaced before any step starts

(All 6 resolved — see "Resolved decisions" section above. Original flag wording retained below for context.)

### F1. Schema migration required (BLOCKS Step 12) — RESOLVED

`blocks.updated_at` and `blocks.updated_by` do not exist. The "Updated {time} by {author}" meta line (Step 12) cannot be implemented without them.

**Proposed migration:**

```sql
ALTER TABLE blocks
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN updated_by UUID REFERENCES users(id);

-- Backfill: legacy rows get created_at as their updated_at; updated_by stays null.
UPDATE blocks SET updated_at = created_at WHERE updated_at IS NULL;

-- Optional: trigger to auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION set_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blocks_updated_at_trigger
  BEFORE UPDATE ON blocks
  FOR EACH ROW EXECUTE FUNCTION set_blocks_updated_at();
```

`updated_by` is application-managed (set by the PATCH route from `authCtx.owner_id`). The trigger handles `updated_at` automatically so we don't need to set it client-side or in every route.

**Migration must run before Step 12.** Step 12 is the only step that depends on these columns; all earlier steps are unblocked.

### F2. New-block flow — ambiguity (BLOCKS Step 7) — RESOLVED

Your spec says: "+ New block opens BlockEditDrawer/BlockEditSheet with empty draft."

The current `BlockEditForm` only has a body Textarea. A new block needs at minimum: `title`, `type`, `body`, and `topic_id` (the existing `POST /api/admin/blocks/save` endpoint requires all four). Two interpretations:

- **(a) Extend `BlockEditForm`** with optional `title` + `type` + `topic_id` fields rendered when in "new" mode (existing block ID absent). One form, two modes.
- **(b) Add a separate `BlockNewForm`** component, also rendered inside the same Drawer/Sheet shells.

Plan defaults to (a) — minimum new components, reuses the form's safety-check flow. **Confirm before Step 7 starts.**

Endpoint: I'll reuse the existing `POST /api/admin/blocks/save` (designed for the Composer create flow but generic enough). If you want a dedicated `/api/admin/blocks` POST, flag.

### F3. Duplicate endpoint path — RESOLVED (`/api/admin/blocks/duplicate`)

Your spec: `POST /api/admin/blocks`. Current state: that route file (`app/api/admin/blocks/route.ts`) has GET only. Plan adds a POST handler at that path. If you'd prefer `/api/admin/blocks/duplicate` for clearer naming, flag — minor change.

### F4. `page.tsx` Tailwind layout — RESOLVED (migrate in Step 6)

The existing `app/admin/prompt-studio/blocks/page.tsx` uses Tailwind classes for the page-header `<div>`. Your standing rules say "Mantine primitives only in admin components, no Tailwind." Plan migrates the page header to Mantine (`<Group>` + `<Stack>`) as part of Step 6 (subtitle work). If you'd rather leave the legacy Tailwind wrapper alone, flag.

### F5. Mantine docs unfetchable

`https://mantine.dev/llms.txt` returned 403 in earlier sessions. Proceeding on Phase 1 / PR 1 working knowledge for `Highlight`, `Chip` / `Chip.Group`, `Progress`, etc. If any specific Mantine API surface needs verification during a step, I'll stop and flag.

---

## Step-by-step plan

Foundation → page chrome → meter → toolbar → row restructuring → duplicate → search highlight. Existing UX keeps working through every commit; each step is shippable.

---

### Foundation: data layer

#### Step 1 — Run schema migration (no commit)

**Files:** none. Per resolved F1, migration SQL is output to chat for manual execution in the Supabase SQL Editor. No file lands in the repo.

**Build:** SQL per F1. After execution, `\d blocks` should show two new columns plus the `blocks_updated_at_trigger`.

**Verification:** Reviewer runs the SQL, confirms columns + trigger exist, backfill applied. No code change in the repo for this step — Step 1 completion is signaled by reviewer approval after manual execution.

**Depends on:** nothing.

---

#### Step 2 — Update CLAUDE.md schema row

**Files:** `CLAUDE.md` (modified, ~3-line delta on the blocks row).

**Build:** Update the blocks schema cell to include `updated_at (timestamptz default now(), auto-set on update)` and `updated_by (uuid references users(id), nullable for legacy rows)`. Mention the trigger.

**Verification:** Document review only — no code impact.

**Depends on:** Step 1 having landed.

---

#### Step 3 — `PATCH /api/admin/blocks/[id]` sets `updated_by`

**Files:** `app/api/admin/blocks/[id]/route.ts` (modified, ~3-line delta).

**Build:** Add `updates.updated_by = authCtx.owner_id` to the updates payload before the Supabase `update()` call. `updated_at` is auto-set by the trigger; no client write needed.

**Verification:** Build green. Tests unchanged. Live: editing a block stamps `updated_by` to the current user (verifiable via DB query).

**Depends on:** Step 1.

---

#### Step 4 — `page.tsx` SELECT extended

**Files:** `app/admin/prompt-studio/blocks/page.tsx` (modified, ~2-line delta).

**Build:** Extend SELECT:
```ts
.select(`
  id, title, type, body, status, is_default, order,
  created_at, updated_at,
  topics(name),
  author:users!blocks_updated_by_fkey(name)
`)
```

The `author:users!blocks_updated_by_fkey(name)` syntax names the relationship explicitly so Postgres doesn't have to guess between `default_edited_by` and `updated_by` (both reference users). Confirm exact join syntax against the migrated schema; flag if different.

**Verification:** Build green. Page renders. Live: `console.log` from page.tsx shows new fields populated for blocks edited post-migration.

**Depends on:** Steps 1, 3.

---

#### Step 5 — Extend `BlockRow` interface across the type graph

**Files:**
- `app/admin/prompt-studio/blocks/BlocksTable.tsx` (`BlockRow` interface, ~3-line delta)
- `components/admin/content/BlockRow.tsx` (`BlockRowBlock` interface, ~3-line delta)
- `components/admin/content/BlockCard.tsx` (`BlockCardBlock` interface, ~3-line delta — additive only; mobile rendering unchanged)

**Build:** Add `updated_at: string` and `author: { name: string } | null` to all three interfaces. Both fields nullable-tolerant in render (legacy rows don't have an author).

**Verification:** Build green. Tests unchanged. No visual change.

**Depends on:** Step 4.

---

### Page chrome

#### Step 6 — Page header restructure (subtitle + Mantine layout)

**Files:** `app/admin/prompt-studio/blocks/page.tsx` (modified, ~10-line delta).

**Build:** Migrate the page-header `<div className="flex …">` to Mantine `<Group justify="space-between">` containing:
- Left: `<Stack gap={4}>` with `Text variant="title"` + new `Text variant="muted" size="sm">Reusable prompt chunks — compiled into Sage's system prompt.</Text>`
- Right: `<Group gap="xs">` with placeholder for `<NewBlockButton />` (Step 7) + existing `<PublishButton />`

This step adds the subtitle but leaves the new-block button as a comment placeholder until Step 7.

**Verification:** Build green. Page header shows title + subtitle; existing PublishButton still works. Mobile breakpoint sanity-check: Stack stacks vertically below md if needed.

**Depends on:** nothing.

---

#### Step 7 — New block button + form mode

**Files:**
- `components/admin/content/BlockEditForm.tsx` (modified, ~25-line delta) — add optional `mode: 'edit' | 'new'` prop; render title/type/topic fields when `mode === 'new'`.
- `components/admin/content/useBlockEditForm.ts` (modified, ~20-line delta) — extend hook draft state with optional title/type/topic for new mode; route Save through to the appropriate endpoint.
- `components/admin/content/NewBlockButton.tsx` (new, ~50 lines) — client component: button + EditContainer (Drawer/Sheet picker) + form in 'new' mode. Owns its own open state.
- `app/admin/prompt-studio/blocks/page.tsx` (modified) — replace the placeholder with `<NewBlockButton />`.

**Build:** Per resolved F2, approach (a) confirmed: extend `BlockEditForm` with a `mode: 'edit' | 'new'` prop. In new mode, render `title`, `type`, `topic_id` fields above the body Textarea. Order is NOT part of Step 7 — newly created blocks save with `order = null` (the existing Postgres default). Step 12 later adds the order field to the form, visible in both modes.

Save POSTs to existing `POST /api/admin/blocks/save` (Composer create endpoint). Required fields per that endpoint: `type`, `topic_id`, `title`, `body`. New `body` from form draft; `type` from form select; `title` from form input; `topic_id` from a select sourced via `GET /api/admin/topics`.

**Verification:** Click "+ New block" → drawer/sheet opens with title/type/topic/body inputs (no order yet). Save → POST → block appears in list (page revalidates). Cancel discards.

**Depends on:** nothing data-side. Step 12 adds order to the form afterwards — independent.

---

### Meter

#### Step 8 — `SegmentedTokenMeter` regrouped by type + legend + counter format

**Files:** `components/admin/content/SegmentedTokenMeter.tsx` (modified, ~50-line delta).

**Build:**
- Replace per-block segment generation with per-type aggregation: group `blocks` by type, sum tokens per type, sort by `TYPE_COMPILE_ORDER`. One `Progress.Section` per type instead of per block.
- Add legend: render to the right of (or below at narrow widths) the bar — `Chip`-styled labels showing `{TYPE_LABELS[type]} {totalTokens}` colored by `TYPE_COLORS[type]`.
- Counter format: `"{used} / {budget} tokens · {N} of {M} active"` where `N` = active block count from props and `M` = total non-deleted blocks count from a new prop.
- Add `totalBlocks` prop so meter can render the `{N} of {M}` counter.

**Verification:** Build green. Visual: meter shows 5-or-fewer wide segments (one per type), legend chips alongside. Counter reflects active vs total.

**Depends on:** Step 5 (data shape — meter blocks already typed).

---

### Toolbar

#### Step 9 — Type/Status filters: SegmentedControl → Chip

**Files:** `components/admin/content/BlocksToolbar.tsx` (modified, ~50-line delta).

**Build:**
- Replace the two `<SegmentedControl>` with `<Chip.Group multiple={false}>` containing one `<Chip>` per option.
- Type chips colored by `TYPE_COLORS[type]` (Mantine Chip accepts `color` per chip).
- Status chips: 'all' = gray, 'active' = green, 'disabled' = gray.
- Selected state visually distinct (Mantine handles this via `<Chip>` checked state — typically filled vs outline).
- Layout adjusts: chips wrap on narrow viewports; group still lives in the toolbar's middle cluster.

**Verification:** Build green. Live: clicking chip filters; URL syncs identically to before (hook contract unchanged); SegmentedControl gone.

**Depends on:** nothing.

---

#### Step 10 — Search placeholder + stacked counter format

**Files:** `components/admin/content/BlocksToolbar.tsx` (modified, ~10-line delta).

**Build:**
- Update `TextInput` placeholder: `"Search blocks by title or content..."`
- Counter restructure: instead of inline `{filtered}/{total}`, render as a vertical stack — `<Stack gap={0}>` with two lines: `{filtered}` (larger) over `{total}` (muted). Or however the design mock specifies; I'll match the HTML mock at this step.

**Verification:** Build green. Counter visually stacked.

**Depends on:** Step 9 (toolbar surface stable).

---

### Rows

#### Step 11 — Drop Topic column

**Files:**
- `components/admin/content/BlockRow.tsx` (modified, ~10-line delta — remove the topic Table.Td and the Topic header).
- `app/admin/prompt-studio/blocks/BlocksTable.tsx` (modified, ~3-line delta — drop the Topic Table.Th from the thead).

**Build:** Remove the topic column entirely from desktop. Topic data is still fetched (for future use) but not displayed. `colSpan` on the inline preview row updates from 7 → 6.

**Verification:** Build green. Desktop table has 6 columns instead of 7. Mobile card unchanged (BlockCard not touched).

**Depends on:** nothing.

---

#### Step 12 — Drop Order column; show order as monospace prefix in Title; move order edit to drawer

**Files:**
- `components/admin/content/BlockRow.tsx` (modified, ~25-line delta) — remove the Order Table.Td and its inline `NumberInput`; add an order-prefix span inside the Title cell.
- `app/admin/prompt-studio/blocks/BlocksTable.tsx` (modified, ~10-line delta) — drop the Order Table.Th. Update colSpan to 5. `handleOrderBlur` becomes unused as a row-level handler; reuse its conflict-detection predicate inside the new save path (see below) and delete the row-blur path.
- `components/admin/content/BlockEditForm.tsx` (modified, ~30-line delta) — add `order` field rendered as `NumberInput` alongside body. Visible in both `'edit'` and `'new'` modes (per Item 5).
- `components/admin/content/useBlockEditForm.ts` (modified, ~15-line delta) — extend hook draft state with `order: number | null`. Save callbacks now receive `{ body, order }`.

**Build (display side):**
- Title cell becomes `<Group gap="xs"><span style="{font-family: var(--mantine-font-family-monospace), color: dimmed}">{padded}</span><Text variant="label">{title}</Text></Group>` where `padded = String(order).padStart(2, '0')` (e.g. `'01'`, `'02'`) or `'—'` for null/0.
- Inline `NumberInput` for order is removed entirely from `BlockRow`. No replacement on the row.

**Build (edit side):**
- `BlockEditForm` renders an order `NumberInput` field above the body Textarea (visible in both edit and new modes).
- `useBlockEditForm` adds `order` to draft state, seeded from `block.order` on edit, defaulting to `null` on new.
- Save callback signature changes from `onSave({ body })` to `onSave({ body, order })`. Same for `onSaveAnyway`.
- BlocksTable's `handleFormSave` / `handleFormSaveAnyway` unchanged structurally but now run an order conflict check before PATCHing:
  ```ts
  if (order !== editingBlock.order && isOrdered(order)) {
    const conflict = items.find(b => b.id !== editingId && b.type === editingBlock.type && b.order === order)
    if (conflict) {
      notifications.show({ color: 'red', title: 'Duplicate order number', message: `…used by ${conflict.title}…` })
      throw new Error('Order conflict')   // hook catches → editor stays open
    }
  }
  ```
  This reuses the exact conflict predicate from PR 1's `handleOrderBlur`. The toast is reused; surfacing the error inside the form (e.g., `NumberInput.error`) is a possible polish but not required for V1 — toast matches today's UX.

**Verification:** Live: rows show "01 Block title", "02 Other block", etc. Editing a block opens the drawer with an order field. Per-type uniqueness check fires when Save is clicked with a conflicting order — toast appears, drawer stays open.

**Depends on:** Step 11 (column slot frees up).

---

#### Step 13 — Add Tokens column with horizontal bar

**Files:**
- `components/admin/content/BlockRow.tsx` (modified, ~30-line delta).
- `app/admin/prompt-studio/blocks/BlocksTable.tsx` (modified, ~3-line delta — add Tokens Table.Th).

**Build:**
- New cell between Type and Status (after Step 11/12 column reshuffle).
- Renders: Mantine `Progress` (or a custom small bar) at `value={tokens / 8000 * 100}`, `size="xs"`, `color={TYPE_COLORS[block.type]}` + numeric `{tokens}` adjacent.
- Token compute: `Math.ceil((body?.length ?? 0) / 4)` — same approximation as the meter.

**Verification:** Build green. Live: each row shows a colored mini-bar matching the row's type color, with token count.

**Depends on:** Step 11 (column slot freed).

---

#### Step 14 — Add "Updated by" meta line under title (BLOCKED on Step 1)

**Files:** `components/admin/content/BlockRow.tsx` (modified, ~10-line delta).

**Build:**
- Below the title in the Title cell, render two strings depending on author presence:
  - With author: `<Text variant="muted" size="xs">Updated {relative} by {author.name}</Text>`
  - Null author (legacy rows): `<Text variant="muted" size="xs">Updated {relative}</Text>` — omit the "by …" entirely per Item 6.
- Relative time via `Intl.RelativeTimeFormat` (no new deps). Helper computes `now - updated_at` and picks the largest unit (e.g., "2d ago", "5m ago", "just now" if < 1m).
- `updated_at` always has a value post-migration (backfilled from `created_at`), so the timestamp is meaningful even on legacy rows.

**Verification:** Build green. Live: rows show "Updated 5m ago by Jane Doe" or "Updated 5m ago" (legacy) beneath title.

**Depends on:** Steps 1, 4, 5. Cannot ship without the migration.

---

#### Step 15 — Restructure Status column (Switch + label adjacent)

**Files:**
- `components/admin/content/BlockRow.tsx` (modified, ~15-line delta).
- `app/admin/prompt-studio/blocks/BlocksTable.tsx` (modified, ~3-line delta — rename the column header from "Actions" to "Status" or split if needed).

**Build:**
- Today: Switch lives in the Actions cell alongside pencil/trash.
- Target: dedicated Status column with `<Group gap="xs"><Switch ... /><Text size="sm">{status === 'active' ? 'Active' : 'Disabled'}</Text></Group>`.
- Action icons (Edit / Delete / Duplicate from Step 16) move to a separate Actions column.

**Verification:** Build green. Live: status pill+label visible distinct from action icons.

**Depends on:** Step 11 / 12 column shuffle finalized.

---

### Duplicate

#### Step 16 — Duplicate endpoint

**Files:** `app/api/admin/blocks/duplicate/route.ts` (new, ~60 lines).

**Build:**
- Accept `{ source_id: string }` in POST body.
- Fetch source row via tenant-scoped select on `id, type, topic_id, title, body`.
- Compute new fields:
  - `title = \`${source.title} (copy)\``
  - `body`, `type`, `topic_id`, `owner_id`, `tenant_id` from source / authCtx
  - `status = 'disabled'`
  - `order = (max order for that type) + 1` — query `MAX(order) WHERE tenant_id AND type` then +1; null/0 max → 1
  - `updated_by = authCtx.owner_id`, `updated_at` auto via trigger
- Insert and return the new row.
- 401 on auth fail; 404 on missing source; 500 on insert error.

**Per resolved F3:** path is `/api/admin/blocks/duplicate`. New file under `app/api/admin/blocks/duplicate/route.ts`. The existing GET-only `app/api/admin/blocks/route.ts` is untouched.

**Verification:** Build green. New API test: POSTing a known block id returns a copy row. Live: invoke from row Duplicate icon (Step 17).

**Depends on:** Steps 1, 3 (so `updated_by` is meaningful).

---

#### Step 17 — Duplicate icon + handler

**Files:**
- `components/admin/content/BlockRow.tsx` (modified, ~10-line delta) — `IconCopy` ActionIcon between Edit and Delete.
- `app/admin/prompt-studio/blocks/BlocksTable.tsx` (modified, ~25-line delta) — add `handleDuplicate(id)`: POST `/api/admin/blocks/duplicate`, on success prepend new row to `items`.

**Build:** Optimistic insert disabled — wait for server response so we have the real ID/order. Disable the Duplicate icon for the row while in flight.

**Verification:** Live: click duplicate → new "(copy)" row appears, status disabled.

**Depends on:** Step 16.

---

### Search highlight

#### Step 18 — Mantine `Highlight` in title + body preview

**Files:** `components/admin/content/BlockRow.tsx` (modified, ~15-line delta).

**Build:**
- Pass `query` from `BlocksTable` (read from `useBlocksFilters`) down to `BlockRow` as a new prop.
- Wrap Title text in `<Highlight highlight={query}>` from `@mantine/core`.
- Wrap body preview text (in the inline expanded preview row) similarly.
- When `query` is empty/whitespace, `Highlight` is a no-op visually.

**Verification:** Build green. Live: typing in search highlights matched substring in both title and expanded preview.

**Depends on:** Step 11 / 12 row restructuring complete.

---

## PR 2 acceptance criteria (end-to-end)

### Page chrome
- [ ] Page header shows title "Blocks" + subtitle "Reusable prompt chunks — compiled into Sage's system prompt." beneath.
- [ ] "+ New block" button visible in header right cluster, paired with "Compile & Publish".
- [ ] Click "+ New block" → drawer/sheet opens with empty form (title/type/body fields). Save creates a block; Cancel discards.

### Meter
- [ ] Meter renders one segment per active block type (max 5), colored by `TYPE_COLORS`, ordered by `TYPE_COMPILE_ORDER`.
- [ ] Legend chips visible to the right of (or beneath, narrow widths) the bar showing per-type token totals.
- [ ] Counter format: "{used} / {budget} tokens · {N} of {M} active".

### Toolbar
- [ ] Type and Status filters render as `Chip` components, not `SegmentedControl`. Type chips colored by `TYPE_COLORS`.
- [ ] Search input placeholder reads "Search blocks by title or content...".
- [ ] Counter on the right is a stacked vertical display ({filtered} over {total}).

### Rows
- [ ] Topic column gone.
- [ ] Order column gone; order shows as zero-padded monospace prefix ("01", "02") in the Title cell, "—" for unset/0.
- [ ] Tokens column between Type and Status, showing token count + colored mini Progress bar.
- [ ] Each row shows "Updated {relative} by {author}" muted small text under the title.
- [ ] Status column has Switch + adjacent "Active"/"Disabled" label, separate from Actions column.
- [ ] Duplicate `IconCopy` action icon between Edit and Delete; click creates a "(copy)" disabled clone of the row.
- [ ] Search query highlights matched substring in titles and expanded body previews.

### Schema / API
- [ ] `blocks.updated_at` and `blocks.updated_by` columns exist with the migration applied.
- [ ] PATCH `/api/admin/blocks/[id]` stamps `updated_by` on every write.
- [ ] POST `/api/admin/blocks/duplicate` accepts `{ source_id }` and returns a duplicated row.

### Build / tests
- [ ] `npm run build` clean.
- [ ] `npm test` clean — 32 existing pass; new tests for the duplicate endpoint and Highlight rendering.

---

## Per-step verification protocol (reused from PR 1)

After each commit, report:
1. Full `npm run build` output.
2. Full `npm test` output.
3. Manual test list (clicks / inputs / URLs actually exercised, deferred to reviewer where I can't run a browser).
4. Regression checks against adjacent behavior.
5. Console observations.

Wait for explicit approval before the next step.

---

## Hard dependencies between steps

```
Step 1 (migration) ──┬── Step 3 (PATCH route)
                     ├── Step 4 (SELECT extended)
                     ├── Step 14 (Updated by line — BLOCKS)
                     └── Step 16 (Duplicate sets updated_by)

Step 2 (CLAUDE.md) ── independent

Step 4 ── Step 5 (interface extends)

Step 5 ── Step 14 (uses author/updated_at)

Step 11 (Topic gone) ── Step 13 (Tokens column slot)
                    └── Step 15 (Status column slot)

Step 12 (Order moves) ── Step 13 / 14 / 15 (column reshuffle stabilized)

Step 16 (endpoint) ── Step 17 (icon wires it)

Step 9 (Chip filters) ── Step 10 (counter restructure on stable toolbar)
```

Steps 1, 2, 6, 9 can run in any order before their dependents.

---

## Decisions needed before implementation starts — RESOLVED

All 6 closed in the "Resolved decisions" section near the top of this document. Implementation proceeds with Step 1 (output migration SQL).
