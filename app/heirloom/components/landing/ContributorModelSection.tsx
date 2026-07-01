'use client';

/*
  ContributorModelSection → "One story. Many voices." — contributor roles +
  key-principle card. Presentational only.
*/

import { useEffect, useRef, useState } from 'react';
import { User, Users, Image as ImageIcon, FileText, type LucideIcon } from 'lucide-react';

const roles: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: User, title: 'Owner / Author', body: 'Primary narrator. Owns the story arc and final approval.' },
  { icon: Users, title: 'Contributors', body: 'Family, friends, colleagues. Invited to add specific memories or perspectives.' },
  { icon: ImageIcon, title: 'Social & Media', body: 'Facebook, Instagram, photos, home video — raw material pulled in automatically.' },
  { icon: FileText, title: 'Documents', body: 'Letters, certificates, news clippings, records — uploaded and synthesized.' },
];

const roleDelays = ['delay-[150ms]', 'delay-[270ms]', 'delay-[390ms]', 'delay-[510ms]'];

export function ContributorModelSection() {
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
    <section ref={sectionRef} id="contributors" className="py-20 sm:py-24 md:py-36 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-12">
        <div className={`text-center mb-14 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <span className="block font-mono text-xs uppercase tracking-[0.3em] text-accent mb-6">The Contributor Model</span>
          <h2 className="font-display font-light text-text-primary mb-6 leading-[1.08] tracking-tight" style={{ fontSize: 'clamp(34px, 5vw, 66px)' }}>One story. Many voices.</h2>
          <p className="font-body text-text-muted max-w-2xl mx-auto" style={{ fontSize: 18, lineHeight: 1.6 }}>
            Legacy is not a solo writing tool. It&rsquo;s a memory aggregation platform where the richest stories come from multiple people and sources.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[18px] mb-6">
          {roles.map((role, i) => {
            const Icon = role.icon;
            return (
              <div key={role.title} className={`h-full rounded-2xl bg-surface border border-border border-l-[3px] border-l-accent/50 p-7 transition-all duration-700 ${roleDelays[i]} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="flex items-center justify-center bg-accent/10 text-accent mb-5" style={{ width: 48, height: 48, borderRadius: 13 }}>
                  <Icon size={21} strokeWidth={1.5} />
                </div>
                <h3 className="font-display font-medium text-text-primary mb-2.5" style={{ fontSize: 22, lineHeight: 1.16 }}>{role.title}</h3>
                <p className="font-body text-text-muted" style={{ fontSize: 15.5, lineHeight: 1.6 }}>{role.body}</p>
              </div>
            );
          })}
        </div>

        <div className={`rounded-2xl bg-accent/10 border border-accent/25 transition-all duration-700 delay-[640ms] ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ padding: 'clamp(28px, 4vw, 44px)' }}>
          <span className="block font-mono text-xs uppercase tracking-[0.26em] text-accent/80 mb-5">Key Principle</span>
          <p className="font-display italic text-text-primary mb-2 leading-[1.28]" style={{ fontSize: 'clamp(22px, 3vw, 34px)' }}>
            When two contributors remember the same moment differently — that&rsquo;s not a problem.
          </p>
          <p className="font-display italic text-accent mb-4 leading-[1.28]" style={{ fontSize: 'clamp(22px, 3vw, 34px)' }}>That&rsquo;s a feature.</p>
          <p className="font-body text-text-muted max-w-[640px]" style={{ fontSize: 16.5, lineHeight: 1.6 }}>
            Two perspectives on the same event can be one of the most compelling things in the book.
          </p>
        </div>
      </div>
    </section>
  );
}
