'use client';

/*
  HowItWorksSection → repurposed to "It becomes a book." — the book centerpiece
  (payoff of the capture→publish flow) plus the other output formats.
  No chat wiring here (presentational only).
*/

import { useEffect, useRef, useState } from 'react';
import { Bookmark, LayoutGrid, Monitor, Headphones, Clock, type LucideIcon } from 'lucide-react';

const otherFormats: { icon: LucideIcon; name: string; body: string }[] = [
  { icon: LayoutGrid, name: 'The Comic', body: 'Illustrated panels that bring the moments to life.' },
  { icon: Monitor, name: 'The Webpage', body: 'A living digital edition with shareable links.' },
  { icon: Headphones, name: 'The Audiobook', body: 'Narrated and ready for the platforms people already use.' },
  { icon: Clock, name: 'The Time Capsule', body: 'Sealed today, unlocked on a date you choose.' },
];

function BookCover() {
  return (
    <div className="relative" style={{ width: 280, height: 380 }} aria-hidden>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface border border-accent/25" style={{ borderRadius: 8, padding: 28 }}>
        <div className="absolute border border-accent/25 pointer-events-none" style={{ inset: 14, borderRadius: 4 }} />
        <span className="font-mono uppercase text-accent" style={{ fontSize: 10, letterSpacing: '.35em', marginBottom: 18 }}>A Life In</span>
        <span className="font-display italic text-text-primary text-center" style={{ fontSize: 44, lineHeight: 1 }}>Legacy</span>
        <div className="bg-accent/25" style={{ width: 40, height: 1, margin: '20px 0' }} />
        <span className="font-display text-text-muted" style={{ fontSize: 17 }}>Volume One</span>
        <span className="absolute text-accent" style={{ bottom: 26 }}><Bookmark size={20} strokeWidth={1.5} /></span>
      </div>
    </div>
  );
}

export function HowItWorksSection() {
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 },
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} id="how-it-works" data-screen-label="How It Works" className="py-20 sm:py-24 md:py-36 bg-surface border-y border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-12">
        <div className={`text-center mb-5 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <span className="block font-mono text-xs uppercase tracking-[0.3em] text-accent mb-5">The Legacy</span>
          <h2 className="font-display font-light text-text-primary leading-[1.05]" style={{ fontSize: 'clamp(34px, 5vw, 66px)' }}>It becomes a book.</h2>
        </div>
        <p className={`font-body text-text-muted text-center max-w-[600px] mx-auto mb-14 transition-all duration-700 delay-[120ms] ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ fontSize: 18, lineHeight: 1.6 }}>
          A real one, in your hands. And when you want to, the same story can live on in other forms too.
        </p>

        {/* Book centerpiece */}
        <div className={`hl-book-grid rounded-[24px] bg-background border border-accent/25 mb-14 transition-all duration-700 delay-200 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ padding: 'clamp(30px, 4.5vw, 60px)' }}>
          <div className="hl-book-copy">
            <span className="block font-mono text-[10px] uppercase tracking-[0.26em] text-accent mb-3">The centerpiece</span>
            <h3 className="font-display font-normal text-text-primary mb-4 leading-none" style={{ fontSize: 'clamp(40px, 6vw, 68px)' }}>The Book</h3>
            <p className="font-body text-text-muted mb-7 max-w-[480px]" style={{ fontSize: 'clamp(17px, 2vw, 20px)', lineHeight: 1.62 }}>
              Printed, bound, and delivered to your door — the whole story as a hardcover keepsake, made to live on a shelf and be handed down for generations.
            </p>
            <div className="flex flex-wrap gap-3.5">
              {['Hardcover / paperback', 'On-demand'].map((tag) => (
                <span key={tag} className="inline-flex items-center gap-2 font-mono text-xs text-text-primary border border-accent/25 rounded-full px-3.5 py-2 bg-accent/10" style={{ letterSpacing: '.06em' }}>
                  <span className="rounded-full bg-accent" style={{ width: 5, height: 5 }} />
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="hl-book-visual flex items-center justify-center">
            <BookCover />
          </div>
        </div>

        {/* Other formats */}
        <div className={`flex items-center gap-4 mb-6 transition-all duration-700 delay-[280ms] ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-dim whitespace-nowrap">Other ways to share it</span>
          <span className="flex-1 h-px bg-border" />
        </div>
        <div className="hl-format-grid">
          {otherFormats.map((fmt, i) => {
            const Icon = fmt.icon;
            return (
              <div key={fmt.name} className={`rounded-2xl bg-background border border-border transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ padding: '24px 22px', transitionDelay: `${340 + i * 80}ms` }}>
                <div className="flex items-center justify-center bg-accent/10 text-accent" style={{ width: 44, height: 44, borderRadius: 12, marginBottom: 18 }}>
                  <Icon size={21} strokeWidth={1.5} />
                </div>
                <p className="font-display font-medium text-text-primary mb-2" style={{ fontSize: 22 }}>{fmt.name}</p>
                <p className="font-body text-text-muted" style={{ fontSize: 15, lineHeight: 1.55 }}>{fmt.body}</p>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .hl-book-grid { display: grid; grid-template-columns: 1fr; gap: 2.5rem; align-items: center; }
        .hl-book-copy { order: 2; text-align: center; }
        .hl-book-visual { order: 1; }
        .hl-book-copy p { margin-left: auto; margin-right: auto; }
        @media (min-width: 821px) {
          .hl-book-grid { grid-template-columns: 1.05fr 0.95fr; gap: clamp(32px, 5vw, 64px); }
          .hl-book-copy { order: 0; text-align: left; }
          .hl-book-copy p { margin-left: 0; margin-right: 0; }
          .hl-book-visual { order: 0; }
        }
        .hl-format-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
        @media (min-width: 561px) { .hl-format-grid { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 921px) { .hl-format-grid { grid-template-columns: repeat(4, 1fr); } }
      `}</style>
    </section>
  );
}
