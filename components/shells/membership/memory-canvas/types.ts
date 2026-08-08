// components/shells/membership/memory-canvas/types.ts
//
// Mode union for the memory canvas panel (list / single-memory card).
// 'closed' is a real state, not a separate boolean, so "is the panel open"
// and "which view is showing" can never disagree.

import type { MemoryRow } from '@/services/chat/ui/v1/useMemories'

export type MemoryCanvasMode =
  | { view: 'closed' }
  | { view: 'list' }
  | {
      view: 'card'
      memoryId: string
      /**
       * Optimistic snapshot of the memory to render immediately, before the
       * panel's own useMemories fetch has necessarily caught up. Set only
       * when auto-opening right after "Keep this" (ChatHero's onMemoryKept)
       * — the panel has its own separate useMemories(sessionId) instance
       * from the one MessageList uses (each fetches independently, same
       * tradeoff useMessageFeedback/useMemories already accept elsewhere),
       * so without a seed the just-kept memory may not be in the panel's
       * own list yet the instant it opens. Rows opened by clicking inside
       * the panel's own list never need this — the panel already has the
       * row in memory at that point.
       */
      seedMemory?: MemoryRow
    }
