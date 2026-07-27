'use client';

/**
 * MemoryCard — the four states of a memory in the transcript.
 *
 * The card is READ-ONLY by design. Title and passage cannot be edited inline;
 * revision happens through conversation (see the Rewrite flow in the README).
 * Do not add inline editing without a design conversation — it changes the
 * product's posture from "we shaped this for you" to "fill in this form".
 */

import { useState } from 'react';
import { Bookmark, Check, Sparkles, ImagePlus } from 'lucide-react';
import type { MemoryToolMessage, Story } from './types';

export type MemoryCardProps = {
  message: MemoryToolMessage;
  stories: Story[];
  onSave: (storyId: string) => void;
  onRewrite: () => void;
  onDiscard: () => void;
  onOpen: () => void;
};

const EYEBROW = 'font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary';
const RAIL = 'w-8 shrink-0'; // aligns the card with the assistant avatar rail

export function MemoryCard({ message, stories, onSave, onRewrite, onDiscard, onOpen }: MemoryCardProps) {
  const [storyId, setStoryId] = useState(message.storyId ?? stories[0]?.id ?? '');

  if (message.state === 'running') {
    return (
      <div className="flex items-center gap-3">
        <span className={RAIL} />
        <div className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface px-[15px] py-2.5">
          <Sparkles size={14} className="animate-pulse text-accent" />
          <span className="font-body text-[13.5px] text-text-secondary">Gathering this memory…</span>
        </div>
      </div>
    );
  }

  if (message.state === 'discarded') {
    return (
      <div className="pl-11 font-mono text-[11px] tracking-[0.06em] text-text-tertiary">
        Memory discarded
      </div>
    );
  }

  if (message.state === 'saved') {
    const story = stories.find((s) => s.id === message.storyId);
    return (
      <div className="flex gap-3">
        <span className={RAIL} />
        <button
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-[11px] rounded-[13px] border border-border bg-surface px-[14px] py-[11px] text-left transition-colors hover:border-border-strong"
        >
          <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <Check size={13} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[15.5px] leading-[1.25] text-text-primary">
              {message.title}
            </span>
            <span className="mt-0.5 block font-mono text-[10.5px] tracking-[0.06em] text-text-tertiary">
              Kept in {story?.name ?? 'your book'}
            </span>
          </span>
        </button>
      </div>
    );
  }

  /* draft */
  return (
    <div className="flex gap-3">
      <span className={RAIL} />
      <div className="min-w-0 flex-1 max-w-[520px] overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-[0_18px_44px_-26px_var(--hl-shadow)] motion-safe:animate-[hl-modal-in_.26s_cubic-bezier(.22,1,.36,1)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-[11px]">
          <Bookmark size={12} className="text-accent" />
          <span className={EYEBROW}>A memory, written up</span>
        </div>

        <div className="px-[18px] pb-[18px] pt-4">
          <h4 className="m-0 font-display text-[23px] font-medium leading-[1.16] tracking-[-0.01em] text-text-primary text-pretty">
            {message.title}
          </h4>
          <p className="mb-0 mt-[11px] font-body text-[14.5px] leading-[1.68] text-text-secondary text-pretty">
            {message.passage}
          </p>

          {/* Photos are a PROMISE, not an upload, in v1 — non-interactive on purpose. */}
          <div className="mt-[18px] flex items-center gap-2">
            <span className={EYEBROW}>Photos</span>
            <span className="font-body text-xs text-text-tertiary">
              — add them whenever you find them
            </span>
          </div>
          <div className="mt-2 flex gap-[7px]">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="grid size-[52px] place-items-center rounded-[10px] border border-dashed border-border-strong bg-surface-muted text-text-tertiary"
              >
                <ImagePlus size={15} />
              </span>
            ))}
          </div>

          <div className="mt-[18px]">
            <span className={EYEBROW}>Keep it in</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stories.map((s) => {
              const on = s.id === storyId;
              return (
                <button
                  key={s.id}
                  onClick={() => setStoryId(s.id)}
                  className={[
                    'rounded-full border px-3 py-1.5 font-body text-[12.5px] font-medium transition-all',
                    // Touch targets: raise to 44px on coarse pointers.
                    '[@media(hover:none)]:min-h-[44px] [@media(hover:none)]:px-4',
                    on
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-border text-text-secondary',
                  ].join(' ')}
                >
                  {s.name}
                </button>
              );
            })}
          </div>

          <div className="mt-[18px] flex flex-wrap items-center gap-2 border-t border-border pt-[15px]">
            <button
              onClick={() => onSave(storyId)}
              className="inline-flex items-center gap-[7px] rounded-[9px] bg-accent px-4 py-2 font-body text-[12.5px] font-semibold text-background hover:bg-accent-hover"
            >
              <Bookmark size={13} />
              Keep this
            </button>
            <button
              onClick={onRewrite}
              className="rounded-[9px] border border-border px-[13px] py-2 font-body text-[12.5px] font-medium text-text-secondary hover:border-border-strong hover:text-text-primary"
            >
              Rewrite
            </button>
            <button
              onClick={onDiscard}
              className="ml-auto rounded-[9px] px-[13px] py-2 font-body text-[12.5px] font-medium text-text-tertiary hover:text-danger"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
