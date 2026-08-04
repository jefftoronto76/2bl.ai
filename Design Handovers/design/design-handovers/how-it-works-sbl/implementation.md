# Implementation — How It Works section

Production handoff for the new **How It Works** section that replaces
the prior `Stack()` section in `app/secondbrainlabs/page.tsx`.

## Files in this handover

| File | Purpose |
|---|---|
| `HowItWorks.tsx` | Production TSX. Drop-in fragment for `page.tsx`. |
| `implementation.md` | This file — summary of changes, theme audit, QA checklist. |
| `How It Works - Production.html` *(optional, in the design project)* | Pixel reference. |

---

## 1 · What changes in `page.tsx`

| Concern              | Before                                                | After                                          |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Section component    | `Stack()` (4-col layered grid of tech)                | `HowItWorks()` — header + 3 steps + walk-away  |
| Anchor               | `#stack`                                              | `#how-it-works`                                |
| `data-screen-label`  | `"Stack"`                                             | `"How it works"`                               |
| Accent               | Terracotta `accent`                                   | **Terracotta `accent`** (unified — no green)   |
| Interactive          | None                                                  | None — pure server component                   |
| Footer link          | `<Link href="#stack">Stack</Link>`                    | `<Link href="#how-it-works">How it works</Link>` |
| Dead code to delete  | `type StackItem`, `const STACK`, `function Stack()`   | —                                              |

### Concrete edits

1. **Paste `HowItWorks.tsx`** into `page.tsx` where `function Stack()`
   used to live. Drop the import lines at the top of the .tsx file
   (`Link` and `ReactNode` are already imported in `page.tsx`) and the
   `export` keyword on `HowItWorks`.
2. **Update the call site** in `LandingPage()`:
   ```tsx
   // before
   <Stack />
   // after
   <HowItWorks />
   ```
3. **Delete dead code**: `type StackItem`, `const STACK`,
   `function Stack()`.
4. **Update the footer "Studio" column** in `SiteFooter()`:
   ```tsx
   // before
   { label: "Stack", href: "#stack" },
   // after
   { label: "How it works", href: "#how-it-works" },
   ```

---

## 2 · Theme tokens — **no changes needed**

Every token this section uses is already in `tailwind.config.js` and
scoped via `[data-brand="sbl"]` in `app/globals.css`:

- `paper`, `paper-2`, `line` — neutrals
- `ink`, `ink-2`, `muted` — text colors
- `accent` (alpha-aware), `accent-deep`, `accent-soft` — the terracotta
  family the rest of the page already uses

Two color-mix recipes are inlined as arbitrary Tailwind values inside
`StepCard` — they don't need to graduate to global tokens:

| Use case            | Recipe                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| Active step bg tint | `color-mix(in oklab, var(--color-accent-soft) 60%, var(--color-paper))`               |
| Muted accent line   | `border-accent/40` (uses the alpha-aware accent token)                                |

*Note:* The `pos` (green) token is still in the SBL palette and still
used by the "Online" status dot in the Sage hero widget. It's just not
used by this section anymore.

---

## 3 · No new dependencies

All icons (transcript, badge-check, connector chevron) are inline SVGs
following the existing `IconFoo` pattern at the bottom of `page.tsx`.
Co-locate `IconTranscript` and `IconBadgeCheck` with the others.

---

## 4 · QA checklist

- [ ] **Anchor** — `/secondbrainlabs#how-it-works` jumps to the section.
- [ ] **Footer link** — clicking "How it works" in the footer scrolls
      to this section.
- [ ] **Step 02 highlight** — visually distinct from steps 01 and 03:
      terracotta border, soft peach tinted background, "→ Yields" tag
      in deep terracotta.
- [ ] **CTA opens Calendly** in a new tab. `BOOKING_URL` is no longer
      `REPLACE-ME`.
- [ ] **Currency on CTA** — `C$250` (with the C for Canadian) — confirm
      that's intended before merge. If the audience is global, drop
      the `C` or move the currency into a locale concern.
- [ ] **Lede punctuation** — the lede preserves the verbatim double-comma
      voice. If you want the cleaner grammatical version, swap to:
      *"I'm a revenue-focused product builder and an executive coach. If
      you want to explore your product, book time below."*
- [ ] **Mobile (<1024px)** — single-column layout for header, steps,
      deliverables. Eyebrow rule hides under `sm`.
- [ ] **`data-brand="sbl"`** is still on the route layout — without it
      the `accent` token resolves to nothing.
- [ ] **Lint + build + tests** — `npm run lint && npm run build && npm run test`.

---

## 5 · Rollback

Git revert of `page.tsx` is the entire rollback. No theme changes, no
dependency changes, no globals.css edits. The `#stack` anchor will be
dead — if you have analytics showing external traffic to it, add a
one-line middleware redirect:

```ts
// inside middleware.ts
if (request.nextUrl.pathname === "/secondbrainlabs" && request.nextUrl.hash === "#stack") {
  const url = request.nextUrl.clone();
  url.hash = "#how-it-works";
  return NextResponse.redirect(url);
}
```

(Hash fragments aren't actually sent to the server, so this only fires
for deep-linked SSR responses. Skip it unless you have real traffic.)
