# Handoff: Heirloom — Per‑Row Kebab Menu (sidebar "⋮" overflow menu)

> ## 🛑 STATUS UPDATE — this is already shipped
> Verified against `jefftoronto76/2bl.ai@main`: the kebab menu is **already fully
> implemented in production** (`components/shells/membership/v2/SidebarV2.tsx`),
> and it's *ahead* of the reference in this bundle. **Don't rebuild it.** Read
> **`SidebarV2.kebab-delta.md`** for the real production-vs-reference diff and
> what's actually left to do (parent wiring + mobile). The sections below remain
> accurate as a spec of intended look/behavior.

## Overview
This package documents the **per‑row kebab menu** in the Heirloom chat sidebar —
the three‑vertical‑dots (`⋮`) "more options" button that appears on each
**conversation/memory** row and each **story** row. Clicking it (or
right‑clicking the row) opens a small floating popover with row‑level actions:
**Star · Rename · Invite collaborators · Move to chapter · Remove from chapter ·
Delete**.

The menu itself owns **no data mutations** — it is pure UI. Every choice is
delegated upward through a single callback so the host app decides what each
action does.

## About the Design Files
The files in this bundle are **design references created in HTML/React‑in‑Babel**
— a runnable prototype showing the intended look and behavior, plus a
production‑style TSX reference component, and — now — the **real production
`SidebarV2.tsx`** pulled from `main`. Since the menu is already shipped, CC's job
is **reconcile + QA + finish the parent wiring**, not a from‑scratch build. The
spec below documents intended look/behavior; `SidebarV2.kebab-delta.md` lists
what production does differently and what's left.

Two parallel sources are included — use whichever matches your stack:
- **`production/SidebarV2.tsx`** — ⭐ the **real current production file** (pulled
  from `main`). This is the source of truth; `production/types.ts` holds the
  shared row types.
- **`prototype/`** — the interactive prototype (inline‑styled React via Babel).
  Open `prototype/Heirloom v2.html` to click the menu. Kebab lives in `chat-v2.jsx`.
- **`reference/SidebarV2.tsx`** — the earlier handover version (kebab inline).
  Kept for the diff; production has since moved past it.

## Fidelity
**High‑fidelity.** Final colors, typography, spacing, radii, icons, animation
timings, and interaction behavior are all specified below and present in the
prototype. Recreate it pixel‑for‑pixel against your own tokens/icons.

---

## 🛠️ Implementation aids (read these before coding)
Three companion docs make this faster — start here:
1. **`SidebarV2.kebab-delta.md`** — the **real diff**: production already ships
   the kebab and is *ahead* of the reference. Lists every production-vs-reference
   difference (portal positioning, hardened dismiss, "chapter" labels, types
   moved to `./types`) and the remaining gaps (parent wiring, mobile).
2. **`TOKEN_MAP.md`** — every `--hl-*` prototype variable → its production
   Tailwind class (`bg-surface`, `text-text-muted`, `text-amber-400` for danger,
   etc.). **Don't hardcode the hex values.**
3. **`prototype/chat-v2.jsx`** is annotated with `[KEBAB-1…4]` banner comments
   marking `RecordMenu`, `RecordRow`, `openRowMenu`, and the controller — so you
   can jump straight to the kebab logic without reading 1,300 lines.

---

## The Kebab Trigger (button on each row)

| Property | Value |
|---|---|
| Icon | `more-vertical` (three vertical dots), 16px |
| Button size | 26 × 26 px, border‑radius 7px |
| Layout | `display:flex; align-items:center; justify-content:center` |
| Default color | `--hl-muted` (`rgba(245,239,230,0.55)`) |
| Visibility | `opacity: 0` by default; `opacity: 1` only on **row hover** or while **its menu is open** (`transition: opacity .15s`) |
| Hover bg | `color-mix(in srgb, var(--hl-text) 12%, transparent)`, color → `--hl-text` |
| Open state bg | same 12% wash, color `--hl-text` |
| aria‑label | `"Story options"` |
| Click | `stopPropagation()` so it doesn't also select the row; opens the menu anchored to the button |

A **star marker** (`star` icon, 13px, color `--hl-accent`) shows in the same slot
when the row is starred **and** the row is not hovered/open — i.e. the star and
the kebab swap: star at rest, kebab on hover.

### Two ways to open
1. **Click the kebab** button.
2. **Right‑click the row** (`onContextMenu` → `preventDefault()` then open at the
   row). Both paths call the same open handler.

---

## The Menu Popover

### Container
| Property | Value |
|---|---|
| Width | 212px |
| Padding | 6px |
| Border‑radius | 15px |
| Background | `color-mix(in srgb, var(--hl-surface-2) 92%, transparent)` (i.e. `#33210F` @ ~92%) |
| Backdrop | `backdrop-filter: blur(14px)` (+ `-webkit-` prefix) |
| Border | `1px solid var(--hl-border-strong)` (`rgba(245,239,230,0.20)`) |
| Box‑shadow | `0 18px 50px -12px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(0,0,0,0.3)` |
| Entrance anim | `hl-menu-in .14s cubic-bezier(.22,1,.36,1)`, `transform-origin: top left` (scale 0.96→1 + fade) |
| Role | `role="menu"`; rows are `role="menuitem"` |

> The `reference/SidebarV2.tsx` version is a simpler opaque panel
> (`w-52`, `rounded-xl`, `bg-surface`, `border-border`, `shadow-lg`, `p-1.5`,
> anchored `absolute right-1 top-full mt-1 z-50`). Either is acceptable — the
> prototype's glassy version is the higher‑fidelity target.

### Menu items (in order)
| # | key | Label | Icon (lucide) | Notes |
|---|---|---|---|---|
| 1 | `star` | **Star** / **Unstar** | `star` | Label flips to "Unstar" when the row is already starred |
| 2 | `rename` | **Rename** | `pencil` / `edit` | Puts the row label into inline edit mode |
| 3 | `invite` | **Invite collaborators** | `user-plus` | Opens the invite/share modal scoped to that row |
| 4 | `moveToChapter` | **Move to chapter** | `folder-input` | production label |
| 5 | `removeFromChapter` | **Remove from chapter** | `folder-minus` | production label |
| — | *(divider)* | | | 1px `--hl-border` line, `margin: 6px 8px` |
| 6 | `delete` | **Delete** | `trash-2` | **Danger** styling |

> Note the two key namings: the production component uses
> `star / rename / invite / moveToChapter / removeFromChapter / delete`; the
> prototype uses the shorter `star / rename / invite / move / remove / delete`.
> Pick one set and keep it consistent in your implementation.

### Menu item (row) styling
| Property | Value |
|---|---|
| Layout | `display:flex; align-items:center; gap:12px; width:100%; text-align:left` |
| Padding | `8px 11px` |
| Border‑radius | 9px |
| Font | `--font-body` (DM Sans), 14.5px, weight 500 |
| Default text | `--hl-text` (`#F5EFE6`); icon color `--hl-muted` |
| Icon size | 16px |
| Hover bg (normal) | `color-mix(in srgb, var(--hl-text) 8%, transparent)` |
| **Danger** text+icon | `--hl-danger` (`#E58D80`) |
| **Danger** hover bg | `color-mix(in srgb, var(--hl-danger) 14%, transparent)` |

---

## Interactions & Behavior
- **Open:** click kebab **or** right‑click row → menu mounts with the
  `hl-menu-in` animation.
- **Positioning (prototype):** the popover is rendered by the **panel root** (not
  the row) in section‑relative coordinates so it survives the sidebar's
  `overflow:hidden` and the chat panel's `transform`. Algorithm:
  - `MENU_W = 212`, `MENU_H = 300`, `GAP = 5`.
  - Horizontally **right‑aligned** under the kebab: `left = anchor.right - section.left - MENU_W + 8`, then clamped to `[8, section.width - MENU_W - 8]`.
  - Vertically below the kebab: `top = anchor.bottom - section.top + GAP`; if it would overflow the bottom (`top + MENU_H > section.height - 8`) it **flips up** above the anchor; finally clamped to `>= 8`.
  - (The TSX reference instead anchors with CSS: `absolute right-1 top-full mt-1`.)
- **Dismiss:** click the full‑screen invisible scrim behind the menu, click
  outside (`mousedown` outside the menu ref), press **Escape**, or on
  `resize` / `scroll` (capture). All close the menu.
- **Selecting an action:** fires `onAction(key)` / `onRowAction(target, id, action)`
  then immediately closes. The menu performs no mutation itself.
- **Star** toggles starred state on the row and shows a confirmation toast
  ("Starred" / "Star removed"). **Rename** enters inline edit. **Delete** removes
  the row (and clears active selection if it was active) + toast "Story deleted".
  Move/Remove show a toast in the prototype (stubbed). **These outcomes are the
  host app's responsibility** — wire them to your real store.

### Inline rename (triggered by the Rename action)
- Replaces the row label with an `<input>` (auto‑focused + selected on mount).
- Background `--hl-surface`, `1px solid var(--hl-accent-line)`, radius 7px,
  padding `4px 7px`, font matches the row (display 16px for story rows, body
  14.5px for conversation rows).
- **Enter** or **blur** commits (trimmed; ignored if empty); **Escape** cancels.

### Toast (confirmation after an action)
Pill at bottom‑center: `--font-mono` 11.5px uppercase, `--hl-surface-2` @94% with
`blur(12px)`, `1px solid --hl-border-strong`, radius 99px, a `check` icon in
`--hl-accent`, auto‑dismiss ~2.2s. Optional — adapt to your app's notification
pattern.

## State Management
Minimal state the host needs:
- `menuOpen` / `menuId` — which row's menu is open (prototype stores
  `{ n, top, left }`; TSX stores a `` `${target}:${id}` `` string).
- `renamingId` — which row is in inline‑edit mode.
- `starredIds` — drives the Star↔Unstar label and the rest‑state star marker
  (TSX prop: `starredConversationIds`).
- Row data (id, title, starred) lives in your store; the menu only reads it.

### Delegation contract (recommended — from `SidebarV2.tsx`)
```ts
export type RowTarget = 'conversation' | 'story';
export type RowAction =
  | 'star' | 'rename' | 'invite'
  | 'moveToChapter' | 'removeFromChapter' | 'delete';

// Single upward callback — the menu owns no mutation:
onRowAction?: (target: RowTarget, id: string, action: RowAction) => void;
```
Only render the kebab when `onRowAction` is provided.

## Design Tokens (exact values — Espresso theme)
```
--hl-bg:            #1C0F06
--hl-bg-2:          #170B04
--hl-surface:       #2A1A0E
--hl-surface-2:     #33210F   /* menu background base */
--hl-accent:        #C9A96E   /* star marker, toast check */
--hl-accent-line:   rgba(201,169,110,0.30)
--hl-accent-soft:   rgba(201,169,110,0.16)
--hl-text:          #F5EFE6   /* menu item text */
--hl-muted:         rgba(245,239,230,0.55)  /* kebab + item icons at rest */
--hl-faint:         rgba(245,239,230,0.30)
--hl-border:        rgba(245,239,230,0.12)  /* divider */
--hl-border-strong: rgba(245,239,230,0.20)  /* menu border */
--hl-danger:        #E58D80   /* Delete item */
--hl-on-accent:     #1C0F06
--hl-shadow:        rgba(0,0,0,0.55)
```
Type:
```
--font-display: 'Cormorant Garamond', Georgia, serif
--font-body:    'DM Sans', system-ui, sans-serif      /* menu items */
--font-mono:    'DM Mono', ui-monospace, monospace     /* toast */
```
Spacing/radii used by the menu: container radius 15px / item radius 9px / kebab
radius 7px; container pad 6px; item pad `8px 11px`; gaps 12px; menu width 212px;
icon 16px; kebab 26×26.

> The app ships multiple themes; these are the **Espresso (default)** values. If
> your codebase already has semantic tokens, map to those instead of hard‑coding.

## Assets / Icons
All icons are **lucide** (the prototype hand‑inlines the same paths in
`icons.jsx`). Names: `more-vertical`, `star`, `pencil` (edit), `user-plus`,
`folder-input` (folder), `folder-minus`, `trash-2`, `check`. Use your existing
lucide / icon set — no custom art.

## Files
- `prototype/Heirloom v2.html` — open this to run the real prototype.
- `prototype/chat-v2.jsx` — **the kebab lives here**:
  - `RecordRow` — the row + kebab trigger + star marker + inline rename
    (search for `const kebab =`).
  - `RecordMenu` — the popover (`function RecordMenu`, ~line 141).
  - Open/close/positioning: `openRowMenu`, `closeMenu`, `onMenuAction`, and the
    dismiss `useEffect` (search `MENU_W = 212`).
- `prototype/icons.jsx`, `prototype/landing.jsx`, `prototype/main-v2.jsx`,
  `prototype/tweaks-panel.jsx` — support files so the prototype runs.
- `reference/SidebarV2.tsx` — production‑style React/Tailwind reference:
  `MENU_ITEMS`, `RowMenu`, `RowTarget` / `RowAction` types, `onRowAction`
  contract.

## Running the prototype
Serve the `prototype/` folder over HTTP (the Babel/JSX `<script src>` tags need a
server, not `file://`), then open `Heirloom v2.html`. Enter the chat, hover a
sidebar conversation/story row, and click the `⋮` (or right‑click the row).
