# Handover — Header: remove the conversation-switcher, restore the logo

Source: `main`'s `ChatHeader.tsx` (components/shells/membership/), read
directly this session.

## What's there today

`ChatHeader.tsx` renders, left of the icon cluster, a **conversation
switcher** — not a logo:

```tsx
<div ref={storyDropdownRef} className="relative min-w-0 flex-1" onBlur={handleStoryBlur}>
  <button type="button" aria-label="Switch conversation" aria-expanded={storyDropdownOpen} onClick={handleStoryClick}
    className="flex items-center gap-1.5 min-w-0 max-w-full font-body text-text-primary font-semibold text-base hover:bg-text-primary/10 rounded-lg px-2 py-1.5 transition-colors">
    <span className="truncate">{storyLabel}</span>
    <ChevronDown size={14} className={`text-text-muted flex-shrink-0 transition-transform ${storyDropdownOpen ? 'rotate-180' : ''}`} />
  </button>
  {storyDropdownOpen && (
    <div className="absolute left-0 top-full mt-1 w-72 max-w-[85vw] rounded-xl bg-surface border border-border shadow-lg z-50 overflow-hidden">
      {/* ...recentSessions.map(...) list... */}
    </div>
  )}
</div>
```

`storyLabel` = the active conversation's title (or "Your Story" if none
started). **No `md:hidden` anywhere on this block** — it renders identically
on mobile and desktop. It's `flex-1`, so it's also the element that eats all
the header's free width — on a narrow phone it dominates the bar.

There is **no logo/brand mark anywhere in this component**, on either
breakpoint — confirmed by reading the full file. Whatever "put the logo back
on desktop" refers to, it isn't restoring something `ChatHeader.tsx` used to
render; it's adding a logo where the switcher currently sits.

## Change

1. **Delete the switcher block above entirely** — button, dropdown, and the
   now-unused `storyDropdownOpen`/`storyDropdownRef`/`handleStoryClick`/
   `handleSelectConversation`/`handleStoryBlur`/`storyLabel`/`activeSession`
   state and handlers. Removes it from both mobile and desktop in one
   change, since nothing here was breakpoint-gated to begin with.
2. **Replace it with a static logo + wordmark**, matching the treatment
   already used elsewhere in this codebase for the same brand mark (feather
   icon in a rounded accent-soft square + "Legacy" or product wordmark) —
   non-interactive, just identity, sitting where the switcher used to be.

```tsx
// Suggested replacement, shape only — pull the exact brand mark markup
// from wherever else in the app already renders it, don't hand-roll new SVG:
<div className="flex items-center gap-2 min-w-0 flex-1">
  <span className="w-6 h-6 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0">
    {/* feather mark */}
  </span>
  <span className="font-display font-semibold text-text-primary text-base truncate">
    {/* product wordmark */}
  </span>
</div>
```

## Known

- This is a `main`-only change — the mobile prototype's own header
  (`chat-widget-canvas.jsx`) never had this switcher to begin with; it
  already shows a static feather-mark + "Legacy" wordmark in the same
  position. No prototype change needed here — `main` is the one catching up
  to that, not the other way around.
- Removing this control removes the **only mobile-visible way to switch
  conversations outside the hamburger drawer**. Desktop keeps the docked
  sidebar's Memories list as an unaffected second path; mobile's only
  remaining path becomes the hamburger drawer.

## Open questions

- Exact brand-mark markup/asset to reuse — not tracked down this session;
  needs a quick search of the codebase for wherever the feather mark is
  already defined (likely `brand/` per this project's own conventions) so
  this doesn't get redrawn as a one-off.
- Whether losing the mobile-header switch path (above) is acceptable as-is,
  or needs a lighter-weight replacement (e.g. the current conversation title
  shown as inert text next to the logo). Not specified by the ask as given.
