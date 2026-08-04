# Pass 3 — The page thread

**Goal:** a single dotted "thread of memory" that runs the whole length of the page, drawing itself as the visitor scrolls, hugging the margins and sweeping across the whitespace between sections, with photo/dot "beads" that wake as the thread reaches them — and a finale where scattered chips gather into the book.

**Reference:** `Heirloom_Combined Lander v2.html` → **Threaded Story** mode. Component in source: `PageThread`; the book gather lives in the Book section (`.gather-chip`).

### Target look
![Page thread drawing mid-scroll — target](screenshots/pass-3-thread.png)

> Only present in the *Threaded Story* variant. Treat it as an enhancement layer over Pass 1–2. It is **decorative** — everything must remain fully usable and legible without it.

---

## Mechanics
1. **One page-spanning SVG overlay**, `position: absolute` from the top of the page container, `width = document width`, `height = full scroll height`, `viewBox = "0 0 W H"` in document pixels, `pointer-events: none`. **z-index above section backgrounds** (so it shows over opaque sections) but **below the fixed nav**. Sits over section *padding/whitespace* only, never over text.

2. **Path is measured from the real DOM, not hardcoded.** Query the section elements (in the prototype: everything with `[data-screen-label]`). For each section, add two points on one side edge (`x = clamp(edge, 20, 72)` from the viewport side, alternating left/right per section, inset ~16% of section height from top and bottom). Consecutive sections are on opposite sides, so the line **crosses diagonally through the gap** between them. Rebuild the path on resize and after fonts/images settle. Smooth it (Catmull-Rom → Bézier).

3. **Scroll-draw via clip (keeps it performant + keeps the dotted texture):**
   - Draw the path **twice**: a faint always-visible "track" (`accent` @ ~16%, dash `2 9`, 2px) and a vivid "live" copy (`accent`, dash `2 9`, 2.5px, subtle drop-shadow).
   - Clip the live copy to a rect `height = front`, where `front = scrollY + innerHeight * 0.6`. As you scroll, the vivid dotted line fills down to ~60% of the viewport. (Update the rect on scroll via `requestAnimationFrame`; no per-frame path rebuild.)
   - **Production note:** a CSS scroll-timeline could drive the clip without JS; the rAF approach in the prototype is the safe baseline.

4. **Beads (HTML, absolutely positioned in document coords, in a `pointer-events:none` layer):** at each section-gap midpoint (`x = pageWidth/2`, `y = gap centre` — always whitespace). Even transitions get a **photo bead** (small rounded photo, ~108×82, with a DM-Mono uppercase caption like "A place / A voice / A face / A day"); the rest get a **node dot** (13px ring, `accent`). A bead is hidden (`opacity 0`, `scale .7/.4`) until `front >= bead.y`, then transitions to `lit`.

5. **Book convergence (finale):** in the Book section, 4 small photo chips start scattered (translated out, rotated, `opacity 0`) and, when the section reveals, **transition inward to tuck around the book** (behind it, `z-index` below the book). Chips use CSS custom props for start/end transform (`--sx/--sy/--sr` → `--ex/--ey/--er`) and animate on the section's reveal class. *(Note: in Pass 4 the book cover becomes a photograph — retarget the chips to gather toward the photo, or drop them if they read as clutter over the finished image. Stakeholder's call.)*

6. **Layering:** nav `z-30`; any tweak/compare UI `z-40`; thread + bead layer `~z-3` (above section bgs, below nav); chat drawer `z-50+`.

---

## Reduced motion & fallbacks
- Under `prefers-reduced-motion: reduce`: no scroll-draw animation, no bead transitions, no gather motion — render the final state statically (beads visible, chips settled). The prototype gates all of this already.
- Print / no-JS: the page must read normally without the overlay.
- Never hijack scroll, never pin sections.

---

## ✅ Pass 3 acceptance checklist
- [ ] A faint dotted track is always present; a vivid terracotta dotted line **draws downward as you scroll**, reaching ~60% of the viewport height.
- [ ] The line hugs the left/right margins and crosses diagonally **only in the whitespace between sections** — never over text.
- [ ] Photo beads + node dots sit at section transitions and **fade/scale in** as the thread reaches them; captions in DM Mono.
- [ ] Path recomputes correctly after resize and on long/short viewports (measured from the DOM, not fixed).
- [ ] Book-section chips gather into the book on reveal.
- [ ] `prefers-reduced-motion` → everything static and legible; nav stays above the thread; no scroll jank.
