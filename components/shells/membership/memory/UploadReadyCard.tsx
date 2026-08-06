'use client'

/**
 * UploadReadyCard — the `ready` state: a captionless upload that finished
 * processing but has no text to write a passage from, so it never becomes a
 * full MemoryCard. Compact quick-actions card instead: eyebrow + status, the
 * kind's extras (memoryKinds.ts's `extra`), story chips, Keep/Discard.
 *
 * Real memory/artifact creation is out of scope this pass (see
 * System Docs/Known Gaps.md and the staged implementation plan this shipped
 * from) — services/crm/memories.ts's createMemoryFromAnchor requires
 * non-empty body text, which a captionless upload never has. "Keep this"
 * and the kind's quick actions are unwired to a local toast, the identical
 * pattern MemoryCard.tsx's own Rewrite button already uses (fireExtra,
 * 2.4s auto-dismiss, role="status") — this sidesteps the blocking product
 * question entirely rather than resolving it, matching the rest of this
 * card family's convention for undesigned interactions.
 *
 * onDiscard IS real: a client-local dismiss (no backend delete route or
 * `discarded` status exists), see UploadCard.tsx/MessageList.tsx for the
 * dismissedMediaIds state backing it.
 */

import { useState } from 'react'
import { Feather, Check } from 'lucide-react'
import type { MemorySourceKind } from '@/services/chat/ui/v1/useMemories'
import { memoryKindOf, KIND_ICONS } from './memoryKinds'

const RAIL = 'w-8 shrink-0'
const EYEBROW = 'font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted'

export interface StoryOption {
  id: string
  name: string
}

export interface UploadReadyCardProps {
  sourceKind: MemorySourceKind
  /** Empty by default this pass — story-linking isn't wired, so nothing populates this yet. */
  stories?: StoryOption[]
  onDiscard: () => void
}

export function UploadReadyCard({ sourceKind, stories = [], onDiscard }: UploadReadyCardProps) {
  const kind = memoryKindOf(sourceKind)
  const Icon = KIND_ICONS[kind.icon] ?? Feather
  const [storyId, setStoryId] = useState(stories[0]?.id ?? '')
  const [toast, setToast] = useState<string | null>(null)

  // Same shape as MemoryCard.tsx's own fireExtra — one shared toast
  // mechanism/convention across the whole memory-card family, not a second
  // one invented for uploads.
  const fireExtra = (toastCopy: string) => {
    setToast(toastCopy)
    window.setTimeout(() => setToast(null), 2400)
  }

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

        <div className="px-4 pb-[14px]">
          {kind.extra.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-[10px]">
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

          {stories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-border pb-[10px] pt-[13px]">
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
          )}

          <div className={['flex items-center gap-2 pt-[13px]', kind.extra.length > 0 || stories.length > 0 ? 'border-t border-border' : ''].join(' ')}>
            <button
              type="button"
              onClick={() => fireExtra('Saving uploads to a story is coming soon.')}
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
