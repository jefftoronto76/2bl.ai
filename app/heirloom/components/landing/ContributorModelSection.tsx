'use client';

import { useEffect, useRef, useState } from 'react';
import { User, Users, Image, FileText } from 'lucide-react';

const roles = [
  {
    icon: User,
    title: 'Owner / Author',
    description: 'Primary narrator. Owns the story arc and final approval.',
  },
  {
    icon: Users,
    title: 'Contributors',
    description: 'Family, friends, colleagues. Invited to add specific memories or perspectives.',
  },
  {
    icon: Image,
    title: 'Social & Media',
    description: 'Facebook, Instagram, photos, home video — raw material pulled in automatically.',
  },
  {
    icon: FileText,
    title: 'Documents',
    description: 'Letters, certificates, news clippings, records — uploaded and synthesized.',
  },
];

const roleDelays = [
  'delay-[150ms]',
  'delay-[270ms]',
  'delay-[390ms]',
  'delay-[510ms]',
];

export function ContributorModelSection() {
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
      id="contributors"
      className="py-20 sm:py-24 md:py-36 bg-contributor-glow"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-12">
        <div
          className={`text-center mb-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <span className="block font-body text-base font-semibold uppercase tracking-widest text-accent mb-6">
            The Contributor Model
          </span>
          <h2 className="font-display font-light text-text-primary mb-8 leading-tight text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
            One story. Many voices.
          </h2>
          <p className="max-w-2xl mx-auto font-body text-text-muted leading-relaxed text-base md:text-lg">
            Heirloom is not a solo writing tool. It's a memory aggregation platform where the richest stories come from multiple people and sources.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {roles.map((role, i) => {
            const Icon = role.icon;
            return (
              <div
                key={role.title}
                className={`transition-all duration-700 ${roleDelays[i]} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              >
                <div className="rounded-2xl p-6 sm:p-7 h-full bg-surface/60 border border-border border-l-[3px] border-l-accent/50">
                  <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-5 bg-accent/15">
                    <Icon size={20} className="text-accent" />
                  </div>
                  <h3 className="font-display font-medium text-text-primary mb-3 text-xl">
                    {role.title}
                  </h3>
                  <p className="font-body text-text-muted leading-relaxed text-base">
                    {role.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={`rounded-2xl p-8 md:p-10 transition-all duration-700 delay-[700ms] bg-accent/15 border border-accent/25 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <span className="block font-body text-base font-semibold uppercase tracking-widest text-accent/75 mb-6">
            Key Principle
          </span>
          <p className="font-display italic text-text-primary mb-3 leading-snug text-lg sm:text-xl md:text-2xl lg:text-3xl">
            When two contributors remember the same moment differently — that's not a problem.
          </p>
          <p className="font-display italic text-accent mb-5 text-xl md:text-2xl">
            That's a feature.
          </p>
          <p className="font-body text-text-muted text-base">
            Two perspectives on the same event can be one of the most compelling things in the book.
          </p>
        </div>
      </div>
    </section>
  );
}
