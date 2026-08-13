# Handover — Sidebar: search + collapse in the header row

Replace the sidebar's old story-switcher dropdown with a header row that
combines a real, working keyword search (conversations, stories, memory
content) with an explicit collapse-to-icon-rail button.

Source: `production-reference/SidebarV2.tsx` + `ChatHero.tsx` (fresh pulls
from `main`, 2026-08-13). `prototype-reference/chat-widget-canvas.jsx` has
this built and verified live.

## Diff against `main`

**Collapse already exists on `main`** — not a gap. `SidebarV2.tsx` has a
chevron `IconButton` above Search that toggles local `expanded` state
(`w-64` ↔ `w-12` icon rail):
```tsx
{!forceCollapsed && (
  <div className={...}>
    <IconButton label={expanded ? 'Collapse sidebar' : 'Expand sidebar'} onClick={() => setExpanded((v) => !v)} ...>
      <ChevronRight size={16} />
    </IconButton>
  </div>
)}
```
The prototype's new collapse button is the same idea, just relocated into
the combined header row instead of its own standalone row, and only shown
on desktop (mobile keeps its Close X in the same slot — same pattern
`main`'s own header already uses elsewhere).

**Search exists on `main` but is dead.** `SidebarV2.tsx`'s `SearchField`:
```tsx
<input
  value={value}
  onChange={(e) => { setValue(e.target.value); onSearch?.(e.target.value); }}
  ...
/>
```
`onSearch` is a prop with no wiring — grepped every `<SidebarV2` render site
in `ChatHero.tsx`; `onSearch` is never passed. Typing into `main`'s search
box today does nothing. It's also **threshold-gated** (`searchRevealed =
recentSessions.length >= searchThreshold`, default 8) — subtle/near-invisible
until you have 8+ conversations, and it lives in its own row above New Chat,
separate from the collapse toggle.

**The dropdown being replaced** (the "All stories ⌄" story-switcher that
used to occupy this slot) was prototype-only scaffolding to begin with —
`main` never had it, so there's nothing to remove there.

## Built and verified (prototype)

Single header row, `Sidebar` component:
```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 10px 10px 12px', ... }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--hl-border)', background: 'var(--hl-surface)' }}>
    <Icon n="search" s={15} style={{ color: 'var(--hl-faint)', flexShrink: 0 }} />
    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memories & stories" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', ... }} />
  </div>
  {onClose ? (
    <button aria-label="Close menu" onClick={onClose}><Icon n="x" s={18} /></button>
  ) : (
    <button aria-label="Collapse menu" onClick={onToggleCollapse}><Icon n="chevronLeft" s={17} /></button>
  )}
</div>
```

**Search actually filters**, three things at once:
```js
const q = query ? query.toLowerCase() : '';
const sessionMatches = (s) => !q || s.title.toLowerCase().includes(q)
  || mems.some((k) => k.sessionId === s.id && ((k.title||'').toLowerCase().includes(q) || (k.passage||'').toLowerCase().includes(q)));
const storyMatches = (st) => !q || st.name.toLowerCase().includes(q) || (st.tagline||'').toLowerCase().includes(q)
  || mems.some((k) => k.storyId === st.id && ((k.title||'').toLowerCase().includes(q) || (k.passage||'').toLowerCase().includes(q)));
```
A conversation or story matches if its own name matches, OR any memory kept
under it matches by title/passage. Both the Memories list and the Stories
list filter live off the same query — one search box, two lists.

**Collapse** is wired per render site to whatever width state that instance
owns (`sideW` for the main chat drawer, `storySideW` for the Story Canvas
sidebar), toggling between the existing `<= 60` icon-rail threshold and 264:
```js
onToggleCollapse={() => setSideW((w) => (w <= 60 ? 264 : 53))}
```

**Side fix, same pass**: the sidebar had a latent bug where it defaulted to
filtering conversations down to only the *first* story (`selectedStoryId`
defaulted to `stories[0].id`, and nothing outside the now-removed dropdown
ever changed it) — silently hiding every other story's conversations by
default. Default is now `null` (show everything) since there's no longer a
per-story filter control in the header at all.

## Known knowns

- One shared `Sidebar` component (prototype) — ships identically on mobile
  and desktop; only the close-vs-collapse button differs, gated on whether
  `onClose` is passed (mobile) or not (desktop).
- `main`'s collapse mechanism (`expanded` state, icon-rail width) is
  structurally the same idea already — this is a relocation/wiring change,
  not new functionality, for that half.
- `main`'s search is the opposite — real UI, zero wiring. Porting this
  handover's filtering logic means writing the filter (main has nothing to
  reuse) and removing the threshold-gate (`searchRevealed`) so it's always
  visible per this design's intent.

## Known unknowns

- **Where should main's search filtering live?** The prototype computes it
  inline in `Sidebar` from props it already has (`memories`, `stories`,
  `sessions`) — `main`'s equivalent data comes from `useChatStore()`
  (`recentSessions`) plus the `stories`/`memories` props `ChatHero.tsx`
  already threads through. Filtering could live in `SidebarV2.tsx` itself
  (mirroring the prototype) or be lifted into the store — not decided here.
- Memory content on `main` (`MemoryRow.title`/`.body`) isn't currently
  passed into `SidebarV2` at all — it only gets `stories`/`writingPrompts`
  as data props today. Wiring memory-content search means threading that
  data down, a real (if small) prop-surface change.
- Whether removing the 8-conversation reveal threshold entirely (this
  design's "always visible" posture) is intended, or whether main should
  keep some form of progressive disclosure — not raised as a question in
  the original ask.
