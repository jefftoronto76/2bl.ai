'use client';

import { animate, useMotionValue, useReducedMotion, motion, type PanInfo } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { FlipDirection, FlipPhase } from './useFlipBook';

/** Fraction of the page width a drag must cover to commit. */
const COMMIT_DISTANCE = 0.25;
/** Horizontal velocity (px/s) that commits regardless of distance. */
const COMMIT_VELOCITY = 500;
const REST_OPEN = 0;
const REST_CLOSED = -180;

export interface FlipSurfaceProps {
  pageIndex: number;
  pageCount: number;
  phase: FlipPhase;
  direction: FlipDirection | null;
  canNext: boolean;
  canPrev: boolean;
  /** Ask the owner to advance/retreat. Return value says whether it was accepted. */
  onNext: () => boolean;
  onPrev: () => boolean;
  /** The animation for the current flip has finished. */
  onSettled: () => void;
  renderPage: (index: number) => ReactNode;
  label: string;
}

/**
 * Single-page book surface with two leaves hinged on the left edge:
 *  - the "current" leaf shows the page being read and turns away (0 → -180°) on a forward flip;
 *  - the "previous" leaf rests folded at -180° off the left edge and turns back in (-180 → 0°) on a back flip.
 * Under both sits the next page, so a forward turn reveals it.
 *
 * State drives animation: the owner's index changes first; this component sees the change
 * and animates to match. Rotation is the only property a motion value writes, and it is the
 * one inline style Motion requires.
 */
export function FlipSurface({
  pageIndex,
  pageCount,
  phase,
  direction,
  canNext,
  canPrev,
  onNext,
  onPrev,
  onSettled,
  renderPage,
  label,
}: FlipSurfaceProps) {
  const current = useMotionValue(REST_OPEN);
  const previous = useMotionValue(REST_CLOSED);
  const reduced = useReducedMotion() === true;
  const container = useRef<HTMLDivElement>(null);
  const gesture = useRef<FlipDirection | null>(null);

  // Which page each layer shows. During a flip the owner's index is already the destination:
  //   forward (n-1 → n): current leaf = n-1 turning away, base = n revealed.
  //   back    (n+1 → n): previous leaf = n turning in on top, current leaf = n+1 underneath.
  const flipping = phase === 'flipping';
  const currentLeafPage = flipping ? (direction === 'forward' ? pageIndex - 1 : pageIndex + 1) : pageIndex;
  const previousLeafPage = flipping && direction === 'back' ? pageIndex : pageIndex - 1;
  const basePage = flipping ? (direction === 'forward' ? pageIndex : pageIndex + 2) : pageIndex + 1;
  /** Only the layer that shows the owner's page is exposed to assistive tech. */
  const hidden = (layerPage: number) => (layerPage === pageIndex ? undefined : 'true');

  // Animate in response to a state change.
  useEffect(() => {
    if (phase !== 'flipping' || direction === null) return;
    const value = direction === 'forward' ? current : previous;
    const target = direction === 'forward' ? REST_CLOSED : REST_OPEN;
    const controls = animate(value, target, {
      duration: reduced ? 0 : 0.55,
      ease: [0.4, 0, 0.2, 1],
      onComplete: onSettled,
    });
    return () => controls.stop();
  }, [phase, direction, current, previous, reduced, onSettled]);

  // Once the owner has re-rendered the leaves with their resting content, snap the
  // rotations back to rest before paint so the content swap and the reset land together.
  useLayoutEffect(() => {
    if (phase === 'idle') {
      current.jump(REST_OPEN);
      previous.jump(REST_CLOSED);
    }
  }, [phase, current, previous]);

  const width = () => container.current?.clientWidth ?? 1;

  const onPanStart = useCallback(() => {
    gesture.current = null;
  }, []);

  const onPan = useCallback(
    (_event: PointerEvent, info: PanInfo) => {
      if (phase !== 'idle') return;
      const wanted: FlipDirection = info.offset.x < 0 ? 'forward' : 'back';
      if (gesture.current !== null && gesture.current !== wanted) {
        // The finger reversed past the origin: rest the leaf we were moving.
        (gesture.current === 'forward' ? current : previous).set(gesture.current === 'forward' ? REST_OPEN : REST_CLOSED);
      }
      gesture.current = wanted;
      const allowed = wanted === 'forward' ? canNext : canPrev;
      if (!allowed) return;
      const progress = Math.min(Math.abs(info.offset.x) / width(), 1);
      if (wanted === 'forward') current.set(REST_OPEN - 180 * progress);
      else previous.set(REST_CLOSED + 180 * progress);
    },
    [phase, canNext, canPrev, current, previous],
  );

  const springBack = useCallback(
    (which: FlipDirection) => {
      const value = which === 'forward' ? current : previous;
      const rest = which === 'forward' ? REST_OPEN : REST_CLOSED;
      animate(value, rest, reduced ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 34 });
    },
    [current, previous, reduced],
  );

  const onPanEnd = useCallback(
    (_event: PointerEvent, info: PanInfo) => {
      const which = gesture.current;
      gesture.current = null;
      if (which === null || phase !== 'idle') return;
      const distance = Math.abs(info.offset.x) / width();
      const velocity = which === 'forward' ? -info.velocity.x : info.velocity.x;
      const commit = distance > COMMIT_DISTANCE || velocity > COMMIT_VELOCITY;
      const accepted = commit && (which === 'forward' ? onNext() : onPrev());
      if (!accepted) springBack(which);
    },
    [phase, onNext, onPrev, springBack],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      onNext();
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      onPrev();
      event.preventDefault();
    }
  };

  const hasBase = basePage < pageCount;
  const hasPrevious = previousLeafPage >= 0;

  return (
    <motion.div
      ref={container}
      role="group"
      aria-roledescription="book"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPanStart={onPanStart}
      onPan={onPan}
      onPanEnd={onPanEnd}
      className="relative h-full w-full select-none overflow-hidden touch-pan-y outline-none [perspective:2000px] focus-visible:ring-2 focus-visible:ring-accent/40"
      data-phase={phase}
    >
      {/* Next page, revealed as the current leaf turns away. */}
      <div className="absolute inset-0 overflow-hidden rounded-lg bg-background" aria-hidden={hidden(basePage)}>
        {hasBase ? renderPage(basePage) : null}
      </div>

      {/* Current leaf. */}
      <motion.div
        className="absolute inset-0 origin-left [transform-style:preserve-3d]"
        style={{ rotateY: current }}
        data-leaf="current"
        aria-hidden={hidden(currentLeafPage)}
      >
        <div className="absolute inset-0 overflow-hidden rounded-lg bg-background shadow-xl [backface-visibility:hidden]">
          {renderPage(currentLeafPage)}
        </div>
        <div className="absolute inset-0 rounded-lg bg-surface-2 [backface-visibility:hidden] [transform:rotateY(180deg)]" aria-hidden="true" />
      </motion.div>

      {/* Previous leaf, folded off the left edge until a back flip. */}
      {hasPrevious ? (
        <motion.div
          className="absolute inset-0 origin-left [transform-style:preserve-3d]"
          style={{ rotateY: previous }}
          data-leaf="previous"
          aria-hidden={hidden(previousLeafPage)}
        >
          <div className="absolute inset-0 overflow-hidden rounded-lg bg-background shadow-xl [backface-visibility:hidden]">
            {renderPage(previousLeafPage)}
          </div>
          <div className="absolute inset-0 rounded-lg bg-surface-2 [backface-visibility:hidden] [transform:rotateY(180deg)]" aria-hidden="true" />
        </motion.div>
      ) : null}
    </motion.div>
  );
}
