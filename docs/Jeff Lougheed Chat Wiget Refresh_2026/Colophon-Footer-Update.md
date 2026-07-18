# Handover — "Brought to you by Second Brain Labs" colophon

## What this is
A quiet colophon that sits **directly under the existing `<Footer />`**, crediting
Second Brain Labs without turning into a second brand block. It reads as a
whisper, not a headline: it inherits the dark inkwell footer palette, uses the
site's mono labels, and the only color pop is a single italic word ("Labs") in
the site's *own* sage accent — no rust, no oversized wordmark.

It mirrors `Footer.tsx`'s layout exactly — brand credit on the left, contact on
the right — inside the same 1100px centered container, so its left/right edges
line up with the footer above and every section on the page.

**Branch:** `feat/mypov-section-why`

---

## Files

1. **New:** `app/(jefflougheed)/components/Colophon.tsx`
2. **Edit:** `app/(jefflougheed)/page.tsx` — mount `<Colophon />` right after `<Footer />`

No new assets, no dependencies, no globals.css changes. All colors/fonts come
from existing CSS custom properties, so it themes automatically.

---

## 1. New component — `app/(jefflougheed)/components/Colophon.tsx`

Written in the same inline-style + CSS-var idiom as `Footer.tsx`.

```tsx
export function Colophon() {
  return (
    <section
      aria-label="Brought to you by Second Brain Labs"
      style={{ padding: '40px 0 56px', borderTop: '1px solid var(--color-border)' }}
    >
      <div
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '0 clamp(24px, 5vw, 48px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '40px',
        }}
      >
        {/* Brand credit — left */}
        <div style={{ maxWidth: '40ch' }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-text-dim)',
              marginBottom: '18px',
            }}
          >
            Brought to you by
          </p>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '21px',
              fontWeight: 500,
              lineHeight: 1.15,
              color: 'var(--color-text-primary)',
              marginBottom: '16px',
            }}
          >
            Second Brain{' '}
            <em style={{ fontStyle: 'italic', color: 'rgb(var(--color-accent))' }}>Labs</em>
          </h3>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13.5px',
              lineHeight: 1.65,
              color: 'var(--color-text-dim)',
            }}
          >
            A small workshop built around the belief that language is changing the
            relationship between people and technology.
          </p>
        </div>

        {/* Contact — right, mirrors the footer's link column */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            alignItems: 'flex-end',
            textAlign: 'right',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-text-dim)',
              marginBottom: '4px',
            }}
          >
            Contact
          </p>
          <a
            href="mailto:hello@2bl.ai"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'var(--color-text-muted)',
              textDecoration: 'none',
            }}
          >
            hello@2bl.ai
          </a>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-text-muted)' }}>
            Toronto · Remote
          </p>
        </div>
      </div>
    </section>
  )
}
```

### Notes for the implementer
- `rgb(var(--color-accent))` is correct — the accent token is a space-separated
  triple (`168 200 168` in the inkwell palette), not a hex.
- The `borderTop` hairline separates it from the footer. If it reads as one line
  too many next to the footer's own spacing, drop the `borderTop` — that's a taste
  call, safe either way.
- Hover states: `Footer.tsx` links have no hover transition, so this matches by
  omitting one. If you want parity with a hover, add `onMouseEnter/Leave` or a
  tiny CSS rule — optional, not required.

---

## 2. Mount it — `app/(jefflougheed)/page.tsx`

Add the import alongside the others:
```tsx
import { Colophon } from './components/Colophon'
```

Render it immediately after `<Footer />`, still inside `<ChatSessionProvider>`:
```tsx
      <Footer />
      <Colophon />
    </ChatSessionProvider>
```

---

## Alternative treatment (if the block is still too much)
There's a one-line "Whisper" variant that drops the description and Contact column
entirely — just a single credit line: *Brought to you by Second Brain Labs ↗*.
Say the word and I'll drop the exact JSX in; the block version above is the
recommended default.

---

## Verify
1. `npx tsc --noEmit` — clean.
2. On a wide viewport: the "Brought to you by" block's left edge lines up with
   "Jeff Lougheed" in the footer; "Contact" right edge lines up with the footer's
   ABOUT/WORK/CHAT links.
3. Palette: everything is muted ink except the italic "Labs", which is sage. No
   rust anywhere.
4. Narrow viewport: brand and contact stack (flex-wrap), nothing overflows.

## Commit
```
feat(jefflougheed): add Second Brain Labs colophon under footer
```
Push to `origin/feat/mypov-section-why`.
