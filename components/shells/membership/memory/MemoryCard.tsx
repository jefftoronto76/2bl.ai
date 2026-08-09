'use client'

/**
 * MemoryCard — the four states of a memory in the transcript, per the design
 * handoff (Design Handovers/heirloom_chat_handoffV2_2026_July 28/memories/README.md §5).
 * Anchored into MessageList.tsx's per-message render functions — it sits
 * inline, below the message it followed, not in its own transcript slot (see
 * the Memories entry in System Docs/Known Gaps.md).
 *
 * The PASSAGE is READ-ONLY by design and, as of the archivist's removal, has
 * no revision path at all — the "Rewrite" button below is unwired to a local
 * stub (fires a toast, does nothing) pending a future redesign, since the
 * model call that used to power it is gone. Today the only way to get a
 * different passage is Discard + bookmark the message again. Do not add
 * inline editing to the passage without a design conversation — it changes
 * the product's posture from "we shaped this for you" to "fill in this form".
 *
 * The TITLE is the one deliberate exception, but only on the draft card
 * below: whether it came from a guide-emitted [MEMORY_TITLE: ...] marker or
 * the deterministic fallback truncation (services/crm/memories.ts's
 * deriveFallbackMemoryTitle), it's treated as an optimistic guess the member
 * can directly correct — no conversation round-trip required, unlike the
 * passage. MemorySavedReceipt below has no edit affordance at all (removed
 * 2026-08-08, saved-receipt fixes pass) — its title is plain, read-only text.
 *
 * Only real, confirmed Tailwind tokens are used here (tailwind.config.js):
 * text-primary / text-muted / border / surface / surface-2 / accent /
 * accent-hover / accent-soft, plus the default red-400 for the one
 * destructive hover state (matching MessageBubble's own failed-delivery
 * styling). No story chips — memories don't require a story to be saved
 * (per the approved plan; a memory may connect to nothing, or to more than
 * one thing, later).
 */

import { useEffect, useRef, useState } from 'react'
import { Bookmark, Check, Feather, ImagePlus, Pencil, Plus } from 'lucide-react'
import type { MemoryRow } from '@/services/chat/ui/v1/useMemories'
import type { ChatErrorType } from '@/services/chat/ui/v1/types'
import { ERROR_COPY } from '@/components/chat/errorCopy'
import { memoryKindOf, KIND_ICONS } from './memoryKinds'
import type { SessionImage } from './BlockCanvas'

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
 * Live failure signal (see the Memories entry in System Docs/Known Gaps.md) —
 * not persisted, not a card. Stays until the visitor retries, rather than
 * auto-dismissing. `errorType` is classified by useMemories.ts's create()
 * (network / account_required / server_error / invalid_response / unknown)
 * and rendered via the shared components/chat/errorCopy.ts ERROR_COPY
 * vocabulary — the same system WidgetShell/MessageList's main turn-error
 * banner already uses, not a memory-specific one.
 */
export function MemoryErrorLine({ errorType, onRetry }: { errorType: ChatErrorType; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3" role="status">
      <span className={RAIL} />
      <span className="font-mono text-[11px] tracking-[0.06em] text-text-muted">{ERROR_COPY[errorType]}</span>
      <button
        type="button"
        onClick={onRetry}
        className="font-mono text-[11px] font-medium tracking-[0.06em] text-accent hover:text-accent-hover"
      >
        Try again
      </button>
    </div>
  )
}

export interface MemorySavedReceiptProps {
  memory: MemoryRow
  onRetitle: (title: string) => void
  /**
   * Opens this memory in the memory panel (Stage A of
   * Design Handovers/design_handoff_memory_panel_layout_2026/README.md).
   * Optional so callers that haven't wired a panel yet (none currently) can
   * still render the receipt inert, same posture as every other optional
   * handler in this file.
   */
  onOpen?: (memory: MemoryRow) => void
  /**
   * Fires the shared "coming soon" toast for the "+" below — same stub
   * pattern as MemoryCardView's own header "+" (add to a story; stories
   * aren't a buildable concept yet). Optional so a caller that hasn't wired
   * a toast (none currently outside ChatHero.tsx) renders the receipt with
   * no "+" at all rather than a silently-broken one.
   */
  onStub?: (message: string) => void
  /**
   * The session's own ready image media items — same lookup pattern as
   * BlockCanvas.tsx's ImageBlockRow, already applied to MemoryCard's own
   * draft state and the memory panel. When memory.media_item_id resolves
   * here, the icon circle below is REPLACED by a real thumbnail (not shown
   * alongside it) — no match, or no media_item_id, keeps the icon circle
   * exactly as before. Defaults to `[]` — non-breaking for any caller that
   * hasn't wired this yet.
   */
  sessionImages?: SessionImage[]
}

/**
 * `saved` state — collapses to a slim receipt. Read-only, no edit affordance
 * (removed 2026-08-08 — see the diff-audit follow-up: inline rename doesn't
 * belong here). The whole row opens the memory panel (added 2026-08-08,
 * panel-layout Stage A) — `onRetitle` stays in the prop type because
 * MessageList.tsx's call site still passes it (unused here on purpose,
 * not dead code to clean up outside this file's scope).
 */
export function MemorySavedReceipt({ memory, onOpen, onStub, sessionImages = [] }: MemorySavedReceiptProps) {
  const kind = memoryKindOf(memory.source_kind)
  const Icon = KIND_ICONS[kind.icon] ?? Feather
  const linkedImage = memory.media_item_id ? sessionImages.find((img) => img.id === memory.media_item_id) : undefined

  return (
    <div className="flex gap-3">
      <span className={RAIL} />
      <div
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen ? () => onOpen(memory) : undefined}
        onKeyDown={
          onOpen
            ? e => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                onOpen(memory)
              }
            : undefined
        }
        className={`flex min-w-0 flex-1 items-center gap-[11px] rounded-[13px] border border-border bg-surface px-[14px] py-[11px] ${onOpen ? 'cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-accent' : ''}`}
      >
        {linkedImage ? (
          <span className="block size-[34px] shrink-0 overflow-hidden rounded-[9px] border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- same convention as BlockCanvas.tsx's ImageBlockRow, a signed URL that changes shape/expiry too often to benefit from next/image */}
            <img src={linkedImage.url} alt={linkedImage.filename} className="block size-full object-cover" />
          </span>
        ) : (
          <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <Icon size={12} aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[15.5px] leading-[1.25] text-text-primary">{memory.title}</span>
          <span className="mt-0.5 flex items-center gap-1 font-mono text-[10.5px] tracking-[0.06em] text-text-muted">
            <Check size={10} aria-hidden />
            Kept
          </span>
        </span>
        {onStub && (
          <button
            type="button"
            onClick={e => {
              // Stop this from also bubbling into the row's own onClick
              // (which opens the memory panel) — a "+" click means "add to
              // a story", not "open this memory".
              e.stopPropagation()
              onStub('Coming soon')
            }}
            onKeyDown={e => e.stopPropagation()}
            aria-label="Add to a story"
            title="Adding to a story is coming soon"
            className="grid size-6 shrink-0 place-items-center rounded-md border-none bg-transparent text-text-muted transition-colors hover:text-text-primary"
          >
            <Plus size={13} aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}

export interface MemoryCardProps {
  memory: MemoryRow
  onKeep: () => void
  onDiscard: () => void
  onRetitle: (title: string) => void
  /**
   * The session's own ready image media items — same lookup pattern as
   * BlockCanvas.tsx's ImageBlockRow (`sessionImages.find((img) => img.id
   * === ...)`), already applied to the panel's block canvas and the memory
   * panel's own hero. A DRAFT photo memory already has a real
   * `media_item_id` at create time (createPhotoMemoryFromMedia sets it
   * before Keep, not after), so this card can show the real photo instead
   * of the placeholder below, same as the saved/panel states already do.
   * Defaults to `[]` — a memory with no media_item_id, or one that doesn't
   * resolve (stale/removed/no-longer-accessible), falls back to the
   * existing placeholder exactly as before, same graceful-degradation
   * posture as every other application of this pattern.
   */
  sessionImages?: SessionImage[]
}

/** `draft` state — the full card. Order: header -> media (if any) -> title -> passage -> photo slots (if any) -> footer. */
export function MemoryCard({ memory, onKeep, onDiscard, onRetitle, sessionImages = [] }: MemoryCardProps) {
  const kind = memoryKindOf(memory.source_kind)
  const linkedImage = memory.media_item_id ? sessionImages.find((img) => img.id === memory.media_item_id) : undefined
  const Icon = KIND_ICONS[kind.icon] ?? Feather
  const [toast, setToast] = useState<string | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(memory.title)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Type-specific actions are specified but not built this pass — they fire
  // this lightweight local toast rather than a real flow (see memoryKinds.ts).
  // Rewrite (below, in the spine) is the same shape now: unwired to a stub
  // pending a redesign, since the archivist that used to power it is gone.
  const fireExtra = (toastCopy: string) => {
    setToast(toastCopy)
    window.setTimeout(() => setToast(null), 2400)
  }

  useEffect(() => {
    if (!isEditingTitle) return
    titleInputRef.current?.focus()
    titleInputRef.current?.select()
  }, [isEditingTitle])

  const saveTitle = () => {
    const trimmed = titleDraft.trim()
    setIsEditingTitle(false)
    if (!trimmed || trimmed === memory.title) return
    onRetitle(trimmed)
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
            linkedImage ? (
              <div className="mb-4 overflow-hidden rounded-[10px] border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- same convention as BlockCanvas.tsx's ImageBlockRow / UploadThumbnail.tsx, a signed URL that changes shape/expiry too often to benefit from next/image */}
                <img src={linkedImage.url} alt={linkedImage.filename} className="block max-h-80 w-full object-contain" />
              </div>
            ) : (
              <div className="mb-4 flex h-32 items-center justify-center rounded-[10px] border border-dashed border-border bg-surface-2">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-muted">
                  {kind.media === 'still' && 'Photo'}
                  {kind.media === 'video' && 'Video'}
                  {kind.media === 'audio' && 'Recording'}
                  {kind.media === 'page' && 'Document'}
                </span>
              </div>
            )
          )}

          <div className="group flex items-start gap-2">
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    saveTitle()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setTitleDraft(memory.title)
                    setIsEditingTitle(false)
                  }
                }}
                aria-label="Memory title"
                className="m-0 min-w-0 flex-1 bg-transparent text-pretty font-display text-[23px] font-medium leading-[1.16] tracking-[-0.01em] text-text-primary outline-none"
              />
            ) : (
              <>
                <h4 className="m-0 min-w-0 flex-1 text-pretty font-display text-[23px] font-medium leading-[1.16] tracking-[-0.01em] text-text-primary">
                  {memory.title}
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setTitleDraft(memory.title)
                    setIsEditingTitle(true)
                  }}
                  aria-label="Edit title"
                  className="mt-1 shrink-0 rounded p-1 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text-primary [@media(hover:none)]:opacity-100"
                >
                  <Pencil size={13} aria-hidden />
                </button>
              </>
            )}
          </div>
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
                onClick={() => fireExtra('Rewrite is being reworked — check back soon.')}
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
