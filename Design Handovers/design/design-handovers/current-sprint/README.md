# Handoff: Blocks Redesign — Phase 2

> **Companion to Phase 1.** The Phase 1 handoff lives in
> `design_handoff_blocks_redesign/`. This bundle does NOT replace it —
> it extends it. Read Phase 1's README + INTEGRATION first, then this one.

## Overview

Phase 1 shipped CRUD + bulk + safety-check + mobile bottom-sheet editing
for the Blocks screen. Phase 2 adds the **discoverability, reordering,
and mobile-ergonomics** features that were deliberately deferred from
the Phase 1 scope.

The shipped Phase 1 code lives on branch
`claude/blocks-redesign-phase-1-6GTgQ` of
`jefftoronto76/natural-resource` and is the baseline this phase builds on.

## About the Design Files

The files in this bundle (`variation-a.jsx`, `mobile.jsx`, `shell.jsx`,
`mantine.css`, `mobile.css`, `dnd.jsx`, `data.jsx`, the three
`Blocks Redesign*.html` prototypes) are **design references created in
HTML**. They are prototypes showing intended look and behavior, not
production code to copy directly.

Your task is to **recreate these HTML designs inside the existing
Next.js / Mantine codebase**, extending the Phase 1 components rather
than replacing them. Keep Phase 1's architecture — the shell split
(`BlockEditDrawer` / `BlockEditSheet`), the `useBlockEditForm` hook,
the `SegmentedTokenMeter`, the `BulkActionsBar` — and add the Phase 2
affordances onto it.

## Fidelity

**High-fidelity.** Colors, typography, spacing, interactions, and
breakpoint behavior in the HTML mock are intended as the pixel-level
spec. Use Mantine primitives to reach this fidelity; do not write raw
CSS to match the prototype's inline styles.

## Phase 2 scope (the diff vs. shipped Phase 1)

Everything below is NEW vs. what's on the branch today. See
`INTEGRATION_natural-resource.md` for file-level mapping and acceptance
criteria.

### Desktop / tablet (`BlocksTable.tsx`, `BlockRow.tsx`)

1. **Search input** — title + body substring match.
2. **Type filter** segmented control (All / Process / Knowledge / Identity / Guardrail / Escalation).
3. **Status filter** segmented control (All / Active / Disabled).
4. **Drag-to-reorder** — grip column on each row, `@dnd-kit/sortable`. Coexists with the existing `NumberInput`. Order is **global**, not per-type.
5. **Expand all / collapse all** toolbar button.
6. **Per-row token mini-bar** in the Tokens column (replaces Topic column on narrow widths, or lives alongside it at desktop width).
7. **Row meta** — "Updated {date} by {author}" beneath the title (requires `updated_at` + `author` on the blocks query).
8. **Order index column** — the displayed position ("01", "02" padded mono) separately from the editable `order` NumberInput.
9. **Duplicate** action — per-row and in the bulk bar.
10. **"View raw"** action inside the inline-expanded preview.
11. **Right-hand meta sidecar** in the expanded row (Tokens / Author / Updated / Order).
12. **Tablet density variant** — at `820px` width, compact column set (no drag column, no Topic column, collapsed Actions). Desktop layout kicks in at ≥ `1024px`.

### Mobile (`BlockCard.tsx` + new sibling components)

13. **Search overlay** — triggered from app bar search icon; full-width input that slides in above the list.
14. **Filter chips row** (All / Process / Knowledge / Identity …) — horizontal scroll, sticky under meter.
15. **Overflow menu** on the chips row — Select mode · Reorder mode · New block.
16. **Select mode** — app bar swaps to a contextual selection bar (Cancel · "{N} selected" · Enable / Disable / Delete icons). Tapping a card toggles selection; no tap-through to edit while in this mode.
17. **Reorder mode** — app bar swaps to a "Reorder blocks" header with a Done button. Each card gets a left-side grip; tap-through to edit is disabled.
18. **Collapsible token meter** — default shows total + active count; tapping expands to per-type legend with per-type token totals and % of budget.
19. **FAB** — floating "+" new-block button, bottom-right, hidden in select/reorder modes.
20. **Detail sheet (read-first)** — tapping a card opens a bottom sheet showing the block body read-only, with Edit / Duplicate / Delete / status-toggle in the footer. The existing `BlockEditSheet` is only reached via the Edit button in this detail sheet.

> **Product decision needed:** (20) changes the mobile mental model
> from "tap card → edit" (Phase 1) to "tap card → preview → tap Edit →
> edit" (Phase 2). This is a deliberate regression on edit-path
> latency in exchange for cheaper read-only review. Confirm with
> product before building.

## Interactions & behavior

- **Filters** are URL-synced query params (`?q=`, `?type=`, `?status=`) so filtered views are shareable.
- **Search** debounces at 200ms; matches against `title` and `body`, case-insensitive.
- **Drag-to-reorder** PATCHes the full re-normalized list; on error, revert optimistic state and toast.
- **Expand all** animates each row independently (120ms) — no single 2s accordion.
- **Selection / reorder modes** on mobile are mutually exclusive; entering one exits the other.
- **Detail sheet → edit sheet** on mobile: the detail sheet closes first, then the edit sheet opens on next tick — avoid stacking two bottom sheets.
- **FAB** respects safe-area-inset-bottom for iOS.
- **Filter chips scroll** with momentum; the active chip scroll-snaps into view on filter change.

## State management

Add to `BlocksTable.tsx` orchestrator:
- `query: string` (debounced)
- `typeFilter: 'all' | BlockType`
- `statusFilter: 'all' | 'active' | 'disabled'`
- `expandedIds: Set<string>` (already exists in Phase 1; add "expand all" affordance)

Add to `MobileBlocksView` (new):
- `searchOpen: boolean`
- `selectMode: boolean`
- `reorderMode: boolean`
- `detailId: string | null`
- `menuOpen: boolean`
- `meterExpanded: boolean`

All filter state URL-syncs via `useSearchParams` + `router.replace`.

## Data-layer additions

- `SELECT` must add `updated_at` and an author reference (join `users(name)` or equivalent).
- `blocks.updated_at` should already exist — confirm before building.
- No new tables, no new API routes for phase 2 reordering — the existing `PATCH /api/admin/blocks/[id]` handles it. (Batch endpoint is a Phase 3 consideration.)

## Design Tokens

Defer to `components/admin/theme/mantine-theme.ts` and
`@/lib/blockTypes` for `TYPE_COLORS` / `TYPE_LABELS`. The mock uses
stand-in Mantine defaults (blue/orange/teal/violet); production uses
the repo's token set.

Mantine primitives mapped to mock elements:

| Mock element                  | Mantine primitive           |
| ----------------------------- | --------------------------- |
| Segmented control (toolbar)   | `SegmentedControl`          |
| Filter chips (mobile)         | `Chip.Group` + `Chip`       |
| Search overlay (mobile)       | `TextInput` + `Transition`  |
| FAB                           | `ActionIcon size="xl" radius="xl" variant="filled"` positioned fixed |
| Detail sheet (mobile)         | `Drawer.Root position="bottom"` (separate instance from edit sheet) |
| Contextual app bar (mobile)   | Custom header — swap-in component |
| Drag grip                     | `IconGripVertical` + `useSortable` listeners |
| Row meta line                 | `Text size="xs" c="dimmed"` |
| Per-row token bar             | `Progress value={pct} size="xs" color={TYPE_COLORS[type]}` |

## Files in this bundle

| File                                | Purpose                                              |
| ----------------------------------- | ---------------------------------------------------- |
| `README.md`                         | This file                                            |
| `INTEGRATION_natural-resource.md`   | Codebase-specific file mapping, build steps, acceptance checklist |
| `Blocks Redesign.html`              | Responsive shell (desktop/tablet/mobile switcher)    |
| `Blocks Redesign - Desktop (saved).html` | Standalone desktop prototype snapshot            |
| `Blocks Redesign - Mobile.html`     | Standalone mobile prototype snapshot                 |
| `variation-a.jsx`                   | Desktop + tablet table implementation                |
| `mobile.jsx`                        | Mobile card-stack implementation                     |
| `shell.jsx`                         | `PageHeader`, `Sidebar`, shared icon set — reference only; your `AdminShell` is authoritative |
| `data.jsx`                          | Sample block data (shape reference)                  |
| `dnd.jsx`                           | Pointer-based `useSortable` stand-in — **replace with `@dnd-kit/sortable`** |
| `mantine.css` / `mobile.css`        | Prototype-only CSS — **do not copy**, your Mantine theme is authoritative |
| `mobile-compile.jsx`                | Compile sheet reference (unchanged from Phase 1 handoff) |

## Where Phase 1 and Phase 2 conflict

- Phase 1's mobile tap-through opens the edit sheet directly. Phase 2
  introduces a read-only detail sheet as an intermediate step. **Phase 2
  wins** if you're implementing these together, but this is a product
  call — flag before building.
- Phase 1 has a single `expandedIds` state. Phase 2 adds expand-all;
  keep the same Set, just add bulk toggles.
- Phase 1 does NumberInput-only ordering. Phase 2 adds drag.
  **Both coexist** — do not remove the NumberInput.
