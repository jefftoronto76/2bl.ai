'use client';

// components/shells/membership/useAnimatedPresence.ts
//
// Keeps an element in the DOM long enough for a CSS exit animation to play
// before it unmounts. Conditionally-rendered overlays ({open && <Drawer/>})
// get their entrance animation for free — the element mounts and the keyframe
// runs — but closing removes the node on the same tick, so the exit keyframe
// never gets a chance to start. The result is an entrance that looks
// deliberate and a close that is an abrupt vanish.
//
// The contract is deliberately narrow: this hook owns TIMING and PRESENCE
// only. It does not know what the animation looks like, does not touch state,
// and never renders anything. The caller keeps its own boolean as the single
// source of truth, applies whatever class it likes while `isExiting`, and
// mounts while `isPresent`.
//
// SOURCE OF TRUTH ORDERING is the important design decision here. The caller's
// `isOpen` flips to false IMMEDIATELY on close — presence lags behind it. The
// alternative (hold the store open until the animation finishes, then flip it)
// was rejected: it leaves the app's own state lying about what is on screen
// for 240ms, and every other consumer of that flag — the header's toggle, the
// Escape handler's guard — would read the stale value and behave oddly.
//
// RAPID RE-OPEN falls out of that ordering rather than needing a special case.
// Re-opening mid-exit flips `isOpen` back to true, which cancels the pending
// unmount, clears `isExiting`, and leaves the node mounted throughout — it was
// never removed, so there is nothing to restore. The element re-enters with
// the caller's entrance class. Because the entrance keyframe starts from its
// own `from` state rather than wherever the exit had reached, a re-open caught
// mid-flight snaps back to the start before sliding in. That is a cosmetic
// artifact of keyframes (a `transition` on transform would interpolate from
// the current position instead), not a stuck state: the element always ends at
// its open position with `isExiting` false and no timer pending.
//
// REDUCED MOTION is the caller's call too — pass 0 and the unmount lands on the
// next macrotask, which pairs with a stylesheet that already zeroes the
// animations out. Presence still goes through the same path, so there is one
// code path to reason about rather than a separate no-animation branch.

import { useEffect, useRef, useState } from 'react';

export interface AnimatedPresence {
  /** Whether the element should be rendered at all. Stays true through the exit. */
  isPresent: boolean;
  /** True only while the exit animation is playing. False at rest, both open and closed. */
  isExiting: boolean;
}

/**
 * @param isOpen           The caller's source of truth. Flips immediately.
 * @param exitDurationMs   How long to keep the element mounted after `isOpen`
 *                         goes false. Must match the CSS exit animation's
 *                         duration; pass 0 to unmount as good as immediately.
 */
export function useAnimatedPresence(isOpen: boolean, exitDurationMs: number): AnimatedPresence {
  const [isPresent, setIsPresent] = useState(isOpen);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Cancels an exit already in flight. This is the rapid-re-open path: the
      // node is still mounted, so dropping the timer and clearing isExiting is
      // the whole recovery — no remount, no state to rebuild.
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsExiting(false);
      setIsPresent(true);
      return;
    }

    // Closed and already gone (including the very first render of a closed
    // element) — there is nothing on screen to animate out.
    if (!isPresent) return;

    setIsExiting(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setIsExiting(false);
      setIsPresent(false);
    }, exitDurationMs);

    // Also the unmount path: React runs the last committed cleanup when the
    // component goes away, so a pending timer can never fire into a dead tree.
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // isPresent is a dependency, not a ref read, so the effect re-evaluates
    // once the timer lands and correctly no-ops instead of starting a second
    // exit. Setting isExiting does not re-run it — that flag is intentionally
    // not a dependency.
  }, [isOpen, isPresent, exitDurationMs]);

  return { isPresent, isExiting };
}
