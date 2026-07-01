'use client';

/*
  FeaturesSection → "Built to make your stories shine" — lead craft card + a
  2×2 grid (two features, a security card that links out, and a "live editor"
  coming-soon teaser with a persisted vote).

  Preserved: hl.liveEditorVote localStorage key. Presentational only (no chat).
*/

import { useEffect, useRef, useState, useCallback } from 'react';
import { Feather, MessageCircle, Clock, Shield, PenLine, Heart, type LucideIcon } from 'lucide-react';

const featureCards: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: MessageCircle, title: 'Questions that draw it out', body: 'Legacy interviews you like a patient biographer — following the thread, asking the one more question that surfaces the detail only you would remember.' },
  { icon: Clock, title: "It remembers, even if you don't", body: "Share the dates that matter and Legacy nudges you when they come around — capturing the story while it's still close." },
];

export function FeaturesSection() {
  const [visible, setVisible] = useState(false);
  const [voted, setVoted] = useState(false);
  const [count, setCount] = useState(247);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 },
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem('hl.liveEditorVote') === '1') { setVoted(true); setCount(248); }
    } catch { /* storage unavailable */ }
  }, []);

  const handleVote = useCallback(() => {
    if (voted) return;
    setVoted(true);
    setCount((c) => c + 1);
    try { localStorage.setItem('hl.liveEditorVote', '1'); } catch { /* storage unavailable */ }
  }, [voted]);

  return (
    <section ref={sectionRef} id="best-parts" className="py-20 sm:py-24 md:py-36 bg-background scroll-mt-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-12">
        <div className={`text-center mb-14 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <span className="block font-mono text-xs uppercase tracking-[0.3em] text-accent mb-6">Changing the way memories are saved and shared.</span>
          <h2 className="font-display font-light text-text-primary leading-[1.12] tracking-tight" style={{ fontSize: 'clamp(30px, 4.6vw, 60px)' }}>Built to make your stories shine</h2>
        </div>

        {/* Lead card */}
        <div className={`rounded-[20px] bg-surface border border-accent/25 mb-[18px] flex flex-wrap items-center gap-7 transition-all duration-700 delay-[120ms] ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ padding: 'clamp(28px, 4vw, 44px)' }}>
          <span className="shrink-0 flex items-center justify-center bg-accent/10 text-accent" style={{ width: 68, height: 68, borderRadius: 17 }}>
            <Feather size={30} strokeWidth={1.5} />
          </span>
          <div className="flex-1 min-w-0 basis-80">
            <span className="block font-mono text-[10px] uppercase tracking-[0.28em] text-accent mb-3">Storytelling, built in</span>
            <h3 className="font-display font-medium text-text-primary mb-3.5 leading-[1.12]" style={{ fontSize: 'clamp(26px, 3.2vw, 36px)' }}>You don&rsquo;t have to be a writer.</h3>
            <p className="font-body text-text-muted max-w-[620px]" style={{ fontSize: 17, lineHeight: 1.64 }}>
              Most memories come out as fragments. Legacy shapes them into stories — using the structures great storytellers lean on, the arc that carries a reader from an ordinary moment to the one that changed everything. You bring the memory; Legacy helps it become a story worth rereading.
            </p>
          </div>
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px]">
          {featureCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className={`rounded-[18px] bg-surface border border-border p-[30px] transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ transitionDelay: `${200 + i * 100}ms` }}>
                <span className="flex items-center justify-center bg-accent/10 text-accent mb-[22px]" style={{ width: 50, height: 50, borderRadius: 13 }}>
                  <Icon size={23} strokeWidth={1.5} />
                </span>
                <h3 className="font-display font-medium text-text-primary mb-2.5 leading-[1.16]" style={{ fontSize: 25 }}>{card.title}</h3>
                <p className="font-body text-text-muted" style={{ fontSize: 16, lineHeight: 1.6 }}>{card.body}</p>
              </div>
            );
          })}

          {/* Secure & responsible — links out (route TBD) */}
          <a
            href="#"
            className={`rounded-[18px] bg-surface border border-border p-[30px] block no-underline hover:border-accent/40 transition-all duration-700 delay-[400ms] ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            aria-label="Learn more about our security and responsible AI practices"
          >
            <span className="flex items-center justify-center bg-accent/10 text-accent mb-[22px]" style={{ width: 50, height: 50, borderRadius: 13 }}>
              <Shield size={23} strokeWidth={1.5} />
            </span>
            <h3 className="font-display font-medium text-text-primary mb-2.5 leading-[1.16]" style={{ fontSize: 25 }}>Secure &amp; responsible</h3>
            <p className="font-body text-text-muted" style={{ fontSize: 16, lineHeight: 1.6 }}>
              Legacy is built to support the most rigorous security standards and privacy for your data. <span className="text-accent font-medium">Learn more&nbsp;→</span>
            </p>
          </a>

          {/* Live editor teaser + vote */}
          <div className={`rounded-[18px] bg-surface border border-dashed border-accent/40 p-[30px] relative overflow-hidden transition-all duration-700 delay-[500ms] ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
              <span className="flex items-center justify-center bg-accent/10 text-accent" style={{ width: 50, height: 50, borderRadius: 13 }}>
                <PenLine size={23} strokeWidth={1.5} />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent border border-accent/25 px-2.5 py-1 rounded-full">Coming soon</span>
            </div>
            <h3 className="font-display font-medium text-text-primary mb-2.5 leading-[1.16]" style={{ fontSize: 25 }}>A live editor</h3>
            <p className="font-body text-text-muted mb-5" style={{ fontSize: 16, lineHeight: 1.6 }}>
              For the hands-on writers — shape the prose yourself, line by line, editing side by side with Legacy in real time.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleVote}
                disabled={voted}
                aria-pressed={voted}
                aria-label={voted ? 'You voted for this feature' : 'I want this sooner'}
                className={`flex items-center gap-2.5 font-mono text-[13px] font-medium px-4 rounded-full border transition-colors min-h-[44px] ${
                  voted
                    ? 'bg-accent/10 border-accent text-accent cursor-default'
                    : 'border-border text-text-muted hover:border-accent/40 hover:text-accent'
                }`}
              >
                <Heart size={17} fill={voted ? 'currentColor' : 'none'} strokeWidth={1.5} />
                <span>{count}</span>
              </button>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-dim">{voted ? 'Thanks!' : 'Want it sooner?'}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
