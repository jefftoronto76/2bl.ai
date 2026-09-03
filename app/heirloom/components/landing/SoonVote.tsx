'use client';

/*
  SoonVote — "vote for this upcoming feature" widget, used on every "Coming
  soon" item. Ported from the design reference: "Design Handovers/ Aug 2026
  Atomic Updates/13_Heirloom_lander_nav_updateV4/Heirloom Lander - Summer 2026 -
  Story Canvas.html" (~lines 248-269).

  Purely a local UI preference toggle: the vote is persisted per storageKey in
  localStorage and the displayed count is `initial` (+1 when the viewer has
  voted). It does NOT call chatStore or dispatch anything — keep it that way.

  SSR guard: this is a client component but Next.js still server-renders it
  once, so localStorage is only touched inside useEffect / the click handler,
  never during render. The first paint is always the un-voted state; the
  effect reconciles from storage after hydration.

  Token mapping from the reference (var(--hl-*) → real tokens):
    --hl-accent        → rgb(var(--color-accent))
    --hl-accent-soft   → rgb(var(--color-accent) / 0.13)   (same as HeroSection.tsx)
    --hl-border-strong → var(--color-border)
    --hl-muted         → var(--color-text-muted)
    --hl-faint         → rgb(var(--color-text-dim))
    --font-mono        → Tailwind `font-mono` class
*/

import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';

export type SoonVoteProps = {
  /** localStorage key that records this viewer's vote for the feature. */
  storageKey: string;
  /** Baseline vote count shown before the viewer's own vote is added. */
  initial: number;
};

export function SoonVote({ storageKey, initial }: SoonVoteProps) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(initial);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === '1') {
        setLiked(true);
        setCount(initial + 1);
      }
    } catch {
      /* storage unavailable (private mode, blocked) — stay un-voted */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    setLiked((v) => {
      const nv = !v;
      setCount((n) => n + (nv ? 1 : -1));
      try {
        if (nv) localStorage.setItem(storageKey, '1');
        else localStorage.removeItem(storageKey);
      } catch {
        /* storage unavailable — the in-memory toggle still works for this visit */
      }
      return nv;
    });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={liked}
        aria-label={liked ? 'Remove your vote' : 'I want this sooner'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 13px',
          borderRadius: 999,
          border: '1px solid ' + (liked ? 'rgb(var(--color-accent))' : 'var(--color-border)'),
          background: liked ? 'rgb(var(--color-accent) / 0.13)' : 'transparent',
          color: liked ? 'rgb(var(--color-accent))' : 'var(--color-text-muted)',
          transition: 'all .2s',
        }}
      >
        <span style={{ display: 'flex', transform: liked ? 'scale(1.12)' : 'none', transition: 'transform .2s' }}>
          <Heart size={14} />
        </span>
        <span className="font-mono" style={{ fontSize: 12, fontWeight: 500 }}>{count}</span>
      </button>
      <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgb(var(--color-text-dim))' }}>
        {liked ? 'Thanks!' : 'Want it sooner?'}
      </span>
    </div>
  );
}
