'use client';

/**
 * MemoryPanelDivider — the draggable boundary between the chat column and
 * the memory panel (memory-panel-layout Stage C interaction, Stage D visual
 * treatment). Adapted from (not copied from) Curtain.tsx in
 * Design Handovers/design_handoff_memory_panel_layout_2026/, which bundles
 * both concerns into one component — pulled apart here across two stages so
 * each stayed reviewable on its own: Stage C shipped the drag math and hit-
 * zone with no visual feedback beyond the cursor; this adds the hover/drag
 * treatment (accent line, pill, background wash) on top of that unchanged
 * interaction shell. No keyboard operability yet either (Stage E): a
 * focusable element with no keyboard handler is worse than one that isn't
 * focusable at all, so no tabIndex until arrow-key/Home handling actually
 * exists — onFocus/onBlur are therefore skipped too (dead handlers on a
 * non-focusable element), unlike Curtain.tsx's version.
 */

import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface MemoryPanelDividerProps {
  /** Returns the panel's current width (px) at drag start. */
  onStart: () => number;
  /** Applies a new width given the width at drag start and the pointer's
   *  horizontal delta since then. Pure math — no DOM reads here, which is
   *  what makes this trivially unit-testable without real layout. */
  onMove: (base: number, delta: number) => void;
  /** Fires true the instant a drag starts, false the instant it ends — lets
   *  the panel suppress its own open/close transition only while actively
   *  dragging, so a live resize isn't lagged behind the cursor. */
  onDragStateChange: (dragging: boolean) => void;
  /** Accessible label — distinguishes this divider from any other separator later. */
  label: string;
}

export function MemoryPanelDivider({ onStart, onMove, onDragStateChange, label }: MemoryPanelDividerProps) {
  // hot = hovered, live = actively dragging. Combined below (`on`) so the
  // treatment doesn't flicker off if a fast drag carries the cursor outside
  // the 9px hit-zone — window-level pointermove tracks the drag regardless
  // of where the cursor ends up, so the visual should stay lit for exactly
  // as long as the drag itself is live, not just while directly hovered.
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

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={handlePointerDown}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      className={`relative w-[9px] min-w-[9px] shrink-0 cursor-col-resize touch-none self-stretch transition-colors ${on ? 'bg-accent/[0.12]' : ''}`}
    >
      {/* The seam itself — was a static border-l on this element in Stage C;
          now a positioned line so it can swap to accent-colored on
          hover/drag without fighting the hit-zone's own background wash. */}
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
