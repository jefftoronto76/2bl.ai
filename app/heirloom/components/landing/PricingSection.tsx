'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useChatStore } from '@/components/shells/membership/chatStore';

type Billing = 'monthly' | 'annual';

type Feature = {
  label: string;
  children?: string[];
};

const features: Feature[] = [
  { label: '1 published story' },
  { label: '50GB storage' },
  {
    label: 'Unlimited:',
    children: ['Drafts', 'AI-guided conversations', 'Contributors per story'],
  },
  { label: 'Cancel anytime' },
];

export function PricingSection() {
  const [visible, setVisible] = useState(false);
  const [billing, setBilling] = useState<Billing>('monthly');
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

  const price = billing === 'monthly' ? '99.99' : '74.99';

  return (
    <section
      ref={sectionRef}
      id="pricing"
      className="py-20 sm:py-24 md:py-36 bg-pricing-glow"
    >
      <div className="max-w-3xl md:max-w-[38.4rem] mx-auto px-4 sm:px-6">
        <div
          className={`text-center mb-12 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <span className="block font-body text-base font-semibold uppercase tracking-widest text-accent mb-6">
            Pricing
          </span>
          <h2 className="font-display font-light text-text-primary leading-tight text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
            One story. One price.
          </h2>
        </div>

        <div
          className={`flex justify-center mb-10 transition-all duration-700 delay-[150ms] ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <div
            role="tablist"
            aria-label="Billing cycle"
            className="inline-flex items-center gap-1 rounded-full bg-surface border border-border p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={billing === 'monthly'}
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 rounded-full font-body text-base font-medium transition-colors ${
                billing === 'monthly'
                  ? 'bg-accent text-background'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={billing === 'annual'}
              onClick={() => setBilling('annual')}
              className={`px-5 py-2 rounded-full font-body text-base font-medium transition-colors ${
                billing === 'annual'
                  ? 'bg-accent text-background'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Annual
            </button>
          </div>
        </div>

        <div
          className={`relative rounded-2xl p-6 sm:p-8 md:p-12 bg-surface border border-accent/35 border-t-[3px] border-t-accent/60 transition-all duration-700 delay-[300ms] ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          {billing === 'annual' && (
            <span className="absolute -top-3 right-6 sm:right-8 inline-flex items-center px-3 py-1 rounded-full font-body text-base font-semibold bg-accent text-background">
              Save 25%
            </span>
          )}

          <div className="text-center mb-8">
            <h3 className="font-display font-medium text-text-primary text-3xl md:text-4xl mb-3">
              Heirloom
            </h3>
            <p className="font-body text-text-muted text-base md:text-lg max-w-md mx-auto leading-relaxed">
              Everything you need to capture, shape, and publish your story.
            </p>
          </div>

          <div className="text-center mb-10">
            <div className="flex items-baseline justify-center gap-1.5">
              <span className="font-display italic text-accent text-5xl md:text-6xl">
                ${price}
              </span>
              <span className="font-body text-text-muted text-base md:text-lg">
                / month
              </span>
            </div>
            {billing === 'annual' && (
              <p className="font-body text-text-muted text-base mt-2">
                billed $899/year
              </p>
            )}
          </div>

          <ul className="flex flex-col gap-3 mb-10 max-w-md mx-auto">
            {features.map((feature) => (
              <li
                key={feature.label}
                className="font-body text-text-primary text-base md:text-lg leading-relaxed"
              >
                <span className="flex items-start gap-3">
                  <Check
                    size={20}
                    className="text-accent flex-shrink-0 mt-0.5"
                    strokeWidth={2.5}
                  />
                  <span>{feature.label}</span>
                </span>
                {feature.children && (
                  <ul className="flex flex-col gap-2 mt-2 pl-8 text-text-muted">
                    {feature.children.map((child) => (
                      <li key={child} className="flex items-start gap-3">
                        <Check
                          size={20}
                          className="text-accent/60 flex-shrink-0 mt-0.5"
                          strokeWidth={2.5}
                        />
                        <span>{child}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => dispatch({ type: 'OPEN_CHAT' })}
            className="block w-full text-center py-4 rounded-xl bg-accent hover:bg-accent-hover text-background font-body font-semibold text-base transition-colors"
          >
            Start Your Story
          </button>
        </div>
      </div>
    </section>
  );
}
