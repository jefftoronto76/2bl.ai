'use client';

import { useState, useEffect } from 'react';
import { BookOpen } from 'lucide-react';
import { useClerk, useUser } from '@clerk/nextjs';
import { useChatStore } from '@/components/shells/membership/chatStore';
import { heirloomClerkAppearance } from '@/components/shells/membership/clerkAppearance';

const navLinks: { label: string; targetId: string }[] = [
  { label: 'How It Works', targetId: 'how-it-works' },
  { label: 'Pricing', targetId: 'pricing' },
  { label: 'About', targetId: 'what-is-heirloom' },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const { dispatch } = useChatStore();
  const { openSignUp } = useClerk();
  const { isLoaded, isSignedIn } = useUser();

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
            <BookOpen size={16} className="text-accent" />
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
          {isLoaded && !isSignedIn && (
            <button
              type="button"
              onClick={() => openSignUp({ appearance: heirloomClerkAppearance })}
              className="border border-accent/50 hover:border-accent text-accent hover:text-text-primary hover:bg-accent/10 font-body text-base font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Sign Up
            </button>
          )}
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
