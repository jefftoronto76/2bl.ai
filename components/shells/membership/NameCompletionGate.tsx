'use client';
// components/shells/membership/NameCompletionGate.tsx

import { useEffect, useState } from 'react';
import { useChatStore } from './chatStore';
import { resolveMemberName } from '@/services/shared/identity';
import { NAME_REQUIRED_SINCE } from '@/services/shared/rollout';

type MeResponse = { name: string | null; invitedName: string | null; createdAt: string | null };
type Status = 'checking' | 'clear' | 'needs-name';

/**
 * Item 3b — server-side name-completion interstitial
 * (Design Handovers/heirloom-signup-signin-fixes-proposal.md, section 3b).
 * Universal backstop: blocks the chat surface for any signed-in member whose
 * `members` row was created on/after NAME_REQUIRED_SINCE and still has no
 * resolvable name — regardless of which signup path created it. Does not
 * block signUp.create() itself and never touches pre-cutover
 * ("grandfathered") nameless rows.
 */
export function NameCompletionGate({ children }: { children: React.ReactNode }) {
  const { state } = useChatStore();
  const { isMember } = state;

  const [status, setStatus] = useState<Status>('checking');
  const [nameValue, setNameValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isMember) {
      setStatus('clear');
      return;
    }
    let cancelled = false;
    setStatus('checking');
    void (async () => {
      try {
        const res = await fetch('/api/members/me');
        if (res.status === 401 || !res.ok) {
          if (!cancelled) setStatus('clear'); // fail open — 401, or any transient error
          return;
        }
        const data = (await res.json()) as MeResponse;
        if (cancelled) return;
        const hasName = resolveMemberName({ name: data.name, invited_name: data.invitedName }) !== null;
        const pastCutover = data.createdAt !== null && data.createdAt >= NAME_REQUIRED_SINCE;
        setStatus(!hasName && pastCutover ? 'needs-name' : 'clear');
      } catch {
        if (!cancelled) setStatus('clear'); // network failure — fail open
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMember]);

  if (status !== 'needs-name') return <>{children}</>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nameValue.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/members/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // syncToClerk: true — this is the one path that also writes the
        // name to Clerk's own profile (firstName), keeping Clerk and
        // Supabase in sync for a name captured post-authentication.
        // Deliberately opt-in on the route side (see route.ts) so this
        // doesn't change behavior for any of the route's other callers.
        body: JSON.stringify({ name: trimmed, syncToClerk: true }),
      });
      if (!res.ok) throw new Error('Something went wrong.');
      setStatus('clear'); // optimistic clear — res.ok confirms the write, no refetch needed
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
      <p className="font-display italic text-accent text-sm mb-6 tracking-wide">Heirloom</p>
      <h2 className="font-display font-light text-text-primary text-3xl md:text-4xl tracking-tight mb-4">
        What should we call you?
      </h2>
      <p className="font-body text-text-muted text-base leading-relaxed max-w-xs mb-8">
        Let us know your first name before you continue.
      </p>
      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-3">
        <input
          type="text"
          value={nameValue}
          onChange={e => setNameValue(e.target.value)}
          placeholder="First name"
          aria-label="First name"
          autoComplete="given-name"
          disabled={submitting}
          className="w-full px-4 py-3 rounded-full bg-surface border border-border text-text-primary font-body text-base placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50"
        />
        {error && <p className="font-body text-red-400 text-xs text-center">{error}</p>}
        <button
          type="submit"
          disabled={!nameValue.trim() || submitting}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-accent text-background font-body text-base font-medium tracking-wide transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
