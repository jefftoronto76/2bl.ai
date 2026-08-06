'use client'

/**
 * UploadReadyCard — the `ready` state: a captionless upload that finished
 * "processing" but has no text to write a passage from, so it never becomes
 * a full MemoryCard. Compact quick-actions card instead: eyebrow + status,
 * the kind's extras (memoryKinds.ts's `extra`, unwired — fires a toast, same
 * as MemoryCard's own type-specific actions), story chips, Keep/Discard.
 *
 * KNOWN UNKNOWN — BLOCKING: this card's "Keep this" has nowhere to write to
 * today. services/crm/memories.ts's createMemoryFromAnchor derives the memory
 * body from the anchor message's own text content and returns a 400
 * (`empty_body_after_marker_strip`) if nothing's left after markers are
 * stripped. A captionless upload has no text, so this call fails outright —
 * not gracefully, just an error. This card cannot be wired for real until a
 * decision is made (see the handoff doc): allow an empty/null body for
 * non-conversation kinds, or require a caption before this card is even
 * reachable. Do not invent an answer in the component — `onKeep` below is
 * typed to fail loudly (a rejected promise) rather than silently swallow it,
 * so integration surfaces the gap instead of hiding it.
 *
 * `onExtra` intentionally has the same shape as MemoryCard's fireExtra — one
 * handler, kind's toast copy passed through — so wiring this up doesn't
 * introduce a second toast mechanism.
 */

import { useState } from 'react'
import { Feather, Image as ImageIcon, Video, Mic, FileText, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MemorySourceKind } from '@/services/chat/ui/v1/useMemories'
import { memoryKindOf } from './memoryKinds'

const KIND_ICONS: Record<string, LucideIcon> = {
  feather: Feather,
  image: ImageIcon,
  video: Video,
  mic: Mic,
  'file-text': FileText,
}

const RAIL = 'w-8 shrink-0'
const EYEBROW = 'font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted'

export interface StoryOption {
  id: string
  name: string
}

export interface UploadReadyCardProps {
  sourceKind: MemorySourceKind
  title: string
  stories: StoryOption[]
  /** Throws/rejects until the backend body-requirement question (see file doc) is resolved. */
  onKeep: (storyId: string) => void | Promise<void>
  onDiscard: () => void
  onExtra: (toastCopy: string) => void
}

export function UploadReadyCard({ sourceKind, title, stories, onKeep, onDiscard, onExtra }: UploadReadyCardProps) {
  const kind = memoryKindOf(sourceKind)
  const Icon = KIND_ICONS[kind.icon] ?? Feather
  const [storyId, setStoryId] = useState(stories[0]?.id ?? '')

  return (
    <div className="flex gap-3">
      <span className={RAIL} />
      <div className="min-w-0 max-w-[420px] flex-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_18px_44px_-26px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-3 px-4 py-[13px]">
          <span className="grid size-11 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent">
            <Icon size={19} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className={EYEBROW}>{kind.eyebrow}</div>
            <div className="mt-0.5 font-body text-[12.5px] text-text-muted">Uploaded — add it to a story</div>
          </div>
          <span className="shrink-0 text-accent"><Check size={16} aria-hidden /></span>
        </div>

        {kind.extra.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-[14px]">
            {kind.extra.map(([label, toastCopy]) => (
              <button
                key={label}
                type="button"
                onClick={() => onExtra(toastCopy)}
                className="rounded-[9px] border border-border px-[11px] py-[7px] font-body text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-text-primary [@media(hover:none)]:min-h-[44px]"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-[10px] border-t border-border px-4 py-[13px]">
          <div className="flex flex-wrap gap-1.5">
            {stories.map(s => {
              const on = s.id === storyId
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStoryId(s.id)}
                  className={[
                    'rounded-full border px-3 py-1.5 font-body text-[12.5px] font-medium transition-colors',
                    on ? 'border-accent bg-accent-soft text-accent' : 'border-border text-text-muted',
                  ].join(' ')}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onKeep(storyId)}
              className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-[9px] bg-accent px-4 py-2 font-body text-[12.5px] font-semibold text-bg hover:bg-accent-hover [@media(hover:none)]:min-h-[44px]"
            >
              Keep this
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="ml-auto whitespace-nowrap rounded-[9px] px-[13px] py-2 font-body text-[12.5px] font-medium text-text-muted hover:text-red-400 [@media(hover:none)]:min-h-[44px]"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
