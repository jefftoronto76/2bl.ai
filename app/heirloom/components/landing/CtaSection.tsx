'use client';

/*
  CtaSection → closing "All memories fade. / Don't let yours be forgotten."
  Ported from the design reference's FadeCta() (NOT FinalCta(), which is dead
  code in the reference and never rendered):
  "Design Handovers/ Aug 2026 Atomic Updates/13_Heirloom_lander_nav_updateV4/
  Heirloom Lander - Summer 2026 - Story Canvas.html" (~lines 648-661).

  Scroll-in animation is the reference's own: useReveal (ref + seen) toggling
  the shared 'reveal' / ' in' classes, whose `.reveal` / hl-rise CSS lives in
  app/heirloom/globals.css (same as the other Wave 2 sections).

  The headline intentionally repeats the Hero's tagline — it is the design's
  closing echo, not a duplicate to dedupe.

  ⚠️ production chat activation — unchanged: "Start Your Story" dispatches
  { type: 'OPEN_CHAT' } via useChatStore, same as the Hero and Pricing CTAs.
  The reference's onClick={startStory} maps to exactly that; PrimaryCta is a
  visual-only pass-through (see LandingCta.tsx).

  Token mapping from the reference (var(--hl-*) → real tokens):
    --hl-bg     → Tailwind `bg-background`
    --hl-accent → Tailwind `text-accent`
    --hl-text   → Tailwind `text-text-primary`
    --hl-muted  → Tailwind `text-text-muted`
    --font-display / --font-mono → Tailwind `font-display` / `font-mono`
  <Icon name="feather" /> → lucide-react <Feather />.
*/

import { Feather } from 'lucide-react';
import { useChatStore } from '@/components/shells/membership/chatStore';
import { PrimaryCta } from './LandingCta';
import { useReveal } from './useReveal';

export function CtaSection() {
  const [ref, seen] = useReveal<HTMLElement>();
  const { dispatch } = useChatStore();

  return (
    <section
      ref={ref}
      data-screen-label="All memories fade"
      className="relative overflow-hidden text-center bg-background"
      style={{ padding: 'clamp(90px, 14vw, 170px) 24px' }}
    >
      <div className={`reveal${seen ? ' in' : ''} relative z-[2] mx-auto`} style={{ maxWidth: 760 }}>
        <span className="inline-flex text-accent" aria-hidden="true">
          <Feather size={34} />
        </span>
        <p
          className="font-display italic font-light text-text-primary"
          style={{ fontSize: 'clamp(28px, 4.4vw, 52px)', lineHeight: 1.2, margin: '24px 0 40px' }}
        >
          All memories fade.<br />Don&rsquo;t let yours be forgotten.
        </p>
        {/* ⚠️ production chat activation — unchanged */}
        <PrimaryCta onClick={() => dispatch({ type: 'OPEN_CHAT' })}>Start Your Story</PrimaryCta>
        <p className="font-mono text-text-muted" style={{ fontSize: 13, letterSpacing: '.06em', margin: '18px 0 0' }}>
          Write your first story in under two minutes.
        </p>
      </div>
    </section>
  );
}
