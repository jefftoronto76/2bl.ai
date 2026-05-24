'use client';

import { useEffect, useRef, useState } from 'react';

const steps = [
  {
    number: '01',
    title: 'Invite',
    description: 'Set up your project. Invite contributors — family, friends, colleagues.',
  },
  {
    number: '02',
    title: 'Capture',
    description: 'AI-guided voice or text interviews. Pull stories from multiple sources: social, photos, documents.',
  },
  {
    number: '03',
    title: 'Draft',
    description: 'AI composes blocks — scenes, chapters, moments. You approve or refine.',
  },
  {
    number: '04',
    title: 'Compile',
    description: 'Approved blocks assemble into a structured manuscript. You review the full arc.',
  },
  {
    number: '05',
    title: 'Publish',
    description: 'Print-on-demand book delivered. Mobile web version included.',
  },
];

const stepDelays = [
  'delay-[150ms]',
  'delay-[270ms]',
  'delay-[390ms]',
  'delay-[510ms]',
  'delay-[630ms]',
];

export function HowItWorksSection() {
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
      id="how-it-works"
      className="py-20 sm:py-24 md:py-36 bg-surface"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12">
        <div
          className={`text-center mb-16 md:mb-20 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <span className="block font-body text-base font-semibold uppercase tracking-widest text-accent mb-6">
            How It Works
          </span>
          <h2 className="font-display font-light text-text-primary leading-tight text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
            Five steps. One book.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className={`transition-all duration-700 ${stepDelays[i]} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
              <div className="h-1 rounded-full mb-6 bg-accent/50" />
              <div className="bg-background rounded-2xl p-6 sm:p-7 h-full border border-border">
                <span className="block font-display select-none mb-5 text-accent/35 leading-none tracking-tight text-5xl">
                  {step.number}
                </span>
                <h3 className="font-display font-medium text-text-primary mb-4 text-2xl">
                  {step.title}
                </h3>
                <p className="font-body text-text-muted leading-relaxed text-base md:text-lg">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
