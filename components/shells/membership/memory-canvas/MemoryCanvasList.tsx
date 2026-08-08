'use client'

/**
 * MemoryCanvasList — the memory canvas panel's list (browse) view. Lists
 * every memory kept this session (same `useMemories(sessionId)` data the
 * inline transcript cards already use — this is a second view onto the same
 * rows, not a separate store), click a row to open it in MemoryCardView.
 *
 * Select mode (opened from a photo's "Add to a memory" action) is a later
 * stage — this component is browse-only for now.
 */

import { Feather, ChevronRight, X } from 'lucide-react'
import type { MemoryRow } from '@/services/chat/ui/v1/useMemories'
import { memoryKindOf, KIND_ICONS } from '../memory/memoryKinds'

function formatMemoryDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export interface MemoryCanvasListProps {
  memories: MemoryRow[]
  onClose: () => void
  onOpen: (id: string) => void
}

export function MemoryCanvasList({ memories, onClose, onOpen }: MemoryCanvasListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-border px-[18px] py-[14px]">
        <div>
          <h3 className="m-0 font-display text-lg font-medium text-text-primary">Memories from this chat</h3>
          <p className="mt-0.5 font-mono text-[11px] tracking-[0.06em] text-text-muted">
            {memories.length} kept this session
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid place-items-center rounded-lg border-none bg-transparent p-1.5 text-text-muted hover:text-text-primary"
        >
          <X size={18} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-5">
        {memories.length === 0 ? (
          <p className="font-body text-sm italic text-text-muted">No memories kept yet.</p>
        ) : (
          memories.map(m => {
            const kind = memoryKindOf(m.source_kind)
            const KindIcon = KIND_ICONS[kind.icon] ?? Feather
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpen(m.id)}
                className="flex w-full items-center gap-3.5 rounded-2xl border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:border-accent [@media(hover:none)]:min-h-[44px]"
              >
                <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                  <KindIcon size={16} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-display text-base font-medium text-text-primary">{m.title}</span>
                    <span className="shrink-0 font-mono text-[10px] tracking-wide text-text-muted">
                      {formatMemoryDate(m.created_at)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate font-body text-[13px] text-text-muted">{m.body}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
