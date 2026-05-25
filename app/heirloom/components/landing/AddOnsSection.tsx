'use client';

import { useEffect, useRef, useState } from 'react';
import { Printer, BookOpen, Mic, Globe, LucideIcon } from 'lucide-react';

type Addon = {
  icon: LucideIcon;
  title: string;
  price: string;
  unit: string;
  description: string;
};

const addons: Addon[] = [
  {
    icon: Printer,
    title: 'Print',
    price: '$149–$399',
    unit: '/ book',
    description:
      'Order hardcover copies of your finished book. We handle layout, formatting, and print-on-demand delivery.',
  },
  {
    icon: BookOpen,
    title: 'Publish',
    price: '$49',
    unit: '/ publication',
    description:
      'Distribute your book to Apple Books, Amazon Kindle, and Kobo. One flat fee, one click.',
  },
  {
    icon: Mic,
    title: 'Audio',
    price: '$49',
    unit: '/ publication',
    description:
      'Turn your book into a narrated audiobook and distribute it to Spotify and Audible.',
  },
  {
    icon: Globe,
    title: 'Digital Keepsake',
    price: '$49',
    unit: '/ year',
    description:
      "Keep your book's website live after your subscription ends. A permanent home for your story.",
  },
];

const addonDelays = [
  'delay-[150ms]',
  'delay-[270ms]',
  'delay-[390ms]',
  'delay-[510ms]',
];

export function AddOnsSection() {
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
      id="add-ons"
      className="py-20 sm:py-24 md:py-36 bg-surface"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-12">
        <div
          className={`text-center mb-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <span className="block font-body text-base font-semibold uppercase tracking-widest text-accent mb-5">
            Publish Your Story
          </span>
          <h2 className="font-display font-light text-text-primary mb-4 leading-tight text-2xl sm:text-3xl md:text-4xl lg:text-5xl">
            Your story doesn't end here.
          </h2>
          <p className="max-w-2xl mx-auto font-body leading-relaxed text-text-muted text-base md:text-lg">
            While you're creating, your book lives on a shareable website and exports as a PDF anytime. When you're ready to share it with the world, choose how.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {addons.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className={`h-full rounded-2xl p-6 sm:p-8 md:p-10 flex flex-col items-center text-center transition-all duration-700 bg-background border border-border border-t-[3px] border-t-accent/60 ${addonDelays[i]} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              >
                <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-7 bg-accent">
                  <Icon size={28} className="text-background" strokeWidth={1.75} />
                </div>

                <h3 className="font-display font-medium text-text-primary mb-4 text-xl sm:text-2xl md:text-3xl">
                  {item.title}
                </h3>

                <div className="flex items-baseline gap-1.5 mb-5">
                  <span className="font-display italic text-accent text-3xl sm:text-4xl md:text-5xl">
                    {item.price}
                  </span>
                  <span className="font-body text-text-muted text-base">
                    {item.unit}
                  </span>
                </div>

                <p className="font-body leading-relaxed max-w-xs text-text-muted text-base md:text-lg">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
