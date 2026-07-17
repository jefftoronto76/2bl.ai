'use client';
// components/shells/membership/GateView.tsx

import { useEffect, useRef, useState } from 'react';
import { useAuthUser, useAuthActions } from '@/services/auth/client';
import { heirloomClerkAppearance } from './clerkAppearance';
import { logAuthStep } from '@/services/auth/log-auth-step';
import { setOAuthInProgress, useChatStore } from './chatStore';

export function GateView() {
  const { openSignUp } = useAuthActions();
  const { isSignedIn, isLoaded } = useAuthUser();
  const { hasInviteToken, invitedName } = useChatStore();

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
      logAuthStep({
        event_type: 'sign_up',
        outcome: 'success',
        metadata: { auth_surface: 'prebuilt_modal', step: 'auth_completed', component: 'GateView' },
      });
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

  // No invite token — show a waitlist request form.
  if (!hasInviteToken) {
    return <WaitlistView />;
  }

  // Visitor arrived with a token that was invalid or expired.
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
      <p className="font-display italic text-accent text-sm mb-6 tracking-wide">
        Heirloom
      </p>
      <h2 className="font-display font-light text-text-primary text-3xl md:text-4xl tracking-tight mb-4">
        {invitedName ? `Welcome, ${invitedName}.` : 'By invitation only.'}
      </h2>
      <p className="font-body text-text-muted text-base leading-relaxed max-w-xs mb-8">
        {invitedName
          ? 'Sign up below to claim your membership.'
          : 'Heirloom is currently in private access. Members and invite holders can sign in below.'}
      </p>
      <button
        type="button"
        onClick={() => {
          logAuthStep({
            event_type: 'sign_up',
            outcome: 'success',
            metadata: { auth_surface: 'prebuilt_modal', step: 'modal_opened', component: 'GateView' },
          });
          setOAuthInProgress(true);
          openSignUp({ appearance: heirloomClerkAppearance });
        }}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-background font-body text-sm font-medium tracking-wide transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        Claim a free membership
      </button>
    </div>
  );
}

// ── Waitlist form (no invite token case) ──────────────────────────────────────

function WaitlistView() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/heirloom/members/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? 'Something went wrong.');
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <p className="font-display italic text-accent text-sm mb-6 tracking-wide">
          Heirloom
        </p>
        <h2 className="font-display font-light text-text-primary text-3xl md:text-4xl tracking-tight mb-4">
          You&apos;re on the list.
        </h2>
        <p className="font-body text-text-muted text-base leading-relaxed max-w-xs">
          We&apos;ll be in touch when your invitation is ready.
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
        Heirloom is currently in private access. Request an invitation below.
      </p>
      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          disabled={submitting}
          className="w-full px-4 py-3 rounded-full bg-surface border border-border text-text-primary font-body text-base placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        />
        {error && (
          <p className="font-body text-red-400 text-xs text-center">{error}</p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-accent text-background font-body text-sm font-medium tracking-wide transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60"
        >
          {submitting ? 'Requesting…' : 'Request access'}
        </button>
      </form>
    </div>
  );
}
