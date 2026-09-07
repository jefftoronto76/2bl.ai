'use client';

/*
  HowItWorksSection → "It becomes a book" — the book centerpiece (a real photo
  of finished books) plus the four "other ways to share it" cards. Ported
  essentially verbatim from the design reference's BookSuite(): "Design
  Handovers/ Aug 2026 Atomic Updates/13_Heirloom_lander_nav_updateV4/
  Heirloom Lander - Summer 2026 - Story Canvas.html" (~lines 593-648).
  The reference's BookCover() is dead code (never rendered) and is not ported.

  Keeps id="how-it-works" — LandingNav ("What You Can Make") scrolls to it.
  data-screen-label is the reference's exact value; it is the marker
  PageThread.tsx uses to find this section's boundaries.

  Scroll-in animation is the reference's own: useReveal (ref + seen) toggling
  the 'reveal' / ' in' classes, with the `.reveal` / hl-rise CSS in
  app/heirloom/globals.css. Purely presentational — no chat wiring. The Comic
  card's SoonVote is a local localStorage preference toggle only.

  Token mapping (var(--hl-*) → real tokens, same pattern as HeroSection.tsx):
    --hl-bg          → rgb(var(--color-background))
    --hl-surface     → rgb(var(--color-surface))
    --hl-border      → var(--color-border)
    --hl-accent      → rgb(var(--color-accent))
    --hl-accent-soft → rgb(var(--color-accent) / 0.13)
    --hl-accent-line → rgb(var(--color-accent) / 0.3)
    --hl-text        → rgb(var(--color-text-primary))
    --hl-muted       → var(--color-text-muted)
    --hl-faint       → rgb(var(--color-text-dim))
    --font-display / --font-mono → Tailwind font-display / font-mono classes

  Icons: the reference's "panels" glyph is four squares in a 2×2 grid, which
  is lucide's LayoutGrid (PanelsTopLeft exists in lucide-react 0.463 but
  draws a different top-bar/side-panel glyph).
*/

import { Monitor, Headphones, Clock, LayoutGrid, type LucideIcon } from 'lucide-react';
import { useReveal } from './useReveal';
import { Eyebrow } from './Eyebrow';
import { SoonVote } from './SoonVote';

const others: { icon: LucideIcon; t: string; d: string; soon?: boolean }[] = [
  { icon: Monitor, t: 'The Webpage', d: 'A living digital edition with shareable links.' },
  { icon: Headphones, t: 'The Audiobook', d: 'Narrated and ready for the platforms people already use.' },
  { icon: Clock, t: 'The Time Capsule', d: 'Sealed today, unlocked on a date you choose.' },
  { icon: LayoutGrid, t: 'The Comic', d: 'Illustrated panels that bring the moments to life.', soon: true },
];

export function HowItWorksSection() {
  const [ref, seen] = useReveal<HTMLElement>();

  return (
    <section
      ref={ref}
      id="how-it-works"
      data-screen-label="It becomes a book"
      className="scroll-mt-16"
      style={{ padding: 'clamp(80px,12vw,150px) 24px', background: 'rgb(var(--color-surface))', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div className={'reveal' + (seen ? ' in' : '')} style={{ textAlign: 'center', marginBottom: 22 }}>
          <Eyebrow style={{ marginBottom: 22 }}>Leave your mark</Eyebrow>
          <h2 className="font-display" style={{ fontWeight: 300, fontSize: 'clamp(34px,5vw,66px)', lineHeight: 1.05, color: 'rgb(var(--color-text-primary))', margin: 0 }}>Something real. Something lasting.</h2>
        </div>
        <p className={'reveal' + (seen ? ' in' : '')} style={{ animationDelay: '.08s', textAlign: 'center', maxWidth: 600, margin: '0 auto 56px', fontSize: 18, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
          Turn your stories into something you can hold, share, and relive.
        </p>

        {/* Book centerpiece */}
        <div className={'hl-book-feature reveal' + (seen ? ' in' : '')} style={{ animationDelay: '.12s', display: 'grid', gridTemplateColumns: '1fr 1.15fr', alignItems: 'center', background: 'rgb(var(--color-background))', border: '1px solid rgb(var(--color-accent) / 0.3)', borderRadius: 24, overflow: 'hidden', marginBottom: 'clamp(48px,7vw,80px)' }}>
          <div style={{ padding: 'clamp(30px,4.5vw,60px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Eyebrow style={{ display: 'inline-block', fontSize: 12, letterSpacing: '.26em' }}>The centerpiece</Eyebrow>
            <h3 className="font-display" style={{ fontWeight: 400, fontSize: 'clamp(40px,6vw,68px)', lineHeight: 1, color: 'rgb(var(--color-text-primary))', margin: '16px 0 18px' }}>The Book</h3>
            <p style={{ fontSize: 'clamp(17px,2vw,20px)', lineHeight: 1.62, color: 'var(--color-text-muted)', margin: '0 0 28px', maxWidth: 480 }}>
              Hardcover, paperback, photo-heavy or illustrated &mdash; create a book that fits the story you want to tell.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {['Hardcover / paperback', 'On-demand'].map((tag) => (
                <span key={tag} className="font-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, letterSpacing: '.06em', color: 'rgb(var(--color-text-primary))', background: 'rgb(var(--color-accent) / 0.13)', border: '1px solid rgb(var(--color-accent) / 0.3)', borderRadius: 999, padding: '8px 14px' }}>
                  <span style={{ width: 5, height: 5, borderRadius: 999, background: 'rgb(var(--color-accent))' }} />{tag}
                </span>
              ))}
            </div>
          </div>
          <div className="hl-book-photo-cell" style={{ display: 'flex' }}>
            <img
              src="/heirloom/landerimages/book-keepsake.webp"
              alt="A shelf of finished Heirloom books — a road-trip memoir, a 30th-birthday keepsake, a kids’ comic, a family recipe book, and an open photo spread — on a linen tabletop."
              width={938}
              height={800}
              loading="lazy"
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        </div>

        {/* Other formats */}
        <div className={'reveal' + (seen ? ' in' : '')} style={{ animationDelay: '.2s', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 26 }}>
          <span className="font-mono" style={{ fontSize: 12, letterSpacing: '.24em', textTransform: 'uppercase', color: 'rgb(var(--color-text-dim))', whiteSpace: 'nowrap' }}>Other ways to share it</span>
          <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        </div>
        <div className="hl-how-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
          {others.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.t} className={'reveal' + (seen ? ' in' : '')} style={{ animationDelay: (0.24 + i * 0.08) + 's', background: 'rgb(var(--color-background))', border: '1px solid var(--color-border)', borderRadius: 16, padding: '24px 22px', height: '100%' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgb(var(--color-accent) / 0.13)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgb(var(--color-accent))', marginBottom: 18 }}>
                  <Icon size={21} />
                </div>
                <h3 className="font-display" style={{ fontWeight: 500, fontSize: 22, margin: '0 0 8px', color: 'rgb(var(--color-text-primary))', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  {s.t}
                  {s.soon && (
                    <span className="font-mono" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgb(var(--color-text-dim))', border: '1px solid var(--color-border)', borderRadius: 99, padding: '3px 8px', fontWeight: 500 }}>Coming soon</span>
                  )}
                </h3>
                <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--color-text-muted)', margin: 0 }}>{s.d}</p>
                {s.soon && <SoonVote storageKey="hl.comicVote" initial={126} />}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @media (max-width: 920px) { .hl-how-grid { grid-template-columns: repeat(2,1fr) !important; } }
        @media (max-width: 820px) {
          .hl-book-feature { grid-template-columns: 1fr !important; }
          .hl-book-feature .hl-book-photo-cell { min-height: 320px !important; }
        }
        @media (max-width: 560px) { .hl-how-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}
