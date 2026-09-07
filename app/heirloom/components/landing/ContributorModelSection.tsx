'use client';

/*
  ContributorModelSection → "One story. Many voices." — contributor roles +
  key-principle card. Presentational only. Ported from the design reference:
  "Design Handovers/ Aug 2026 Atomic Updates/13_Heirloom_lander_nav_updateV4/
  Heirloom Lander - Summer 2026 - Story Canvas.html" (ContributorModel(),
  ~lines 663-699).
*/

import { User, Users, FileText, Image as ImageIcon, Share2, type LucideIcon } from 'lucide-react';
import { useReveal } from './useReveal';
import { Eyebrow } from './Eyebrow';
import { SoonVote } from './SoonVote';

const roles: { icon: LucideIcon; title: string; body: string; soon?: boolean }[] = [
  { icon: User, title: 'Owner / Author', body: 'Primary narrator. Owns the story arc and final approval.' },
  { icon: Users, title: 'Contributors', body: 'Family, friends, colleagues. Invited to add specific memories or perspectives.' },
  { icon: FileText, title: 'Documents', body: 'Letters, certificates, news clippings, records — uploaded and synthesized.' },
  { icon: ImageIcon, title: 'Media', body: 'Photos and home video, uploaded and woven directly into the story.' },
  { icon: Share2, title: 'Social', body: 'Facebook, Instagram — raw material pulled in automatically.', soon: true },
];

const roleDelays = ['delay-[140ms]', 'delay-[240ms]', 'delay-[340ms]', 'delay-[440ms]', 'delay-[540ms]'];

export function ContributorModelSection() {
  const [ref, seen] = useReveal();

  return (
    <section ref={ref} id="contributors" data-screen-label="One story. Many voices" className="py-20 sm:py-24 md:py-36 bg-surface border-y border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-12">
        <div className={`text-center mb-14 transition-all duration-700 ${seen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <Eyebrow style={{ marginBottom: 24 }}>The Contributor Model</Eyebrow>
          <h2 className="font-display font-light text-text-primary mb-6 leading-[1.08] tracking-tight" style={{ fontSize: 'clamp(34px, 5vw, 66px)' }}>One story. Many voices.</h2>
          <p className="font-body text-text-muted max-w-2xl mx-auto" style={{ fontSize: 18, lineHeight: 1.6 }}>
            Bring together the people, memories, photos, and moments that make a story whole.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-[16px] mb-6">
          {roles.map((role, i) => {
            const Icon = role.icon;
            return (
              <div key={role.title} className={`h-full rounded-2xl bg-background border border-border border-l-[3px] border-l-accent/30 p-7 transition-all duration-700 ${roleDelays[i]} ${seen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="flex items-center justify-center bg-accent/[0.13] text-accent mb-5" style={{ width: 48, height: 48, borderRadius: 13 }}>
                  <Icon size={21} strokeWidth={1.5} />
                </div>
                <h3 className="font-display font-medium text-text-primary mb-2.5 flex items-center gap-2.5 flex-wrap" style={{ fontSize: 22, lineHeight: 1.16 }}>
                  {role.title}
                  {role.soon && (
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] border border-border rounded-full px-[9px] py-[3px] font-medium whitespace-nowrap" style={{ color: 'rgb(var(--color-text-dim))' }}>
                      Coming soon
                    </span>
                  )}
                </h3>
                <p className="font-body text-text-muted" style={{ fontSize: 15.5, lineHeight: 1.6 }}>{role.body}</p>
                {role.soon && <SoonVote storageKey="hl.socialMediaVote" initial={94} />}
              </div>
            );
          })}
        </div>

        <div className={`rounded-2xl bg-accent/[0.13] border border-accent/30 transition-all duration-700 delay-[640ms] ${seen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ padding: 'clamp(28px, 4vw, 44px)' }}>
          <Eyebrow style={{ fontSize: 12, letterSpacing: '.26em', marginBottom: 22, opacity: 0.85 }}>Key Principle</Eyebrow>
          <p className="font-display italic text-text-primary mb-2 leading-[1.28]" style={{ fontSize: 'clamp(22px, 3vw, 34px)' }}>
            When two contributors remember the same moment differently — that&rsquo;s not a problem.
          </p>
          <p className="font-display italic text-accent mb-4 leading-[1.28]" style={{ fontSize: 'clamp(22px, 3vw, 34px)' }}>That&rsquo;s a feature.</p>
          <p className="font-body text-text-muted max-w-[640px]" style={{ fontSize: 16.5, lineHeight: 1.6 }}>
            Two perspectives on the same event can be one of the most compelling things in the book.
          </p>
        </div>
      </div>
    </section>
  );
}
