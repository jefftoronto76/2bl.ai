# Handover — Updated Headers

Restore a static logo/wordmark in the chat header and remove the
conversation-switcher dropdown that's there today — on both mobile and
desktop (the control isn't breakpoint-gated on `main`, so this affects both
at once).

Source: `production-reference/ChatHeader.tsx` + `ChatHero.tsx` (fresh pulls
from `main`, 2026-08-13). `prototype-reference/chat-widget-canvas.jsx` shows
the target state already built — its own header never had this dropdown.

## Today, on `main`

`ChatHeader.tsx` renders, left of the icon cluster, a conversation switcher —
not a logo:

```tsx
<div ref={storyDropdownRef} className="relative min-w-0 flex-1" onBlur={handleStoryBlur}>
  <button type="button" aria-label="Switch conversation" aria-expanded={storyDropdownOpen} onClick={handleStoryClick}
    className="flex items-center gap-1.5 min-w-0 max-w-full font-body text-text-primary font-semibold text-base hover:bg-text-primary/10 rounded-lg px-2 py-1.5 transition-colors">
    <span className="truncate">{storyLabel}</span>
    <ChevronDown size={14} className={`text-text-muted flex-shrink-0 transition-transform ${storyDropdownOpen ? 'rotate-180' : ''}`} />
  </button>
  {storyDropdownOpen && (
    <div className="absolute left-0 top-full mt-1 w-72 max-w-[85vw] rounded-xl bg-surface border border-border shadow-lg z-50 overflow-hidden">
      {/* recentSessions.map(...) — click switches loadSession(id) */}
    </div>
  )}
</div>
```

`storyLabel` is the active conversation's title, or "Your Story" if none
started yet. **No `md:hidden` anywhere on this block** — it's identical on
mobile and desktop. It's also `flex-1`, so it eats all the header's free
width; on a narrow phone it's the dominant element in the bar.

There is **no logo/brand mark anywhere in `ChatHeader.tsx`**, on either
breakpoint, confirmed by reading the full file. "Put the logo back" means
adding one where the switcher currently sits, not literally restoring
something this file used to render.

## Change

1. **Delete the switcher block** — button, dropdown, and the
   `storyDropdownOpen` / `storyDropdownRef` / `handleStoryClick` /
   `handleSelectConversation` / `handleStoryBlur` / `storyLabel` /
   `activeSession` state and handlers that only exist to support it.
2. **Replace it with a static logo + wordmark**, non-interactive, in the same
   position — pull the exact brand mark from wherever it's already defined
   elsewhere in the app (this project's own convention: a `brand/` asset,
   gold-gradient rounded square + feather glyph) rather than redrawing it.

```tsx
// Shape only — swap in the real brand-mark markup/asset:
<div className="flex items-center gap-2 min-w-0 flex-1">
  <span className="w-6 h-6 rounded-md bg-accent/10 border border-accent/20 flex items-center justify-center text-accent flex-shrink-0">
    {/* feather mark */}
  </span>
  <span className="font-display font-semibold text-text-primary text-base truncate">
    {/* product wordmark */}
  </span>
</div>
```

## Known knowns

- Confirmed via direct read of `ChatHeader.tsx`: the switcher renders
  identically on both breakpoints — this is one change, not two.
- The mobile prototype's own header (`chat-widget-canvas.jsx`) already shows
  the target state (static feather-mark + "Legacy" wordmark, no switcher) —
  it's `main` catching up to the prototype here, not the reverse.
- Removing this control removes the **only mobile-visible way to switch
  conversations outside the hamburger drawer**. Desktop is unaffected beyond
  losing the header shortcut — the docked `SidebarV2` Memories list still
  covers switching there.

## Known unknowns

- Exact brand-mark markup/asset to reuse — not tracked down this session;
  needs a quick search of the codebase (likely a `brand/` folder per this
  project's conventions) so it isn't redrawn as a one-off.
- Whether losing the mobile-header switch path is acceptable as-is, or needs
  a lighter-weight replacement (e.g. the current conversation title as inert
  text next to the logo). Not specified by the request as given.
- Whether `storyLabel`'s underlying data (active conversation title) needs
  to surface anywhere else in the header once the switcher is gone, or is
  fully dropped.
