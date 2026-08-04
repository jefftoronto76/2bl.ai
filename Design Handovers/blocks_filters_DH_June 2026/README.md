# Handoff: Blocks — new filter system

## Overview
The Blocks screen (`/admin/prompt-studio/blocks`) needs a new approach to filtering. The
multi-select **prompt-set filter** explored in the HTML prototype doesn't work: it lets
several prompt sets' blocks mix into one table (confusing), and the set chips don't scale
past a handful of sets.

The new approach:

1. **One prompt set is in view at a time.** The existing header **"Current Prompt Set"**
   picker is the single source of which set's blocks the table shows. There is **no
   multi-select set filter** — do not port that experiment.
2. The picker becomes **searchable** so it scales to many sets.
3. The remaining filters (**Type**, **Status**, **search**) are unified into one cohesive
   filter system, offered in **three presentations** (compare and pick one):
   - **Bar** *(recommended default)* — one search field with inline removable filter
     tokens + a "+ Filter" popover.
   - **Rail** — faceted left sidebar (Type / Status as count lists). Scales best.
   - **Popover** — slim search + a single "Filters" button with an active-count badge.
4. An **empty state** (with "Clear filters") is added.

## About the design files
The files in this bundle are **design references**:
- `blocks-page.tsx` — a **production-ready** drop-in replacement for
  `app/admin/prompt-studio/blocks/page.tsx`, written in the same React/TypeScript +
  Mantine + `@tabler/icons-react` conventions as the screens already on `main`. It
  compiles against the existing `lib/` (`fixtures`, `badges`, `types`, `primitives`). It
  is the primary artifact — paste it in and it runs off the existing fixtures.
- `combined-blocks.jsx` — the htm/CDN **prototype** the design was explored in (the
  `Combined Admin` harness). Reference only; not for production.
- `screenshots/` — the three layouts rendered.

This is **not** a from-scratch build — recreate the behavior in the existing admin app
using its established patterns (which `blocks-page.tsx` already does).

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interactions are final and match the
shipped admin screens. Recreate pixel-for-pixel using the existing Mantine theme + token
maps — `blocks-page.tsx` already reads everything through `var(--mantine-*)` and
`blockTint()`.

---

## What actually changes vs the page on `main`
The page currently at `app/admin/prompt-studio/blocks/page.tsx` already has a **single**
header `PromptSetSelect` and filters the table by Type/Status/search only. So the deltas
are small and contained:

| Area | On `main` today | After |
|---|---|---|
| Prompt-set picker | single select, no search | single select **+ search field** when > 6 sets |
| Table scoping | `BLOCKS` (one set's worth) | blocks **loaded for the selected set**; switching the picker swaps the set (resets transient filters) |
| Type + Status + search | three separate inline `<Chip>` groups + a `TextInput` | **one** unified filter system (`FILTER_LAYOUT` = `'bar' | 'rail' | 'popover'`) |
| No results | empty table | **empty state** with "Clear filters" |
| Multi-select set filter (prototype) | — | **explicitly not built** |

Flip the chosen presentation with the single constant near the top of `blocks-page.tsx`:
```tsx
const FILTER_LAYOUT: 'bar' | 'rail' | 'popover' = 'bar'
```

---

## Data model note (important)
`Block` (`lib/types.ts`) has **no `prompt_set` field**, and the page on `main` shows all
`BLOCKS` regardless of the picker. For "one set in view" you have two options:

- **Recommended — scope the query by set.** Load only the selected set's blocks; switch =
  refetch. `blocks-page.tsx` has the hook point marked:
  ```tsx
  // TODO: replace BLOCKS with loadBlocksForSet(promptSet)
  useEffect(() => { loadBlocksForSet(promptSet).then(setItems) }, [promptSet])
  ```
  No schema/type change needed; the client never holds other sets' blocks.
- **Simpler — add `prompt_set: string` to `Block`** (+ fixtures) and filter client-side
  (`if (b.prompt_set !== promptSet) return false`). Fine for small libraries; ships every
  set to the client.

Either way the picker drives the table; the rest of the page is identical.

---

## Screens / Views

### Blocks (single screen, three filter presentations)
**Purpose:** browse, search, filter, and bulk-manage the prompt blocks of the **one**
prompt set currently selected in the header.

**Layout (shared):** sticky header bar (Current Prompt Set picker) → padded body
(`p="xl"`) → vertical stack: summary (donut + stats, collapsible) → **filter region** →
bulk bar (conditional) → table.

#### Header — Current Prompt Set picker
- Hand-built `<button>` + popover (matches `MasterPromptPicker.tsx`), `minWidth: 280`,
  height 38, `1px solid gray-3`, radius `sm`.
- Trigger shows the set label (14px / 600), a Live/Draft `Badge` (`variant="light"`,
  green / yellow), and a chevron that rotates 90° when open.
- **New:** when `COMPOSER_PROMPT_SETS.length > 6`, the dropdown opens with a search field
  at top (autofocused, 30px, `gray-3` border, green focus), filtering by label;
  "No prompt sets match." when empty.
- Menu items: label (500), `vN` (mono 11, gray-5), Live/Draft badge, check on the
  selected row. Hover row → `gray-1`.

#### Filter region — pick ONE

**A · Bar** *(default)*
- A single pill-shaped field: `1px solid gray-3`, radius `md`, min-height 42, padding
  `6px 6px 6px 13px`, white, `flexWrap: wrap`.
- Contents left→right: search glyph (gray-5) → any active **filter tokens** → free-text
  `<input>` (14px, grows, `min-width 110`) → clear-search `X` (when text) → a
  right-aligned **"+ Filter"** button (`1px dashed gray-4`, radius 999, 30px).
- "+ Filter" opens a popover (`min-width 236`, radius `sm`, `shadow-md`, padding 6) with
  two groups, **Type** and **Status**, each a mono uppercase label + rows of
  `dot · name · count · check`. Selecting toggles the filter and closes.
- **Filter token:** rounded pill, height 26, tinted by the block type (`blockTint`) or
  green/gray for status; 7px dot + label + `X`. Border `${fg}3d`. Removing clears that
  filter.

**B · Rail**
- Two-column grid `208px | 1fr`, gap `xl`. Left = sticky facet rail (`top: 84`).
- Rail groups **Type** and **Status**: mono uppercase label + option rows
  (`dot/sdot · name · count`), single-select, active row = `rgba(45,106,79,0.09)` bg /
  `#2d6a4f` text / 600. "All types" and "All" reset rows show the set total.
- Right column: a slim search `TextInput` + result meta on one row, then bulk bar + table.
- Collapses to stacked facet groups under 860px.

**C · Popover**
- One row: search `TextInput` (`flex 1 1 280`) + a **"Filters"** button
  (`IconFilter`, 36px, radius `sm`). When any filter active: brand-6 border + green text +
  a brand-6 count **badge** (mono, white).
- Button opens a popover (width 330, radius `md`, `shadow-md`, padding 14) with **Type**
  and **Status** as `<Chip>` rows (same chips as on `main`, with counts) + "Clear all
  filters" when active.
- Active filters also echo as removable **tokens** beside the button.

#### Result meta (all layouts)
`filtered / total` (mono, dimmed) + an **Expand all / Collapse all** subtle button.

#### Empty state
Dashed `Paper`, `gray-0`. "No blocks to show" + a contextual line ("…has no blocks yet."
vs "…match your filters.") + a "Clear filters" button when filters are active.

#### Table, rows, bulk bar, summary, donut
Unchanged from `main` — included verbatim in `blocks-page.tsx` so it's a complete file.

## Interactions & Behavior
- **Set switch** resets Type/Status/search/selection/expansion (`useEffect` on
  `promptSet`) and (recommended) refetches blocks.
- **Type / Status** are single-select; clicking the active one clears it (`'all'`).
- **Search** matches `title + body`, case-insensitive, trimmed.
- **Popovers** close on outside `mousedown` (`useOutside` hook) — same as the existing
  pickers.
- **Expand all** toggles every filtered row; bulk Enable/Disable/Delete act on the
  selection; "select all" is indeterminate when partial.
- Picker chevron and row chevrons rotate 90° via `transform` (150ms).

## State management
Local `useState` (seed from query): `promptSet`, `items`, `selected:Set`, `expanded:Set`,
`query`, `typeFilter:'all'|BlockType`, `statusFilter:'all'|'active'|'disabled'`,
`copiedId`, `summaryHidden`. Derived each render: `activeBlocks`, `filtered`, `maxTok`,
`allExpanded`, `filteredSel`, `allSel`, `typeCounts`, `statusCounts`. Mutations
(`toggleStatus`, bulk, delete) currently call `notify()` / local `setItems` — point at
your endpoints.

## Design tokens (all already in the Mantine theme / `badges.tsx`)
- **Block type tints** via `blockTint(type)` → `{ bg, fg, solid }`
  (`BLOCK_BADGE`: violet `#7950f2`, blue `#228be6`, red `#fa5252`, orange `#fd7e14`,
  yellow `#f59f00`). Type→color in `BLOCK_TYPE_COLORS`; order via `ORDERED_BLOCK_TYPES`.
- **Status:** active green `#2d6a4f` / `rgba(45,106,79,0.12)`; disabled gray.
- **Neutrals / radii / shadow:** `var(--mantine-color-gray-{0..6})`,
  `--mantine-radius-{sm,md}`, `--mantine-shadow-md`.
- **Brand accent:** `var(--mantine-color-brand-6)` (count badge, active outline).
- **Type:** body Manrope, mono DM Mono (`--mantine-font-family-monospace`), labels uppercase
  0.08–0.12em.
- Active-filter pill: height 26, radius 999; rail/menu rows: radius `sm`, 7–8px padding.

## Assets
None. Icons are `@tabler/icons-react`: `IconSearch, IconFilter, IconPlus, IconX,
IconCheck, IconChevronRight, IconChevronsUp/Down, IconClipboard, IconCopy, IconPencil,
IconTrash`. (`IconFilter` is the only addition vs the page on `main`.)

## Files
- `blocks-page.tsx` → replaces `app/admin/prompt-studio/blocks/page.tsx`. Reuses
  `@/components/admin/lib/{fixtures,badges,types,primitives}` unchanged.
- `combined-blocks.jsx` → prototype reference (htm/CDN harness), not production.
- `screenshots/blocks-bar.png`, `blocks-rail.png`, `blocks-popover.png` →
  the three presentations. `blocks-bar-token.png` shows an active token + empty state.

## Open question (deferred by request)
A true **compare** workflow (draft vs production, or current vs an older version) was
raised — putting two sets/versions side by side. That is a *separate* view, not a filter,
and is **out of scope** here. Flagged for a follow-up: likely a two-column compare or a
diff view, not a return to the multi-select filter.
