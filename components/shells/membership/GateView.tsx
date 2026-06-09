'use client';

import { useEffect, useRef } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { heirloomClerkAppearance } from './clerkAppearance';

export function GateView() {
  const { openSignUp } = useClerk();
  const { isSignedIn, isLoaded } = useUser();

  // Track the false→true sign-in transition so we call /api/heirloom/members/claim
  // only once per sign-up event — not on every page load for a pending member
  // who is already signed in.
  const wasSignedInRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (wasSignedInRef.current === null) {
      wasSignedInRef.current = !!isSignedIn;
      return;
    }
    if (isSignedIn && !wasSignedInRef.current) {
      wasSignedInRef.current = true;
      // Create a pending membership record for this self-service visitor.
      // claimSessionsOnly in ChatProvider handles session linking separately.
      void fetch('/api/heirloom/members/claim', { method: 'POST' }).catch(err =>
        console.error('[heirloom/GateView] membership claim failed:', err)
      );
    }
    if (!isSignedIn) {
      wasSignedInRef.current = false;
    }
  }, [isLoaded, isSignedIn]);

  // Any signed-in visitor reaching GateView is either pending (on the waitlist)
  // or just signed up — either way "You're on the list." is the correct state.
  if (isLoaded && isSignedIn) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <p className="font-display italic text-accent text-sm mb-6 tracking-wide">
          Heirloom
        </p>
        <h2 className="font-display font-light text-text-primary text-3xl md:text-4xl tracking-tight mb-4">
          You&apos;re on the list.
        </h2>
        <p className="font-body text-text-muted text-base leading-relaxed max-w-xs">
          We&apos;ll let you know when your membership is ready.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
      <p className="font-display italic text-accent text-sm mb-6 tracking-wide">
        Heirloom
      </p>
      <h2 className="font-display font-light text-text-primary text-3xl md:text-4xl tracking-tight mb-4">
        By invitation only.
      </h2>
      <p className="font-body text-text-muted text-base leading-relaxed max-w-xs mb-8">
        Heirloom is currently in private access. Members and invite holders can sign in below.
      </p>
      <button
        type="button"
        onClick={() => openSignUp({ appearance: heirloomClerkAppearance })}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-background font-body text-sm font-medium tracking-wide transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        Claim a free membership
      </button>
    </div>
  );
}
