'use client';

import { useEffect, useState } from 'react';
import { LandingNav } from './LandingNav';
import { FeaturesSection } from './FeaturesSection';
import { WhatIsHeirloomSection } from './WhatIsHeirloomSection';
import { HowItWorksSection } from './HowItWorksSection';
import { ContributorModelSection } from './ContributorModelSection';
import { TestimonialsSection } from './TestimonialsSection';
import { BuyerPersonasSection } from './BuyerPersonasSection';
import { PricingSection } from './PricingSection';
import { AddOnsSection } from './AddOnsSection';
import { CtaSection } from './CtaSection';
import { Footer } from './Footer';
import { useChatStore } from '../store/chatStore';

function HeroSection() {
  const { dispatch } = useChatStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-hero-glow" />
      <div className="absolute inset-0 opacity-[0.04] bg-pattern-dots" />

      <div className="relative z-10 text-center px-4 sm:px-6 max-w-4xl mx-auto flex flex-col items-center">
        <div
          className={`transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <h1 className="font-display font-light text-text-primary leading-none mb-6 tracking-tight text-5xl sm:text-6xl md:text-7xl">
            Heirloom
          </h1>
        </div>

        <div
          className={`transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <p className="font-display italic text-accent mb-6 text-lg sm:text-xl md:text-2xl">
            Every life deserves to be a book.
          </p>
        </div>

        <div
          className={`transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <p className="font-body text-text-muted text-base md:text-lg mb-10 md:mb-12 leading-relaxed max-w-xl">
            AI-guided biography platform — from first memory to printed book.
          </p>
        </div>

        <div
          className={`flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto transition-all duration-700 delay-[400ms] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <button
            onClick={() => dispatch({ type: 'OPEN_CHAT' })}
            className="w-full sm:w-auto bg-accent hover:bg-accent-hover active:bg-accent-hover text-background font-body font-semibold text-base px-8 py-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-accent/30 hover:shadow-xl hover:-translate-y-0.5"
          >
            Start Your Story
          </button>

          <button
            onClick={() => {
              document.getElementById('learn-more')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="w-full sm:w-auto border border-accent/50 hover:border-accent text-accent hover:text-text-primary hover:bg-accent/10 font-body font-semibold text-base px-8 py-4 rounded-xl transition-all duration-200"
          >
            Learn More
          </button>
        </div>
      </div>

      <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-2 animate-bounce">
          <div className="w-6 h-10 rounded-full border-2 border-accent/40 flex items-start justify-center pt-2">
            <div className="w-1 h-2 bg-accent/60 rounded-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    <div>
      <LandingNav />
      <HeroSection />
      <div id="learn-more">
        <FeaturesSection />
      </div>
      <WhatIsHeirloomSection />
      <HowItWorksSection />
      <ContributorModelSection />
      <TestimonialsSection />
      <BuyerPersonasSection />
      <PricingSection />
      <AddOnsSection />
      <CtaSection />
      <Footer />
    </div>
  );
}
