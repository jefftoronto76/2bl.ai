'use client';

/*
  PricingSection → "We're almost ready." — the beta-signup panel that replaces
  the former price card / billing toggle. Ported from the design reference's
  Pricing(): "Design Handovers/ Aug 2026 Atomic Updates/
  13_Heirloom_lander_nav_updateV4/Heirloom Lander - Summer 2026 - Story
  Canvas.html" (~lines 817-833).

  id="pricing" is load-bearing — it is LandingNav's "Pricing" scroll target
  (document.getElementById('pricing')). Do not rename or remove. scroll-mt-16
  is kept from production so the fixed nav doesn't cover the heading.

  ⚠️ DELIBERATE DEVIATION FROM THE REFERENCE — behaviour is NOT ported.
  The reference button called `dropMessage`, which fired its own internal
  window event (CustomEvent 'legacy-open-chat' with a "Joining the beta"
  context). Production has never used that event system. "Drop us a message"
  is wired exactly like every other CTA on this page — HeroSection's "Start
  Your Story" included: dispatch({ type: 'OPEN_CHAT' }) via useChatStore.
  OPEN_CHAT carries no payload, so the reference's context string is simply
  dropped; that is expected.

  Copy note: the reference body says "...make sure Legacy is ready..." — that
  is the old brand name, changed to "Heirloom" here.

  Token mapping from the reference (var(--hl-*) → real tokens):
    --hl-surface      → rgb(var(--color-surface))
    --hl-border       → var(--color-border)
    --hl-text         → rgb(var(--color-text-primary))
    --hl-muted        → var(--color-text-muted)
    --hl-accent       → rgb(var(--color-accent))
    --hl-accent-hover → var(--color-accent-hover)
    --hl-on-accent    → rgb(var(--color-background))  (= Tailwind `text-background`
                                                      on the existing CTAs)
    --font-display → Tailwind `font-display`
  Reference `.reveal` / `.reveal.in` → same classes, defined once in globals.css
  (shared with the other Story Canvas section ports).
*/

import { useChatStore } from '@/components/shells/membership/chatStore';
import { useReveal } from './useReveal';
import { Eyebrow } from './Eyebrow';

const ACCENT = 'rgb(var(--color-accent))';
const ACCENT_HOVER = 'var(--color-accent-hover)';

export function PricingSection() {
  const [ref, seen] = useReveal<HTMLElement>();
  const { dispatch } = useChatStore();

  return (
    <section
      ref={ref}
      id="pricing"
      data-screen-label="Public Release Soon"
      className="scroll-mt-16"
      style={{ padding: 'clamp(80px,12vw,150px) 24px', background: 'rgb(var(--color-surface))', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}
    >
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <div className={'reveal' + (seen ? ' in' : '')} style={{ textAlign: 'center' }}>
          <Eyebrow style={{ marginBottom: 24 }}>Public Release Soon</Eyebrow>
          <h2 className="font-display" style={{ fontWeight: 300, fontSize: 'clamp(34px,5vw,60px)', lineHeight: 1.1, letterSpacing: '-.01em', color: 'rgb(var(--color-text-primary))', margin: '0 0 26px' }}>
            We&rsquo;re almost ready.
          </h2>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: 'var(--color-text-muted)', margin: '0 auto 40px', maxWidth: 480 }}>
            We&rsquo;re currently in the final phase of testing, working closely with around 100 members to make sure Heirloom is ready before we open it up more broadly.
          </p>
          <p className="font-display" style={{ fontStyle: 'italic', fontSize: 22, color: 'rgb(var(--color-text-primary))', margin: '0 0 20px' }}>
            Want to join the beta?
          </p>
          {/* ⚠️ production chat activation — same OPEN_CHAT dispatch as every other CTA */}
          <button
            type="button"
            onClick={() => dispatch({ type: 'OPEN_CHAT' })}
            style={{ padding: '15px 30px', borderRadius: 13, background: ACCENT, color: 'rgb(var(--color-background))', fontWeight: 600, fontSize: 16, border: 'none', transition: 'background .2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = ACCENT_HOVER; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ACCENT; }}
          >
            Drop us a message
          </button>
        </div>
      </div>
    </section>
  );
}
