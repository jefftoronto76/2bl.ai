'use client';

/**
 * MemoryPanelDivider — the draggable, keyboard-operable boundary between
 * the chat column and the memory panel (memory-panel-layout Stage C
 * interaction, Stage D visual treatment, Stage E keyboard operability).
 * Adapted from (not copied from) Curtain.tsx in
 * Design Handovers/design_handoff_memory_panel_layout_2026/, which bundles
 * all three concerns into one component — pulled apart across stages here
 * so each stayed reviewable on its own.
 *
 * Keyboard shares the exact same width-setting path as drag: an arrow-key
 * nudge calls the same onMove(base, delta) callback a pointer drag does,
 * just with a fixed +-16px delta instead of a live pointer delta — no
 * second width-calculation path.
 */

import { useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

const ARROW_KEY_STEP = 16;

export interface MemoryPanelDividerProps {
  /** Returns the panel's current width (px) at drag/keyboard-nudge start. */
  onStart: () => number;
  /** Applies a new width given the width at drag start and a horizontal
   *  delta since then — a live pointer delta for a drag, a fixed +-16 for
   *  an arrow-key nudge. Pure math on the caller's side — no DOM reads
   *  here, which is what makes this trivially unit-testable without real
   *  layout. */
  onMove: (base: number, delta: number) => void;
  /** Fires true the instant a drag starts, false the instant it ends — lets
   *  the panel suppress its own open/close transition only while actively
   *  dragging, so a live resize isn't lagged behind the cursor. */
  onDragStateChange: (dragging: boolean) => void;
  /** Accessible label — distinguishes this divider from any other separator later. */
  label: string;
}

export function MemoryPanelDivider({ onStart, onMove, onDragStateChange, label }: MemoryPanelDividerProps) {
  // hot = hovered OR focused, live = actively dragging. Combined below
  // (`on`) so the treatment doesn't flicker off if a fast drag carries the
  // cursor outside the 9px hit-zone, and so keyboard focus gets the exact
  // same visual feedback mouse hover already does — one state, two sources,
  // not a separate focus style.
  const [hot, setHot] = useState(false);
  const [live, setLive] = useState(false);
  const on = hot || live;

  const handlePointerDown = (e: ReactPointerEvent) => {
    if (e.button) return; // primary button/touch only
    e.preventDefault();
    const x0 = e.clientX;
    const base = onStart();
    setLive(true);
    onDragStateChange(true);

    const handleMove = (ev: PointerEvent) => onMove(base, ev.clientX - x0);
    const handleUp = () => {
      setLive(false);
      onDragStateChange(false);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    // Same direction convention as drag: moving the divider left widens the
    // panel (base - delta with a negative delta = base + step), moving it
    // right narrows it — ArrowLeft/ArrowRight mirror that intuitively.
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onMove(onStart(), -ARROW_KEY_STEP);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onMove(onStart(), ARROW_KEY_STEP);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      className={`relative w-[9px] min-w-[9px] shrink-0 cursor-col-resize touch-none self-stretch outline-none transition-colors ${on ? 'bg-accent/[0.12]' : ''}`}
    >
      {/* The seam itself — was a static border-l on this element in Stage C;
          now a positioned line so it can swap to accent-colored on
          hover/focus/drag without fighting the hit-zone's own background wash. */}
      <span
        className={`absolute inset-y-0 left-1 w-px transition-colors ${on ? 'bg-accent' : 'bg-border'}`}
      />
      {/* The grip pill — always accent, only its opacity toggles, matching
          Curtain.tsx's own approach. */}
      <span
        className={`absolute left-1/2 top-1/2 h-[30px] w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent transition-opacity ${on ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
