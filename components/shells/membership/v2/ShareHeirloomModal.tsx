'use client';

// components/shells/membership/v2/ShareHeirloomModal.tsx
//
// "Share Heirloom" — pass the product on. Pure presentation: the URL + message
// are props; social buttons open share intents in a new tab; "Copy" uses the
// clipboard. No store, no API.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Heart, Link as LinkIcon, Mail, X } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { useModalA11y } from './useModalA11y';

export interface ShareChannel {
  key: string;
  label: string;
  /** Single glyph (e.g. "f", "in", "X") OR omit and provide `icon`. */
  glyph?: string;
  /** Use the Mail lucide icon instead of a glyph. */
  icon?: 'mail';
  /** Build the share-intent URL from the page URL + message. */
  href: (url: string, message: string) => string;
}

export const DEFAULT_SHARE_CHANNELS: ShareChannel[] = [
  {
    key: 'x',
    label: 'X',
    glyph: 'X',
    href: (u, m) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(m)}&url=${encodeURIComponent(u)}`,
  },
  {
    key: 'fb',
    label: 'Facebook',
    glyph: 'f',
    href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
  },
  {
    key: 'li',
    label: 'LinkedIn',
    glyph: 'in',
    href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`,
  },
  {
    key: 'mail',
    label: 'Email',
    icon: 'mail',
    href: (u, m) =>
      `mailto:?subject=${encodeURIComponent('A story worth keeping')}&body=${encodeURIComponent(`${m}\n\n${u}`)}`,
  },
];

export interface ShareHeirloomModalProps {
  open: boolean;
  onClose: () => void;
  /** The URL to share. Default https://heirloom.life */
  shareUrl?: string;
  /** Prefilled share message for social/email intents. */
  shareMessage?: string;
  /** Channels to render. Defaults to X / Facebook / LinkedIn / Email. */
  channels?: ShareChannel[];
  /** Notified after a successful link copy. */
  onCopied?: () => void;
  /** Notified when a channel button is opened. */
  onShare?: (channelKey: string) => void;
}

const DEFAULT_URL = 'https://heirloom.life';
const DEFAULT_MSG =
  'Every life deserves to be told. I’m using Heirloom to turn memories into a real, lasting book — you have to see this.';

export function ShareHeirloomModal({
  open,
  onClose,
  shareUrl = DEFAULT_URL,
  shareMessage = DEFAULT_MSG,
  channels = DEFAULT_SHARE_CHANNELS,
  onCopied,
  onShare,
}: ShareHeirloomModalProps) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape (capture — never reaches the panel's handler), initial focus on the
  // dialog container, focus restore on close, Tab trap.
  useModalA11y(open, dialogRef, onClose);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const openIntent = useCallback(
    (ch: ShareChannel) => {
      try {
        window.open(ch.href(shareUrl, shareMessage), '_blank', 'noopener,noreferrer');
      } catch {
        /* no-op */
      }
      onShare?.(ch.key);
    },
    [shareUrl, shareMessage, onShare],
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* no-op */
    }
    setCopied(true);
    onCopied?.();
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1900);
  }, [shareUrl, onCopied]);

  if (!open) return null;

  const cleanUrl = shareUrl.replace(/^https?:\/\//, '');
  const sectionLabel = 'font-mono text-[11px] tracking-[0.18em] uppercase text-text-muted';

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-[80] flex items-center justify-center p-5 bg-black/55 backdrop-blur-sm"
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Share Heirloom"
        className="relative w-[min(440px,100%)] max-h-[92%] overflow-y-auto bg-surface border border-border rounded-2xl shadow-2xl p-7 text-center focus:outline-none"
      >
        <div className="absolute top-3.5 right-3.5">
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>

        <div className="w-[50px] h-[50px] mx-auto mb-4 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
          <Heart size={22} />
        </div>
        <h2 className="font-display font-medium text-text-primary text-[27px] leading-tight tracking-tight">
          Share Heirloom
        </h2>
        <p className="font-body text-sm text-text-muted leading-relaxed mt-2 max-w-[340px] mx-auto">
          Know someone with a story worth keeping? Pass it on. Every share helps
          another life become a book.
        </p>

        {/* Channels */}
        <div className="grid grid-cols-4 gap-2.5 mt-6">
          {channels.map((ch) => (
            <button
              key={ch.key}
              type="button"
              onClick={() => openIntent(ch)}
              aria-label={`Share on ${ch.label}`}
              className="flex flex-col items-center gap-2 pt-3.5 pb-2.5 px-1 rounded-2xl bg-background/60 border border-border hover:border-accent/30 hover:bg-accent/15 hover:-translate-y-0.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="w-[30px] h-[30px] flex items-center justify-center text-text-primary">
                {ch.icon === 'mail' ? (
                  <Mail size={19} />
                ) : (
                  <span
                    className={`font-display font-bold leading-none ${
                      ch.key === 'li' ? 'text-base' : 'text-xl'
                    } ${ch.key === 'x' ? 'font-body' : ''}`}
                  >
                    {ch.glyph}
                  </span>
                )}
              </span>
              <span className="font-body text-xs font-medium text-text-muted">
                {ch.label}
              </span>
            </button>
          ))}
        </div>

        {/* Copy link */}
        <div className="mt-5 text-left">
          <span className={sectionLabel}>Or copy the link</span>
          <div className="flex items-center gap-2.5 mt-2 pl-3 pr-1.5 py-1.5 bg-background/60 border border-border rounded-xl">
            <LinkIcon size={16} className="flex-shrink-0 text-accent" />
            <span className="flex-1 min-w-0 font-mono text-[13px] text-text-primary truncate">
              {cleanUrl}
            </span>
            <button
              type="button"
              onClick={copy}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg font-body text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                copied
                  ? 'bg-accent/15 text-accent'
                  : 'bg-accent hover:bg-accent-hover text-background'
              }`}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <p className="inline-flex items-center gap-1.5 mt-6 font-mono text-[10.5px] tracking-[0.06em] uppercase text-text-muted">
          <Heart size={12} className="text-accent" />
          Made to be passed down
        </p>
      </div>
    </div>
  );
}
