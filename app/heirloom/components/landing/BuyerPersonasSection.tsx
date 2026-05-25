'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Clock,
  Heart,
  Gift,
  Users,
  Calendar,
  Briefcase,
  Building2,
  Landmark,
  LucideIcon,
} from 'lucide-react';

const tagIcons: Record<string, LucideIcon> = {
  BookOpen,
  Clock,
  Heart,
  Gift,
  Users,
  Calendar,
  Briefcase,
  Building2,
  Landmark,
};

type Buyer = {
  title: string;
  tagline: string;
  description: string;
  tags: { label: string; icon: keyof typeof tagIcons }[];
};

const buyers: Buyer[] = [
  {
    title: 'The Individual',
    tagline: 'For yourself',
    description:
      "You've lived enough to know the stories worth telling. Heirloom guides you through them — chapter by chapter, memory by memory — and turns them into something you can hold.",
    tags: [
      { label: 'Memoir', icon: 'BookOpen' },
      { label: 'Retirement', icon: 'Clock' },
      { label: 'Legacy', icon: 'Heart' },
    ],
  },
  {
    title: 'The Family',
    tagline: 'For the ones you love',
    description:
      "Someone in your family has a story that needs to be captured before it's gone. You're the one who's going to make sure it happens.",
    tags: [
      { label: 'Aging parent', icon: 'Heart' },
      { label: 'Family historian', icon: 'BookOpen' },
      { label: 'Gift occasion', icon: 'Gift' },
    ],
  },
  {
    title: 'The Parents',
    tagline: "For your children's children",
    description:
      "The early years go fast. Heirloom helps you document them while they're fresh — so the people who matter most never have to wonder where they came from.",
    tags: [
      { label: 'Baby milestone', icon: 'Gift' },
      { label: 'Family tradition', icon: 'BookOpen' },
      { label: 'Future keepsake', icon: 'Heart' },
    ],
  },
  {
    title: 'The Group',
    tagline: 'For the people you did life with',
    description:
      'Road trips. Seasons. Years of showing up for each other. Some stories are better told together. Heirloom lets your whole group contribute.',
    tags: [
      { label: 'Friends', icon: 'Users' },
      { label: 'Teams', icon: 'Briefcase' },
      { label: 'Reunions', icon: 'Calendar' },
    ],
  },
  {
    title: 'The Organization',
    tagline: 'For the moments that matter most',
    description:
      'From eulogies to company histories, Heirloom helps organizations capture and preserve the stories that define them.',
    tags: [
      { label: 'Funeral homes', icon: 'Building2' },
      { label: 'Companies', icon: 'Briefcase' },
      { label: 'Institutions', icon: 'Landmark' },
    ],
  },
];

const buyerDelays = [
  'delay-[150ms]',
  'delay-[270ms]',
  'delay-[390ms]',
  'delay-[510ms]',
  'delay-[630ms]',
];

const buyerColStart = ['', '', '', 'md:col-start-2', ''];

export function BuyerPersonasSection() {
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
      id="personas"
      className="pt-20 sm:pt-24 md:pt-36 pb-12 sm:pb-16 md:pb-20 bg-pricing-glow"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-12">
        <div
          className={`text-center mb-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <span className="block font-body text-base font-semibold uppercase tracking-widest text-accent mb-6">
            Who We're Building For
          </span>
          <h2 className="font-display font-light text-text-primary leading-tight text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
            Every story deserves to be told.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-6 items-stretch">
          {buyers.map((buyer, i) => (
            <div
              key={buyer.title}
              className={`h-full md:col-span-2 ${buyerColStart[i]} rounded-2xl p-6 md:p-8 flex flex-col gap-5 transition-all duration-700 bg-surface border border-accent/35 border-t-[3px] border-t-accent/60 ${buyerDelays[i]} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
              <div>
                <h3 className="font-display font-medium text-text-primary leading-snug text-2xl">
                  {buyer.title}
                </h3>
                <p className="font-display italic text-accent text-base">
                  {buyer.tagline}
                </p>
              </div>

              <p className="font-body leading-relaxed flex-1 text-text-muted text-base md:text-lg">
                {buyer.description}
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                {buyer.tags.map((tag) => {
                  const Icon = tagIcons[tag.icon];
                  return (
                    <span
                      key={tag.label}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-base font-medium bg-accent/10 text-accent border border-accent/25"
                    >
                      <Icon size={12} className="text-accent" />
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
