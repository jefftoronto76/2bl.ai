/*
  Eyebrow — small shared uppercase label that sits above section headings.
  Ported from the design reference: "Design Handovers/ Aug 2026 Atomic Updates/
  13_Heirloom_lander_nav_updateV4/Heirloom Lander - Summer 2026 - Story Canvas.html"
  (~line 295, right after GhostCta).

  Token mapping from the reference (var(--hl-*) → real tokens):
    --hl-accent → rgb(var(--color-accent))
    --font-mono → Tailwind `font-mono` class
*/

import type { CSSProperties, ReactNode } from 'react';

export type EyebrowProps = {
  children: ReactNode;
  /** Optional overrides merged over the base styling (e.g. marginBottom). */
  style?: CSSProperties;
};

export function Eyebrow({ children, style }: EyebrowProps) {
  return (
    <span
      className="font-mono"
      style={{ fontSize: 13, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgb(var(--color-accent))', display: 'block', ...style }}
    >
      {children}
    </span>
  );
}
