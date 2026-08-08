'use client';

/**
 * Curtain — the draggable divider between two panes.
 *
 * onStart() returns the pane's current width; onMove(base, delta) applies the new width from a
 * pointer delta. onReset (Home key or double-click) restores the default.
 * Keyboard: ArrowLeft/ArrowRight nudge by 16px — dragging is never the only way to resize.
 */

import { useState } from 'react';

export function Curtain({
  onStart,
  onMove,
  onReset,
  label,
}: {
  onStart: () => number;
  onMove: (base: number, delta: number) => void;
  onReset?: () => void;
  label: string;
}) {
  const [hot, setHot] = useState(false);
  const [live, setLive] = useState(false);

  const down = (e: React.PointerEvent) => {
    if (e.button) return;
    e.preventDefault();
    const x0 = e.clientX;
    const base = onStart();
    setLive(true);
    const mv = (ev: PointerEvent) => onMove(base, ev.clientX - x0);
    const up = () => {
      setLive(false);
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onMove(onStart(), -16); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onMove(onStart(), 16); }
    else if (e.key === 'Home' && onReset) { e.preventDefault(); onReset(); }
  };

  const on = hot || live;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={down}
      onKeyDown={key}
      onDoubleClick={onReset}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      className="relative z-[24] w-[9px] min-w-[9px] shrink-0 cursor-col-resize touch-none self-stretch outline-none transition-colors"
      style={{ background: on ? 'rgb(var(--color-accent) / 0.12)' : 'transparent' }}
    >
      <span
        className="absolute bottom-0 left-1 top-0 w-px transition-colors"
        style={{ background: on ? 'rgb(var(--color-accent))' : 'var(--color-border)' }}
      />
      <span
        className="absolute left-1/2 top-1/2 h-[30px] w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent transition-opacity"
        style={{ opacity: on ? 1 : 0 }}
      />
    </div>
  );
}

export const clampWidth = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
