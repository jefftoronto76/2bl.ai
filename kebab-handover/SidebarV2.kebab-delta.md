# SidebarV2.tsx — Real Diff: Production vs. Handoff Reference

## 🛑 Headline: the kebab menu is ALREADY in production
Pulled live from `jefftoronto76/2bl.ai@main`
(`components/shells/membership/v2/SidebarV2.tsx`). **Do not re-implement it.**
Production already ships a complete, working kebab — and it is *more* evolved
than the handoff reference. CC's job is **reconciliation + QA**, not a build.

Files in this folder:
- `production/SidebarV2.tsx` — the real current file (pulled from `main`).
- `production/types.ts` — shared types, now extracted (see below).
- `../reference/SidebarV2.tsx` — the earlier handover version (kebab inline).

---

## What production has that the reference predicted/changed

### 1. Types were extracted to `v2/types.ts` ✅ (HANDOVER predicted this)
Production does:
```ts
import type { RowAction, RowTarget, Story, WritingPrompt } from './types';
```
`RowTarget`, `RowAction`, `Story`, `WritingPrompt`, `Collaborator` all now live
in `types.ts` — **not** inline in `SidebarV2.tsx`. The `RowAction` union is
unchanged (`star | rename | invite | moveToChapter | removeFromChapter | delete`).
→ **Action for CC:** import row types from `./types`; don't redeclare them.

### 2. The menu now portals to `<body>` with fixed positioning (big change)
The reference used a simple in-tree `absolute right-1 top-full mt-1`. Production
**rewrote positioning** because the sidebar is `overflow-y-auto` (clips in-tree):
- `RowMenu` now takes an `anchorRect: DOMRect | null`.
- `createPortal(…, document.body)` + `className="fixed z-[90] w-52 …"`.
- Constants `MENU_WIDTH = 208`, `MENU_EST_HEIGHT = 272`.
- **Flip-up** when `anchorRect.bottom + 4 + MENU_EST_HEIGHT > innerHeight`;
  horizontal **clamp** to the viewport.
- The rect is captured at click time:
  ```ts
  const toggleMenu = (id, e) => {
    if (menuId === id) setMenuId(null);
    else { setMenuRect(e.currentTarget.getBoundingClientRect()); setMenuId(id); }
  };
  ```
  State: `menuId` **and** new `menuRect`.
→ This matches the *prototype's* portal/section-relative approach in spirit —
  production just anchors to the viewport instead of the chat section.

### 3. Dismiss logic hardened
- Uses `'click'` (not `mousedown`) so toggling the kebab doesn't close-then-reopen.
- **Capture-phase Escape with `stopPropagation()`** so the chat panel's own
  window-level Escape doesn't also fire.
- Closes on `scroll`(capture) + `resize` (fixed menu detaches from its row).
→ **QA these** — they're the subtle bugs the prototype's simpler handlers had.

### 4. Menu item LABELS changed: "story" → "chapter"
Production reads **"Move to chapter" / "Remove from chapter"** (keys still
`moveToChapter` / `removeFromChapter`). The prototype + earlier README said
"Move to **story**". **Production wins** — use "chapter". (I've corrected the
README.)

### 5. Accessibility + focus polish added in production
- `aria-expanded={isMenuOpen}` on each kebab button.
- Menu items gained `focus-visible:ring-2 focus-visible:ring-accent`.

### 6. Unrelated production evolution (context, not kebab work)
- New `storiesDisabled` prop → Stories section inert with a "soon" tag; the
  story kebab + start-chat buttons are gated `&& !storiesDisabled`.
- `SectionLabel` gained a `trailing` slot (for the "soon" tag).
- Sign-in nudge for anonymous visitors (`!isMember`).
- Uploads / Share / Create / Writing Prompts currently `opacity-40
  pointer-events-none` (shipped-disabled). Don't "fix" these — they're intentional.
- Conversation + story lists are `max-h-48 overflow-y-auto`.

---

## Gaps — things the PROTOTYPE intended that production does NOT have
These are the only places the design intent isn't met yet:

| Prototype intent | Production state | Recommendation |
|---|---|---|
| **Right-click row** (`onContextMenu`) also opens the menu | Not implemented — kebab click only | Add only if desired; minor |
| **Inline rename** in the row | `rename` just delegates `onRowAction(…, 'rename')` | Correct per the delegation model — the **parent** must render the rename UI + toast |
| **Touch/mobile**: visible kebab, ≥44px targets | Still `opacity-0 group-hover:opacity-100` + `w-7 h-7` (28px) | **Open issue** — same mobile caveats as README §Mobile. Production is desktop-only too |

## Net guidance for CC
1. **Don't rebuild the kebab.** It exists and is ahead of the reference.
2. Confirm the **parent** wires `onRowAction` → store mutations + the rename UI +
   confirmation toasts (the menu delegates all of this).
3. Use **"chapter"** labels and import types from **`./types`**.
4. If mobile matters, treat the touch gaps above as the real work (paused per
   your call) — not the menu itself.
