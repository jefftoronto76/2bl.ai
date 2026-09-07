'use client';

/*
  BuyerPersonasSection → "Every story deserves to be told." — five audience
  cards on a 6-column grid. Ported from the design reference's Personas():
  "Design Handovers/ Aug 2026 Atomic Updates/13_Heirloom_lander_nav_updateV4/
  Heirloom Lander - Summer 2026 - Story Canvas.html" (~lines 775-814).

  Layout (ported exactly — it is a deliberate asymmetric grid, not a simple
  5-up): every card spans 2 of 6 columns, so rows 1 hold cards 1-3; the 4th
  card is offset to start at column 2 (`colStart` → `hl-p-col-2`) so the
  two remaining cards sit centred under the first row. Below 920px the grid
  collapses to a single column and the offset is cleared.

  Copy note: the "Legacy" tag chip on "The Individual" card is the common
  word (memoir / retirement / legacy), NOT the old brand name — it stays.

  Token mapping from the reference (var(--hl-*) → real tokens):
    --hl-bg          → rgb(var(--color-background))
    --hl-surface     → rgb(var(--color-surface))
    --hl-text        → rgb(var(--color-text-primary))
    --hl-muted       → var(--color-text-muted)
    --hl-border      → var(--color-border)
    --hl-accent      → rgb(var(--color-accent))
    --hl-accent-soft → rgb(var(--color-accent) / 0.13)
    --hl-accent-line → rgb(var(--color-accent) / 0.3)
    --font-display / --font-mono → Tailwind `font-display` / `font-mono`
  Reference `.reveal` / `.reveal.in` → same classes, defined once in globals.css
  (shared with the other Story Canvas section ports).
  Reference <Icon name=…> → lucide-react (same pattern as HeroSection.tsx).

  Presentational only — no chat wiring in this section.
*/

import { BookOpen, Clock, Heart, Gift, Users, Briefcase, Calendar, Building2, Landmark, type LucideIcon } from 'lucide-react';
import { useReveal } from './useReveal';
import { Eyebrow } from './Eyebrow';

type Tag = { icon: LucideIcon; label: string };
type Buyer = { t: string; tag: string; d: string; tags: Tag[] };

const buyers: Buyer[] = [
  { t: 'The Individual', tag: 'For yourself', d: 'Your life is full of stories worth telling. Capture the moments, people, places and experiences that made it yours.', tags: [{ icon: BookOpen, label: 'Memoir' }, { icon: Clock, label: 'Retirement' }, { icon: Heart, label: 'Legacy' }] },
  { t: 'The Family', tag: 'For the ones you love', d: 'Every family has stories worth sharing. Bring together the memories, voices and moments that make yours unique.', tags: [{ icon: Heart, label: 'Aging parent' }, { icon: BookOpen, label: 'Family historian' }, { icon: Gift, label: 'Gift occasion' }] },
  { t: 'The Parents', tag: "For your children's children", d: 'Childhood moves quickly. Capture the adventures, milestones and everyday moments that make these years their own.', tags: [{ icon: Gift, label: 'Baby milestone' }, { icon: BookOpen, label: 'Family tradition' }, { icon: Heart, label: 'Future keepsake' }] },
  { t: 'The Group', tag: 'For the people you did life with', d: 'Road trips. Seasons. Years of showing up for each other. Some stories are better told together. Let your whole group contribute.', tags: [{ icon: Users, label: 'Friends' }, { icon: Briefcase, label: 'Teams' }, { icon: Calendar, label: 'Reunions' }] },
  { t: 'The Organization', tag: 'For the moments that matter most', d: 'Celebrate the people, moments and milestones that shaped your organization. Bring those stories together in one place.', tags: [{ icon: Building2, label: 'Funeral homes' }, { icon: Briefcase, label: 'Companies' }, { icon: Landmark, label: 'Institutions' }] },
];

// Reference: const colStart = ['', '', '', 'p-col-2', ''] — only the 4th card is offset.
const colStart = ['', '', '', 'hl-p-col-2', ''];

const ACCENT = 'rgb(var(--color-accent))';
const ACCENT_SOFT = 'rgb(var(--color-accent) / 0.13)';
const ACCENT_LINE = 'rgb(var(--color-accent) / 0.3)';

export function BuyerPersonasSection() {
  const [ref, seen] = useReveal<HTMLElement>();

  return (
    <section
      ref={ref}
      id="personas"
      data-screen-label="Every story deserves to be told"
      style={{ padding: 'clamp(80px,12vw,150px) 24px', background: 'rgb(var(--color-background))' }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div className={'reveal' + (seen ? ' in' : '')} style={{ textAlign: 'center', marginBottom: 60 }}>
          <Eyebrow style={{ marginBottom: 24 }}>Who We&rsquo;re Building For</Eyebrow>
          <h2 className="font-display" style={{ fontWeight: 300, fontSize: 'clamp(34px,5vw,66px)', lineHeight: 1.08, letterSpacing: '-.01em', color: 'rgb(var(--color-text-primary))', margin: 0 }}>
            Every story deserves to be told.
          </h2>
        </div>

        <div className="hl-personas-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 18 }}>
          {buyers.map((b, i) => (
            <div
              key={b.t}
              className={['reveal', colStart[i], seen ? 'in' : ''].filter(Boolean).join(' ')}
              style={{
                gridColumn: colStart[i] === 'hl-p-col-2' ? '2 / span 2' : 'span 2',
                animationDelay: (0.14 + i * 0.1) + 's',
                background: 'rgb(var(--color-surface))',
                border: '1px solid var(--color-border)',
                borderTop: `3px solid ${ACCENT_LINE}`,
                borderRadius: 18,
                padding: 'clamp(24px,3vw,32px)',
                display: 'flex',
                flexDirection: 'column',
                gap: 18,
                height: '100%',
              }}
            >
              <div>
                <h3 className="font-display" style={{ fontWeight: 500, fontSize: 26, lineHeight: 1.15, color: 'rgb(var(--color-text-primary))', margin: 0 }}>{b.t}</h3>
                <p className="font-display" style={{ fontStyle: 'italic', fontSize: 17, color: ACCENT, margin: '4px 0 0' }}>{b.tag}</p>
              </div>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--color-text-muted)', margin: 0, flex: 1 }}>{b.d}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {b.tags.map(({ icon: Icon, label }) => (
                  <span
                    key={label}
                    className="font-mono"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontSize: 11, letterSpacing: '.04em', background: ACCENT_SOFT, color: ACCENT, border: `1px solid ${ACCENT_LINE}` }}
                  >
                    <Icon size={12} strokeWidth={1.75} aria-hidden="true" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .hl-personas-grid .hl-p-col-2 { grid-column: 2 / span 2; }
        @media (max-width: 920px) {
          .hl-personas-grid { grid-template-columns: 1fr !important; }
          .hl-personas-grid > div { grid-column: auto !important; }
        }
      `}</style>
    </section>
  );
}
