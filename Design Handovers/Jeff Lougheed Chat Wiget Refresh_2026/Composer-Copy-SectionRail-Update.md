# Handover — composer restyle, copy edits, persistent section rail

Grounded directly in `jefftoronto76/2bl.ai@main` (read via GitHub, not
guessed from the mockup). Real files/paths below — no adaptation guesswork
needed.

Branch: continue on `feat/mypov-section-why` (or cut a new branch off it).

---

## 1. Composer restyle — off-white surface, dark navy text

**File:** `components/shells/widget/WidgetShell.tsx` — no JSX changes needed,
this is CSS-only (the `.composer`/`.composer textarea`/`.composer .meta`
classes already exist on the hero composer in `WidgetShellHero`).

**File:** `app/(jefflougheed)/globals.css`

```diff
 .composer{
-  background:rgb(var(--color-surface));border:1px solid var(--color-border);border-radius:18px;
+  background:rgb(245 244 240);border:1px solid rgb(24 32 41 / 0.12);border-radius:18px;
   padding:14px 14px 10px;
   box-shadow:0 8px 32px rgba(0,0,0,.05);
   transition:border-color .15s ease, box-shadow .15s ease;
 }
 .composer .row{display:flex;align-items:flex-end;gap:10px}
 .composer textarea{
   flex:1;border:none;outline:none;resize:none;background:transparent;
-  font-family:var(--font-body);font-size:16px;line-height:1.5;color:var(--color-text-primary);
+  font-family:var(--font-body);font-size:16px;line-height:1.5;color:rgb(24 32 41);
   min-height:28px;max-height:140px;padding:6px 6px;
 }
-.composer textarea::placeholder{color:var(--color-text-dim)}
+.composer textarea::placeholder{color:rgb(24 32 41 / 0.42)}
 ...
 .composer .meta{
   display:flex;justify-content:space-between;align-items:center;
-  margin-top:8px;padding-top:8px;border-top:1px solid var(--color-border);
-  font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;color:var(--color-text-dim);
+  margin-top:8px;padding-top:8px;border-top:1px solid rgb(24 32 41 / 0.12);
+  font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;color:rgb(24 32 41);
 }
```

Notes:
- `--color-surface` in the inkwell (`data-brand="jefflougheed"`) context is
  the dark `42 56 69` — that's what the composer currently sits on. This
  swaps it for an explicit off-white regardless of theme, so every color
  inside the composer (text, placeholder, meta, hairlines) is hardcoded to
  dark navy `rgb(24 32 41)` rather than the `--color-text-*` tokens (which
  resolve light-on-dark in this theme).
- The `ai-badge` pill (`SAGE·AI`) is unaffected — it already uses the sage
  accent color independent of `--color-text-*`, and stays as-is.
- `globals.css` also has `.composer .send { color: rgb(var(--color-bg)) }`
  applied via `html[data-brand="jefflougheed"] .composer .send` — leave that
  rule alone, the send button icon color isn't part of this change.

---

## 2. Remove the hero suggestion chips

**File:** `components/shells/widget/WidgetShell.tsx`, inside
`WidgetShellHero` — delete this whole block (currently rendered when
`!isEngaged`):

```tsx
{!isEngaged && (
  <div className="chips">
    <button className="chip" onClick={() => handleChipClick("Pipeline that won't convert")} disabled={isStreaming}>Pipeline that won&apos;t convert<span className="arr">→</span></button>
    <button className="chip" onClick={() => handleChipClick('Is this a fit for me?')} disabled={isStreaming}>Is this a fit for me?<span className="arr">→</span></button>
    <button className="chip" onClick={() => handleChipClick("A deal I can't lose")} disabled={isStreaming}>A deal I can&apos;t lose<span className="arr">→</span></button>
    <button className="chip" onClick={() => handleChipClick('What does "do better" mean?')} disabled={isStreaming}>What does &quot;do better&quot; mean?<span className="arr">→</span></button>
    <button className="chip" onClick={() => handleChipClick('What are companies getting wrong about AI?')} disabled={isStreaming}>What are companies getting wrong about AI?<span className="arr">→</span></button>
  </div>
)}
```

Also remove the now-unused `handleChipClick` function in the same component,
and the `.chips`/`.chip`/`.chip:hover`/`.chip .arr`/`.stage.engaged .chips`
rules in `globals.css`.

---

## 3. New: persistent, scroll-spy "section rail"

Replaces the plain-text scroll hint at the bottom of the hero
(`.scroll-hint-wrap` / `.scroll-hint`, currently just
`<span>Scroll for background, principles, work ↓</span>`). The rail is a
small fixed pill, centered at the bottom of the viewport, listing every
section as a clickable link that highlights the active section on scroll —
and stays hidden while the hero/composer is in view (fades in once you
scroll past the hero), so it can never overlap the composer.

Confirmed real section ids from the repo:
`#problem`, `#outcomes`, `#why`, `#how-it-works`, `#career`, `#testimonials`.

### New component — add to `app/(jefflougheed)/components/SectionRail.tsx`

```tsx
'use client'
import { useEffect, useState, Fragment } from 'react'

const SECTION_LINKS = [
  { label: 'Background', href: '#problem' },
  { label: 'Outcomes', href: '#outcomes' },
  { label: 'Principles', href: '#why' },
  { label: 'Getting Started', href: '#how-it-works' },
  { label: 'Work', href: '#career' },
  { label: 'Testimonials', href: '#testimonials' },
] as const

export function SectionRail() {
  const [active, setActive] = useState<string>(SECTION_LINKS[0].href)
  const [pastHero, setPastHero] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const hero = document.getElementById('hero')
      const heroBottom = hero ? hero.getBoundingClientRect().bottom : 0
      setPastHero(heroBottom < window.innerHeight * 0.6)
    }
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const els = SECTION_LINKS.map((s) => document.querySelector(s.href)).filter(Boolean) as Element[]
    if (!els.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible.length) setActive('#' + (visible[0].target as HTMLElement).id)
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div className={'section-rail' + (pastHero ? '' : ' is-hidden')}>
      {SECTION_LINKS.map((s, i) => (
        <Fragment key={s.href}>
          {i > 0 && <span className="section-rail-sep" aria-hidden="true">·</span>}
          <a
            href={s.href}
            className={'section-rail-link' + (active === s.href ? ' is-active' : '')}
            onClick={(e) => { e.preventDefault(); document.querySelector(s.href)?.scrollIntoView({ behavior: 'smooth' }) }}
          >
            {s.label}
          </a>
        </Fragment>
      ))}
    </div>
  )
}
```

### Mount — `app/(jefflougheed)/page.tsx`

```diff
 import { Nav } from './components/Nav'
+import { SectionRail } from './components/SectionRail'
 ...
     <ChatSessionProvider instanceKey="sage" persistNamespace="sage">
       <Nav />
+      <SectionRail />
       <main>
```

### CSS — add to `globals.css`, and delete the old scroll-hint rules

```diff
-.scroll-hint-wrap {
-  display: flex;
-  align-items: center;
-  justify-content: center;
-}
-.stage:not(.engaged) .scroll-hint-wrap { flex: 1; }
-.stage.engaged .scroll-hint-wrap { height: 52px; }
-.scroll-hint {
-  font-family: var(--font-mono);
-  font-size: 11px;
-  letter-spacing: .18em;
-  text-transform: uppercase;
-  color: var(--color-text-dim);
-  text-align: center;
-}
+.section-rail {
+  position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%) translateY(0);
+  z-index: 40;
+  display: flex; align-items: center; gap: 10px;
+  padding: 10px 20px;
+  border-radius: 999px;
+  background: rgb(var(--color-bg) / 0.85);
+  border: 1px solid var(--color-border);
+  backdrop-filter: blur(12px);
+  box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
+  font-family: var(--font-mono);
+  font-size: 10.5px;
+  letter-spacing: .14em;
+  text-transform: uppercase;
+  max-width: calc(100vw - 32px);
+  overflow-x: auto;
+  transition: opacity .25s, transform .25s;
+}
+.section-rail.is-hidden { opacity: 0; transform: translateX(-50%) translateY(16px); pointer-events: none; }
+.section-rail-link { color: var(--color-text-dim); text-decoration: none; transition: color .15s; white-space: nowrap; }
+.section-rail-link:hover { color: var(--color-text-primary); }
+.section-rail-link.is-active { color: rgb(var(--color-accent)); }
+.section-rail-sep { color: var(--color-text-dim); opacity: .4; }
+@media (max-width: 768px) { .section-rail { display: none; } }
```

Then in `WidgetShell.tsx`, delete the now-unused scroll-hint JSX at the
bottom of `WidgetShellHero`:
```diff
-      <div className="scroll-hint-wrap">
-        <div className="scroll-hint">
-          <span>Scroll for background, principles, work ↓</span>
-        </div>
-      </div>
```

**Mobile note:** the existing mobile stylesheet already sets
`.scroll-hint-wrap { display: none }` under `@media (max-width: 768px)` — the
rail's own `@media (max-width: 768px) { display: none }` above preserves
that same mobile behavior (rail hidden on small screens, same as the old
hint). Revisit if you *do* want the rail on mobile — it'll need to clear the
fixed `.composer-wrap` bottom bar defined in that same mobile block.

---

## 4. Copy changes

**`app/(jefflougheed)/components/Problem.tsx`**
- Eyebrow: the mono label currently reads **"The Work"** (rendered as `The
  <span>Work</span>` with a highlight SVG on the second word) → change to
  **"My POV"** (keep the highlight span on "POV").
- Headline `<h2>`: `"Most problems aren't<br/><em>what they look
  like.</em>"` → **`"Stay focused on<br/><em>the outcomes that matter
  most.</em>"`**

**`components/shells/widget/WidgetShell.tsx`**, `WidgetShellHero` — the
`.lede` paragraph:
- Before: *"I help technology companies and the people who drive them think
  clearly, develop their capabilities, and grow in ways that last."*
- Note: production's current lede is already the short version (no "I'm an
  operator, a coach, and a builder" intro sentence — that phrasing only
  existed in the standalone mockup, not in this repo). **No change needed
  here** — flagging so CD doesn't go looking for text that isn't there.

---

## Verify
1. `npx tsc --noEmit` clean.
2. Composer: type into the hero input — text renders solid dark navy on the
   off-white surface, not the theme's light-ink color.
3. Chips are gone from the hero; no dead `handleChipClick`/`.chips` CSS left.
4. Section rail: hidden while hero is on screen; fades in once scrolled past
   hero; correct section highlights in sage green scrolling through Problem →
   Outcomes → Why → How it Works → Career → Testimonials; hidden on mobile
   (≤768px) same as the hint it replaced.
5. Problem section: eyebrow reads "My POV", headline reads the new copy.
