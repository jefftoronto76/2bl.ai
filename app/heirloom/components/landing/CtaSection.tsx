'use client';

/*
  CtaSection → closing CTA "All memories fade. They don't have to be forgotten."

  ⚠️ Chat activation (fresh wiring): "Start Your Story" → dispatch({ type: 'OPEN_CHAT' }).
*/

import { useEffect, useRef, useState } from 'react';
import { Feather } from 'lucide-react';
import { useChatStore } from '@/components/shells/membership/chatStore';

export function CtaSection() {
  const [visible, setVisible] = useState(false);
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

  return (
    <section ref={sectionRef} id="cta" data-screen-label="Final CTA" className="py-24 sm:py-28 md:py-40 px-4 sm:px-6 text-center bg-background">
      <div className={`max-w-2xl mx-auto transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <span className="inline-flex items-center justify-center text-accent mb-6">
          <Feather size={36} strokeWidth={1.5} />
        </span>
        <p className="font-display italic font-light text-text-primary mb-10 leading-[1.2]" style={{ fontSize: 'clamp(28px, 4.4vw, 52px)' }}>
          All memories fade. They don&rsquo;t have to be forgotten.
        </p>
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_CHAT' })}
          className="inline-flex items-center bg-accent hover:bg-accent-hover text-background font-body text-base font-semibold px-8 rounded-[13px] transition-colors min-h-[52px]"
        >
          Start Your Story
        </button>
        <p className="font-mono text-[13px] tracking-[0.06em] text-text-muted mt-[18px]">Write your first story in under two minutes.</p>
      </div>
    </section>
  );
}
