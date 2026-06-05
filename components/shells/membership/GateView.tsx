'use client';

import { useCallback, useState } from 'react';
import { MagicLinkCard } from './MagicLinkCard';
import { useChatStore } from './chatStore';

type GateStage = 'gate' | 'signup' | 'claimed';

export function GateView() {
  const [stage, setStage] = useState<GateStage>('gate');
  const { claimCurrentSession } = useChatStore();

  const handleClaimSuccess = useCallback(async () => {
    // Link the anonymous chat session to the newly-authenticated user.
    await claimCurrentSession();
    // Create a pending membership record for this visitor.
    await fetch('/api/heirloom/members/claim', { method: 'POST' }).catch((err) =>
      console.error('[heirloom/GateView] claim failed:', err),
    );
    setStage('claimed');
  }, [claimCurrentSession]);

  if (stage === 'claimed') {
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

  if (stage === 'signup') {
    return (
      <div className="flex-1 flex flex-col justify-center px-4 py-6">
        <MagicLinkCard
          reason="claim_membership"
          onSuccess={handleClaimSuccess}
        />
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
        onClick={() => setStage('signup')}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-background font-body text-sm font-medium tracking-wide transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        Claim a free membership
      </button>
    </div>
  );
}
