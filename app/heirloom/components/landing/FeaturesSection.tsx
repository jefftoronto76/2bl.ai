'use client';

import { useEffect, useRef, useState } from 'react';

export function FeaturesSection() {
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.15 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="features"
      className="bg-background py-16 sm:py-20 md:py-32"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-12">
        <div className="flex flex-col md:flex-row md:items-center gap-12 md:gap-16 lg:gap-24">

          <div
            className={`flex-1 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            <span className="block font-body text-base font-semibold uppercase tracking-widest text-accent mb-6">
              The Insight
            </span>

            <h2 className="font-display font-light leading-tight mb-6 text-text-primary text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
              Every life has a story.{' '}
              <span className="text-accent">
                Most of them disappear.
              </span>
            </h2>

            <p className="font-body text-text-muted leading-relaxed max-w-lg text-base md:text-lg">
              The stories that shaped us — an early immigration, a quiet
              sacrifice, a life fully lived — are told once, imperfectly remembered,
              and eventually lost. Not because they weren't worth keeping. Because
              no one made it easy to keep them.
            </p>
          </div>

          <div
            className={`flex-1 flex justify-center md:justify-end transition-all duration-700 delay-200 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            <div className="relative w-full max-w-sm md:max-w-md rounded-2xl px-8 sm:px-10 py-10 sm:py-12 shadow-2xl bg-surface border border-border">
              <div className="absolute -top-5 left-8 font-display text-6xl leading-none select-none text-accent/60">
                &ldquo;
              </div>

              <blockquote className="font-display italic leading-relaxed mb-8 text-text-primary text-xl sm:text-2xl md:text-3xl">
                "I always meant to ask her more questions."
              </blockquote>

              <p className="font-body text-base text-accent">
                — heard too often, afterwards
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
