'use client';

/*
  FeaturesSection → "Built to make your stories shine" — lead craft card + a
  2×2 grid (two features, a security card that links out, and a "live editor"
  coming-soon teaser). Presentational only (no chat). Ported from the design
  reference: "Design Handovers/ Aug 2026 Atomic Updates/13_Heirloom_lander_nav_updateV4/
  Heirloom Lander - Summer 2026 - Story Canvas.html" (BestParts(), ~lines 702-772).

  The reference's "live editor" card hand-rolls its own liked/likes state +
  localStorage logic, duplicating SoonVote. That duplication is not ported —
  <SoonVote storageKey="hl.liveEditorVote" initial={247} /> is used instead,
  same as every other coming-soon vote widget on this page.
*/

import { Feather, MessageCircle, Clock, Shield, Pencil, type LucideIcon } from 'lucide-react';
import { useReveal } from './useReveal';
import { Eyebrow } from './Eyebrow';
import { SoonVote } from './SoonVote';

const featureCards: { icon: LucideIcon; title: string; body: string; soon?: boolean }[] = [
  { icon: MessageCircle, title: 'Questions that draw it out', body: 'A good question can bring back the part you forgot you remembered. Follow the conversation, add the details, and let the story grow naturally.' },
  { icon: Clock, title: "It remembers, even if you don't", body: 'Share the dates and moments that matter, and get a reminder when they come around.', soon: true },
];

export function FeaturesSection() {
  const [ref, seen] = useReveal();

  return (
    <section ref={ref} id="best-parts" data-screen-label="The Best Parts" className="py-20 sm:py-24 md:py-36 bg-background scroll-mt-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-12">
        <div className={`text-center mb-14 transition-all duration-700 ${seen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <Eyebrow style={{ marginBottom: 26 }}>Changing the way memories are saved and shared.</Eyebrow>
          <h2 className="font-display font-light text-text-primary leading-[1.12] tracking-tight" style={{ fontSize: 'clamp(30px, 4.6vw, 60px)' }}>Built to make your stories shine</h2>
        </div>

        {/* Lead card */}
        <div className={`rounded-[20px] bg-surface border border-accent/30 mb-[18px] flex flex-wrap items-center gap-7 transition-all duration-700 delay-[120ms] ${seen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ padding: 'clamp(28px, 4vw, 44px)' }}>
          <span className="shrink-0 flex items-center justify-center bg-accent/[0.13] text-accent" style={{ width: 68, height: 68, borderRadius: 17 }}>
            <Feather size={30} strokeWidth={1.5} />
          </span>
          <div className="flex-1 min-w-0 basis-80">
            <Eyebrow style={{ fontSize: 12, letterSpacing: '.26em', marginBottom: 12 }}>Storytelling, built in</Eyebrow>
            <h3 className="font-display font-medium text-text-primary mb-3.5 leading-[1.12]" style={{ fontSize: 'clamp(26px, 3.2vw, 36px)' }}>You don&rsquo;t have to be a writer.</h3>
            <p className="font-body text-text-muted max-w-[620px]" style={{ fontSize: 17, lineHeight: 1.64 }}>
              Most memories come out as fragments. Heirloom shapes them into stories — using the structures great storytellers lean on, the arc that carries a reader from an ordinary moment to the one that changed everything. You bring the memory; Heirloom helps it become a story worth rereading.
            </p>
          </div>
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px]">
          {featureCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className={`rounded-[18px] bg-surface border border-border p-[30px] transition-all duration-700 ${seen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ transitionDelay: `${200 + i * 100}ms` }}>
                <span className="flex items-center justify-center bg-accent/[0.13] text-accent mb-[22px]" style={{ width: 50, height: 50, borderRadius: 13 }}>
                  <Icon size={23} strokeWidth={1.5} />
                </span>
                <h3 className="font-display font-medium text-text-primary mb-2.5 leading-[1.16] flex items-center gap-2.5 flex-wrap" style={{ fontSize: 25 }}>
                  {card.title}
                  {card.soon && (
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] border border-border rounded-full px-[9px] py-[3px] font-medium" style={{ color: 'rgb(var(--color-text-dim))' }}>
                      Coming soon
                    </span>
                  )}
                </h3>
                <p className="font-body text-text-muted" style={{ fontSize: 16, lineHeight: 1.6 }}>{card.body}</p>
                {card.soon && <SoonVote storageKey="hl.rememberVote" initial={183} />}
              </div>
            );
          })}

          {/* Secure & responsible — links out (route TBD) */}
          <a
            href="#"
            className={`rounded-[18px] bg-surface border border-border p-[30px] block no-underline hover:border-accent/40 transition-all duration-700 delay-[400ms] ${seen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            aria-label="Learn more about our security and responsible AI practices"
          >
            <span className="flex items-center justify-center bg-accent/[0.13] text-accent mb-[22px]" style={{ width: 50, height: 50, borderRadius: 13 }}>
              <Shield size={23} strokeWidth={1.5} />
            </span>
            <h3 className="font-display font-medium text-text-primary mb-2.5 leading-[1.16]" style={{ fontSize: 25 }}>Secure &amp; responsible</h3>
            <p className="font-body text-text-muted" style={{ fontSize: 16, lineHeight: 1.6 }}>
              Your stories are personal. They should stay that way. Built with privacy and security at the centre. <span className="text-accent font-medium">Learn more&nbsp;→</span>
            </p>
          </a>

          {/* Live editor teaser + vote */}
          <div className={`rounded-[18px] bg-surface border border-dashed border-accent/30 p-[30px] relative overflow-hidden transition-all duration-700 delay-[500ms] ${seen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="flex items-center justify-center bg-accent/[0.13] text-accent mb-[22px]" style={{ width: 50, height: 50, borderRadius: 13 }}>
              <Pencil size={23} strokeWidth={1.5} />
            </span>
            <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
              <h3 className="font-display font-medium text-text-primary leading-[1.16]" style={{ fontSize: 25, margin: 0 }}>A live editor</h3>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent border border-accent/30 rounded-full px-[10px] py-1">Coming soon</span>
            </div>
            <p className="font-body text-text-muted" style={{ fontSize: 16, lineHeight: 1.6 }}>
              Want another set of eyes? Get hands-on help shaping, editing, and finishing your story from a professional editor.
            </p>
            <SoonVote storageKey="hl.liveEditorVote" initial={247} />
          </div>
        </div>
      </div>
    </section>
  );
}
