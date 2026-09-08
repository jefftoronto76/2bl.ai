'use client';

/*
  LandingNav — the lander's fixed top bar (Summer 2026 redesign, PR #449).

  - Wordmark "Heirloom" (+ aria-label "Heirloom home"). The pre-redesign
    "Legacy" wordmark, the "About" link and the "Sign Up" ghost button were
    removed in that redesign.
  - Three scroll links — "How It Works" / "What You Can Make" / "Pricing". The
    label → target-id mapping in navLinks below is deliberately NOT 1:1
    (see System Docs/Public Site.md, "Heirloom lander"); renaming a section id
    breaks these links.
  - "Start Your Story" is the only CTA; its wiring is production's.

  ⚠️ DO NOT modify the handler:
  • Start Your Story → dispatch({ type: 'OPEN_CHAT' })
*/

import { useState, useEffect } from 'react';
import { useChatStore } from '@/components/shells/membership/chatStore';

const navLinks: { label: string; targetId: string }[] = [
  { label: 'How It Works', targetId: 'what-is-heirloom' },
  { label: 'What You Can Make', targetId: 'how-it-works' },
  { label: 'Pricing', targetId: 'pricing' },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const { dispatch } = useChatStore();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-30 transition-all duration-300 ${
        scrolled
          ? 'bg-surface/95 backdrop-blur-md shadow-sm border-b border-accent/20'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2.5 outline-none focus:outline-none"
          aria-label="Heirloom home"
        >
          <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center">
            <img
                src="/heirloom/favicons/icons/heirloom-feather-cream.svg"
                width={16}
                height={16}
                alt=""
                aria-hidden="true"
              />
          </div>
          <span className="font-display font-semibold text-lg text-text-primary tracking-wide">
            Heirloom
          </span>
        </button>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map(({ label, targetId }) => (
            <button
              key={label}
              type="button"
              onClick={() => scrollTo(targetId)}
              className="font-body text-base font-medium text-text-muted hover:text-accent transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => dispatch({ type: 'OPEN_CHAT' })}
            className="bg-accent hover:bg-accent-hover text-background font-body text-base font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Start Your Story
          </button>
        </div>
      </div>
    </nav>
  );
}
