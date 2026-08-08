'use client';

/**
 * MemoryPanelDivider — the draggable boundary between the chat column and
 * the memory panel (memory-panel-layout Stage C). Interaction only: pointer
 * drag + the math to turn a pointer delta into a new width. Adapted from
 * (not copied from) Curtain.tsx in
 * Design Handovers/design_handoff_memory_panel_layout_2026/, which bundles
 * Stage D's hover/drag visual treatment with the same drag mechanic — that
 * treatment isn't here yet, deliberately, so this stage stays reviewable on
 * its own. No keyboard operability yet either (Stage E): a focusable
 * element with no keyboard handler is worse than one that isn't focusable
 * at all, so no tabIndex until arrow-key/Home handling actually exists.
 */

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
  const handlePointerDown = (e: ReactPointerEvent) => {
    if (e.button) return; // primary button/touch only
    e.preventDefault();
    const x0 = e.clientX;
    const base = onStart();
    onDragStateChange(true);

    const handleMove = (ev: PointerEvent) => onMove(base, ev.clientX - x0);
    const handleUp = () => {
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
      className="w-[9px] min-w-[9px] shrink-0 cursor-col-resize touch-none self-stretch border-l border-border"
    />
  );
}
