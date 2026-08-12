# Handover — Sidebar: remove Uploads, drop the mobile drawer scrim, make Stories collapsible

Source: fresh copies of `SidebarV2.tsx` and `ChatHero.tsx` from `main` (pulled
2026-08-12), in `production-reference/`. Section 3 below is the fourth and
final draft — verified line-by-line against both the live prototype and the
reference screenshot before writing; the prior three drafts described
different, wrong structures and should be discarded if you have them.

## 1. Remove the "Uploads" nav row entirely

**Today:** `SidebarV2.tsx` renders an "Uploads" button under New Chat / Media,
but it's dead: `opacity-40 pointer-events-none`, permanently disabled, doing
nothing if clicked. Visible in the screenshot as the grayed-out "Uploads" row
between "Media" and "Share Heirloom."

**Change:** delete the row completely — not just leave it disabled. Uploads
already live inside Media; a permanently-inert nav item is confusing, not a
safe placeholder.

```tsx
// DELETE this entire block from SidebarV2.tsx (~line 460):
<button
  type="button"
  aria-label="Uploads"
  onClick={onUploads}
  className={`${navBtn} ${isExpanded ? 'w-full px-2 py-2' : 'w-9 h-9 justify-center'} opacity-40 pointer-events-none`}
>
  <Upload size={16} className="flex-shrink-0" />
  {isExpanded && <span className="font-body text-sm font-normal truncate">Uploads</span>}
</button>
```

Follow-up cleanup once the JSX is gone: remove the now-unused `onUploads`
prop from `SidebarV2Props` and its parameter destructure, the `onUploads`
prop passed down from `ChatHero.tsx`, the `Upload` icon import if nothing
else in the file uses it, and whatever handler `ChatHero.tsx` currently wires
to `onUploads` (delete it if it's not used elsewhere).

## 2. Remove the scrim behind the mobile sidebar drawer

**Today:** opening the sidebar on mobile renders a `bg-black/40` dimming
layer behind the drawer (`ChatHero.tsx`, `isMobile && state.isSidebarExpanded`
block) — visible in the screenshot as the darkened chat panel behind the open
drawer.

**Change:** the drawer should sit on top of the chat with no dimming at all
— same visual weight as if it were simply a wider panel, not a modal.

```tsx
// ChatHero.tsx, isMobile && state.isSidebarExpanded block (~line 476):
// BEFORE
{isMobile && state.isSidebarExpanded && (
  <>
    <div
      className="hl-animate-fade absolute inset-0 z-20 bg-black/40"
      aria-hidden="true"
      onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
    />
    {/* ...drawer... */}
  </>
)}

// AFTER — scrim div deleted, drawer unchanged
{isMobile && state.isSidebarExpanded && (
  <>
    {/* ...drawer... */}
  </>
)}
```

**Open question this creates, flagged rather than silently resolved:** the
deleted scrim was also the tap-outside-to-close target
(`onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}`). Removing it removes
that dismiss path — closing the drawer would then only be possible via its
own explicit close control (the collapse chevron / an X, whichever the
drawer header has) unless a different, invisible tap-catcher is added behind
it. Decide which before shipping; this handover only says "no visible
dimming," not "no dismiss-by-tapping-out."

**This also affects `handover_mobile_memory_panel_scrim`:** that earlier
handover asked for the memory panel's mobile overlay to adopt the *sidebar's*
scrim treatment, on the reasoning that the sidebar was the correct reference.
With the sidebar's own scrim now removed, that reasoning no longer holds.
Don't apply both handovers as originally written — resolve which pattern the
app should standardize on (no scrim anywhere, matching this change; or a
scrim everywhere, matching Media) before implementing either.

## 3. Make the Stories section collapsible — Create becomes the header's "+" button, chevron added beside it, the old Create row is deleted

**Verified against the current image and the live prototype (`chat-widget-canvas.jsx`, `Sidebar` component) — this is the exact, final target. Do not build anything looser than this.**

**Today on `main` (`SidebarV2.tsx`):** the Stories header is a static
`SectionLabel` (icon + "STORIES" label + optional "soon" tag, no button, no
interaction). Directly below it is a **separate, always-visible "Create" row** —
its own bordered button with a `Plus` icon and the text "Create" — inside a
`<div className="flex flex-col gap-px mb-2 pb-2 border-b border-border">`.
Below that, the story list always renders, no collapse control.

**Target — reproduced from the reference image:** header row reads
`STORIES  [+]  [⌄]` — label on the left, a bare `+` icon-button and a chevron
icon-button on the right, nothing else. **The text-labeled "Create" row is
gone entirely.** The `+` button IS Create now — same handler, new home,
icon-only. The chevron is a second, separate button next to it that
collapses/expands the story list beneath.

### 3a. Delete the old Create row completely

```tsx
// SidebarV2.tsx — DELETE this entire block (currently right after
// <SectionLabel>...Stories</SectionLabel>, ~line 605):
<div className="flex flex-col gap-px mb-2 pb-2 border-b border-border">
  <button
    type="button"
    onClick={onCreateStory}
    disabled={storiesDisabled || !onCreateStory}
    className="flex items-center gap-2.5 w-full text-left px-2 py-2 rounded-lg text-accent hover:bg-accent/15 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
  >
    <Plus size={15} className="flex-shrink-0" />
    <span className="font-body text-sm font-semibold">Create</span>
  </button>
</div>
```

### 3b. Replace the static header with one that carries "+" and the chevron

```tsx
// SidebarV2.tsx — add state alongside convosOpen (~line 379):
const [storiesOpen, setStoriesOpen] = useState(true);
```

```tsx
// SidebarV2.tsx — BEFORE (~line 592):
<SectionLabel
  icon={BookOpen}
  large
  trailing={
    storiesDisabled ? (
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-muted/60">
        soon
      </span>
    ) : undefined
  }
>
  Stories
</SectionLabel>

// AFTER — SectionLabel's own trailing slot is dropped in favor of a literal
// header row, because trailing now needs to hold TWO interactive buttons,
// not one static tag, and the "soon" tag needs to sit before them:
<div className="flex items-center gap-2 mb-3">
  <BookOpen size={14} className="text-text-muted" />
  <span className="font-mono text-sm tracking-[0.2em] uppercase text-text-muted">
    Stories
  </span>
  <div className="ml-auto flex items-center gap-1">
    {storiesDisabled && (
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-muted/60 mr-1">
        soon
      </span>
    )}
    <button
      type="button"
      aria-label="Create a new story"
      title="Create a new story"
      onClick={() => { onCreateStory?.(); setStoriesOpen(true); }}
      disabled={storiesDisabled || !onCreateStory}
      className="w-6 h-6 flex items-center justify-center rounded-md text-accent hover:bg-accent/15 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <Plus size={14} />
    </button>
    <button
      type="button"
      aria-label={storiesOpen ? 'Collapse stories' : 'Expand stories'}
      aria-expanded={storiesOpen}
      onClick={() => setStoriesOpen((o) => !o)}
      className="w-6 h-6 flex items-center justify-center rounded-md text-text-muted hover:bg-text-primary/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <ChevronRight
        size={14}
        className={`transition-transform ${storiesOpen ? 'rotate-90' : ''}`}
      />
    </button>
  </div>
</div>
```

**Resolved decisions, stated explicitly:**

1. **Create's fate:** the old text "Create" row is deleted outright. The `+`
   button in the header calls the exact same `onCreateStory` handler — no new
   prop, no behavior change to what creating a story does, only where the
   trigger lives.
2. **Does "+" force the list open?** Yes. The `+` button's `onClick` calls
   `setStoriesOpen(true)` in addition to `onCreateStory()`, so a newly
   created story is never hidden behind a collapsed list.
3. **Chevron direction:** use `ChevronRight` (already imported) at `0`
   rotation at rest — pointing right, list collapsed — and `rotate-90` when
   `storiesOpen` is true — pointing down, list expanded. This is the *same*
   convention already used one section up for Memories
   (`` `text-text-muted transition-transform ${convosOpen ? 'rotate-90' : ''}` ``
   on its own `ChevronRight`) — Stories' chevron now behaves identically, just
   living in a smaller standalone button instead of a full-row toggle.
   (Do not use a negative rotation — a prior draft of this handover said
   `-rotate-90` on open, which points the arrow up; that was wrong and is
   superseded by this one.)
4. **Sizing/spacing:** both buttons are `w-6 h-6` (24×24px) icon buttons,
   `gap-1` (4px) apart, sitting in a `ml-auto` wrapper together with the
   "soon" tag when present. `Plus` renders at `size={14}`, `ChevronRight` at
   `size={14}` — matched to each other, slightly smaller than the label's own
   14px `BookOpen` icon so the row doesn't feel top-heavy.

### 3c. Gate only the story list on `storiesOpen`

```tsx
// SidebarV2.tsx — story list wrapper (~line 615), BEFORE:
<div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
  {stories.map((story) => { ... })}
</div>

// AFTER:
{storiesOpen && (
  <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
    {stories.map((story) => { ... })}
  </div>
)}
```

Nothing inside the `.map` changes — each row's own icons (start-chat, invite,
kebab/star) are unrelated to this handover and stay exactly as they are.

**Do NOT:**
- Leave any text-labeled "Create" button anywhere in the Stories section —
  it's fully replaced by the header's `+`.
- Gate the header row itself (label/+ /chevron) behind `storiesOpen` — only
  the list below it collapses.
- Turn the whole header into one big clickable button (unlike Memories) —
  Stories keeps two small separate icon-buttons, matching the reference image
  exactly (label is not clickable, only the two icons are).

Default `storiesOpen` to `true` so nothing currently visible disappears on
upgrade.


## Everything not mentioned above is unchanged

Desktop layout, the collapsed icon rail (`forceCollapsed`), Search, New Chat,
Media, Share Heirloom, Memories, Writing Prompts, and every modal are
untouched by this handover.
