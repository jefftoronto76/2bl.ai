'use client';

/**
 * MemoryRunningCard — the `running` state.
 *
 * REPLACES main's MemoryRunningPill (components/shells/membership/memory/MemoryCard.tsx) —
 * that pill (pulsing icon + one line, no card chrome) is now stale relative to design intent.
 * This is a full card shell, same size/radius/shadow as the eventual draft card, holding:
 *   header (icon + eyebrow) → media placeholder (kind-dependent) → crossfading status ticker
 *   → progress bar.
 *
 * The ticker cycles through 2-4 kind-specific phrases (`RUNNING_STEPS`) every ~1.3s and the bar
 * eases toward 92% (never 100% — it doesn't know real completion time; the last step holds until
 * the draft actually resolves and this component unmounts in favor of the draft card).
 */

import { useEffect, useState } from 'react';
import { Feather, Image, Video, Mic, FileText, type LucideIcon } from 'lucide-react';
import type { MemoryKind } from './memoryKinds';

const KIND_ICONS: Record<string, LucideIcon> = { feather: Feather, image: Image, video: Video, mic: Mic, file: FileText };

export const RUNNING_STEPS: Record<MemoryKind, string[]> = {
  conversation: ['Gathering this memory', 'Finding the words', 'Almost there'],
  photo: ['Uploading your photo', 'Looking closely', 'Remembering the moment', 'Almost there'],
  video: ['Uploading your video', 'Watching it back', 'Finding the moment', 'Almost there'],
  audio: ['Uploading your recording', 'Listening closely', 'Almost there'],
  document: ['Uploading your document', 'Reading it over', 'Almost there'],
};

// Matches memoryKinds.ts's `media` field: which visual placeholder (if any) sits under the header.
const MEDIA_SHAPE: Record<MemoryKind, 'still' | 'video' | 'audio' | 'page' | null> = {
  conversation: null, photo: 'still', video: 'video', audio: 'audio', document: 'page',
};

export function MemoryRunningCard({
  kind,
  eyebrow,
}: {
  kind: MemoryKind;
  eyebrow: string; // MemoryKindSpec.eyebrow — same string the draft card's header will show
}) {
  const Icon = KIND_ICONS[kind] ?? Feather;
  const steps = RUNNING_STEPS[kind] ?? RUNNING_STEPS.conversation;
  const [i, setI] = useState(0);
  const media = MEDIA_SHAPE[kind];

  useEffect(() => {
    setI(0);
    const id = setInterval(() => setI((v) => (v < steps.length - 1 ? v + 1 : v)), 1300);
    return () => clearInterval(id);
  }, [steps]);

  const progress = Math.round(((i + 1) / steps.length) * 92);

  return (
    <div className="flex gap-3">
      <span className="w-8 shrink-0" />
      <div className="hl-animate-modal min-w-0 max-w-[520px] flex-1 overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-[0_18px_44px_-26px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-[11px]">
          <Icon size={12} className="text-accent" aria-hidden />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">{eyebrow}</span>
        </div>

        {(media === 'still' || media === 'video') && (
          <div className={`relative grid place-items-center overflow-hidden border-b border-border bg-surface-muted ${media === 'video' ? 'aspect-video' : 'aspect-[16/10]'}`}>
            <span className="up-glow absolute h-[130px] w-[130px] rounded-full bg-accent" aria-hidden="true" />
            <span className="up-hum relative text-accent"><Icon size={26} /></span>
          </div>
        )}
        {(media === 'audio' || media === 'page') && (
          <div className="flex items-center gap-3 border-b border-border bg-surface-muted px-[18px] py-[13px]">
            <span className="relative h-[34px] w-[34px] shrink-0">
              <span className="up-glow absolute -inset-[9px] rounded-full bg-accent" aria-hidden="true" />
              <span className="up-hum relative grid h-[34px] w-[34px] place-items-center rounded-full bg-accent-soft text-accent"><Icon size={16} /></span>
            </span>
            <span className="up-shimmer-bar h-[10px] flex-1 rounded-full" />
          </div>
        )}

        <div className="px-[18px] pb-4 pt-[15px]">
          <div className="relative h-[18px] overflow-hidden">
            <span key={i} className="up-ticker absolute inset-0 font-body text-[13.5px] text-text-secondary">{steps[i]}…</span>
          </div>
          <div className="mt-[11px] h-[3px] overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-accent transition-[width] duration-[1150ms] ease-out" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * `up-glow` / `up-hum` / `up-shimmer-bar` / `up-ticker` / `hl-animate-modal` are existing
 * keyframe classes already in the codebase (UploadThumbnail.tsx and MemoryCard.tsx both use
 * `hl-animate-modal`) — reuse those definitions, don't redeclare them.
 */
