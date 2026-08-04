# Handoff: Blocks Page Redesign (Sage.AI Prompt Studio)

## Overview
This handoff covers a responsive redesign of the **Blocks** admin page in Sage.AI's Prompt Studio — the screen where an admin manages reusable prompt chunks ("blocks") that get compiled into Sage's system prompt. The redesign fixes visibility problems with the token budget, removes redundant columns, makes disabled blocks visually distinct, surfaces block content inline, introduces bulk actions, and gates the "Compile & Publish" action behind a preview/diff surface.

**Responsive breakpoints:**
- **Mobile (≤ 640px):** mobile-first layout, opinionated for **review & toggle** (the 80% case on phones). See `Blocks Redesign — Mobile.html`.
- **Tablet (641–1023px):** compact table (Variation A) — drag-handle, mini token bar, and Actions column are dropped; per-row actions move into the expanded preview.
- **Desktop (≥ 1024px):** Variation A full enhanced table with drag-to-reorder, inline expand, and per-row actions.

Three desktop variations were explored (A enhanced table, B split view, C grouped stack); the user selected **Variation A** as the preferred desktop direction. B and C have been removed from the responsive file but remain in the bundle for alternate-pattern reference.

## About the Design Files
The files in this bundle are **design references created in HTML + inline React (Babel)** — prototypes demonstrating intended look and behavior, not production code to copy-paste. Your job is to **recreate these designs in the target app's real environment** using the **Mantine v7 component library** (which the design is explicitly modeled after) and the project's established patterns.

If the target app already has a Mantine setup, use its `MantineProvider`, theme, and components directly. If it has a different design system, translate the primitives (AppShell, Table, Badge, Switch, ActionIcon, Progress, Modal, TextInput, SegmentedControl) to that system's equivalents while preserving the layout, spacing, and information hierarchy.

## Fidelity
**High-fidelity.** Colors, spacing, radii, typography, and component vocabulary are all lifted from Mantine v7 defaults. Use these as exact targets — but prefer Mantine's real components over the hand-rolled CSS in `mantine.css` (that file exists only so the HTML prototype could render without a React component library).

## Target Stack (recommended)
- **React 18+**
- **Mantine v7** (`@mantine/core`, `@mantine/hooks`)
- **@dnd-kit/core + @dnd-kit/sortable** for drag-to-reorder (the prototype uses HTML5 DnD as a rough stand-in)
- **TypeScript**

## Screens / Views

### 0. Mobile (≤ 640px) — primary touch-first layout

The mobile design is **opinionated for review & toggle** (the confirmed 80% case). Editing content is relegated to an explicit action inside a detail sheet.

**Structure, top-to-bottom:**
- **App bar (56px, sticky):** hamburger (40×40 `ActionIcon`) → title "Blocks" (17px/600) → search icon → green "Publish" button (sm, sparkles icon). Drawer opens the same sidebar navigation as desktop.
- **Token meter strip (sticky, tappable):** 4px progress bar (blue.6 default, yellow.6 when >80%) + summary row `{used} / {budget} tokens · {active}/{total} active ▾`. Tap to expand into per-type breakdown (Process / Knowledge / Identity, with % of budget).
- **Search strip (collapsed by default):** appears below the meter when the search icon is tapped. Inline input with clear button.
- **Filter chips + overflow:** horizontally scrollable pill row `All / Process / Knowledge / Identity`. Overflow `⋯` menu on the right exposes **Select**, **Reorder**, **New block** — keeping the app bar clean.
- **Block list:** stacked cards, 10px gutter, full-bleed. Each card is a touch-primary row:
  - Left: type badge + order `#01` + "Off" badge if disabled
  - Middle: title (15px/500, 2-line clamp) + meta `{tokens} tok · {updated} · {author}`
  - Right: 44×26px `Switch` (the primary action; green.6 when active)
  - Tap card body → opens detail sheet. Switch stops propagation.
- **FAB:** 56px round, `green.8`, bottom-right, 20px inset. Opens the new-block flow.

**Modes (modal states of the same screen):**
- **Multi-select:** entered from `⋯ → Select`. App bar morphs into a `blue.6` selection bar with count + Enable (check) + Disable (x) + Delete (trash, white on blue). Tapping a card toggles its selection. Cancel (×) on the left exits.
- **Reorder:** entered from `⋯ → Reorder`. App bar shows a Done button; cards collapse to compact form (switches hidden, meta hidden) with a 20px drag grip on the left. Use `@dnd-kit` with touch sensors — HTML5 DnD does not work on mobile.
- **Detail sheet (bottom sheet):** 86% max-height. Header: type badge, tokens, title (17px/600), "Updated {time} by {author}". Body: content in monospace 13.5px/1.7. Footer: Switch + Active/Disabled label, Duplicate, Delete (danger), Edit (filled primary, navigates to the editor route).
- **Publish sheet (full-screen):** app-bar with Cancel × and filled-green Publish button. Body sections: Token budget (bar + summary), Changes since last publish (diff list with `+ ~ ↕ −` glyphs), Compiled system prompt (monospace `<pre>` block). Not a modal — a full route on mobile, because the desktop two-column modal has no small-screen equivalent.
- **Drawer:** left slide-in, 300px max 85%. Same navigation structure as desktop sidebar. Scrim at 35% black dismisses.

**Mobile-only design decisions (call-outs):**
1. Drag-to-reorder is a **mode**, not an always-visible handle. Prevents accidental reorders while scrolling; gives touch targets room.
2. Switch is placed on the **right edge** of every card — the only always-thumb-reachable position on large phones.
3. Edit content is **one tap away** (card → sheet → Edit button), deliberately. Review-toggle is zero-tap.
4. Token meter is **collapsible** to protect vertical space but always visible as a 4px bar so the budget ceiling is never hidden.
5. Compile & Publish is a **full-screen sheet, not a modal**. Mobile modals at 86% height can't hold the two-column desktop layout; a route-level sheet with its own app bar is the mobile-native pattern.

**Tablet (641–1023px):** single-column list persists, but:
- App bar switches to the full desktop page header (title + subtitle + action cluster).
- Sidebar unhides permanently (240px fixed left) on the real desktop app; inside the prototype's tablet frame it's hidden to simulate the small viewport.
- Use the **compact table treatment** (see Variation A tablet density below) rather than cards.
- Detail content lives in the expanded row (not a side drawer) — consistent with desktop.
- Publish remains a modal (desktop modal spec), not a full-screen sheet.

### 1a. Variation A — Tablet density (641–1023px)

When the Variation A table renders at tablet width, adjust as follows (implemented in the prototype by passing `density="tablet"` to `VariationA`):

- **Drop columns:** drag-handle column and Actions column are removed.
- **Compress columns:** Tokens column shows the numeric value only (no mini bar). Status column shrinks to just the `Switch` (no "Active"/"Disabled" text label).
- **Toolbar:** Status SegmentedControl is hidden (users can still filter via search). Type segmented control shortens "All types" → "All". The "Drag to reorder" hint is hidden. The Expand/Collapse button label shortens.
- **Expanded row** becomes single-column (no sidebar). Meta appears as an inline row (Tokens · Author · Updated · Order). Actions move inline: Edit, View raw, Duplicate, Delete — with Delete pushed to the right edge as a danger-subtle button.
- **Reorder:** drag handle is removed at tablet width. To reorder on tablet, either (a) use keyboard shortcuts from the focused row (recommended; `@dnd-kit` supports this out of the box) or (b) enter a mobile-style "Reorder mode" if product decides that's warranted. The prototype currently does (a) implicitly by leaving the handle off.

### 1. Blocks page — shell (desktop, ≥ 1024px)
- **Purpose:** Manage the set of prompt blocks that get compiled.
- **Layout:** `AppShell` with fixed left `Navbar` (240px, dark surface) and fluid `Main`.
  - `AppShell.Header` area is a custom page header — 20–32px vertical padding, white surface, bottom border (`gray.2`), containing `Title` (h1, 22px, weight 600, letter-spacing -0.01em) + subtitle + right-aligned action cluster.
  - Primary action: `<Button color="green" variant="filled">Compile & Publish</Button>` with a sparkles icon.
  - Secondary: `<Button variant="default">+ New block</Button>`.
- **Sidebar:**
  - Brand: "Natural Resource" in a serif face (Georgia fallback), 18px/600; `ADMIN` role label underneath, 10px uppercase letter-spacing 0.12em, color `dark.2`.
  - Sections: top group (Inbound Chats, Prompt, Settings) and "PROMPT STUDIO" group (Composer, **Blocks** (active), History, Assets, Prompt).
  - Active link uses `green.8` fill, white text; inactive links are `dark.0` text, transparent → `dark.6` on hover.
  - User footer pinned to bottom: 28px avatar + name + email.

### 2. Variation A — Enhanced table (**preferred desktop direction**)
Single-table layout optimized for scanability across the full block set.
- **Token meter card** on top.
- **Toolbar:** search (left) + SegmentedControl for type + SegmentedControl for status (`All / Active / Disabled`) + right side: Expand all / Collapse all + `{filtered} of {total}` + "Drag ⋮⋮ to reorder" hint.
- **Bulk-action bar** (appears when ≥1 selected): blue-tinted `Paper` with count, Enable, Disable, Duplicate, Delete (danger-subtle), Clear.
- **Table columns:** drag-handle | checkbox | expand-chevron | Title (with order index + title + meta) | Type badge | Tokens (number + mini bar) | Status (Switch + label) | Actions (Edit / Duplicate / Delete icons, delete is danger).
- **Expanded row** reveals block content (monospace, 12.5px) + meta sidebar (Tokens, Author, Updated, Order) + Edit/View raw buttons.
- **Dragging:** drag handle visible on row hover; drop target shows a 2px `primary` top border. Use `@dnd-kit/sortable` — the prototype uses a pointer-event stand-in that works on both mouse and touch.

### 3. Variation B — Split view (alternate reference)
Two-pane layout — list on the left (420px), live preview on the right. Retained as a reference for an alternate pattern focused on content reading over scanning. See `variation-b.jsx`.

### 4. Variation C — Grouped stack
Accordion by Type (Process / Knowledge / Identity) — best for 40+ blocks.
- Top: token meter card.
- Toolbar: search + Expand all / Collapse all + bulk actions (when selected).
- Each group = a collapsible `paper`:
  - Group header: 4px colored accent strip (orange / teal / violet) + chevron + type name + count badge + `{active} active · {tokens} tokens` + `{%} of budget` on the right + inline "+ Add" button.
  - Body: responsive CSS grid (`repeat(auto-fill, minmax(320px, 1fr))`) of block cards.
- Block card: checkbox + drag handle + order + token count (top row) → title (2-line clamp, 13.5px/500) → preview (3-line clamp, 12px text-dimmed, min-height 54px) → footer (Switch, updated time, Preview/Edit/Delete ActionIcons).

### 5. Compile & Publish modal (shared)
Opens from the green "Compile & Publish" button in the header. 900–1000px wide modal, max-height 86vh.
- **Header:** title "Compile & Publish preview" + subtitle "Review the compiled system prompt before publishing to production." + close `ActionIcon`.
- **Body (two columns, 320px | 1fr):**
  - **Left aside (padding 16px, border-right):**
    - Token meter in **stacked** layout (summary → bar → legend vertically — do NOT use the row layout here; it overflows the narrow aside).
    - "CHANGES SINCE LAST PUBLISH" section — diff list with glyphs: `+` added (green.7), `~` edited (blue.7), `↕` reordered (yellow.7), `−` disabled (gray.6).
    - "ACTIVE BLOCKS ({n})" list — compact numbered rows with token cost right-aligned.
  - **Right section (padding 20px, scroll):**
    - Label: "COMPILED SYSTEM PROMPT".
    - `<pre>` block on `surface-subtle` background, border `gray.2`, radius 8, padding 16, font family monospace, 12.5px/1.6. Renders each active block as `# {NN} — {Title}\n{content}\n`.
- **Footer:**
  - Left: warning icon + "{disabled-count} disabled blocks are excluded. Last published 3h ago." (text-dimmed).
  - Right: Cancel (default) / Export as JSON (default, download icon) / **Publish to production** (filled green, check icon).

## Interactions & Behavior

### Selection & bulk actions (all variations)
- Header checkbox cycles: none → all → none. Shows indeterminate state when some rows selected.
- Bulk action bar appears when `selected.size > 0`. Actions: Enable, Disable, Duplicate, Delete, Clear.
- Clearing removes the bar via slide-up (not implemented in prototype — use Mantine `Transition`).

### Drag-to-reorder (Variation A, C)
- Drag handle (`grip-vertical` icon) visible on row hover only (`opacity: 0 → 1`, 100ms).
- Use `@dnd-kit/sortable` — the HTML5 DnD in the prototype is a placeholder.
- On drop, renumber `order` field sequentially. Persist immediately.
- Keyboard support (dnd-kit provides): Space to grab, arrows to move, Space to drop, Esc to cancel.

### Inline preview / expand (Variation A)
- Chevron rotates 0° → 90° when expanded (transform 120ms).
- Expanded content fades in (160ms ease-out). Keep expansion state in a `Set<string>` of ids.

### Type & status filtering
- Variation A: two `SegmentedControl`s in the toolbar — All types / Process / Knowledge / Identity, then All / Active / Disabled.
- Variation B: pill buttons (radius 999px) for type only.
- Variation C: accordion naturally groups by type; search filters across all groups.

### Status toggle
- Single `Switch` per row (green.6 when active). The status badge + dropdown from the original design are replaced entirely.
- Disabled rows apply the `is-disabled` visual (opacity + diagonal stripes).

### Compile modal
- Opens from header button. Should also be reachable via keyboard (`Cmd/Ctrl+Enter` — bind in real impl).
- "Publish to production" is the only filled-green button; everything else is default or subtle, so the destructive-adjacent action is visually distinct.
- Export as JSON is an escape hatch — hook to a download of the compiled prompt text.

### Keyboard shortcuts (stub — prototype shows hints, does not bind)
- `↑` / `↓` — navigate block list (Variation B)
- `E` — edit focused block
- `Cmd/Ctrl+K` — focus search
- `Cmd/Ctrl+Enter` — open compile preview
- `Shift+Click` — range-select rows

### Empty states
- No blocks match filter: centered text-dimmed message "No blocks match the current search." in the list area.

## State Management
Minimum state shape:

```ts
type BlockType = 'process' | 'knowledge' | 'identity';

interface Block {
  id: string;
  title: string;
  type: BlockType;
  tokens: number;
  active: boolean;
  order: number;       // stable sort key; renumber on reorder
  preview: string;     // the actual prompt content
  updated: string;     // ISO timestamp preferred in real impl
  author: string;
}

interface BlocksPageState {
  blocks: Block[];
  query: string;
  typeFilter: 'all' | BlockType;
  statusFilter: 'all' | 'active' | 'disabled';  // Variation A only
  selected: Set<string>;
  expanded: Set<string>;  // Variation A only
  selectedId: string | null;  // Variation B only
  openGroups: Set<BlockType>;  // Variation C only
  compileModalOpen: boolean;
}
```

Data fetching: whatever the codebase uses (React Query / SWR / RTK Query). All mutations (toggle active, reorder, bulk actions) should be optimistic with rollback on error.

## Design Tokens (Mantine v7 defaults — use `theme` directly, do not redeclare)

### Colors (hex values, not variable names)
- `white` `#ffffff`
- `gray.0–9`: `#f8f9fa` `#f1f3f5` `#e9ecef` `#dee2e6` `#ced4da` `#adb5bd` `#868e96` `#495057` `#343a40` `#212529`
- `dark.0–9`: `#c9c9c9` `#b8b8b8` `#828282` `#696969` `#424242` `#3b3b3b` `#2e2e2e` `#242424` `#1f1f1f` `#141414`
- `blue.6` (primary) `#228be6`; `blue.0` `#e7f5ff`, `blue.8` `#1971c2`
- `green.8` (sidebar active, publish) `#2f9e44`; `green.0` `#ebfbee`, `green.6` `#40c057`
- `teal.6` (knowledge accent) `#12b886`; `teal.0` `#e6fcf5`, `teal.8` `#099268`
- `orange.6` (process accent) `#fd7e14`; `orange.0` `#fff4e6`, `orange.8` `#e8590c`
- `violet.6` (identity accent) `#7950f2`; `violet.0` `#f3f0ff`, `violet.8` `#6741d9`
- `red.6` (danger) `#fa5252`; `red.0` `#fff5f5`
- `yellow.7` (budget warning) `#f59f00`; `yellow.4` `#ffd43b`

### Radii
- `xs` 2 · `sm` 4 · `md` 8 · `lg` 16 · `xl` 32
- Use `sm` for inputs, buttons, table rows; `md` for cards/papers/modals; `xl` (999px) for pill badges.

### Spacing
- `xs` 10 · `sm` 12 · `md` 16 · `lg` 20 · `xl` 32

### Typography
- Font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- Monospace: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
- Sizes: xs 12, sm 14 (default), md 16, lg 18, xl 20
- Page title: 22px/600, letter-spacing -0.01em
- Block content body (right pane, Variation B): **monospace** 15px/1.7 — this is deliberate, prompt content should read as code-adjacent.
- Badge: 11px/700 uppercase, letter-spacing 0.02em
- Section label: 10–11px/600 uppercase, letter-spacing 0.08em, color `text-dimmed`

### Shadows
Borders do most of the work; shadows only on modals (`shadow.md`) and floating panels.

## Components (Mantine mapping)

| Prototype class | Mantine component |
|---|---|
| `.app-shell` | `AppShell` with `navbar` + `main` |
| `.nav-link` | `NavLink` |
| `.btn` | `Button` (variants: `filled`, `default`, `subtle`, `light`) |
| `.action-icon` | `ActionIcon` (`variant="subtle"`, `color="red"` for destructive) |
| `.badge` | `Badge` (`variant="light"`, `color="orange"` / `teal` / `violet` / `gray`) |
| `.text-input` | `TextInput` with `leftSection={<IconSearch />}` |
| `.switch` | `Switch` (`color="green"`) |
| `.checkbox` | `Checkbox` (supports `indeterminate`) |
| `.progress` / segments | Stacked `Progress.Root` + `Progress.Section` — Mantine v7 supports multi-segment natively |
| `.paper` | `Paper` (`withBorder`, `radius="md"`) |
| `.modal` | `Modal` (`size="xl"`) |
| `.kbd` | `Kbd` |
| `.tooltip` | `Tooltip` |
| SegmentedControl styling | `SegmentedControl` (use directly) |
| Accordion groups (Var C) | `Accordion` with `multiple` + `chevronPosition="left"` |

Use **Tabler Icons** (`@tabler/icons-react`) — Mantine's canonical icon set. The prototype uses a hand-rolled minimal icon set; the mapping is:

| Prototype `<Icon name>` | Tabler |
|---|---|
| search | `IconSearch` |
| plus | `IconPlus` |
| edit | `IconPencil` |
| trash | `IconTrash` |
| drag | `IconGripVertical` |
| chevronRight | `IconChevronRight` |
| caretDown | `IconChevronDown` |
| copy | `IconCopy` |
| eye | `IconEye` |
| sparkles | `IconSparkles` |
| warn | `IconAlertTriangle` |
| download | `IconDownload` |
| check | `IconCheck` |
| x | `IconX` |
| code | `IconCode` |

## Assets
No raster assets. All iconography should come from `@tabler/icons-react`. The "JT" avatar in the sidebar footer is a text-initial fallback — swap for a real avatar image in production.

## Files in this bundle

**Responsive implementation — target output:**
- One `BlocksPage` React component with `@media` / Mantine `useMediaQuery` hooks switching between mobile-first, tablet, and desktop layouts.
- Share state (`blocks`, `selected`, `compileOpen`, etc.) across breakpoints; only presentation differs.

**Prototype files (reference only — do not ship):**

Desktop:
- `Blocks Redesign — Desktop (saved).html` — earlier locked reference (pre-decision).
- `mantine.css` — hand-rolled mirror of Mantine v7 tokens.
- `data.jsx` — sample block data + icon primitives.
- `shell.jsx` — AppShell, Sidebar, PageHeader, TokenMeter (with `layout="row"` and `layout="stacked"` variants), CompileModal.
- `variation-a.jsx` — **enhanced table (chosen desktop direction).** Accepts `density="tablet"` prop to switch to the compact column set. Uses pointer-event reorder via `useSortable`.
- `variation-b.jsx` — split view (alternate reference).
- `variation-c.jsx` — grouped stack (alternate reference).
- `dnd.jsx` — prototype-scoped pointer-event reorder hook (`useSortable`) that works on both mouse and touch. **In production, swap for `@dnd-kit/sortable`.**

Mobile:
- `Blocks Redesign — Mobile.html` — 8 mobile scenes in phone frames.
- `mobile.css` — mobile-only styles (app bar, meter strip, chips, cards, sheets, drawer, FAB).
- `mobile.jsx` — `MobileBlocks` component (interactive; all mobile modes, including touch-drag reorder via `useSortable`).
- `mobile-compile.jsx` — `MobileCompileSheet` full-screen publish preview.

Entry:
- `Blocks Redesign.html` — responsive harness that swaps Variation A (desktop) / Variation A tablet density / MobileBlocks based on breakpoint. Includes a preview pill to force any breakpoint.

## Implementation order (suggested)
1. Set up Mantine with the project's existing theme (or initialize one matching the tokens above).
2. Define `useBlocksStore` (Zustand / context / Redux) with blocks, selection, mode, compile state — reused across breakpoints.
3. Build mobile layout first (≤ 640px) — it's the strict subset; desktop adds surfaces.
4. Build `TokenMeter` with `Progress.Root` multi-segment — verify stacked, row, and mobile-strip variants.
5. Build desktop Variation A (enhanced table) at ≥ 1024px, reusing the same store.
6. Build the tablet density (hide drag-handle, Actions, and Status label columns; hide the status filter; single-column expand).
7. Wire data fetching and optimistic mutations.
8. Drag-to-reorder via `@dnd-kit` with **both** pointer and touch sensors — verify on a real phone.
9. Build `CompileModal` (desktop) and `CompilePage` (mobile full-screen sheet) — both render the same diff + compiled-prompt content.
9. Keyboard shortcuts (desktop) and ARIA (both).
10. Empty, loading, and error states.

## Open questions for the developer
- Where does the compiled prompt get published to? (API endpoint + auth)
- Is there a version history you can diff against, or does the diff need to be computed client-side from a cached previous snapshot?
- How is token count calculated — tokenizer library on client, or a backend count?
- Are block edits autosaved or explicit? (Prototype shows "Edit content" and "View raw" as explicit actions.)
