'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

export function CtaSection() {
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const { dispatch } = useChatStore();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="cta"
      className="py-20 sm:py-24 md:py-40 bg-cta-glow"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <div
          className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <h2 className="font-display font-light text-text-primary mb-6 leading-tight text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
            Your story deserves to be told.
          </h2>
          <p className="font-body text-text-muted leading-relaxed mb-10 max-w-xl mx-auto text-base md:text-lg">
            Don't let your memories disappear. Start capturing them today with Heirloom's AI-guided platform.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <button
              type="button"
              onClick={() => dispatch({ type: 'OPEN_CHAT' })}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 font-body font-semibold px-8 sm:px-9 py-4 rounded-xl transition-all text-base hover:bg-accent-hover active:scale-95 bg-accent text-background"
            >
              Start Your Book
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 font-body font-semibold px-8 sm:px-9 py-4 rounded-xl transition-all text-base hover:bg-accent/10 active:scale-95 bg-transparent text-accent border border-accent/45"
            >
              Schedule a Demo
            </button>
          </div>

          <div className="border-t mx-auto mb-14 max-w-xl border-border" />

          <p className="font-display italic text-accent mb-3 text-xl md:text-2xl">
            Every life deserves to be a book.
          </p>
          <p className="font-body text-text-muted text-base tracking-wide">
            Heirloom · April 2026
          </p>
        </div>
      </div>
    </section>
  );
}
