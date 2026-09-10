# Hand-rolled flip evaluation — Heirloom Read view

Investigation only. A fresh implementation of the interaction design settled in the Bolt
prototype (`jefftoronto76/2bl-heirloom-pageflip-prototype`), written from scratch in this repo's
conventions and evaluated with the same method as the `react-pageflip` report. No app code is
touched; the spike lives under `Design Handovers/heirloom-flip-spike/` (excluded from `tsc`) and is
reproducible with `npm install && node harness/run.mjs` from that directory.

## Verdict

**Safe to build on, with the risk profile of code we own rather than a library we adopt.** The
whole thing is two files, about 230 lines: a state hook (`useFlipBook`) and a surface
(`FlipSurface`) on top of Motion. It compiles under the repo's strict config with no `any`, passes
the repo's ESLint at its candidate path, uses Heirloom's tokens with no hex, and needs exactly two
inline style bindings — the `rotateY` motion values Motion requires, which is the documented
third-party exception to the Tailwind-only rule. Every scenario in the test plan passed in real
Chromium, including touch on a 390 px viewport and a viewport shrink plus `position: fixed` body
lock landing mid-gesture. Idle cost while mounted is zero frame callbacks and zero style recalcs;
after unmount nothing runs.

The costs are the honest ones of a hand-rolled surface: it is a single-page flip (no two-page
spread, no corner curl, no page-edge stack), pagination of long memories is ours, and the two
things the harness cannot reach — real iOS scroll passthrough and the iOS edge-swipe conflict on
backward drags — must be checked on a device via a Vercel preview before this ships.

## What was tested

| | |
|---|---|
| Animation library | `motion@13.2.0` (import `motion/react`); `framer-motion@13.2.0` is the same code re-exported over `motion-dom` |
| React | 19.2.4, the version pinned in `package-lock.json`; Motion's peer range is `^18 \|\| ^19` |
| Upstream | motiondivision/motion: 33.6k stars, MIT, 108 open issues, 75 releases in the last 365 days, latest 2 Sep 2026 |
| Toolchain | the repo's exact `tsconfig` flags; repo ESLint config; Tailwind 3.4; real Chromium via Playwright with CDP touch input, reduced-motion emulation and CDP Performance metrics |
| Method | test plan written first (`TEST_PLAN.md`), 14 desktop + 5 mobile scenarios, same idle probe run on the `page-flip` harness |

## 1. TypeScript and strictness

- `motion/react` ships full declarations. The surface the flip needs — `motion.div`, `useMotionValue`, `useTransform`, `animate`, `useReducedMotion`, `PanInfo` — compiles clean under `strict` with no `any` and no loosened flags (probe + spike + harness all exit 0).
- The repo's own `tsc --noEmit` reports **zero** errors in the candidate path `app/heirloom/components/read/`. Incidental finding: the repo's `tsc` is currently red on this branch base with 8 pre-existing errors in `components/admin/content/*.test.ts(x)` (missing `type` on `BlockEditFormBlock` fixtures). Unrelated to this work, but it means "tsc is green" cannot be used as a gate today.

## 2. Repo constraints

| Constraint | Result |
|---|---|
| Tailwind-only, no inline styles | Two `style={{ rotateY }}` bindings, one per leaf. Motion values can only be applied through `style`; this is the "third-party library requires it" exception in `CLAUDE.md`. Everything else is classes: `[perspective:2000px]`, `[transform-style:preserve-3d]`, `[backface-visibility:hidden]`, `[transform:rotateY(180deg)]`, `origin-left`, `touch-pan-y`. Tailwind 3.4 emits all of them (verified in the built CSS). No prior 3D arbitrary-property usage in the repo; the `[animation:…]` precedent is the same mechanism. |
| No hardcoded hex, tokens only | Zero hex literals. Uses `bg-background`, `bg-surface-2`, `text-text-primary`, `text-text-muted`, `border-border`, `ring-accent/40`, all `rgb(var(--color-*))`-mapped in `tailwind.config.js`. **Gap in the design system, not the spike:** there is no shadow token, so page lift uses stock `shadow-xl`. |
| ESLint `boundaries/element-types` | Placed at `app/heirloom/components/read/` it imports only React and `motion/react`; repo ESLint exits 0. `app/**` may import `components/**` and `services/**`, so a later move to `components/shells/membership/` (if the membership shell needs it) is also legal. |
| Reduced motion | `useReducedMotion()` from Motion drops durations to 0; `settled` still fires (H12). House convention is Mantine's `useReducedMotion` plus a CSS reduce block — either works, the JS hook is required here because the animation is not a class. |
| Client-only | The component is `'use client'`; unlike the engine path it renders real HTML on the server (page 1 at rest), so there is no empty-then-filled flash. Not yet verified in a `next build`. |

## 3. The design as built (fresh, not ported)

- **State drives animation.** `useFlipBook` moves `pageIndex` immediately and sets `phase: 'flipping'`; `FlipSurface` sees the change and animates to match; `onSettled` returns the phase to `idle`. A synchronous ref lock closes the gap between two inputs landing before React re-renders.
- **Two leaves hinged on the left edge.** The current leaf turns away (0 → −180°) on a forward flip. The previous leaf rests folded at −180° off the left edge and turns back in (−180 → 0°) on a back flip, on top of the page being left. Under both sits the next page. Both leaves have a `backface-visibility: hidden` front and a plain paper back, so nothing mirrors mid-rotation. This differs from the prototype, whose single leaf rotated the outgoing page rightward for "previous".
- **Gesture.** Motion pan handlers (not `drag`, so nothing translates): rotation = drag distance / live container width × 180°. Commit when distance > 25 % of width **or** |velocity| > 500 px/s in the flip direction; otherwise spring back (stiffness 400, damping 34). Reversing past the origin mid-gesture rests the other leaf. Drags are ignored while a flip is animating.
- **Content swap without a flash.** When the phase returns to idle, a layout effect jumps both motion values to rest in the same commit that re-renders the leaves with their resting pages, so the swap and the reset land in one paint.
- **Accessibility.** Only the layer showing the owner's page is exposed; the others are `aria-hidden`. The surface is focusable with `ArrowLeft`/`ArrowRight`; prev/next buttons and an `aria-live` counter are the owner's.

## 4. Evidence (Chromium, StrictMode on)

| ID | Scenario | Result |
|---|---|---|
| H1 | Mount | page 1, one leaf, no errors |
| H2 / H14 | Click Next / Previous | `next → settled`, rotation back to rest; previous leaf visibly turning in at −48° mid-way |
| H3 / H4 | Slow drag 10 % / 40 % | cancel (no events, idle) / commit |
| H5 | Flick 8 % at high velocity | commit (velocity rule) |
| H6 | Backward drag on page 1 | nothing; previous leaf not rendered |
| H7 | 10 clicks 30 ms apart | 1 accepted, 1 settled: the button is disabled mid-flip |
| H7c | 20 `ArrowRight` presses 40 ms apart | 2 accepted = 2 settled; the lock serialises, never queues; ends idle |
| H7d | 5 presses paced at 600 ms | 5 accepted = 5 settled |
| H8 | Drag during a flip | ignored; flip completes |
| H9 | Viewport resize + surface width 448 → 388 px mid-drag | commit computed against the live width; idle |
| H10 | 3 mount/unmount cycles | window/document listener counts identical each cycle (one-time Playwright registrations only); 0 rAF/s, 0 web animations, 0 script after unmount |
| H11 | Idle 3 s mounted, desktop | 0 rAF/s, 0 recalcs, 0 ms script, 0.93 ms task |
| M5 | Idle 3 s mounted, 390 px mobile | 0 rAF/s, 0 recalcs, 0 ms script |
| H12 | `prefers-reduced-motion: reduce` | instant flip, `settled` fires |
| H13 | Keyboard | ArrowRight / ArrowLeft flip |
| M1 / M2 | CDP touch drag 40 % / 10 % on 390×844 | commit / cancel |
| M3 | Vertical touch gesture over the book | no flip; computed `touch-action: pan-y`. Scroll passthrough itself is **unverified**: the control run scrolled nothing even with no book mounted (headless limitation) |
| M4 | Viewport 844 → 520 px + `position: fixed` body lock mid touch-drag | commit; idle |

Idle cost, same probe, both spikes (3 s window, desktop):

| | rAF callbacks/s | style recalcs | script | total task |
|---|---|---|---|---|
| Hand-rolled, mounted | 0 | 0 | 0 ms | 0.93 ms |
| `page-flip`, mounted | 60 | 180 | 28.94 ms | 81.73 ms |
| `page-flip`, after teardown | 60 | 0 | 11.93 ms / 1.5 s | loop cannot be cancelled |

## 5. Defects found

- **In the first cut of this build:** the back-flip layering was wrong (the page being left vanished the moment state changed). Fixed by giving the current leaf the outgoing page during a back flip. Worth recording because it is the class of bug a fresh build gets wrong first and the harness caught it.
- **Inherited from the design, not fixed:** completion depends on `animate().onComplete`. The lock is released only by `settle()`. If the effect restarts mid-flip (a new `onSettled` identity or a reduced-motion change), Motion stops the first run and the restarted one completes; if the component unmounts mid-flip the lock dies with it. No case was found where the lock sticks, but it is a contract to keep in mind.
- **Not a defect, a limit:** inputs during a flip are dropped, not queued (H7c). Twenty rapid presses advance two pages. That is the prototype's intent ("prevent overlapping flips") and matches the engine's behaviour of force-completing rather than queueing.

## 6. Open risks not resolvable here

- **iOS edge-swipe.** A backward drag that starts within about 20 px of the screen's left edge is Safari's back-navigation gesture; web content cannot suppress it. Mitigation is UX (inset the surface, or accept that backward drags start off the edge). Needs a device.
- **Real scroll passthrough** with `touch-action: pan-y` under the membership shell's `position: fixed` body lock: mechanically correct in emulation (M3, M4) but the harness could not synthesize a real scroll. Needs a device.
- **Safari 3D quirks.** `overflow: hidden` sits on the face children, not on the `preserve-3d` element, which is the arrangement WebKit tolerates; still verify no flattening on iOS.
- **Content pagination** is ours (same as the engine path): the surface shows one fixed-ratio page per index.
- **Bundle cost.** The harness bundle (React 19 + Motion + spike) is 106.75 KB gzip; Motion's own share was not isolated in this harness. Import from `motion/react` and let tree-shaking work; `motion/react-m` (the `m` component) is the smaller entry if size matters.
- **Dependency hygiene.** Add `motion` (not `framer-motion`) pinned exactly to `13.2.0` via npm; `package-lock.json` is authoritative (Vercel runs `npm install`), the pnpm lockfile has drifted and should be left alone or removed. Motion is actively maintained, but it is a large dependency for one gesture; a zero-dependency version (Web Animations API + pointer events, imperative `element.style.transform`) is feasible if the team would rather not adopt it.

## Evidence index

`harness/results.json` (all scenarios), `harness/mid-flip.png` (frame during a forward flip),
`TEST_PLAN.md` (written before implementation), `probe/fm-strict.tsx` (the strict-TS probe).
Comparable `page-flip` numbers are in `Design Handovers/react-pageflip-spike/harness/idle-results.json`.
