'use client'

// components/shells/membership/memory/SessionMemoriesPanel.tsx
//
// Lists every memory (draft + published) kept during the active chat
// session — the flow the investigation in Design Handovers/ Aug 2026 Atomic
// Updates/11_session_memory_icon_gap/README.md found missing from main:
// main had MemoryCardView (one memory) and the sidebar's decorative
// SidebarMemoryCount badge, but nothing that listed a session's memories
// for browsing. Adapted from (not copied from) the prototype's own
// SessionMemoriesPanel (chat-widget-canvas.jsx) — same anatomy (header with
// title + count, a scrollable list of rows, each row's kind icon/title/
// date/story tag/passage preview/chevron) rebuilt against this codebase's
// real Tailwind chrome (StoryAdminPanel.tsx/MediaGallery.tsx's shared
// header shape) instead of the reference's inline styles. Not the
// prototype's select-mode variant — that's the photo-attach flow, out of
// scope here.
//
// Shows every status, not published-only: a memory's own draft/published
// state already has real meaning elsewhere (MemoryCard.tsx's draft chrome,
// the sidebar badge's published-only count), and this list is a session
// browser, not a "what's been kept" summary — so it doesn't filter status,
// it labels it. The subtitle deliberately says "N memories this session"
// rather than the prototype's "N kept this session": with drafts included,
// "kept" would overclaim for rows that haven't been kept yet.

import { X, ChevronRight } from 'lucide-react'
import type { MemoryRow } from '@/services/chat/ui/v1/useMemories'
import { memoryKindOf, KIND_ICONS } from './memoryKinds'
import type { Story } from '../v2/types'

export interface SessionMemoriesPanelProps {
  /** Every memory for the active session, any status — unfiltered. */
  memories: MemoryRow[]
  /** For the "Featured in X" story tag on a row whose memory.storyId is set. */
  stories: Story[]
  onClose: () => void
  /** Opens this memory into the existing single-memory MemoryCardView editor. */
  onOpen: (memory: MemoryRow) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function SessionMemoriesPanel({ memories, stories, onClose, onOpen }: SessionMemoriesPanelProps) {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] text-text-primary truncate">Memories from this chat</h2>
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-text-muted mt-0.5">
            {memories.length} {memories.length === 1 ? 'memory' : 'memories'} this session
          </p>
        </div>
        <button
          type="button"
          aria-label="Close session memories panel"
          onClick={onClose}
          className="grid place-items-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {memories.length === 0 ? (
          <p className="font-body text-sm italic text-text-muted">No memories yet</p>
        ) : (
          <div className="flex flex-col gap-2">
            {memories.map((memory) => {
              const kind = memoryKindOf(memory.source_kind)
              const Icon = KIND_ICONS[kind.icon]
              const story = memory.storyId ? stories.find((s) => s.id === memory.storyId) : undefined
              return (
                <button
                  key={memory.id}
                  type="button"
                  onClick={() => onOpen(memory)}
                  className="w-full flex items-center gap-3.5 text-left rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="flex-shrink-0 grid place-items-center w-9 h-9 rounded-full bg-accent/15 text-accent">
                    {Icon && <Icon size={16} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="font-display text-base font-medium text-text-primary truncate">
                        {memory.title}
                      </span>
                      {memory.status === 'draft' && (
                        <span className="flex-shrink-0 font-mono text-[9.5px] tracking-[0.1em] uppercase text-text-muted">
                          Draft
                        </span>
                      )}
                      <span className="flex-shrink-0 font-mono text-[10px] tracking-[0.05em] text-text-muted">
                        {formatDate(memory.created_at)}
                      </span>
                    </span>
                    {story && (
                      <span className="block mt-0.5 font-mono text-[10px] tracking-[0.05em] text-accent truncate">
                        Featured in {story.name}
                      </span>
                    )}
                    <span className="block mt-0.5 font-body text-[13px] leading-snug text-text-muted truncate">
                      {memory.body}
                    </span>
                  </span>
                  <ChevronRight size={16} className="flex-shrink-0 text-text-muted" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
