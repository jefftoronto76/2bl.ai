# Heirloom Read View — Sprint Plan (Draft)

**Note:** This covers only the sprints scoped in tonight's session. If this is part of a
larger 12-sprint / 6-day plan, these are a subset — reconcile against the full list
separately.

## Context — decisions already locked

- **Flip mechanic:** hand-rolled CSS 3D transform + Framer Motion (`motion/react`), a
  two-leaf hinge — current page turns away on "next," previous page folds back in from
  the left on "previous." Chosen over `react-pageflip`/`page-flip` after two
  investigate-first CC spikes run directly in the `2bl.ai` repo, evaluated to equal
  rigor. Decisive factors: zero idle CPU/frame cost vs. the library's 60fps idle loop
  that cannot be cancelled even after unmount; Motion is actively maintained (75
  releases/year) vs. the library abandoned since 2021 with an open type-declaration bug
  since 2022.
- **Two layouts, user-facing names:** **Novel** (tall portrait, text-forward, generous
  margins) and **Landscape** (wide, photo-forward, image fills most of the page width).
  Internally these map to `book`/`landscape` in code. **Landscape ships first.**
- **Open risks still needing real-device verification:** iOS edge-swipe conflict on
  backward drags, real scroll passthrough under the membership shell's `position: fixed`
  body lock.
- **Pagination** (splitting long memories / oversized images across pages) is a known
  hard problem, explicitly deferred — not solved by these sprints, surfaces for real in
  Sprint 3.

## Sprint 0 — Lock print constraints (dimensions + photo requirements)

**Goal:** de-risk everything downstream by knowing Lulu's real constraints before CD
finalizes page dimensions.

- Run the investigate-first CC prompt against the Lulu sandbox (credentials already set
  up in Vercel: `LULU_CLIENT_KEY_SB`, `LULU_CLIENT_SECRET_SB`, `LULU_API_ENVIRONMENT`).
- Confirm real trim sizes, bleed, and safety margins for Casewrap and Linen-with-Dust-
  Jacket hardcover, in the ~25-30 page range.
- **Photo/image requirements:** minimum print resolution/DPI (notes suggest 300–600
  PPI), acceptable file formats, color space handling (sRGB in, Lulu converts to CMYK).
  Decide the UX for a member-uploaded photo that doesn't meet the minimum — flag before
  submission, not discovered as a failed print job later.
- **Deliverable:** one written spec covering page dimensions + photo requirements. No
  app code touched.

## Sprint 1 — Reader shell + Landscape layout

- CD finalizes: reader shell, Landscape page layout (photo-forward), cover/closing page
  treatment, per-memory action placement (Talk about this / Use as a base / edit /
  remove) within a fixed page.
- CC promotes the hand-rolled Motion flip spike from throwaway/spike code into real
  implementation at `app/heirloom/components/read/`, wired to Landscape.
- Real per-memory data — photo-only and mixed content types first.
- On-device verification: 390px, iOS edge-swipe conflict, scroll passthrough under
  `position: fixed` body lock.
- **Design token gap:** no shadow token exists yet (surfaced during the flip spike,
  hand-rolled-Motion evaluation, Sept 10). CD/CC will need to add one, or confirm the
  flip surface doesn't require elevation, before/while building the real component.
- Cross-check existing member photos against the Sprint 0 resolution spec — surface any
  gap now, not after Sprint 4.

## Sprint 2 — Novel layout + format selector

- CD finalizes Novel page layout + the Landscape/Novel selector control and the
  transition behavior when switching formats mid-book.
- CC wires the `pageFormat` toggle into the real component; text-only and mixed content
  types.
- Re-verify navigation across all four combinations (Landscape+forward,
  Landscape+back, Novel+forward, Novel+back) — this class of bug (state desync across
  mode switches) was caught once already in the prototype phase; don't assume it "just
  works" here without re-testing.

## Sprint 3 — Layout / "block" optimization

- Needs its own scoping pass first: what counts as a block (text, photo, caption), are
  blocks reorderable, is this drag-and-drop or a simpler add/remove flow. Not yet
  specified — write a short spec before writing a CC prompt.
- This is where pagination surfaces for real: how a long memory or an oversized photo
  splits across pages is the same problem as block arrangement, viewed from the other
  side.

## Sprint 4 — Print integration (Lulu build-out)

- Build the real Lulu adapter behind a vendor-agnostic `services/fulfillment/`
  interface (`createPrintJob`, `getJobStatus`, `getJobCost`, `cancelJob`) so Lulu isn't
  a hard dependency baked into the rest of the app.
- Build the `print_orders` state machine, idempotent submission guard, and webhook
  handler already scoped in prior research.
- Submit a real (sandbox) print job end-to-end as the deliverable.

## Reference

- Lulu sandbox credentials: set in Vercel (Production/Preview/Development), naming
  convention `_SB` suffix for sandbox, reserve `_PROD` suffix for live credentials
  later.
- Hand-rolled flip spike report + `react-pageflip` evaluation report: branch
  `claude/bold-bardeen-twwcv7`, under `Design Handovers/heirloom-flip-spike/` and
  `Design Handovers/react-pageflip-spike/` in the `2bl.ai` repo.
- Original Bolt/GitHub prototype (reference only, not ported):
  `github.com/jefftoronto76/2bl-heirloom-pageflip-prototype`
