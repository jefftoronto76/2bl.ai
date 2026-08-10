'use client'

// services/chat/ui/v1/useStories.ts
//
// Headless data hook (no JSX) for the sidebar's Stories list, mirroring
// useMemories.ts's fetch-on-mount/optimistic-write shape, simplified: a
// story has no anchor-message concept (no composite key, no per-anchor
// pending/error tracking) and isn't session-scoped, so this fetches once on
// mount rather than re-fetching per sessionId.
//
// The returned StoryListItem type is a deliberate local duplicate of
// components/shells/membership/v2/types.ts's Story (minus `collaborators`,
// which nothing here ever populates) — not an import of it. Same reason
// useMemories.ts keeps its own MemoryRow copy rather than importing
// services/crm/memories.ts's: importing a components/ type into services/
// would be a reverse dependency the `boundaries/element-types` ESLint rule
// (error severity) rejects. The shape is structurally compatible with Story,
// so ChatHero.tsx can pass this hook's array straight into SidebarV2's
// `stories` prop with no adapter.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface StoryListItem {
  id: string
  name: string
  description?: string
}

export interface UseStoriesReturn {
  stories: StoryListItem[]
  /** False until the initial GET has settled (success or failure). */
  isLoaded: boolean
  /** Posts a new story; returns whether it succeeded so the caller can toast on failure — BeginStoryModal's onCreate is a synchronous void callback with no error UI of its own. */
  create(name: string, description: string): Promise<boolean>
  /** Optimistic local removal + DELETE, reverting on failure — mirrors chatStore.tsx's deleteSession pattern. */
  discard(id: string): Promise<void>
}

export function useStories(): UseStoriesReturn {
  const [stories, setStories] = useState<StoryListItem[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const storiesRef = useRef<StoryListItem[]>(stories)
  storiesRef.current = stories

  useEffect(() => {
    fetch('/api/stories')
      .then(r => r.json())
      .then((data: { stories?: StoryListItem[] }) => {
        if (Array.isArray(data.stories)) setStories(data.stories)
      })
      .catch(err => console.error('[useStories] fetch failed:', err))
      .finally(() => setIsLoaded(true))
  }, [])

  const create = useCallback(async (name: string, description: string) => {
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.story) {
        console.error('[useStories] create failed:', res.status)
        return false
      }
      const story = data.story as StoryListItem
      setStories(prev => [...prev, story])
      return true
    } catch (err) {
      console.error('[useStories] create threw:', err)
      return false
    }
  }, [])

  const discard = useCallback(async (id: string) => {
    const prevStories = storiesRef.current
    // Optimistic removal
    setStories(prev => prev.filter(s => s.id !== id))
    try {
      const res = await fetch(`/api/stories/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) throw new Error(`status ${res.status}`)
    } catch (err) {
      console.error('[useStories] discard failed:', id, err)
      // Revert — restore removed story at its original position
      setStories(prevStories)
    }
  }, [])

  return { stories, isLoaded, create, discard }
}
