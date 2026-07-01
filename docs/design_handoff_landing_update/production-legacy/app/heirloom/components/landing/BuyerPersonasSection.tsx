'use client';

/*
  BuyerPersonasSection → "Every story deserves to be told." — five audience
  cards (the 4th centered on the wide 6-col grid). Presentational only.
*/

import { useEffect, useRef, useState } from 'react';
import { BookOpen, Clock, Heart, Gift, Users, Briefcase, Calendar, Building2, Landmark, type LucideIcon } from 'lucide-react';

type Buyer = { title: string; tagline: string; body: string; tags: { label: string; icon: LucideIcon }[] };

const buyers: Buyer[] = [
  { title: 'The Individual', tagline: 'For yourself', body: "You've lived enough to know the stories worth telling. Legacy guides you through them — chapter by chapter, memory by memory — and turns them into something you can hold.", tags: [{ label: 'Memoir', icon: BookOpen }, { label: 'Retirement', icon: Clock }, { label: 'Legacy', icon: Heart }] },
  { title: 'The Family', tagline: 'For the ones you love', body: "Someone in your family has a story that needs to be captured before it's gone. You're the one who's going to make sure it happens.", tags: [{ label: 'Aging parent', icon: Heart }, { label: 'Family historian', icon: BookOpen }, { label: 'Gift occasion', icon: Gift }] },
  { title: 'The Parents', tagline: "For your children's children", body: "The early years go fast. Legacy helps you document them while they're fresh — so the people who matter most never have to wonder where they came from.", tags: [{ label: 'Baby milestone', icon: Gift }, { label: 'Family tradition', icon: BookOpen }, { label: 'Future keepsake', icon: Heart }] },
  { title: 'The Group', tagline: 'For the people you did life with', body: 'Road trips. Seasons. Years of showing up for each other. Some stories are better told together. Legacy lets your whole group contribute.', tags: [{ label: 'Friends', icon: Users }, { label: 'Teams', icon: Briefcase }, { label: 'Reunions', icon: Calendar }] },
  { title: 'The Organization', tagline: 'For the moments that matter most', body: 'From eulogies to company histories, Legacy helps organizations capture and preserve the stories that define them.', tags: [{ label: 'Funeral homes', icon: Building2 }, { label: 'Companies', icon: Briefcase }, { label: 'Institutions', icon: Landmark }] },
];

const buyerColStart = ['', '', '', 'md:col-start-2', ''];
const buyerDelays = ['delay-[150ms]', 'delay-[270ms]', 'delay-[390ms]', 'delay-[510ms]', 'delay-[630ms]'];

export function BuyerPersonasSection() {
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
    <section ref={sectionRef} id="personas" className="py-20 sm:py-24 md:py-36 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-12">
        <div className={`text-center mb-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <span className="block font-mono text-xs uppercase tracking-[0.3em] text-accent mb-6">Who We&rsquo;re Building For</span>
          <h2 className="font-display font-light text-text-primary leading-[1.08] tracking-tight" style={{ fontSize: 'clamp(34px, 5vw, 66px)' }}>Every story deserves to be told.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-[18px] items-stretch">
          {buyers.map((buyer, i) => (
            <div
              key={buyer.title}
              className={`h-full md:col-span-2 ${buyerColStart[i]} rounded-2xl bg-surface border border-border border-t-[3px] border-t-accent/60 flex flex-col gap-5 transition-all duration-700 ${buyerDelays[i]} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ padding: 'clamp(24px, 3vw, 32px)' }}
            >
              <div>
                <h3 className="font-display font-medium text-text-primary leading-snug" style={{ fontSize: 26 }}>{buyer.title}</h3>
                <p className="font-display italic text-accent" style={{ fontSize: 17 }}>{buyer.tagline}</p>
              </div>
              <p className="font-body text-text-muted flex-1" style={{ fontSize: 16, lineHeight: 1.6 }}>{buyer.body}</p>
              <div className="flex flex-wrap gap-2">
                {buyer.tags.map((tag) => {
                  const Icon = tag.icon;
                  return (
                    <span key={tag.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[11px] bg-accent/10 text-accent border border-accent/25" style={{ letterSpacing: '.04em' }}>
                      <Icon size={12} strokeWidth={1.75} />
                      {tag.label}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
