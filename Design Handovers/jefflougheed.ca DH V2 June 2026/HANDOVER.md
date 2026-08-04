# Handover — June 2026 site updates → `app/(jefflougheed)`

This package maps the changes from this round onto the production
`app/(jefflougheed)` components on **main**.

**How to read it**
- Components with **structural / markup / logic** changes ship as full
  drop-in files in `handover/components/` — replace the file on main wholesale.
- Components with **copy-only** changes are documented as
  *current → updated* tables (no file to swap; just edit the strings).

```
handover/
  components/
    SectionOutcomes.tsx       ← drop-in replacement
    SectionWhy.tsx            ← drop-in replacement
    SectionProcess.tsx        ← drop-in replacement
    FeaturedTestimonial.tsx   ← NEW component (mount in How-it-works)
    ShareIcons.tsx            ← NEW icon set (wire into ShareModal)
  HANDOVER.md                 ← this file
```

| File on main | Change type | Action |
|---|---|---|
| `components/SectionProcess.tsx` | structural + copy | **Replace** with handover version |
| `components/SectionOutcomes.tsx` | structural + copy | **Replace** with handover version |
| `components/SectionWhy.tsx` | structural + copy | **Replace** with handover version |
| `components/SectionCareer.tsx` | — | No change |
| `components/useMode.ts` | — | No change |
| `globals.css` | — | No change (see note at end) |

> The drop-ins were produced by copying the real main files and applying only
> the diffs below, so everything else (Tailwind classes, animations, props,
> chat wiring, SSR notes) is byte-for-byte unchanged.

---

## 1. SectionProcess.tsx — **replace** (`handover/components/SectionProcess.tsx`)

### Structural / logic
- **Chip order** — `TRACK_ORDER` changed `['coaching', 'operator']` →
  `['operator', 'coaching']`, so the chips read **Special Projects · Coaching**
  (Special Projects is the default-selected track via `useMode`).
- **Step labels removed** — the per-card top-right tag (`Step` / `→ Yields`)
  on every step card is gone.
- **"The Session" label re-added** — the origin (middle) card shows a
  `The Session` tag in the top-right, in **dark ink**
  (`text-[color:var(--color-text-primary)]`) rather than the green accent.
- **Deliverables tray** — the `From step 0X` badge was removed from the
  desktop tray header (and the now-unused `fromLabel` const deleted).

### Copy
Chip label:

| Track | Current | Updated |
|---|---|---|
| operator | `Operator` | `Special Projects` |
| coaching | `Coaching` | `Coaching` (unchanged) |

Operator subhead:

| Current | Updated |
|---|---|
| I build systems that stop problems from happening. | An experienced partner for your most important initiatives. |

Step titles (both tracks): `Book a session → Book`,
`The session` / `Working Session → Engage`, `The shift → Excel`.

Step bodies — now **distinct per track**:

**Coaching**
| Step | Updated body |
|---|---|
| Book | Each session lasts 45 minutes and is structured around your situation, goals, and next move. |
| Engage | Built on ICF-certified coaching principles. A structured conversation that goes beneath the surface to uncover the real influences and what's driving them. |
| Excel | See the situation differently and move forward with confidence. |

**Special Projects (operator)**
| Step | Updated body |
|---|---|
| Book | Each session is 60 minutes and focused on understanding your objectives, constraints, and the opportunities ahead. |
| Engage | Built on ICF-certified coaching principles and shaped by decades of leadership experience. You know your business. I'll help you see it differently. |
| Excel | Clarity on the challenge, the levers that matter, and a practical path forward. |

CTA price:

| Current | Updated |
|---|---|
| Book a Session — C$250 | Book a Session — C$350 |

(The `C$250` references in the file's doc comments were also updated to `C$350`.)

---

## 2. SectionOutcomes.tsx — **replace** (`handover/components/SectionOutcomes.tsx`)

### Structural
- **"In their words" eyebrow** added at the top of `CalloutFigure` (the
  coach-mode coda call-out): a mono eyebrow + hairline rule above the
  blockquote, matching the featured-testimonial treatment.

### Copy
Toggle labels (`MODE_LABELS`) + the toggle's `aria-label`:

| Mode | Current | Updated |
|---|---|---|
| operator | `Operator` | `Special Projects` |
| coach | `Coach` | `Coaching` |
| aria-label | `Operator or Coach` | `Special Projects or Coaching` |

(Order already had operator first → renders **Special Projects · Coaching**.)

---

## 3. SectionWhy.tsx — **replace** (`handover/components/SectionWhy.tsx`)

### Structural
- **"In their words" eyebrow** added to `CalloutFigure` (identical treatment
  to SectionOutcomes).

### Copy
- Toggle labels + `aria-label`: same relabel as SectionOutcomes
  (Operator → Special Projects, Coach → Coaching, aria-label updated).
- Section eyebrow:

| Current | Updated |
|---|---|
| I show up, listen, and contribute. | Show up, listen, and contribute. |

---

## globals.css — no change

The 1100px content-column alignment work from this round applies to the
**Hero, Problem, and Footer** blocks, which live outside `app/(jefflougheed)`.
The in-scope sections (Outcomes / Why / Process / Career) already use
`max-w-[1100px] mx-auto`, so they needed nothing. The "The Session" label
color and the call-out eyebrow are expressed with inline Tailwind in the
components above — no stylesheet edits required.

---

## Appendix — changes outside `app/(jefflougheed)/components`

These touch files that are **not mirrored into this project** (only
`globals.css` is). Where I have the source I give an exact diff; where I
don't, I give drop-in code written to your conventions plus integration
notes. Share those component files and I'll convert any of these into exact
drop-ins too.

### A. Hero / Problem / Footer — 1100px content column

The goal was a single centered **1100px** column so the left edge stops
shifting while scrolling. The in-scope sections already use
`max-w-[1100px] mx-auto`; these three did not.

**Hero — exact diff (`globals.css`, the `.stage` rule, ~line 343):**
```css
.stage{
  height:100dvh;display:flex;flex-direction:column;
  padding:52px clamp(20px,5vw,48px) 0;
  max-width:1100px;   /* was 920px */
  margin:0 auto;
  width:100%;
  position:relative;
}
```
> Note: in production `.stage` is the **chat surface** (composer +
> conversation + engaged state), so this widens the whole hero/chat column to
> match the sections below it — which is the intended alignment. Confirm you
> want the chat surface at 1100px.

**Problem & Footer** live in Tailwind-inline components not present here.
The change is the same in spirit: wrap each block's inner content in a
`max-w-[1100px] mx-auto` container (full-bleed background stays outside it).
Footer: put the flex row (`justify-between`) on that inner container, not the
full-width `<footer>`. Send me `Problem.tsx` / `Footer.tsx` (or their
equivalents) and I'll return exact drop-ins. The Nav stays full-width chrome.

### B. Share modal icons — `handover/components/ShareIcons.tsx` (NEW)

Line-style glyphs (LinkedIn, X, WhatsApp, Email, Copy-link) matching the
Lucide set. Import `SHARE_ICON` into the existing `ShareModal` and render one
before each row label — the row is already `flex / gap-3 / items-center`, so
no layout changes are needed:
```tsx
import { SHARE_ICON } from './ShareIcons'
// inside a row:
<a className="share-row" href={row.href} target="_blank" rel="noopener noreferrer">
  {SHARE_ICON[row.key]}        {/* key: 'linkedin' | 'twitter' | 'whatsapp' | 'email' | 'copy' */}
  <span>{row.label}</span>
</a>
```
If you want the glyphs muted, add `text-[color:var(--color-text-muted)]` to
the row and let them brighten to `--color-text-primary` on hover.

### C. Featured “In their words” testimonial — `handover/components/FeaturedTestimonial.tsx` (NEW)

Net-new component (was prototype-only) — the rotating social-proof card at
the bottom of How-it-works, **now with real headshots**. Mount it inside
`SectionProcess` at the end of the `max-w-[1100px]` container, after the
desktop tray:
```tsx
import { FeaturedTestimonial } from './FeaturedTestimonial'
// … after <div className="hidden lg:block"><DesktopTray .../></div>
<FeaturedTestimonial />
```
Headshots use the established asset convention
`/sage/jefflougheed/people/<slug>.jpg`:

| Person | Assumed path |
|---|---|
| Saif Ajani | `/sage/jefflougheed/people/saif-ajani.jpg` |
| Rick Bacchus | `/sage/jefflougheed/people/rick-bacchus.jpg` |
| Iara Rios | `/sage/jefflougheed/people/iara-rios.jpg` |
| Ryan MacEwing | `/sage/jefflougheed/people/ryan-macewing.jpg` |

> **Confirm these filenames/dir match `/public/sage/jefflougheed`.** Any entry
> whose `image` is omitted falls back to initials, so it degrades cleanly.

### D. Testimonials section — copy only

Lives in a component not present here; no drop-in, just edit two strings:

| Field | Current | Updated |
|---|---|---|
| Heading | Testimonials | Working Together |
| Lede | A collection of thoughts from the people who've helped me, and who I've helped throughout my career and life. | I've been fortunate to work with exceptional people. These are a few of their reflections on what it was like to work together. |
