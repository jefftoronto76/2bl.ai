'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Sparkles, BookOpen } from 'lucide-react';

const steps = [
  {
    icon: Mic,
    label: 'CAPTURE',
    description: 'Guided voice and text conversations that draw stories out — chapter by chapter, memory by memory.',
  },
  {
    icon: Sparkles,
    label: 'SHAPE',
    description: 'AI acts as your editor. It drafts, organizes, and refines — you approve every word.',
  },
  {
    icon: BookOpen,
    label: 'PUBLISH',
    description: 'A formatted, print-ready manuscript delivered as a physical book and a mobile-accessible keepsake.',
  },
];

const stepDelays = ['delay-[200ms]', 'delay-[350ms]', 'delay-[500ms]'];

export function WhatIsHeirloomSection() {
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

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
      id="what-is-heirloom"
      className="py-20 sm:py-24 md:py-36 bg-background"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-12">
        <div
          className={`text-center mb-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <span className="block font-body text-base font-semibold uppercase tracking-widest text-accent mb-8">
            What Is Heirloom
          </span>
          <h2 className="font-display font-light leading-tight mx-auto max-w-3xl text-text-primary text-2xl sm:text-3xl md:text-5xl lg:text-6xl">
            An AI-guided platform that helps people capture, shape, and publish their life story — as a real, printed book.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4 items-stretch">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.label}
                className={`h-full flex flex-col transition-all duration-700 ${stepDelays[i]} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              >
                <div className="h-px mb-8 bg-accent/45" />
                <div className="h-full flex-1 rounded-xl p-6 sm:p-8 bg-surface border border-border">
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-6 bg-accent/20">
                    <Icon size={24} className="text-accent" strokeWidth={1.75} />
                  </div>
                  <p className="font-body text-base font-semibold uppercase tracking-widest text-accent mb-4">
                    {step.label}
                  </p>
                  <p className="font-body leading-relaxed text-text-muted text-base md:text-lg">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
