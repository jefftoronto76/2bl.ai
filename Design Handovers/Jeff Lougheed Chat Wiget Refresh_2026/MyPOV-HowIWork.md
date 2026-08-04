# Handover — "My POV" coda on **How I work** (Special Projects / operator)

**File:** `components/SectionWhy.tsx`
**Scope:** operator-mode coda only. Coach mode (`CalloutFigure`) is unchanged.

## What & why
The operator-mode coda is currently a bare italic `<p>`. Give it the same
treatment as the coaching "In their words" call-out — eyebrow + rule, italic
display quote, avatar + attribution — but labeled **My POV** and signed to
Jeff, because this line is his own point of view rather than a client quote.
(No literal quotation marks, for the same reason.)

Mirror of the change already shipped on **Outcomes I focus on**.

---

## Diff

### 1. Add a `POV` constant (next to the existing `CALLOUT`)

```diff
 /** Coach-mode coda call-out (the fixed "quiet line" treatment). */
 const CALLOUT = {
   quote: 'One of the people I learned the most from.',
   who: 'Brittany Dallman',
   role: 'BDR',
 }
+
+/** Operator-mode coda — Jeff's own point of view (no quote marks). */
+const POV = {
+  quote:
+    'Most of my career has been spent close to ownership. It shapes how I lead, build, and make decisions.',
+  who: 'Jeff Lougheed',
+  role: 'Operator & Coach',
+}
```

### 2. Add a `MyPovFigure` component (next to `CalloutFigure`)

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
+      {/* eyebrow + rule (matches the featured-head treatment) */}
+      <div className="flex items-center gap-4 mb-[18px]">
+        <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-[color:var(--color-text-dim)]">
+          My POV
+        </span>
+        <span
+          aria-hidden
+          className="flex-1 h-px max-w-[160px] bg-[color:var(--color-border)]"
+        />
+      </div>
+      <blockquote className="m-0 font-display italic text-[clamp(18px,1.7vw,21px)] leading-[1.5] text-[color:var(--color-text-primary)] text-pretty">
+        {POV.quote}
+      </blockquote>
+      <figcaption className="mt-4 flex items-center gap-3">
+        <span
+          aria-hidden
+          className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[#E8E1CF] font-body text-sm font-semibold text-[rgb(24_32_41)] shadow-[inset_0_0_0_1px_rgb(24_32_41/0.06)]"
+        >
+          {initials}
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
             <CalloutFigure />
           ) : (
-            <p className="font-display italic font-normal text-[clamp(18px,1.8vw,22px)] leading-[1.55] text-[color:var(--color-text-muted)] m-0 max-w-[64ch] text-pretty">
-              Most of my career has been spent{' '}
-              <span className="mark-highlight--display font-display">
-                close to ownership
-              </span>
-              . It shapes how I lead, build, and make decisions.
-            </p>
+            <MyPovFigure />
           )}
           <PracticeAreas />
```

---

## Notes
- `MyPovFigure` is a near-clone of `CalloutFigure`; the only structural
  addition is the **My POV** eyebrow + rule at the top. If you'd rather not
  duplicate, factor the shared `<figure>` body into one component that takes
  `{ eyebrow?, quote, who, role }` and render both from it.
- Initials resolve to **JL**. Swap the `bg-[#E8E1CF]` initials avatar for a
  headshot `<img>` if you have one, same as the `CalloutFigure` pattern.
- The avatar/eyebrow tokens all read from CSS vars, so this stays correct on
  the cream section background with no extra work.
