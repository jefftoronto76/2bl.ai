'use client';

/*
  PricingSection → "Easy to get started." — Purchase Price / Annual toggle,
  feature list, and the primary conversion CTA.

  ⚠️ Chat activation (fresh wiring): "Start Your Story" → dispatch({ type: 'OPEN_CHAT' }).
*/

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useChatStore } from '@/components/shells/membership/chatStore';

type Billing = 'purchase' | 'annual';
type Feature = { label: string; children?: string[] };

const features: Feature[] = [
  { label: '1 published story' },
  { label: '50GB storage' },
  { label: 'Unlimited:', children: ['Drafts', 'AI-guided conversations', 'Contributors per story'] },
  { label: 'Cancel anytime' },
];

export function PricingSection() {
  const [visible, setVisible] = useState(false);
  const [billing, setBilling] = useState<Billing>('purchase');
  const sectionRef = useRef<HTMLDivElement>(null);
  const { dispatch } = useChatStore();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 },
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const price = billing === 'purchase' ? '99.99' : '74.99';
  const tab = (active: boolean) =>
    `px-5 py-2 rounded-full font-body text-base font-medium transition-colors ${active ? 'bg-accent text-background' : 'text-text-muted hover:text-text-primary'}`;

  return (
    <section ref={sectionRef} id="pricing" className="py-20 sm:py-24 md:py-36 bg-surface border-y border-border scroll-mt-16">
      <div className="max-w-[620px] mx-auto px-4 sm:px-6">
        <div className={`text-center mb-11 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <span className="block font-mono text-xs uppercase tracking-[0.3em] text-accent mb-6">Pricing</span>
          <h2 className="font-display font-light text-text-primary leading-[1.08] tracking-tight" style={{ fontSize: 'clamp(34px, 5vw, 66px)' }}>Easy to get started.</h2>
        </div>

        <div className={`flex justify-center mb-9 transition-all duration-700 delay-[120ms] ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div role="tablist" aria-label="Billing cycle" className="inline-flex items-center gap-1 rounded-full bg-background border border-border p-1">
            <button type="button" role="tab" aria-selected={billing === 'purchase'} onClick={() => setBilling('purchase')} className={tab(billing === 'purchase')}>Purchase Price</button>
            <button type="button" role="tab" aria-selected={billing === 'annual'} onClick={() => setBilling('annual')} className={tab(billing === 'annual')}>Annual</button>
          </div>
        </div>

        <div className={`relative rounded-2xl bg-background border border-accent/25 border-t-[3px] border-t-accent transition-all duration-700 delay-200 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ padding: 'clamp(28px, 5vw, 48px)' }}>
          {billing === 'annual' && (
            <span className="absolute -top-3 right-7 inline-flex items-center px-3 py-1 rounded-full font-mono text-xs font-semibold bg-accent text-background">Save 25%</span>
          )}

          <div className="text-center mb-7">
            <h3 className="font-display font-medium text-text-primary mb-2.5" style={{ fontSize: 'clamp(28px, 4vw, 38px)' }}>Legacy</h3>
            <p className="font-body text-text-muted max-w-md mx-auto" style={{ fontSize: 16.5, lineHeight: 1.55 }}>Everything you need to capture, shape, and publish your story.</p>
          </div>

          <div className="text-center mb-8">
            <div className="flex items-baseline justify-center gap-2">
              <span className="font-display italic text-accent leading-none" style={{ fontSize: 'clamp(48px, 8vw, 64px)' }}>${price}</span>
              <span className="font-body text-text-muted" style={{ fontSize: 17 }}>/ month</span>
            </div>
            {billing === 'annual' && <p className="font-body text-text-muted mt-2" style={{ fontSize: 14 }}>billed $899/year</p>}
          </div>

          <ul className="flex flex-col gap-3 mb-8 max-w-md mx-auto list-none p-0">
            {features.map((feature) => (
              <li key={feature.label} className="font-body text-text-primary" style={{ fontSize: 16.5, lineHeight: 1.5 }}>
                <span className="flex items-start gap-3">
                  <Check size={19} className="text-accent flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span>{feature.label}</span>
                </span>
                {feature.children && (
                  <ul className="flex flex-col gap-2 mt-2 pl-8 text-text-muted list-none">
                    {feature.children.map((child) => (
                      <li key={child} className="flex items-start gap-3" style={{ fontSize: 15.5 }}>
                        <Check size={18} className="text-accent/60 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
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
            className="block w-full text-center py-4 rounded-[13px] bg-accent hover:bg-accent-hover text-background font-body font-semibold text-base transition-colors"
          >
            Start Your Story
          </button>
        </div>
      </div>
    </section>
  );
}
