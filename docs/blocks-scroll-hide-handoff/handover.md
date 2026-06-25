# Blocks page — closing the two gaps

**Branch:** `claude/gifted-franklin-4ovsx3` · **Target:** `app/admin/prompt-studio/blocks/`
Mantine v7 · Next.js App Router · TypeScript. The Blocks rework is in place; two
behaviours from the approved prototype (Combined Admin · **Blocks**) are still missing.

---

## Gap 1 — the filter toolbar doesn't lock on scroll

**Prototype:** the search + filter-chip toolbar lives in a `.blocks-sticky` wrapper
(`position: sticky; top: 0; z-index: 6`). As you scroll, the summary (donut + details)
scrolls away and the toolbar **locks to the top of the scroll region**, so search and
filters stay reachable through a long block list. Scroll back up and it releases when
the summary returns.

**Branch today:** `BlocksTable` renders the toolbar in a plain `<Box mb="md">` inside
the scrolling `<Box>` from `page.tsx` — nothing is sticky, so the toolbar scrolls off
with the summary.

**Fix:** give the toolbar wrapper `position: sticky; top: 0`. The scroll container is
already `BlocksPage`'s `<Box style={SCROLL_AREA_STYLE}>` (`overflow: auto`), and the
toolbar is a descendant of it, so sticky pins to that scrollport with no structural
change. The only nuance is the scroll container's padding (`p={{ base: 'md', sm: 'lg' }}`):
the sticky bar bleeds out to those edges with negative inline margins so rows scroll
**under** it edge-to-edge. That's all in `.stickyToolbar` (`BlocksLayout.module.css`).

> Requirement for sticky to work: no ancestor between the toolbar and the scroll
> `<Box>` may set `overflow` to anything but `visible`, and the scroll `<Box>` must keep
> `overflow: auto` + a bounded height (it has both — `flex: 1; min-height: 0` inside the
> `Stack h="100%"`). If a future wrapper adds `overflow: hidden`, sticky silently breaks.

---

## Gap 2 — no "Hide summary" button

**Prototype:** the overview card (status / version / active blocks / last updated +
the token donut) carries a **Hide summary** button (top-right, `header` control
variant). Hiding collapses the card and swaps in a compact **recall bar** — a green/
amber status dot, active-block count, and token total — with a **Show summary** link.
The choice persists in `localStorage` (`blocks.summaryHidden`).

**Branch today:** `BlocksTable` renders `<BlocksOverview>` directly with no collapse.

**Fix:** wrap `<BlocksOverview>` in the new **`SummarySection`** component (in this
bundle). It owns the hide/show state + persistence and renders the button, the
collapse animation, and the recall bar. `BlocksTable` passes it the recall stats.

---

## Files in this bundle

- **`SummarySection.tsx`** — NEW component. Drop in
  `app/admin/prompt-studio/blocks/SummarySection.tsx`.
- **`BlocksLayout.module.css`** — NEW. Two slices: `.stickyToolbar` (Gap 1) and the
  `.summary*` / `.recall*` rules (Gap 2). Drop in
  `app/admin/prompt-studio/blocks/BlocksLayout.module.css`.
- **`BlocksTable.edits.md`** — the exact edits to `BlocksTable.tsx` (import, stats,
  wrap the overview, make the toolbar sticky).

No change to `page.tsx` is required — its scroll container already does the right
thing. (Optional polish noted in `BlocksTable.edits.md`.)

---

## Design tokens (from the prototype, mapped to Mantine v7)

- Sticky bar: `background var(--mantine-color-body)`, `border-bottom 1px
  var(--mantine-color-gray-2)`, `z-index 6`, bleed = scroll padding (`md` → `lg` at
  `48em`).
- Hide button (pill): 30px tall, `1px gray-3` border, `radius 999px`, `12.5px/500`,
  soft shadow; hover → `gray-1` bg / `gray-4` border.
- Recall bar: `gray-0` bg, `1px gray-2` border, `radius md`; label `13px/600`; stats
  `12.5px dimmed`, numerals bold `gray-7` tabular; status dot `#2d6a4f` Live /
  `#e67700` Draft; "Show summary" link `green-7`.
- Collapse: `max-height` 0↔760px, `300ms cubic-bezier(0.4,0,0.2,1)`; disabled under
  `prefers-reduced-motion`.
- Persistence key: `localStorage['blocks.summaryHidden']` (`'1'` hidden / `'0'` shown).

---

## QA checklist

- [ ] Scroll a long list: toolbar pins to the top, rows pass under it edge-to-edge;
      scroll up and it releases as the summary returns.
- [ ] **Hide summary** collapses the card to the recall bar; **Show summary** restores it.
- [ ] Recall bar shows correct status dot, active count, and token total.
- [ ] Refresh / navigate away and back — hidden/shown state persists.
- [ ] Reduced-motion: collapse is instant, no animation.
- [ ] Narrow viewport: recall bar wraps; sticky bleed matches the `md` padding.
