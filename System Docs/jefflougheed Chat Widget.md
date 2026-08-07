# jefflougheed Chat Widget

## jefflougheed Chat Widget

This file documents the **actual runtime behavior** of the jefflougheed.ca
chat surfaces — `components/shells/widget/WidgetShell.tsx` and its CSS in
`app/(jefflougheed)/globals.css` — at a mechanism level: why things are wired
the way they are, what's live vs. dead, and what a future edit needs to know
before touching this surface. It exists because three real bugs (visitor
bubble rendering the wrong color, desktop page unable to scroll past the
engaged hero, the assistant's response rendering outside the viewport) were
all traced, on the same night, to mechanisms that existed nowhere in
writing — found only by live debugging each time. `System Docs/Public
Site.md`'s `WidgetShellChat`/`WidgetShellHero` rows still own the
visual/copy-level spec (bubble shape history, animation timing, empty-state
copy) — this file owns the mechanism.

---

## 1. Overview — two surfaces, one conversation

`app/(jefflougheed)/page.tsx` mounts both:

- **`WidgetShellHero`** — the inline chat-first hero (`#herochat`). Composer
  + conversation canvas sit directly in the landing hero section.
- **`WidgetShellChat`** — the `#footerchat` CTA section ("Start a
  Conversation" / "Continue Conversation") plus the full-screen overlay
  (`#sage-chat-overlay`) it opens via `useWidgetShell.expand()`.

Both read/write the **same conversation** through the shared session
(`useChatSessionContext`, `instanceKey: "sage"`) — sending a message in one
surface is immediately visible in the other if both are mounted. Only
*shell* state is per-surface and lives in `useWidgetShell` (a module-level
Zustand singleton, not React context): `isExpanded` (is the overlay open),
`mode` (`'question' | null`), `heroEngaged` (read by `SectionRail` only, to
hide the section nav while the hero is engaged), and `composerRef`.
`WidgetShellHero` does **not** call `expand()` under normal circumstances —
see §2.

---

## 2. The mobile routing mechanism (composer taps don't do what they look like they do)

`WidgetShell.tsx:631-636`, wired via `onPointerDown` on the Hero's own
textarea (`WidgetShell.tsx:773`):

```ts
const handleComposerPointerDown = (e: PointerEvent<HTMLTextAreaElement>) => {
  if (typeof window === 'undefined') return
  if (!window.matchMedia('(max-width: 767px)').matches) return
  e.preventDefault()
  expand()
}
```

At ≤767px, the moment a visitor taps the Hero's composer, this handler calls
`preventDefault()` — blocking the browser's default focus action before it
can fire — and calls `expand()`, mounting the full-screen overlay instead.

**Consequence:** on mobile, ordinary tap-to-type on the Hero composer
**never reaches Hero's own engaged state.** `handleComposerFocus`
(`WidgetShell.tsx:638-641`, the only thing besides `submit()` that sets
`conversationVisible` true) never fires, because focus itself was prevented
— and `submit()` needs text typed into a focused textarea to run at all. So
`isEngaged = messages.length > 0 && conversationVisible`
(`WidgetShell.tsx:602`) stays false on mobile for the ordinary journey; the
`.stage.engaged` CSS state (§3 in the old sense, now covered by the CSS
cascade below) and everything that depends on it in `WidgetShellHero` is,
functionally, a **desktop-only code path** for real visitors.

**The one exception:** `detectModeFromLocation()` (`WidgetShell.tsx:537-546`)
parses `?mode=question` (hash-query or top-level search param) on mount and,
if present, calls `textareaRef.current?.focus()` **programmatically**
(`WidgetShell.tsx:593-600`) — this bypasses the pointerdown guard entirely
(it's not a pointer event), so it's the only way a mobile visitor reaches
Hero's genuine inline-engaged state. Any bug report about "the mobile inline
hero" should be checked against which path was actually used — a normal tap
routes to the overlay (§ below); only a `?mode=question` link exercises
Hero's own engaged rendering.

**Why this matters for future debugging:** a visual bug reported as "on the
mobile inline hero" is very likely actually the overlay, reached through a
different gesture than "the nav chat button" but rendering through the exact
same component and CSS. Confirmed exactly this way for the visitor-bubble
color bug — see §5.

---

## 3. `useKeyboardViewport`'s contract

Full hook: `services/chat/ui/v1/core/useKeyboardViewport.ts`. Its own file
header and options doc comments are the authoritative source — this section
exists so a reader doesn't have to go find them, and states the rule
plainly:

> **`lockBodyScroll: true`** is for a true full-viewport overlay only.
> **Inline surfaces must pass `false`.** `position: fixed` on `document.body`
> freezes the page at its current scroll offset with nothing to re-anchor an
> inline surface to the viewport top — on desktop this directly caused the
> page-can't-scroll-past-the-hero and response-outside-viewport bugs; the
> hook's own doc comment additionally notes it breaks iOS keyboard detection
> in a non-overlay context.

Three real call sites in the app:

| Call site | `active` | `lockBodyScroll` | `trackViewport` | Surface type |
|---|---|---|---|---|
| `WidgetShellChat` (`WidgetShell.tsx:249-253`) | `isExpanded` | `true` | `false` | Full-screen overlay |
| `WidgetShellHero` (`WidgetShell.tsx:620-624`) | `isEngaged \|\| composerFocused` | `false` | `false` | Inline |
| `ChatHero.tsx` (Heirloom membership shell, `components/shells/membership/ChatHero.tsx:147-150`) | `state.isChatOpen` | `true` | (default `true`) | Modal panel — genuinely a different surface/shell, not this widget |

`WidgetShellHero`'s call previously passed `lockBodyScroll: isEngaged` —
contradicting the hook's own contract for exactly the reason above. Fixed
2026-08-06/07; see git history on `WidgetShell.tsx` around that date if this
regresses.

`trackViewport: false` on **both** jefflougheed call sites means neither
surface uses the hook's `visualViewport` measurement/`keyboardOpen`
tracking or `onViewportChange` — that mechanism exists in the hook for
other consumers but is currently inert for this widget. (An earlier version
of this widget did use it — see §4's correction of stale prior
documentation.)

---

## 4. The `--vvh` viewport-height mechanism (corrects prior stale docs)

`System Docs/Public Site.md` previously described the overlay's height as
"pure CSS (`h-dvh`), unconditionally, no JS-computed inline height or
transform," and separately described `WidgetShellHero`'s keyboard handling
as writing `--kb-surface-h`/`--kb-surface-y` CSS vars and toggling a
`.chat-surface--kb` class. **Neither exists in the current code** — grepped
to confirm zero matches for `h-dvh`, `kb-surface`, `chat-surface--kb`,
`chatSurfaceRef`, `onViewportChange` anywhere in `WidgetShell.tsx`. Both
paragraphs described a since-removed implementation that was never updated
when the code changed. What's actually there today:

`WidgetShellChat` measures the visual viewport directly, independent of the
`useKeyboardViewport` hook:

```ts
// WidgetShell.tsx:270-286
useEffect(() => {
  if (!window.visualViewport) return
  const overlay = overlayInnerRef.current
  const update = () => {
    if (overlay && window.visualViewport) {
      overlay.style.setProperty('--vvh', `${window.visualViewport.height}px`)
    }
  }
  window.visualViewport.addEventListener('resize', update)
  update()
  return () => window.visualViewport?.removeEventListener('resize', update)
}, [])
```

The overlay's inner div consumes it via inline style, with `100dvh` as the
pre-JS/no-`visualViewport`-API fallback:

```tsx
// WidgetShell.tsx:410
<div ref={overlayInnerRef} className="flex min-h-0 flex-col" style={{ height: 'var(--vvh, 100dvh)' }}>
```

One CSS rule also reads `--vvh`, scoped to mobile only
(`globals.css:597-603`, the `#sage-chat-overlay > div` grid-layout block) —
redundant with the inline style at desktop widths but harmless, since both
resolve to the same value.

`app/layout.tsx`'s `interactiveWidget: 'resizes-content'` viewport export
(line 7) is real and accurate — it's what makes `visualViewport.height`
itself shrink correctly on keyboard-open on both iOS Safari and Android
Chrome, which is what this whole mechanism depends on.

`WidgetShellHero` has no equivalent mechanism today — no CSS vars, no
`chatSurfaceRef`, no keyboard-aware class toggle. Its only
`useKeyboardViewport` usage is the plain call in §3.

---

## 5. The branding/CSS-cascade mechanism

`app/layout.tsx:22` sets `data-brand="jefflougheed"` on `<html>` for every
route except sbl/heirloom/admin/legacy (resolved from middleware headers).
This is a genuinely surprising default: **jefflougheed.ca's site-wide theme
is dark** (`html[data-brand="jefflougheed"]` sets `--color-bg: 24 32 41`,
`--color-surface: 42 56 69` — a near-black background, dark slate-blue
surface — `globals.css:33-44`), with specific sections and components
carved out back to a light/cream palette. A chat surface that doesn't land
inside one of those carve-outs silently renders dark/blue instead of
cream-on-white — this is exactly what tonight's visitor-bubble bug was.

**Selectors that currently carve back to light/cream** (i.e. re-declare
`--color-surface`, `--color-text-primary`, `--color-border`, etc. to their
light values):

- `#outcomes`, `#how-it-works`, `#testimonials` sections (`globals.css:46-60`)
- `#herochat .chat-surface`, `#sage-chat-overlay > div > header`
  (`globals.css:67-79`) — note this is the **header only** for the overlay,
  not its message log
- `.chat-overlay-composer` (`globals.css:81-92`)
- `.hero-conversation`, `.chat-overlay-log`, `.chat-overlay-composer`
  (`globals.css:516-525`) — text/border tokens were already correct here;
  `--color-surface` was **missing** until the 2026-08-06/07 fix (this is
  Bug 3)

**The gap that caused Bug 3, for reference:** `.chat-overlay-log` (the
overlay's actual message list) sits in a DOM subtree that's a *sibling* of
`header`, not a descendant of it — so the `#sage-chat-overlay > div > header`
override (light-theme, scoped to the header only) never reached it, and
nothing else in the file set `--color-surface` for `.chat-overlay-log`
before the fix — it fell through to the dark `html[data-brand="jefflougheed"]`
default. `.hero-conversation` (Hero's own conversation panel) never had this
problem, because it's a direct DOM child of `.chat-surface`, which *does*
carve back to light (`globals.css:67-79`), and CSS custom properties inherit
down the DOM tree regardless of specificity tricks. The lesson for future
edits: **a selector re-declaring these tokens must actually be an ancestor
(in the DOM, not just visually adjacent) of everything that needs the light
theme** — a header-scoped override does not help a sibling container.

**Known dead-selector trap in the same area:** `.chat-log-light` /
`.chat-composer-light` (`globals.css:94-124`) define a *correct* light-theme
override and would have prevented Bug 3 if they matched anything — but no
element in `WidgetShell.tsx` carries those class names (confirmed via grep;
the real classes are `chat-overlay-log`/`chat-overlay-composer`). These are
leftover from an earlier naming convention. Do not "fix" a color bug by
editing these — they're inert.

---

## 6. Dead/fragile CSS inside `globals.css` itself

**Dead `.chat-overlay-*` block (`globals.css:552-593`).** Of the ten class
selectors defined under the "Full-screen chat overlay" comment header —
`.chat-overlay`, `.chat-overlay-inner`, `.chat-overlay-header`,
`.chat-overlay-title`, `.chat-overlay-dot`, `.chat-overlay-actions`,
`.chat-overlay-close`, `.chat-overlay-scroll`, `.chat-overlay-greeting`,
`.chat-overlay-log`, `.chat-overlay-composer` — **only the last two are
referenced anywhere in `WidgetShell.tsx`** (confirmed via grep, one match
each; zero for the other eight). The other eight are an earlier,
hand-rolled-class implementation of the overlay's chrome, superseded by
inline Tailwind utility classes directly in the JSX, with the old CSS never
removed. They sit visually indistinguishable from the two live selectors —
which are the exact ones Bug 3's fix touched. If a future change needs to
restyle the overlay's header, close button, or greeting text, those live in
plain Tailwind classes in the JSX (`WidgetShell.tsx:409-464`), **not** in
`.chat-overlay-header`/`.chat-overlay-close`/`.chat-overlay-greeting`.

**Cascade-order fragility: `.stage.engaged .composer-wrap`'s `margin-top`.**
Four rules across the file set this property, all at the same selector
specificity (`.stage.engaged .composer-wrap`, two classes) and all
`!important`, so which one wins is purely a function of source order per
matching viewport width — not deliberate breakpoint design:

| Rule | Location | Value | Scope |
|---|---|---|---|
| Base | `globals.css:294` (`.composer-wrap` only, lower specificity) | `8px` | All widths |
| Original mobile block | `globals.css:465` | `0px` | `max-width: 768px` |
| "Ported" section, unscoped | `globals.css:499` | `12px` | **All widths, including desktop** |
| "Ported" section, narrow | `globals.css:507` | `10px` | `max-width: 640px` |

Live-verified (Playwright, `getComputedStyle`, mobile viewport, engaged via
the `?mode=question` path from §2): at 390px width the computed value is
**10px** (the narrow-breakpoint rule wins, purely because it's last in file
order among rules matching that width). At 641–768px width, the unscoped
12px rule wins over the original mobile block's intended 0px — meaning that
`0px` **never actually applies at any width** once the later "ported"
section's rules are in the cascade; it's fully shadowed. Net effect: desktop
non-engaged gets 8px, 641–768px engaged gets 12px, ≤640px engaged gets 10px
— three different values across three bands, as an accident of which file
section was pasted where, not an intentional three-tier design.

Impact today is cosmetic (an 8–12px spacing difference), not functional.
**Suggested fix (not applied — flag for a future pass):** consolidate to one
rule per intended breakpoint tier, decide deliberately whether the original
mobile `0px` should be restored or the port's values are the real intent,
and comment the tiers explicitly so a future edit can't silently
reorder-break this again.

---

## 7. Stale/duplicate files — non-authoritative, do not edit or reference

The following files under `Design Handovers/` contain CSS or component code
that overlaps with or duplicates the live widget — **none of them are
imported anywhere** (`Design Handovers/` is excluded from `tsconfig.json`;
confirmed via grep that no file under `app/`, `components/`, or `services/`
references any of these by path):

| Path | What it is |
|---|---|
| `Design Handovers/jefflougheed_July Updates (mobile chat)/WidgetShell.patched.tsx` | Full patched-replacement draft of `WidgetShell.tsx`, not fully merged |
| `Design Handovers/jefflougheed_July Updates (mobile chat)/globals.css.patch.css` | CSS patch intended to be appended to `globals.css`, not fully merged |
| `Design Handovers/jefflougheed_July Updates (mobile chat)/chat-design-port.css` | Companion CSS port — partially merged (live `globals.css:495` comment cites it) |
| `Design Handovers/jefflougheed_July Updates (mobile chat)/SectionRail.patched.tsx` | One-line behavior patch, same handover set |
| `Design Handovers/jefflougheed_July Updates (mobile chat)/MessageActions.patched.tsx` | Adjacent patch, same handover set |
| `Design Handovers/Jeff Lougheed Chat Wiget Refresh_2026/chat-design-port.css` | Byte-identical duplicate of the file above |
| `Design Handovers/spec_visitor_bubble.md` | Original pre-implementation bubble spec |
| `Design Handovers/heirloom_chat_handoffV2_2026_July 28/spec_visitor_bubble.md` | Divergent copy, same filename, different (later) values — both stale relative to current code, see `Public Site.md`'s bubble-history notes for what actually shipped |
| `Design Handovers/chat-shells.md` | Design rationale doc, cited by `useKeyboardViewport.ts`'s own file header |

**The only sources of truth for this widget are:**
`app/(jefflougheed)/globals.css` and `components/shells/widget/WidgetShell.tsx`.

---

## 8. Cross-references

- `System Docs/Public Site.md` — `WidgetShellChat`/`WidgetShellHero` table
  rows own the visual/copy-level spec (bubble shape history, empty-state
  copy, animation timing) this file doesn't repeat.
- `System Docs/Design System.md` — the general per-brand CSS-cascade
  mechanism (`data-brand` scoping, per-route `globals.css` files) that §5
  above is one specific, worked instance of. **Note:** as of this writing,
  `Design System.md` (and `System Docs/App Structure and Routing.md`) still
  refer to this mechanism's attribute as `data-palette="inkwell"` —
  confirmed via grep that no code anywhere sets `data-palette`; the actual,
  current attribute is `data-brand="jefflougheed"` (`app/layout.tsx:22`).
  This looks like a renamed convention that was never propagated through
  those docs — out of scope for this pass (those files cover every brand,
  not just this widget) but flagged here since it's directly adjacent to §5.
- `System Docs/Known Gaps.md` — the `.stage.engaged .composer-wrap`
  cascade-order fragility (§6) is not yet logged there; consider adding an
  entry if the suggested fix isn't picked up soon.
