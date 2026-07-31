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
// only ever exists once an archivist call actually succeeded (see
// services/crm/memories.ts's module doc), so an in-flight call is pure local
// UI state (pendingAnchors below), never persisted, never stuck on reload.
//
// Generic/session-scoped, like useMessageFeedback — it happens to only be
// consumed by the Heirloom membership shell today (components/shells/membership/),
// but nothing here is Heirloom-specific.

import { useCallback, useEffect, useRef, useState } from 'react'
import { isValidMemoryErrorType, type MemoryErrorType } from '@/services/crm/memory-errors'

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
  /** True while a create or rewrite call is actually in flight for this anchor — the running pill. */
  isPending(anchorMessageId: string): boolean
  /**
   * The source kind to show on the running pill while pending — known
   * client-side even for a fresh create() with no row yet (a rewrite's
   * pending kind is just its existing row's own kind). Null when not pending.
   */
  getPendingKind(anchorMessageId: string): MemorySourceKind | null
  /** The classified failure for this anchor's most recent call, if any — stays until the next attempt. */
  getError(anchorMessageId: string): MemoryErrorType | null
  /**
   * Whole-session suppression flag for the manual bookmark, per the handoff's
   * state rules: never nag, never go dead — suppressed only while a draft is
   * open (streaming suppression is the caller's own isStreaming, combined
   * separately). At most one draft should ever be open at a time if callers
   * respect this flag, so "open" and "newest" coincide by construction.
   */
  hasOpenDraft: boolean
  create(anchorMessageId: string, sourceKind: MemorySourceKind): Promise<void>
  rewrite(memoryId: string, anchorMessageId: string, note: string): Promise<void>
  keep(memory: MemoryRow): Promise<void>
  discard(memory: MemoryRow): Promise<void>
}

export function useMemories(sessionId: string | null): UseMemoriesReturn {
  const [memories, setMemories] = useState<MemoryRow[]>([])
  const [pendingAnchors, setPendingAnchors] = useState<Record<string, MemorySourceKind>>({})
  const [errorsByAnchor, setErrorsByAnchor] = useState<Record<string, MemoryErrorType>>({})
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  useEffect(() => {
    if (!sessionId) return
    fetch(`/api/sessions/${sessionId}/memories`)
      .then(r => r.json())
      .then((data: { memories?: MemoryRow[] }) => {
        if (Array.isArray(data.memories)) setMemories(data.memories)
      })
      .catch(err => console.error('[useMemories] fetch failed:', err))
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
  const getError = useCallback(
    (anchorMessageId: string) => errorsByAnchor[anchorMessageId] ?? null,
    [errorsByAnchor],
  )
  const hasOpenDraft = memories.some(m => m.status === 'draft')

  const setPending = (anchorId: string, kind: MemorySourceKind | null) =>
    setPendingAnchors(prev => (kind ? { ...prev, [anchorId]: kind } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== anchorId))))

  const setAnchorError = (anchorId: string, errorType: MemoryErrorType | null) =>
    setErrorsByAnchor(prev =>
      errorType
        ? { ...prev, [anchorId]: errorType }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== anchorId)),
    )

  /** Shared by create/rewrite — both are "run the archivist, land a draft" calls that differ only in body shape. */
  const runArchivistCall = useCallback(async (anchorId: string, sourceKind: MemorySourceKind, body: Record<string, unknown>) => {
    const sid = sessionIdRef.current
    if (!sid) return
    setAnchorError(anchorId, null)
    setPending(anchorId, sourceKind)
    try {
      const res = await fetch(`/api/sessions/${sid}/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.memory) {
        const errorType = isValidMemoryErrorType(data?.error_type) ? data.error_type : 'unknown'
        setAnchorError(anchorId, errorType)
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
      console.error('[useMemories] archivist call failed:', err)
      setAnchorError(anchorId, 'network')
    } finally {
      setPending(anchorId, null)
    }
  }, [])

  const create = useCallback(
    (anchorMessageId: string, sourceKind: MemorySourceKind) =>
      runArchivistCall(anchorMessageId, sourceKind, { mode: 'create', anchor_message_id: anchorMessageId, source_kind: sourceKind }),
    [runArchivistCall],
  )

  const rewrite = useCallback(
    (memoryId: string, anchorMessageId: string, note: string) => {
      const sourceKind = memories.find(m => m.id === memoryId)?.source_kind ?? 'conversation'
      return runArchivistCall(anchorMessageId, sourceKind, { mode: 'rewrite', memory_id: memoryId, rewrite_note: note })
    },
    [runArchivistCall, memories],
  )

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

  return { memories, getByAnchor, isPending, getPendingKind, getError, hasOpenDraft, create, rewrite, keep, discard }
}
