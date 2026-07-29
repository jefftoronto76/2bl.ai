'use client'

/**
 * MemoryCard — the four states of a memory in the transcript, per the design
 * handoff (docs/heirloom_chat_handoffV2_2026_July 28/memories/README.md §5).
 * Anchored into MessageList.tsx's per-message render functions — it sits
 * inline, below the message it followed, not in its own transcript slot (see
 * CLAUDE.md's Memories architecture note).
 *
 * The card is READ-ONLY by design. Title and passage cannot be edited
 * inline; revision happens through the Rewrite conversation flow (see
 * MessageList.tsx). Do not add inline editing without a design conversation
 * — it changes the product's posture from "we shaped this for you" to "fill
 * in this form".
 *
 * Only real, confirmed Tailwind tokens are used here (tailwind.config.js):
 * text-primary / text-muted / border / surface / surface-2 / accent /
 * accent-hover / accent-soft, plus the default red-400 for the one
 * destructive hover state (matching MessageBubble's own failed-delivery
 * styling). No story chips — memories don't require a story to be saved
 * (per the approved plan; a memory may connect to nothing, or to more than
 * one thing, later).
 */

import { useState } from 'react'
import { Bookmark, Check, Feather, Image as ImageIcon, Video, Mic, FileText, ImagePlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MemoryRow } from '@/services/chat/ui/v1/useMemories'
import type { MemoryErrorType } from '@/services/crm/memory-errors'
import { memoryKindOf } from './memoryKinds'
import { MEMORY_ERROR_COPY } from './memoryErrorCopy'

const KIND_ICONS: Record<string, LucideIcon> = {
  feather: Feather,
  image: ImageIcon,
  video: Video,
  mic: Mic,
  'file-text': FileText,
}

/** Aligns every card/pill/receipt with the assistant avatar rail (w-8) they sit below. */
const RAIL = 'w-8 shrink-0'
const EYEBROW = 'font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted'

/** `running` state — pulsing kind icon + the kind's running copy. No cancel (not cancellable in v1). */
export function MemoryRunningPill({ sourceKind }: { sourceKind: MemoryRow['source_kind'] }) {
  const kind = memoryKindOf(sourceKind)
  const Icon = KIND_ICONS[kind.icon] ?? Feather
  return (
    <div className="flex items-center gap-3">
      <span className={RAIL} />
      <div className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface px-[15px] py-2.5">
        <Icon size={14} className="animate-pulse text-accent" aria-hidden />
        <span className="font-body text-[13.5px] text-text-muted">{kind.running}</span>
      </div>
    </div>
  )
}

/**
 * Live failure signal (CLAUDE.md §4.2) — not persisted, not a card. Stays
 * until the visitor tries the bookmark again, rather than auto-dismissing.
 */
export function MemoryErrorLine({ errorType }: { errorType: MemoryErrorType }) {
  return (
    <div className="flex items-center gap-3" role="status">
      <span className={RAIL} />
      <span className="font-mono text-[11px] tracking-[0.06em] text-text-muted">{MEMORY_ERROR_COPY[errorType]}</span>
    </div>
  )
}

/** `saved` state — collapses to a slim receipt. Whole row is a button (inert this pass — the story view doesn't exist yet). */
export function MemorySavedReceipt({ memory }: { memory: MemoryRow }) {
  const kind = memoryKindOf(memory.source_kind)
  const Icon = KIND_ICONS[kind.icon] ?? Feather
  return (
    <div className="flex gap-3">
      <span className={RAIL} />
      <div className="flex min-w-0 flex-1 items-center gap-[11px] rounded-[13px] border border-border bg-surface px-[14px] py-[11px]">
        <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <Check size={13} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[15.5px] leading-[1.25] text-text-primary">{memory.title}</span>
          <span className="mt-0.5 flex items-center gap-1 font-mono text-[10.5px] tracking-[0.06em] text-text-muted">
            <Icon size={10} aria-hidden />
            Kept
          </span>
        </span>
      </div>
    </div>
  )
}

export interface MemoryCardProps {
  memory: MemoryRow
  onKeep: () => void
  onRewrite: () => void
  onDiscard: () => void
}

/** `draft` state — the full card. Order: header -> media (if any) -> title -> passage -> photo slots (if any) -> footer. */
export function MemoryCard({ memory, onKeep, onRewrite, onDiscard }: MemoryCardProps) {
  const kind = memoryKindOf(memory.source_kind)
  const Icon = KIND_ICONS[kind.icon] ?? Feather
  const [toast, setToast] = useState<string | null>(null)

  // Type-specific actions are specified but not built this pass — they fire
  // this lightweight local toast rather than a real flow (see memoryKinds.ts).
  const fireExtra = (toastCopy: string) => {
    setToast(toastCopy)
    window.setTimeout(() => setToast(null), 2400)
  }

  return (
    <div className="flex gap-3">
      <span className={RAIL} />
      <div className="hl-animate-modal min-w-0 max-w-[520px] flex-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_18px_44px_-26px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-[11px]">
          <Icon size={12} className="text-accent" aria-hidden />
          <span className={EYEBROW}>{kind.eyebrow}</span>
        </div>

        <div className="px-[18px] pb-[18px] pt-4">
          {kind.media && (
            <div className="mb-4 flex h-32 items-center justify-center rounded-[10px] border border-dashed border-border bg-surface-2">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-muted">
                {kind.media === 'still' && 'Photo'}
                {kind.media === 'video' && 'Video'}
                {kind.media === 'audio' && 'Recording'}
                {kind.media === 'page' && 'Document'}
              </span>
            </div>
          )}

          <h4 className="m-0 text-pretty font-display text-[23px] font-medium leading-[1.16] tracking-[-0.01em] text-text-primary">
            {memory.title}
          </h4>
          <p className="mb-0 mt-[11px] text-pretty font-body text-[14.5px] leading-[1.68] text-text-muted">
            {memory.body}
          </p>

          {/* Photos on a card are a promise, not an upload, in v1 — non-interactive on purpose. Shown only on kinds where media isn't already the hero. */}
          {kind.slots && (
            <>
              <div className="mt-[18px] flex items-center gap-2">
                <span className={EYEBROW}>Photos</span>
                <span className="font-body text-xs text-text-muted">— add them whenever you find them</span>
              </div>
              <div className="mt-2 flex gap-[7px]">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="grid size-[52px] place-items-center rounded-[10px] border border-dashed border-border bg-surface-2 text-text-muted"
                  >
                    <ImagePlus size={15} aria-hidden />
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="mt-[18px] flex flex-col gap-[11px] border-t border-border pt-[15px]">
            {/* Row 1 — type-specific actions. Own row, smaller, allowed to wrap. Never threatens the spine. */}
            {kind.extra.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {kind.extra.map(([label, toastCopy]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => fireExtra(toastCopy)}
                    className="rounded-[9px] border border-border px-[11px] py-[7px] font-body text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-text-primary [@media(hover:none)]:min-h-[44px]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Row 2 — the spine. Keep this first, Rewrite and Discard last, one line, never wraps, never reorders. */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onKeep}
                className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-[9px] bg-accent px-4 py-2 font-body text-[12.5px] font-semibold text-bg hover:bg-accent-hover [@media(hover:none)]:min-h-[44px]"
              >
                <Bookmark size={13} aria-hidden />
                Keep this
              </button>
              <button
                type="button"
                onClick={onRewrite}
                className="whitespace-nowrap rounded-[9px] border border-border px-[13px] py-2 font-body text-[12.5px] font-medium text-text-muted hover:border-accent hover:text-text-primary [@media(hover:none)]:min-h-[44px]"
              >
                Rewrite
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

          {toast && (
            <div className="mt-2 font-mono text-[10.5px] tracking-[0.04em] text-text-muted" role="status">
              {toast}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
