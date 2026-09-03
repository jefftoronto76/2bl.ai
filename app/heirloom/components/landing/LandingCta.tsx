'use client';

/*
  LandingCta — the two shared CTA buttons (PrimaryCta / GhostCta), ported from
  the design reference: "Design Handovers/ Aug 2026 Atomic Updates/
  13_Heirloom_lander_nav_updateV4/Heirloom Lander - Summer 2026 - Story Canvas.html"
  (~lines 276-297).

  ⚠️ DELIBERATE DEVIATION FROM THE REFERENCE — behaviour is NOT ported.
  The reference wired its CTAs to its own internal event system
  (window.dispatchEvent(new CustomEvent('legacy-open-chat'))). Production has
  never used that. These components are visual only: they accept `children`
  and an `onClick` and pass it straight through — no dispatch logic, no
  chatStore import, no window events. The calling section owns the behaviour
  and wires `onClick={() => dispatch({ type: 'OPEN_CHAT' })}` via useChatStore,
  exactly as HeroSection.tsx's "Start Your Story" button already does.

  Token mapping from the reference (var(--hl-*) → real tokens):
    --hl-accent        → rgb(var(--color-accent))
    --hl-accent-hover  → var(--color-accent-hover)
    --hl-on-accent     → rgb(var(--color-background))   (= Tailwind `text-background` used on the
                                                          existing production CTAs)
    --hl-accent-soft   → rgb(var(--color-accent) / 0.13)
    --hl-accent-line   → rgb(var(--color-accent) / 0.3)
    --hl-text          → rgb(var(--color-text-primary))

  Icons for the remaining Wave 2 sections (no generic Icon wrapper — each
  section imports what it needs from lucide-react directly, the same pattern
  HeroSection.tsx uses; heart / mapPin / mic are already established there):
    bookMark → BookMarked (or Bookmark)
    edit     → Pencil (or Edit)
    feather  → Feather
    shield   → Shield
*/

import type { MouseEventHandler, ReactNode } from 'react';

export type LandingCtaProps = {
  children: ReactNode;
  /** Plain pass-through. The calling section decides what the button does. */
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

const ACCENT = 'rgb(var(--color-accent))';
const ACCENT_HOVER = 'var(--color-accent-hover)';
const ACCENT_SOFT = 'rgb(var(--color-accent) / 0.13)';
const ACCENT_LINE = 'rgb(var(--color-accent) / 0.3)';

export function PrimaryCta({ children, onClick }: LandingCtaProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: ACCENT,
        color: 'rgb(var(--color-background))',
        fontWeight: 600,
        fontSize: 16,
        padding: '16px 30px',
        borderRadius: 13,
        border: 'none',
        transition: 'background .2s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = ACCENT_HOVER; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ACCENT; }}
    >
      {children}
    </button>
  );
}

export function GhostCta({ children, onClick }: LandingCtaProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        color: ACCENT,
        fontWeight: 600,
        fontSize: 16,
        padding: '16px 30px',
        borderRadius: 13,
        border: `1px solid ${ACCENT_LINE}`,
        transition: 'all .2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = ACCENT_SOFT;
        e.currentTarget.style.color = 'rgb(var(--color-text-primary))';
        e.currentTarget.style.borderColor = ACCENT;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = ACCENT;
        e.currentTarget.style.borderColor = ACCENT_LINE;
      }}
    >
      {children}
    </button>
  );
}
