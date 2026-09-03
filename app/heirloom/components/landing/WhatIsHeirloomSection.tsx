'use client';

/*
  WhatIsHeirloomSection → "Through simple conversations" (3 step cards:
  Capture / Shape / Publish). Ported essentially verbatim from the design
  reference's WhatIs(): "Design Handovers/ Aug 2026 Atomic Updates/
  13_Heirloom_lander_nav_updateV4/Heirloom Lander - Summer 2026 - Story Canvas.html"
  (~lines 560-591).

  Keeps id="what-is-heirloom" — LandingNav ("How It Works") and Footer ("About")
  both scroll to it. data-screen-label is the reference's exact value; it is
  the marker PageThread.tsx uses to find this section's boundaries.

  Scroll-in animation is the reference's own: useReveal (ref + seen) toggling
  the 'reveal' / ' in' classes, with the `.reveal` / hl-rise CSS in
  app/heirloom/globals.css. Purely presentational — no chat wiring.

  Token mapping (var(--hl-*) → real tokens, same pattern as HeroSection.tsx):
    --hl-bg          → rgb(var(--color-background))
    --hl-surface     → rgb(var(--color-surface))
    --hl-border      → var(--color-border)
    --hl-accent      → rgb(var(--color-accent))
    --hl-accent-soft → rgb(var(--color-accent) / 0.13)
    --hl-accent-line → rgb(var(--color-accent) / 0.3)
    --hl-text        → rgb(var(--color-text-primary))
    --hl-muted       → var(--color-text-muted)
    --font-display / --font-mono → Tailwind font-display / font-mono classes
*/

import { Mic, Sparkles, BookOpen, type LucideIcon } from 'lucide-react';
import { useReveal } from './useReveal';
import { Eyebrow } from './Eyebrow';

const steps: { icon: LucideIcon; label: string; body: string }[] = [
  { icon: Mic, label: 'Capture', body: 'Start with a memory. Add a photo, write it down, or simply talk. Invite others to add what they remember.' },
  { icon: Sparkles, label: 'Shape', body: 'Explore the details, connections, and context that turn a memory into an engaging story.' },
  { icon: BookOpen, label: 'Publish', body: 'Bring your stories to life in books made to be held, shared, and passed along.' },
];

export function WhatIsHeirloomSection() {
  const [ref, seen] = useReveal<HTMLElement>();

  return (
    <section
      ref={ref}
      id="what-is-heirloom"
      data-screen-label="Through simple conversations"
      className="scroll-mt-16"
      style={{ padding: 'clamp(80px,12vw,150px) 24px', background: 'rgb(var(--color-background))' }}
    >
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <div className={'reveal' + (seen ? ' in' : '')} style={{ textAlign: 'center', marginBottom: 64 }}>
          <Eyebrow style={{ marginBottom: 26 }}>Every story is worth saving.</Eyebrow>
          <h2 className="font-display" style={{ fontWeight: 300, fontSize: 'clamp(28px,4vw,52px)', lineHeight: 1.12, letterSpacing: '-.01em', maxWidth: 900, margin: '0 auto', color: 'rgb(var(--color-text-primary))' }}>
            Turn the moments you remember into stories you can hold onto.
          </h2>
        </div>
        <div className="hl-whatis-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className={'reveal' + (seen ? ' in' : '')} style={{ animationDelay: (0.15 + i * 0.13) + 's' }}>
                <div style={{ height: 1, background: 'rgb(var(--color-accent) / 0.3)', marginBottom: 26 }} />
                <div style={{ background: 'rgb(var(--color-surface))', border: '1px solid var(--color-border)', borderRadius: 16, padding: 30, height: '100%', position: 'relative', overflow: 'hidden' }}>
                  <span className="font-display" aria-hidden="true" style={{ position: 'absolute', top: 18, right: 22, fontSize: 60, lineHeight: 1, color: 'rgb(var(--color-accent))', opacity: 0.12 }}>{i + 1}</span>
                  <div style={{ width: 54, height: 54, borderRadius: 14, background: 'rgb(var(--color-accent) / 0.13)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgb(var(--color-accent))', marginBottom: 24 }}>
                    <Icon size={24} />
                  </div>
                  <p className="font-mono" style={{ fontSize: 12, letterSpacing: '.26em', textTransform: 'uppercase', color: 'rgb(var(--color-accent))', margin: '0 0 14px' }}>{s.label}</p>
                  <p style={{ fontSize: 17, lineHeight: 1.62, color: 'var(--color-text-muted)', margin: 0 }}>{s.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) { .hl-whatis-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}
