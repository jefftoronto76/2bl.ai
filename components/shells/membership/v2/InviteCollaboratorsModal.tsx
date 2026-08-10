'use client';

// components/shells/membership/v2/InviteCollaboratorsModal.tsx
//
// Invite collaborators into a story via a private magic link. Pure presentation
// — link, expiry, and the collaborator roster are all passed in. "Copy" uses the
// clipboard only; "Reset link" is delegated to the parent (no API here).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check, Clock, Copy, Link as LinkIcon, RefreshCw, Shield, UserPlus, X,
} from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { useModalA11y } from './useModalA11y';
import type { Collaborator, Story } from './types';

// Custom-Greeting char cap — mirrors app/admin/members/InviteMemberModal.tsx's
// Primer field exactly (same members.primer mechanism, see that component's
// doc comment). Not a UI-only decoration: this value is injected into every
// one of the invited member's chat turns via MEMBER CONTEXT.
const PRIMER_MAX_LENGTH = 500;

export interface InviteCollaboratorsModalProps {
  open: boolean;
  onClose: () => void;
  /** The private join link, e.g. "heirloom.life/join/AB12-CD34-EF56". */
  magicLink: string;
  /** Human label for expiry, e.g. "Expires in 7 days · Jun 18". */
  expiresLabel?: string;
  /** People already invited — name, relationship, joined/pending. */
  collaborators: Collaborator[];
  /** All stories the picker can choose from. Picker renders only when non-empty. */
  stories: Story[];
  /** Currently-selected story id — drives the intro copy and, once a
   *  story-collaborator schema exists, which story the invite is tied to. */
  storyId?: string;
  /** Fired when the picker's selection changes. */
  onStoryChange?: (storyId: string) => void;
  /** Custom Greeting — the members.primer value, pre-filled by the caller
   *  from tenants.default_primer, same as InviteMemberModal.tsx. */
  primer: string;
  /** Fired on every keystroke, already capped to PRIMER_MAX_LENGTH by this
   *  component (same `.slice(0, 500)` behavior as InviteMemberModal.tsx). */
  onPrimerChange?: (value: string) => void;
  /** Regenerate the link (parent owns token rotation). */
  onResetLink?: () => void;
  /** Notified after a successful clipboard copy. */
  onCopied?: () => void;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function InviteCollaboratorsModal({
  open,
  onClose,
  magicLink,
  expiresLabel,
  collaborators,
  stories,
  storyId,
  onStoryChange,
  primer,
  onPrimerChange,
  onResetLink,
  onCopied,
}: InviteCollaboratorsModalProps) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Derived, not a prop — re-labels the intro copy the instant the picker
  // changes, without the caller having to keep a separate storyName in sync.
  const storyName = storyId ? stories.find((s) => s.id === storyId)?.name : undefined;

  // Escape (capture — never reaches the panel's handler), initial focus on the
  // dialog container, focus restore on close, Tab trap.
  useModalA11y(open, dialogRef, onClose);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const copy = useCallback(async () => {
    const full = magicLink.startsWith('http') ? magicLink : `https://${magicLink}`;
    try {
      await navigator.clipboard.writeText(full);
    } catch {
      // ignore — clipboard may be unavailable in the host context
    }
    setCopied(true);
    onCopied?.();
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1900);
  }, [magicLink, onCopied]);

  if (!open) return null;

  const joined = collaborators.filter((c) => c.status === 'joined').length;
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
        aria-label="Invite collaborators"
        className="relative w-[min(462px,100%)] max-h-[92%] flex flex-col bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden focus:outline-none"
      >
        <div className="absolute top-3.5 right-3.5">
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>

        {/* Body — everything except the magic link scrolls here. */}
        <div className="flex-1 min-h-0 overflow-y-auto p-7">
          <div className="w-11 h-11 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent mb-4">
            <UserPlus size={21} />
          </div>
          <h2 className="font-display font-medium text-text-primary text-[27px] leading-tight tracking-tight">
            Invite collaborators
          </h2>
          <p className="font-body text-sm text-text-muted leading-relaxed mt-2">
            {storyName ? (
              <>
                Bring the people who shared{' '}
                <span className="font-display italic text-text-primary text-base">
                  &ldquo;{storyName}&rdquo;
                </span>{' '}
                into the book. Anyone with this private link can join and add their
                memories in their own voice.
              </>
            ) : (
              'Bring the people who lived these stories alongside you. Anyone with this private link can join your book and add their memories in their own voice.'
            )}
          </p>

          {/* Story picker */}
          {stories.length > 0 && (
            <div className="mt-5">
              <span className={sectionLabel}>Story</span>
              <select
                value={storyId ?? ''}
                onChange={(e) => onStoryChange?.(e.target.value)}
                aria-label="Story"
                className="w-full mt-2 px-3 py-2.5 bg-background/60 border border-border rounded-xl font-body text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all"
              >
                {stories.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Custom Greeting — members.primer, injected into every chat turn
              via MEMBER CONTEXT. Same field, same 500-char cap, as
              app/admin/members/InviteMemberModal.tsx's admin invite flow. */}
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <span className={sectionLabel}>Custom Greeting</span>
              <span
                className={`font-mono text-[11px] ${
                  primer.length >= PRIMER_MAX_LENGTH * 0.96 ? 'text-red-400' : 'text-text-muted'
                }`}
              >
                {primer.length}/{PRIMER_MAX_LENGTH}
              </span>
            </div>
            <textarea
              value={primer}
              onChange={(e) => onPrimerChange?.(e.target.value.slice(0, PRIMER_MAX_LENGTH))}
              placeholder="Optional — extra context Heirloom should know before this person starts chatting."
              aria-label="Custom Greeting"
              rows={3}
              className="w-full mt-2 px-3 py-2.5 bg-background/60 border border-border rounded-xl font-body text-sm text-text-primary placeholder-text-muted resize-y focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all"
            />
          </div>

          <div className="h-px bg-border my-5" />

          {/* Roster */}
          <div className="flex items-center justify-between mb-3">
            <span className={sectionLabel}>Already invited</span>
            <span className="font-mono text-[11px] text-text-muted">
              {joined} joined · {collaborators.length - joined} pending
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {collaborators.map((c, i) => {
              const isJoined = c.status === 'joined';
              return (
                <div key={`${c.name}-${i}`} className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-9 h-9 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center font-display text-sm font-semibold text-accent">
                    {initials(c.name)}
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col leading-tight">
                    <span className="font-body text-sm text-text-primary truncate">
                      {c.name}
                    </span>
                    <span className="font-body text-xs text-text-muted">
                      {c.relationship}
                    </span>
                  </span>
                  <span
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10.5px] tracking-[0.1em] uppercase border ${
                      isJoined
                        ? 'bg-accent/15 text-accent border-accent/30'
                        : 'bg-text-primary/[0.07] text-text-muted border-transparent'
                    }`}
                  >
                    {isJoined && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    )}
                    {c.status}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-start gap-2 mt-5 pt-4 border-t border-border">
            <Shield size={13} className="flex-shrink-0 text-text-muted mt-0.5" />
            <p className="font-body text-xs text-text-muted leading-relaxed">
              You stay the author. Collaborators can read and add their own
              memories — they can never edit or overwrite yours.
            </p>
          </div>
        </div>

        {/* Footer — magic link. Pinned, never scrolls, always visible. */}
        <div className="flex-shrink-0 border-t border-border p-7 pt-5">
          <span className={sectionLabel}>Magic link</span>
          <div className="flex items-center gap-2.5 mt-2 pl-3 pr-1.5 py-1.5 bg-background/60 border border-border rounded-xl">
            <LinkIcon size={16} className="flex-shrink-0 text-accent" />
            <span className="flex-1 min-w-0 font-mono text-[13px] text-text-primary truncate">
              {magicLink}
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
          <div className="flex items-center justify-between gap-3 mt-2.5">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-text-muted">
              <Clock size={12} />
              {expiresLabel ?? 'Expires in 7 days'}
            </span>
            {onResetLink && (
              <button
                type="button"
                onClick={onResetLink}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg font-body text-[12.5px] font-medium text-text-muted hover:text-accent hover:bg-accent/15 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              >
                <RefreshCw size={13} />
                Reset link
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
