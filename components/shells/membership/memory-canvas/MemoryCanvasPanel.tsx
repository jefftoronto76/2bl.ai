'use client'

/**
 * MemoryCanvasPanel — the right-hand memory canvas: browse every memory kept
 * this session (MemoryCanvasList) or read one (MemoryCardView). Owns its own
 * useMemories(sessionId) instance, independent of MessageList's — same
 * tradeoff useMessageFeedback/useMemories already accept elsewhere in this
 * codebase (each consumer fetches its own copy rather than threading one
 * instance through props). See mode.seedMemory in ./types.ts for how the
 * auto-open-after-keep path stays correct despite that.
 *
 * Heirloom-only — lives beside memory/ as a sibling, not inside
 * components/chat/ (same shell-isolation rule package 3 already
 * established: the widget shell has no memories and no stories).
 */

import { useMemories } from '@/services/chat/ui/v1/useMemories'
import type { Story } from '../v2/types'
import type { MemoryCanvasMode } from './types'
import { MemoryCanvasList } from './MemoryCanvasList'
import { MemoryCardView } from './MemoryCardView'

export interface MemoryCanvasPanelProps {
  sessionId: string | null
  mode: MemoryCanvasMode
  onModeChange: (mode: MemoryCanvasMode) => void
  onClose: () => void
  stories: Story[]
  onMoveToStory: (storyId: string) => void
  /** Icon-only footer on MemoryCardView — see that file's doc comment. */
  compact?: boolean
}

export function MemoryCanvasPanel({ sessionId, mode, onModeChange, onClose, stories, onMoveToStory, compact }: MemoryCanvasPanelProps) {
  const memories = useMemories(sessionId)

  if (mode.view === 'closed') return null

  if (mode.view === 'card') {
    const memory = memories.memories.find(m => m.id === mode.memoryId) ?? mode.seedMemory ?? null
    if (!memory) {
      // Only a genuinely stale/discarded id falls back to the list — not a
      // real id whose row simply hasn't arrived yet from this panel's own
      // in-flight fetch (isLoaded false). Bailing before isLoaded settles
      // would flip 'card' -> 'list' on every open and never come back once
      // the fetch actually resolves.
      if (memories.isLoaded) onModeChange({ view: 'list' })
      return null
    }
    return (
      <MemoryCardView
        memory={memory}
        onBack={() => onModeChange({ view: 'list' })}
        onRetitle={title => memories.rename(memory.id, title)}
        onDiscard={() => {
          void memories.discard(memory)
          onModeChange({ view: 'list' })
        }}
        stories={stories}
        onMoveToStory={onMoveToStory}
        compact={compact}
      />
    )
  }

  return <MemoryCanvasList memories={memories.memories} onClose={onClose} onOpen={id => onModeChange({ view: 'card', memoryId: id })} />
}
