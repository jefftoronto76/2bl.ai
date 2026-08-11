# Handover — Sidebar: remove Uploads, drop the mobile drawer scrim, make Stories collapsible

Source: fresh copies of `SidebarV2.tsx` and `ChatHero.tsx` from `main`, in
`production-reference/`. Three independent, small changes, verified against a
real production screenshot (mobile, iOS, `heirloom.2bl.ai`). Each is quoted
exactly — search for the comment markers, don't count lines by hand.

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

## 3. Make the Stories section collapsible, matching Memories

**Today:** the Memories section header is a `<button>` that toggles
`convosOpen`, with a `ChevronRight` that rotates 90° when open
(`aria-expanded`, click anywhere on the header row). The Stories section
header is a static, non-interactive `SectionLabel` — no button, no chevron,
always rendered open.

**Change:** give Stories the same interaction. Add a `storiesOpen` state
(default `true`, so nothing currently visible disappears on upgrade) and wrap
the header in a button exactly like the Memories one.

```tsx
// SidebarV2.tsx — add alongside the existing convosOpen state (~line 379):
const [storiesOpen, setStoriesOpen] = useState(true);
```

```tsx
// SidebarV2.tsx — Stories header (~line 601), replace the static SectionLabel
// with a toggling button. Reference: the Memories header a few lines above
// this block already does exactly this (aria-label="Memories", aria-expanded,
// ChevronRight rotate) — copy that pattern.

// BEFORE
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

// AFTER
<button
  type="button"
  aria-label="Stories"
  aria-expanded={storiesOpen}
  onClick={() => setStoriesOpen((o) => !o)}
  className="flex items-center gap-2 mb-3 w-full text-left"
>
  <BookOpen size={14} className="text-text-muted" />
  <span className="font-mono text-sm tracking-[0.2em] uppercase text-text-muted">
    Stories
  </span>
  {storiesDisabled && (
    <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-muted/60 ml-1">
      soon
    </span>
  )}
  <ChevronRight
    size={14}
    className={`text-text-muted transition-transform ml-auto ${storiesOpen ? 'rotate-90' : ''}`}
  />
</button>
```

Then gate everything currently rendered unconditionally below that header —
the Create row and the story list `<div className="flex flex-col gap-0.5
max-h-48 overflow-y-auto">...` — behind `storiesOpen &&`, the same way
Memories' conversation list is gated behind `isExpanded && convosOpen &&`.

**Unaffected by this change:** the "soon" tag's own logic (still tied to
`storiesDisabled`, just relocated from `SectionLabel`'s `trailing` prop into
the inline header markup above), the Create button, the per-row invite/kebab
icons, `storiesDisabled`'s disabling of every row action. None of that
changes — only whether the section can be collapsed.

## Everything not mentioned above is unchanged

Desktop layout, the collapsed icon rail (`forceCollapsed`), Search, New Chat,
Media, Share Heirloom, Memories, Writing Prompts, and every modal are
untouched by this handover.
