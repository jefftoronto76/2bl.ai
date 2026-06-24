# Handover — Blocks page: token-distribution Overview + Prompt Sets

**2BL.AI tenant admin · `app/admin/prompt-studio/blocks/`**
Mantine v7 · Next.js App Router · TypeScript strict. Built against `jefftoronto76/2bl.ai@main`.
Status: **UI complete; needs the `prompt_sets` schema + (optional) compile scoping in §3.**

---

## 1. What was built

Two additions to the Blocks page, matching the approved prototype
(`Combined Admin - Production.html` → Blocks).

### 1a. Overview card with token-distribution **donut**

Replaces the bare `SegmentedTokenMeter` at the top of the table with a summary **Card**:

- **Left — details grid:** Status (Live/Draft badge), Live version, Active blocks count, Last
  updated (relative). Plus the five type **legend** badges.
- **Right — `TokenDonut`:** one arc per block type in compile order, sized by the tokens that type's
  *active* blocks contribute. Idle center shows `total / 8,000 tokens` (red when over budget);
  hovering an arc swaps the center to that type's tokens + share and dims the others.

Colors come from `TYPE_COLORS` (via `--mantine-color-<name>-6`), so the donut, the legend, and the
existing per-row type badges always agree. Token counts reuse the shared `tokensFor`.

### 1b. **Current Prompt Set** picker

A header dropdown to switch between prompt sets — named, versioned block collections that each
compile into one system prompt (e.g. *Sage — Production v7 · Live*, *Sage — Staging v8 · Draft*,
*Discovery Bot v3 · Live*). URL-driven (`?set=<id>`), so the server page scopes its blocks query to
the active set and feeds that set's **version + status** into the Overview.

---

## 2. Files in this bundle (drop into the repo at the same paths)

| File | Type | Status | Responsibility |
|------|------|--------|----------------|
| `app/admin/prompt-studio/blocks/TokenDonut.tsx` | Client | **new** | The SVG donut + hover breakdown. Reuses `block-types` + `tokensFor`. |
| `app/admin/prompt-studio/blocks/BlocksOverview.tsx` | Client | **new** | Details grid + legend + donut. Derives everything from `blocks`; takes optional `version`/`status`. |
| `app/admin/prompt-studio/blocks/PromptSetSelect.tsx` | Client | **new** | The "Current Prompt Set" picker (Mantine `Menu`, URL-driven). |
| `app/admin/prompt-studio/blocks/promptSets.ts` | — | **new** | `PromptSet` type + pure `resolveActiveSet` (shared client/server). |
| `app/admin/prompt-studio/blocks/getPromptSets.ts` | Server | **new** | `server-only` Supabase reader → `PromptSet[]`. |
| `app/admin/prompt-studio/blocks/page.tsx` | Server | **updated** | Fetches sets, resolves `?set=`, scopes the blocks query, renders the picker, passes `overview` to `BlocksTable`. |
| `db/2026-06-24_prompt_sets.sql` | SQL | **sketch** | `prompt_sets` table + `blocks.prompt_set_id`. |

Reused untouched: `block-types.ts`, `tokenize.ts`, `BlockRow`/`BlockCard`, `BlocksToolbar`,
`BulkActionsBar`, the edit drawer/sheet. The one client file you hand-edit is **`BlocksTable.tsx`** —
see §2a (small patch).

### 2a. `BlocksTable.tsx` — three-line patch

`BlocksTable` owns the live `items` state, so the Overview lives here (not the server page) to update
as blocks toggle/delete. Swap the meter for the Overview:

```diff
- import { SegmentedTokenMeter } from '@/components/admin/content/SegmentedTokenMeter'
+ import { BlocksOverview } from './BlocksOverview'

- export function BlocksTable({ rows }: { rows: BlockRow[] }) {
+ export function BlocksTable({
+   rows,
+   overview,
+ }: {
+   rows: BlockRow[]
+   overview?: { version?: number | null; status?: string | null }
+ }) {

  // …in the return, replace the meter block:
- <Box mb="md">
-   <SegmentedTokenMeter blocks={activeMeterBlocks} />
- </Box>
+ <Box mb="md">
+   <BlocksOverview blocks={items} version={overview?.version} status={overview?.status} />
+ </Box>
```

`activeMeterBlocks` becomes unused after the swap — delete it (or keep `SegmentedTokenMeter` as a
compact companion below the donut if you prefer both; see §4).

---

## 3. Wiring to finish

1. **Schema (`db/…sql`).** Create `prompt_sets` and add `blocks.prompt_set_id`. Backfill one Live
   set per tenant and stamp existing blocks with it (commented backfill in the migration). Until this
   lands, `getPromptSets` returns `[]`, the picker hides, and the page falls back to tenant-wide
   blocks — so it ships safely ahead of the data.
2. **`getPromptSets` columns.** Verify `prompt_sets(id, label, version, status)` + the
   `status in ('Live','Draft','archived')` values against your final schema.
3. **Publish/version source.** `version` + `status` shown in the Overview come from the active
   `prompt_sets` row. If versioning actually lives in the prompt-studio publish flow (behind
   `PublishButton`), point `getPromptSets` at that source instead — the UI only needs
   `{ id, label, version, status }`.
4. **Compile route scoping.** If prompt sets are real, `/api/admin/prompt/compile` (and anything that
   reads "the tenant's blocks") must compile **per set** — filter by `prompt_set_id`. Out of the box
   this bundle only scopes the Blocks *view*; confirm the compile/publish path is set-aware too.
5. **New-block + duplicate.** `NewBlockButton` / `POST /api/admin/blocks/duplicate` should stamp the
   active `prompt_set_id` so new/duplicated blocks land in the current set. Thread the active set id
   down (or read `?set=` server-side on those routes).

---

## 4. Decisions & notes

1. **Donut replaces the linear meter.** The prototype uses the donut as the headline token viz inside
   a richer Overview. The existing `SegmentedTokenMeter` is accessible and fine to keep — if you want
   both, render it below the donut. Either way the donut + legend reuse the same `TYPE_COLORS`.
2. **The meter measures reality, not the filtered view.** Like `SegmentedTokenMeter`, the donut is
   fed *active* blocks (`items`), never the `filtered` set. Per-row token bars stay relative to the
   heaviest visible block (unchanged).
3. **URL-driven picker.** `?set=` matches `useBlocksFilters`' posture, keeps the active set
   shareable/bookmarkable, and lets the server scope the query. Switching sets is a normal navigation
   (server refetch) — no client cache to reconcile.
4. **Status colors.** Live → green, Draft (and anything else) → yellow, matching the Overview badge.
5. **Budget constant.** `TOKEN_LIMIT = 8000` is duplicated from `SegmentedTokenMeter`; if you prefer
   one source, export it from `@/services/prompt/block-types` and import in both.
6. **Out of scope on purpose:** creating/renaming/publishing prompt sets (the picker only *switches*).
   That's a natural follow-up once the table exists.

---

## 5. Reference

- Prototype: `Combined Admin - Production.html` → **Blocks** (header prompt-set picker + Overview
  donut). Design reference, not code to copy.
- Real source this extends: `app/admin/prompt-studio/blocks/{page,BlocksTable}.tsx`,
  `components/admin/content/SegmentedTokenMeter.tsx`, `services/prompt/{block-types,tokenize}.ts`.
