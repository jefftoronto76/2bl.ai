# Handover — "My POV" coda on **Outcomes I focus on** (Special Projects / operator)

> **⚠️ BRANCH:** Apply this on **`feat/mypov-section-why`** (or a branch off it)
> — NOT `main`. The How I work half of this change already lives on that
> branch; both halves must land in the same PR or the twin sections ship
> mismatched again.

**File:** `components/SectionOutcomes.tsx`
**Scope:** operator-mode coda only. Coach mode (`CalloutFigure`) is unchanged.

> ## Why this exists — read first
> The earlier `MyPOV-HowIWork.md` handover said the My POV coda was *"already
> shipped on Outcomes I focus on"* and asked CC to **mirror** it onto How I
> work. That precedent was never actually true: `SectionOutcomes.tsx`'s
> operator coda is **still the bare italic `<p>`**. So How I work got the
> treatment and Outcomes did not — the twin sections now disagree
> (`How I work` has the eyebrow + avatar; `Outcomes I focus on` has the plain
> line). This spec applies the **identical** treatment CC already shipped on
> `SectionWhy.tsx`, so the two match. Nothing was lost in the last pass — it
> was just scoped to one of the two files.

## What & why
The operator-mode coda is currently a bare italic `<p>`. Give it the same
treatment as `SectionWhy`'s new **My POV** coda — eyebrow + rule, italic
display quote, initials avatar, attribution to Jeff. It is his own point of
view, not a client quote, so it is signed to Jeff with **no** quotation marks
(and drop the inline `mark-highlight` span — the How I work version is a plain
blockquote).

This is the exact twin of what shipped on **How I work** in
`feat/mypov-section-why`.

---

## Diff

### 1. Add a `POV` constant (next to the existing `CALLOUT` / coach data)

```diff
 const PRACTICE_AREAS = ['Revenue', 'Operations', 'Product', 'Leadership']
+
+/** Operator-mode coda — Jeff's own point of view (no quote marks). */
+const POV = {
+  quote:
+    'Underneath all of it: relationships are a moat. Durable businesses know their customers, understand their pains, and help them win.',
+  who: 'Jeff Lougheed',
+  role: 'Operator & Coach',
+}
```

### 2. Add a `MyPovFigure` component (next to `CalloutFigure`)

Identical to the one shipped in `SectionWhy.tsx` — standalone, no props, reads
from `POV`:

```diff
+function MyPovFigure() {
+  const initials = POV.who
+    .split(/\s+/)
+    .filter(Boolean)
+    .slice(0, 2)
+    .map((p) => p[0].toUpperCase())
+    .join('')
+  return (
+    <figure className="m-0 max-w-[64ch] [animation:jlRise_0.45s_cubic-bezier(0.2,0.7,0.2,1)_both]">
+      {/* eyebrow + rule (matches the "In their words" featured-head treatment) */}
+      <div className="mb-4 flex items-center gap-4">
+        <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)]">
+          My POV
+        </span>
+        <span aria-hidden className="h-px flex-1 bg-[color:var(--color-border)] max-w-[120px]" />
+      </div>
+      <blockquote className="m-0 font-display italic text-[clamp(18px,1.7vw,21px)] leading-[1.5] text-[color:var(--color-text-primary)] text-pretty">
+        {POV.quote}
+      </blockquote>
+      <figcaption className="mt-4 flex items-center gap-3">
+        <span
+          aria-label={POV.who}
+          className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[#E8E1CF] font-body text-sm font-semibold text-[rgb(24_32_41)] shadow-[inset_0_0_0_1px_rgb(24_32_41/0.06)]"
+        >
+          <span aria-hidden>{initials}</span>
+        </span>
+        <span className="flex flex-col gap-0.5 font-mono text-[11px] tracking-[0.1em] uppercase text-[color:var(--color-text-dim)]">
+          <span className="text-[color:var(--color-text-muted)]">{POV.who}</span>
+          <span>{POV.role}</span>
+        </span>
+      </figcaption>
+    </figure>
+  )
+}
```

### 3. Swap the operator `<p>` for `<MyPovFigure />` in the coda

```diff
           {mode === 'coach' ? (
             jim && (
               <CalloutFigure
                 callout={{ quote: jim.text, who: jim.name, role: jim.title ?? '', headshot: jim.headshot }}
               />
             )
           ) : (
-            <p className="font-display italic font-normal text-[20px] leading-[1.55] text-[color:var(--color-text-muted)] m-0 max-w-[64ch] text-pretty">
-              Underneath all of it: relationships are a moat. Durable businesses{' '}
-              <span className="mark-highlight--display font-display">
-                know their customers, understand their pains, and help them win
-              </span>
-              .
-            </p>
+            <MyPovFigure />
           )}
           <PracticeAreas />
```

---

## Notes
- **Initials resolve to `JL`** — matches How I work.
- `MyPovFigure` here is byte-for-byte the same as the one in `SectionWhy.tsx`
  except for the `POV.quote` copy. If you'd rather not have two copies across
  the twin files, factor the shared `<figure>` body into one component that
  takes `{ eyebrow?, quote, who, role }` and render both `CalloutFigure`-style
  and `MyPovFigure`-style from it. Duplication is fine for now and is what
  already shipped.
- All tokens read from CSS vars, so this stays correct on the cream section
  background (Outcomes) exactly as it does on the dark background (How I work).

## Quick test checklist
- [ ] Operator (**Special Projects**) mode on **Outcomes I focus on** now shows
      the **My POV** eyebrow + rule, italic line, **JL** avatar, and
      *Jeff Lougheed / Operator & Coach* attribution — matching How I work.
- [ ] Coach mode is unchanged (still the Jim Schnepp `CalloutFigure`).
- [ ] No quotation marks around the My POV line (it's Jeff's own POV).
- [ ] `tsc` / `npm run build` passes.
