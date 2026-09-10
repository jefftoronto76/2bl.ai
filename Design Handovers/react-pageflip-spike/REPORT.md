# react-pageflip evaluation — Heirloom Read view

Investigation only. Nothing here touches `app/heirloom` or any real page. The spike lives
under `Design Handovers/react-pageflip-spike/` (excluded from `tsc` by `tsconfig.json`) and
is reproducible with `npm install && node harness/run.mjs` from that directory.

## Verdict

**Buildable, but only as a dependency we are prepared to own.** Every friction Bolt hit is
real and inherent to the library's *type surface*; none of it is inherent to the *runtime*.
A ~150-line typed wrapper we control (included, compiles under the repo's strict config
with no `any`) removes all of it and fixes three runtime defects in the React wrapper that
Bolt did not find. The larger risk is maintenance: both packages have been untouched since
2021–2022, the type bug has been an open issue since March 2022, and any fix is ours to
carry. If we adopt, bind to the `page-flip` engine directly and skip `react-pageflip`
(three of the defects live in its 80 lines), pin the engine version, and keep the harness.

Premise check: this repo has **no** hand-rolled CSS 3D / Framer Motion page-flip and no
Read view (`Backlog/2BL_Outstanding_Master (2).md` lists 1A.6 as not started; Framer Motion
is not in `package.json`). The "already working" implementation must be outside this
checkout. Reconcile that before deciding.

## What was tested

| | |
|---|---|
| Packages | `react-pageflip@2.0.3` (published May 2022, last commit 18 Apr 2021) → `page-flip@2.0.7` (May 2022) |
| Upstream | 50 open issues / 4 PRs (wrapper), 42 / 4 (engine); no maintainer activity since 2021 |
| Toolchain | React 19.2.4, TypeScript 5.9, the repo's exact `tsconfig` flags; real Chromium via Playwright |
| Method | Read the engine source (no docs answer the event questions), five `tsc` probes, 17 browser scenarios |

## 1. TypeScript support (inherent friction — confirmed)

- The wrapper ships four `.d.ts` files. The engine ships **none**: `import type { PageFlip } from 'page-flip'` is TS7016 under `strict`. Its raw `src/*.ts` is present, but importing it drags 30+ strict-null errors from `node_modules` into our build. Unusable.
- `IProps` marks **all 21 settings, plus `className` and `style`, as required**. The README says only `width`/`height` are. `<HTMLFlipBook width height>` fails with "missing 23 properties". Upstream issue #32, open since 2022.
- The ref handle is `RefAttributes<any>`; `useRef<null>` is accepted. Every event payload is `(flipEvent: any) => void`. Nothing in the compiler can catch a wrong ref guess (issue #20 is someone guessing `getPageFlip()`).
- The settings/event interfaces are not re-exported from the package index; the deep path `react-pageflip/build/html-flip-book/settings` works (no `exports` map) but is undocumented.
- The wrapper declares **no `peerDependencies`** on React, and depends on `page-flip: "latest"` — unpinned.

Workaround that is not a workaround: `spike/pageFlipTypes.ts` (hand-written surface, derived from source) and `spike/FlipBook.tsx` (defaults spread from the engine's own `Settings._default`). No `any`, no loosened flags.

## 2. Event contract (read from source, then verified in Chromium)

| Event | Fires when | Payload | Verified |
|---|---|---|---|
| `init` | Once, from a 1 ms `setTimeout` after `loadFromHTML`. Handlers are bound synchronously before that timer, so it is **reliable on every mount**, StrictMode included. | `{ page, mode }` | T1, T10, T11 — fired exactly once each |
| `flip` | Every `showSpread()`: animated flips, `turnToPage`/`Next`/`Prev`, **and** every orientation change on resize. Fires even when turning to the page already shown. | first page index of the *spread* (landscape: 0, 2, 4…), not the page you asked for | T2–T6, T12 |
| `changeState` | Only on state *transitions*. Animated flip: `flipping` → `flip` → `read`, always in that order, and a second flip started mid-animation force-completes the first before starting. | `'flipping' \| 'read' \| 'user_fold' \| 'fold_corner'` | T2, T4, T5, T17 |
| `changeState: read` after `turnToPage` | **Never.** `turnToPage` bypasses the flip controller; state is already `read`, and `setState` is change-gated. | | T3 |
| `update` | **Never reaches React.** The wrapper unbinds all handlers, calls `updateFromHtml` (which emits `update`), then rebinds. | | T7 |
| `changeOrientation` | On resize when the container drops below two page widths (`usePortrait`). | `'portrait' \| 'landscape'` | T12 |

So: `read` is guaranteed after every *animated* flip and is genuinely never emitted for
`turnToPage`. The correct "flip finished" signal is `onFlip` for instant turns and
`onChangeState === 'read'` for animated ones. Nothing here needs a timeout.

## 3. Runtime defects in the React wrapper (not in Bolt's list)

1. **No unmount cleanup.** The engine registers `mousemove`, `mouseup`, `touchmove`, `touchend`, `resize` on `window` and starts a `requestAnimationFrame` loop that is never cancelled and rewrites inline styles every frame even at rest. Unmounting the React component leaves all of it running (T8). Leaked instances kept emitting `flip` events into the recorder on later resizes. **Measured (T18, CDP Performance metrics, 3 s window, headless Chromium):** at rest the mounted book runs 60 rAF callbacks/s, 180 style recalculations, 28.94 ms script and 81.73 ms total task time per 3 s (mobile emulation: 60.3/s, 181 recalcs, 23.85 ms script). **The loop cannot be stopped:** after unmount with our `getUI().destroy()` cleanup it still runs at 60.7 callbacks/s (11.93 ms script per 1.5 s); two leaked instances run at 120/s. In a Next.js app this survives client-side navigation for the life of the document.
2. **`destroy()` is unusable under React.** It removes the React-owned root `<div>`; React then throws `removeChild: The node to be removed is not a child of this node` on unmount (T9). `getUI().destroy()` is the safe call, and it must run from a *layout*-effect cleanup, deferred one macrotask so StrictMode's simulated remount does not kill a live book (T13, T15, T15b — listeners released, book still flips after remount).
3. **Every parent re-render rebuilds the page collection** (8 child-list mutations on an identical re-render, T16) because `children` is a fresh array each render. It survived a re-render landing mid-animation (T17), but it is work on every render. The escape hatch `renderOnlyPageLengthChange` stops the churn and **reintroduces stale handlers** (T16b: a re-render with a new callback still reported the old one). The wrapper binds latest-ref trampolines so either mode is safe.

## 4. Was the Bolt friction inherent?

| Bolt symptom | Inherent? | Evidence |
|---|---|---|
| Wrong ref API guessed | Partly. README documents `ref.current.pageFlip()`, but the handle is `any`, so the compiler cannot correct a wrong guess. | `index.d.ts`, issue #20 |
| Weak / incomplete `.d.ts`, all props required | **Yes**, fully. | Probes A, B, C, E; issue #32 |
| `onInit` vs React mount race, timeout fallback | **No.** `init` fired on every mount in 17 runs. The likely real cause: the engine is created only after the wrapper's internal `setPages`, so `ref.current.pageFlip()` is `undefined` during the first commit (closed issue #15, Next.js issue #46). That needs a null-guard, not a timer. | T1, T10, T11; wrapper source |

## 5. Things a careful integration must still carry

- **Client-only.** The engine injects a `<style>` at import (guarded, so SSR does not crash) and renders nothing until after mount → no server HTML for the book, an empty-then-filled flash, and an LCP consideration.
- **Styling rule.** The engine writes inline `cssText`/`z-index` on our page elements every frame and reparents them into its own `.stf__block`. That is the third-party exception to Tailwind-only, and must be documented in `System Docs/Known Gaps.md` if adopted. The shipped CSS has a typo (`.sft__wrapper`) so the wrapper rule never applies; it works because `.stf__parent` is positioned.
- **Mobile.** `touchmove` is registered non-passive on `window` by default (Lighthouse will flag it); `mousedown` calls `preventDefault` (no text selection inside pages); `clickEventForward` only whitelists `a` and `button`.
- **Accessibility.** The engine provides no keyboard path; prev/next controls are ours (the spike has them, with `aria-live` status). Off-spread pages are `display:none`, so assistive tech sees only the current spread.
- **Performance is a feature.** The idle rAF loop is measured, not assumed: 60 callbacks/s and about 60 style recalcs/s per mounted instance, and it cannot be paused or cancelled through the API, even after teardown. Battery cost on a real phone is still unmeasured.
- **Dependency hygiene.** Pin `page-flip` directly; the repo carries both `package-lock.json` and `pnpm-lock.yaml`, so which lockfile is authoritative needs a decision first.

## 6. Open questions not resolvable from source or docs

- Real-device touch: the 30 px / 250 ms swipe heuristic vs. vertical page scroll on iOS Safari and Android Chrome.
- Idle CPU/battery cost of the perpetual frame loop on low-end mobile (INP / CWV on Vercel preview).
- Content pagination: the engine has a fixed page aspect ratio and does not reflow; long memories must be split into pages by us.
- React 19 compatibility is empirical only (React 19.2.4 in this harness); the wrapper was built for React 17 and upstream makes no statement.
- Abandonment: no maintainer response since 2021. Budget for a fork or `patch-package` from day one.

| T18 | Idle cost while mounted / after unmount (same probe as the hand-rolled spike) | 60 rAF/s at rest; loop persists after teardown |

## Evidence index

`harness/results.json` holds the raw output of the 17 scenarios (T1–T17) and `harness/idle-results.json` the idle-cost samples (T18); `harness/mid-flip.png`
is a frame captured mid-animation. `probe/` holds the five TypeScript resolution probes.
