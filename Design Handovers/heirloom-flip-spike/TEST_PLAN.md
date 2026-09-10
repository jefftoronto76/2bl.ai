# Test plan — hand-rolled flip spike (written before implementation)

Harness: Vite + real Chromium via Playwright. Every scenario records React console errors.

| ID | Scenario | Pass condition |
|---|---|---|
| H1 | Mount under StrictMode | page 1 visible, no errors, exactly one leaf at rest |
| H2 | Click Next | `settled` fires once; index 1; phase back to `idle`; buttons re-enabled; leaf rotation reset to 0 |
| H3 | Slow drag 10% of width, release | spring-back; index unchanged; phase idle |
| H4 | Slow drag 40% of width, release | completes forward; `settled` once |
| H5 | Flick: 8% distance, high velocity | completes forward (velocity rule) |
| H6 | Drag backward on first page | no page change; leaf never rotates |
| H7 | 10 rapid Next clicks (30 ms apart) | index == number of `settled` calls; phase idle; buttons enabled; no lock-up |
| H7b | Rapid alternating Next/Prev | state consistent, ends idle |
| H8 | Drag while a flip is animating | ignored; animation completes normally |
| H9 | Viewport geometry mutation mid-drag (resize + container height mutation, as the iOS visualViewport pattern does) | gesture completes or cancels correctly; phase idle afterwards |
| H9b | Same on a 390×844 touch-emulated viewport using CDP touch events | as H9 |
| H10 | Unmount after flips | window/document listener counts return to baseline; rAF callbacks/sec ≈ 0 after unmount; `document.getAnimations()` empty |
| H11 | Idle cost while mounted, 3 s | rAF callbacks/sec, CDP `Performance` deltas (TaskDuration, ScriptDuration, Layout/RecalcStyle counts). Same probe run on the page-flip harness for equal footing |
| H12 | `prefers-reduced-motion: reduce` | flip completes with no animation; `settled` fires |
| H13 | Keyboard ArrowRight / ArrowLeft | advances / goes back |
| H14 | Click Prev after Next | previous leaf turns in from the left; index back to 0 |

Static checks: `tsc` under the repo's flags on the spike; repo ESLint (boundaries, restricted imports) and repo `tsc` on a copy placed at the candidate path; Tailwind 3.4 build proves the arbitrary-property classes emit CSS; grep for hex literals.
