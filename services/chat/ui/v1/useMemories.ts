'use client'

// services/chat/ui/v1/useMemories.ts
//
// Headless data hook (no JSX) for the Heirloom memory bookmark/card, mirroring
// useMessageFeedback.ts's shape: fetch-on-mount, keyed lookup, optimistic
// local state on write. The key difference from useMessageFeedback is
// deliberate — this is keyed by the anchor message's stable UIMessage.id, not
// its array position, specifically to avoid the index-drift class of bug
// message_feedback has to guard against on every edit/truncate (see
// CLAUDE.md's Memories section).
//
// There is no "running" status to fetch or reconcile on mount — a memory row
// only ever exists once createMemoryFromAnchor actually succeeded (see
// services/crm/memories.ts's module doc), so an in-flight call is pure local
// UI state (pendingAnchors below), never persisted, never stuck on reload.
//
// No model call anywhere behind this hook — create() is a verbatim write, and
// there is no rewrite() anymore (the archivist that used to power it is
// gone; Rewrite is unwired to a local stub in MemoryCard.tsx). With no model
// call, there's exactly one failure shape left system-wide (a write erroring),
// so error state here is a plain boolean per anchor, not a classified type —
// see components/shells/membership/memory/MemoryCard.tsx's MemoryErrorLine,
// which sources its copy from components/chat/errorCopy.ts's shared
// ChatErrorType vocabulary rather than a memory-specific one.
//
// Generic/session-scoped, like useMessageFeedback — it happens to only be
// consumed by the Heirloom membership shell today (components/shells/membership/),
// but nothing here is Heirloom-specific.

import { useCallback, useEffect, useRef, useState } from 'react'

export type MemorySourceKind = 'conversation' | 'photo' | 'video' | 'audio' | 'document'
export type MemoryStatus = 'draft' | 'published'

export interface MemoryRow {
  id: string
  session_id: string
  anchor_message_id: string
  source_kind: MemorySourceKind
  title: string
  body: string
  status: MemoryStatus
  created_at: string
  updated_at: string
}

export interface UseMemoriesReturn {
  memories: MemoryRow[]
  getByAnchor(anchorMessageId: string): MemoryRow | undefined
  /** True while a create call is actually in flight for this anchor — the running pill. */
  isPending(anchorMessageId: string): boolean
  /**
   * The source kind to show on the running pill while pending — known
   * client-side even before the row exists. Null when not pending.
   */
  getPendingKind(anchorMessageId: string): MemorySourceKind | null
  /** True if this anchor's most recent create call failed — stays true until the next attempt. */
  hasError(anchorMessageId: string): boolean
  /**
   * Whole-session suppression flag for the manual bookmark, per the handoff's
   * state rules: never nag, never go dead — suppressed only while a draft is
   * open (streaming suppression is the caller's own isStreaming, combined
   * separately). At most one draft should ever be open at a time if callers
   * respect this flag, so "open" and "newest" coincide by construction.
   */
  hasOpenDraft: boolean
  /**
   * False until the initial GET for this session has settled (success or
   * failure). Load-bearing for any *automatic* trigger (e.g. the SAVE_MEMORY
   * marker) that decides whether to create() based on getByAnchor already
   * returning a row — without this, an automatic trigger can fire within
   * milliseconds of mount, well before the fetch resolves, and race past a
   * memory that already exists server-side. A manual bookmark click is slow
   * enough in practice that this rarely mattered before, but the guard
   * applies uniformly now that both paths share it.
   */
  isLoaded: boolean
  create(anchorMessageId: string, sourceKind: MemorySourceKind): Promise<void>
  keep(memory: MemoryRow): Promise<void>
  discard(memory: MemoryRow): Promise<void>
  /** Title-only correction — the inline edit affordance on MemoryCard/MemorySavedReceipt. */
  rename(memoryId: string, title: string): Promise<void>
}

export function useMemories(sessionId: string | null): UseMemoriesReturn {
  const [memories, setMemories] = useState<MemoryRow[]>([])
  const [pendingAnchors, setPendingAnchors] = useState<Record<string, MemorySourceKind>>({})
  const [erroredAnchors, setErroredAnchors] = useState<Record<string, true>>({})
  // No session yet -> nothing to load, so start "loaded" (there's nothing an
  // automatic trigger could race against). A real sessionId starts unloaded
  // until its fetch below settles.
  const [isLoaded, setIsLoaded] = useState(!sessionId)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  useEffect(() => {
    if (!sessionId) {
      setIsLoaded(true)
      return
    }
    setIsLoaded(false)
    fetch(`/api/sessions/${sessionId}/memories`)
      .then(r => r.json())
      .then((data: { memories?: MemoryRow[] }) => {
        if (Array.isArray(data.memories)) setMemories(data.memories)
      })
      .catch(err => console.error('[useMemories] fetch failed:', err))
      // Flip to loaded on failure too — matches this hook's existing
      // fail-open posture elsewhere (log and carry on with best-known
      // state) rather than blocking every automatic trigger forever on one
      // network hiccup.
      .finally(() => setIsLoaded(true))
  }, [sessionId])

  const getByAnchor = useCallback(
    (anchorMessageId: string) => memories.find(m => m.anchor_message_id === anchorMessageId),
    [memories],
  )
  const isPending = useCallback((anchorMessageId: string) => pendingAnchors[anchorMessageId] !== undefined, [pendingAnchors])
  const getPendingKind = useCallback(
    (anchorMessageId: string) => pendingAnchors[anchorMessageId] ?? null,
    [pendingAnchors],
  )
  const hasError = useCallback(
    (anchorMessageId: string) => erroredAnchors[anchorMessageId] === true,
    [erroredAnchors],
  )
  const hasOpenDraft = memories.some(m => m.status === 'draft')

  const setPending = (anchorId: string, kind: MemorySourceKind | null) =>
    setPendingAnchors(prev => (kind ? { ...prev, [anchorId]: kind } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== anchorId))))

  const setAnchorError = (anchorId: string, errored: boolean) =>
    setErroredAnchors(prev =>
      errored
        ? { ...prev, [anchorId]: true }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== anchorId)),
    )

  const create = useCallback(async (anchorMessageId: string, sourceKind: MemorySourceKind) => {
    const sid = sessionIdRef.current
    if (!sid) return
    setAnchorError(anchorMessageId, false)
    setPending(anchorMessageId, sourceKind)
    try {
      const res = await fetch(`/api/sessions/${sid}/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchor_message_id: anchorMessageId, source_kind: sourceKind }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.memory) {
        setAnchorError(anchorMessageId, true)
        return
      }
      const memory = data.memory as MemoryRow
      setMemories(prev => {
        const idx = prev.findIndex(m => m.id === memory.id)
        if (idx === -1) return [...prev, memory]
        const next = prev.slice()
        next[idx] = memory
        return next
      })
    } catch (err) {
      console.error('[useMemories] create call failed:', err)
      setAnchorError(anchorMessageId, true)
    } finally {
      setPending(anchorMessageId, null)
    }
  }, [])

  const keep = useCallback(async (memory: MemoryRow) => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      const res = await fetch(`/api/sessions/${sid}/memories/${memory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'keep' }),
      })
      if (!res.ok) {
        console.error('[useMemories] keep failed:', res.status)
        return
      }
      setMemories(prev => prev.map(m => (m.id === memory.id ? { ...m, status: 'published' } : m)))
    } catch (err) {
      console.error('[useMemories] keep threw:', err)
    }
  }, [])

  const discard = useCallback(async (memory: MemoryRow) => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      const res = await fetch(`/api/sessions/${sid}/memories/${memory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discard' }),
      })
      if (!res.ok) {
        console.error('[useMemories] discard failed:', res.status)
        return
      }
      setMemories(prev => prev.filter(m => m.id !== memory.id))
    } catch (err) {
      console.error('[useMemories] discard threw:', err)
    }
  }, [])

  const rename = useCallback(async (memoryId: string, title: string) => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      const res = await fetch(`/api/sessions/${sid}/memories/${memoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retitle', title }),
      })
      if (!res.ok) {
        console.error('[useMemories] rename failed:', res.status)
        return
      }
      setMemories(prev => prev.map(m => (m.id === memoryId ? { ...m, title } : m)))
    } catch (err) {
      console.error('[useMemories] rename threw:', err)
    }
  }, [])

  return { memories, getByAnchor, isPending, getPendingKind, hasError, hasOpenDraft, isLoaded, create, keep, discard, rename }
}
