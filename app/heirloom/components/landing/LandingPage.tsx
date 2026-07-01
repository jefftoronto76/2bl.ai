'use client';

/*
  LandingPage — composes the redesigned storefront.

  The Hero is the ONE merged piece: its "Start Your Story" keeps the production
  chat activation — dispatch({ type: 'OPEN_CHAT' }) from useChatStore — exactly as
  the live HeroSection. Layout/copy is the new "formats" design (eyebrow, Legacy
  wordmark, format-fan visual, single CTA). Everything below the Hero is a fresh
  presentational section; only Pricing / Cta re-open the chat via the same dispatch.

  Section order:
  Nav → Hero → WhatIs → HowItWorks(book) → ContributorModel → Features(best parts)
      → BuyerPersonas → Pricing → Cta(closing) → Footer
*/

import { useEffect, useState } from 'react';
import { BookOpen, Monitor, Headphones, LayoutGrid, Clock, type LucideIcon } from 'lucide-react';
import { useChatStore } from '@/components/shells/membership/chatStore';
import { LandingNav } from './LandingNav';
import { WhatIsHeirloomSection } from './WhatIsHeirloomSection';
import { HowItWorksSection } from './HowItWorksSection';
import { ContributorModelSection } from './ContributorModelSection';
import { FeaturesSection } from './FeaturesSection';
import { BuyerPersonasSection } from './BuyerPersonasSection';
import { PricingSection } from './PricingSection';
import { CtaSection } from './CtaSection';
import { Footer } from './Footer';

// ─── Hero visual: format fan ──────────────────────────────────────────────

const FORMAT_ITEMS: { Icon: LucideIcon; name: string; tag: string; top: number; angle: number }[] = [
  { Icon: BookOpen, name: 'The Book', tag: 'Printed & bound', top: 4, angle: -2.4 },
  { Icon: Monitor, name: 'The Webpage', tag: 'A living digital edition', top: 74, angle: 1.6 },
  { Icon: Headphones, name: 'The Audiobook', tag: 'Narrated in their own voice', top: 144, angle: -1.6 },
  { Icon: LayoutGrid, name: 'The Comic', tag: 'Illustrated panels', top: 214, angle: 2.4 },
  { Icon: Clock, name: 'The Time Capsule', tag: 'Sealed today, opened later', top: 284, angle: -2 },
];

function FormatFan() {
  return (
    <div className="relative" style={{ width: 340, height: 366 }} aria-hidden>
      {FORMAT_ITEMS.map((e, i) => {
        const Icon = e.Icon;
        return (
          <div
            key={e.name}
            className="absolute left-1/2 flex items-center gap-4 rounded-2xl bg-surface border border-accent/25"
            style={{ top: e.top, width: 300, height: 82, padding: '0 20px', transform: `translateX(-50%) rotate(${e.angle}deg)`, zIndex: i + 1 }}
          >
            <span className="shrink-0 flex items-center justify-center bg-accent/10 text-accent" style={{ width: 46, height: 46, borderRadius: 13 }}>
              <Icon size={22} strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex flex-col gap-1">
              <span className="font-display italic text-text-primary" style={{ fontSize: 23, lineHeight: 1 }}>{e.name}</span>
              <span className="font-mono uppercase text-text-muted whitespace-nowrap" style={{ fontSize: 9.5, letterSpacing: '.18em' }}>{e.tag}</span>
            </div>
            <span className="ml-auto font-mono text-accent/50" style={{ fontSize: 11 }}>0{i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Hero (merged — production chat activation preserved) ──────────────────

function HeroSection() {
  const { dispatch } = useChatStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const rise = (delay: string) =>
    `transition-all duration-700 ${delay} ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`;

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-background" aria-label="Hero">
      <div className="hl-hero-grid relative z-10 max-w-6xl w-full mx-auto px-4 sm:px-6 md:px-12 pt-32 pb-20">
        <div className="min-w-0">
          <p className={`font-mono text-xs uppercase tracking-[0.34em] text-accent mb-5 ${rise('delay-[80ms]')}`}>Private. Secure. Collaborative.</p>
          <h1 className={`font-display font-light text-text-primary leading-[0.95] tracking-tight ${rise('delay-100')}`} style={{ fontSize: 'clamp(56px, 8vw, 108px)' }}>Legacy</h1>
          <p className={`font-display italic text-accent mt-3 leading-snug ${rise('delay-200')}`} style={{ fontSize: 'clamp(16px, 4.2vw, 30px)' }}>Capture life as it happens.</p>
          <p className={`font-body text-text-muted mt-7 max-w-[520px] ${rise('delay-300')}`} style={{ lineHeight: 1.78, fontSize: 18 }}>
            <span className="hl-nowrap">The moments pass quickly. The stories behind them fade even faster.</span>{' '}
            Capture memories while they&rsquo;re fresh, and turn them into something you&rsquo;ll always have.
          </p>
          <div className={`flex flex-wrap items-center gap-4 mt-9 ${rise('delay-[400ms]')}`}>
            {/* ⚠️ production chat activation — unchanged */}
            <button
              type="button"
              onClick={() => dispatch({ type: 'OPEN_CHAT' })}
              className="bg-accent hover:bg-accent-hover text-background font-body text-base font-semibold px-7 rounded-[13px] transition-colors min-h-[52px] flex items-center"
            >
              Start Your Story
            </button>
          </div>
        </div>
        <div className={`hl-fan justify-center ${rise('delay-[320ms]')}`}>
          <FormatFan />
        </div>
      </div>

      <style>{`
        .hl-hero-grid { display: grid; grid-template-columns: 1fr; gap: 3rem; align-items: center; }
        .hl-fan { display: none; }
        @media (min-width: 921px) {
          .hl-hero-grid { grid-template-columns: 1.18fr 0.82fr; }
          .hl-fan { display: flex; }
        }
        .hl-nowrap { white-space: normal; }
        @media (min-width: 769px) { .hl-nowrap { white-space: nowrap; } }
      `}</style>
    </section>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-text-primary">
      <LandingNav />
      <HeroSection />
      <WhatIsHeirloomSection />
      <HowItWorksSection />
      <ContributorModelSection />
      <FeaturesSection />
      <BuyerPersonasSection />
      <PricingSection />
      <CtaSection />
      <Footer />
    </div>
  );
}

export default LandingPage;
