# Handoff — Blocks table: sortable column headers

## What this is
Adds sorting to the Blocks table (Prompt Studio → Blocks): **Title**, **Type**, and
**Last updated** column headers are now clickable — click to sort by that column,
click again to flip direction. No dropdown, no separate control; the headers are
the only sort UI. Default state is unsorted (the table's original/authored order).

**Note on baseline:** this diff is written against the *post-filters* Blocks table
(the `blocks_filters_DH_June 2026` package — prompt-set scoping, Type/Status filter
bar/rail/popover, guardrail meter). The `admin-tsx/app/admin/prompt-studio/blocks/page.tsx`
currently in this project predates that package and doesn't have those pieces yet;
this handoff assumes it lands after (or together with) that one. If it's going in
standalone, `SortLabel` + `sortBlocks` are self-contained and only depend on each
block having `created_at`/`updated_at`.

## What changed
1. **`created_at` added to the `Block` fixture/type.** Blocks previously only carried
   `updated_at`. A `Created` timestamp now exists per block (see DIFF.md, fixtures).
2. **New "Dates" column** in the table, showing `Created {date}` / `Updated {relative}`
   stacked. Replaces the "Updated Xh ago" line that used to sit under the title.
3. **Sortable headers** — Title, Type, and the Dates column's "Last updated" label are
   each a small button: unsorted (double-headed arrow icon, muted) → click sorts
   ascending (up arrow) → click again sorts descending (down arrow) → click a
   *different* header resets to that field, ascending (or descending by default for
   the date field — newest first reads better on first click).
4. Sort is applied **after** search/type/status filtering, so it always operates on
   what's currently visible.

## Files
- `BlocksSort.tsx` — the new/changed pieces only: `sortBlocks()`, `<SortLabel>`, and
  the `Table.Thead` + relevant `Row` JSX to splice into the existing Blocks table
  component (`components/admin/prompt-studio/BlocksTable.tsx` in the post-filters
  package, or `admin-tsx/app/admin/prompt-studio/blocks/page.tsx` directly).
- `DIFF.md` — diff against the Blocks table component + the `Block` fixture type.
- Preview: `admin-mantine/blocks-screen.js` in the Second Brain Labs admin project,
  wired into `Combined Admin July 2026.html`.

## Known knowns
- KK-1: Default state on load (and whenever the prompt set is switched) is
  **unsorted** — `sortBy = null` — matching the table's existing authored order
  (blocks in compile order). Switching prompt sets resets sort, same as it already
  resets filters/search/selection.
- KK-2: Type sort orders by the same `ORDERED_BLOCK_TYPES` sequence used everywhere
  else (guardrail → identity → process → knowledge → escalation, or whatever that
  array's real order is) — not alphabetical.
- KK-3: Sorting is client-side over the already-filtered set; no new query params
  or requests.

## Known unknowns
- UK-1: No sort-order persistence — reloading or navigating away resets to
  unsorted. Worth a `?sort=` query param or localStorage if users sort often.
- UK-2: Only three fields are sortable (Title, Type, Last updated). Tokens and
  Status were intentionally left out — didn't seem asked for — but the same
  `SortLabel` pattern extends to them trivially if wanted.
- UK-3: `created_at` values in the fixture are backfilled guesses (a few weeks to
  months before each block's `updated_at`) since the prior fixture never tracked
  creation time. Real data will have real values; nothing in the sort logic assumes
  the fixture's specific spread.
