'use client';

/*
  WhatIsHeirloomSection → "Through conversation…".
  Keeps id="what-is-heirloom" (nav "About" target + preserved anchor).
  Repo reveal idiom: local `visible` state + IntersectionObserver + transition-all.
*/

import { useEffect, useRef, useState } from 'react';
import { Mic, Sparkles, BookOpen, type LucideIcon } from 'lucide-react';

const steps: { index: string; icon: LucideIcon; label: string; description: string }[] = [
  { index: '1', icon: Mic, label: 'Capture', description: 'Start with a memory, a photo, or a voice note. Invite others to deepen the story.' },
  { index: '2', icon: Sparkles, label: 'Shape', description: "Legacy's storytelling engine helps you uncover what matters most and tell it well." },
  { index: '3', icon: BookOpen, label: 'Publish', description: 'Give those stories a form that can be shared, revisited, and passed along.' },
];

const stepDelays = ['delay-[150ms]', 'delay-[280ms]', 'delay-[410ms]'];

export function WhatIsHeirloomSection() {
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
    <section ref={sectionRef} id="what-is-heirloom" data-screen-label="What Is Heirloom" className="py-20 sm:py-24 md:py-36 bg-background scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-12">
        <div className={`text-center mb-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <span className="block font-mono text-xs uppercase tracking-[0.3em] text-accent mb-6">Create Your Legacy</span>
          <h2 className="font-display font-light text-text-primary mx-auto max-w-2xl leading-[1.12] tracking-tight" style={{ fontSize: 'clamp(30px, 4.6vw, 60px)' }}>
            Through conversation, Legacy helps give your memories a future.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] items-stretch">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className={`h-full flex flex-col transition-all duration-700 ${stepDelays[i]} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="h-px mb-7 bg-accent/25" />
                <div className="relative h-full flex-1 overflow-hidden rounded-2xl bg-surface border border-border p-7 sm:p-8">
                  <span className="absolute top-4 right-5 font-display leading-none select-none pointer-events-none text-accent/10" style={{ fontSize: 60 }} aria-hidden>
                    {step.index}
                  </span>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-accent/10 text-accent">
                    <Icon size={24} strokeWidth={1.5} />
                  </div>
                  <p className="font-mono text-xs uppercase tracking-[0.26em] text-accent mb-3.5">{step.label}</p>
                  <p className="font-body text-text-muted leading-relaxed" style={{ fontSize: 17 }}>{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
