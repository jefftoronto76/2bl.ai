'use client'

// services/chat/ui/v1/useMemories.ts
//
// Headless data hook (no JSX) for the Heirloom memory bookmark/card, mirroring
// useMessageFeedback.ts's shape: fetch-on-mount, keyed lookup, optimistic
// local state on write. The key difference from useMessageFeedback is
// deliberate — this is keyed by the anchor message's stable UIMessage.id, not
// its array position, specifically to avoid the index-drift class of bug
// message_feedback has to guard against on every edit/truncate (see the
// Memories entry in System Docs/Known Gaps.md).
//
// There is no "running" status to fetch or reconcile on mount — a memory row
// only ever exists once createMemoryFromAnchor actually succeeded (see
// services/crm/memories.ts's module doc), so an in-flight call is pure local
// UI state (pendingAnchors below), never persisted, never stuck on reload.
//
// No model call anywhere behind this hook — create() is a verbatim write, and
// there is no rewrite() anymore (the archivist that used to power it is
// gone; Rewrite is unwired to a local stub in MemoryCard.tsx). With no model
// call there's no streaming-protocol failure mode, but create()'s own fetch
// still fails in more than one distinguishable shape (network throw, 4xx,
// 5xx, malformed 2xx body) — error state per anchor is a classified
// ChatErrorType, not a boolean, classified by classifyCreateError() below.
// See components/shells/membership/memory/MemoryCard.tsx's MemoryErrorLine,
// which sources its copy from components/chat/errorCopy.ts's shared
// ChatErrorType vocabulary rather than a memory-specific one.
//
// Generic/session-scoped, like useMessageFeedback — it happens to only be
// consumed by the Heirloom membership shell today (components/shells/membership/),
// but nothing here is Heirloom-specific.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatErrorType } from './types'

export type MemorySourceKind = 'conversation' | 'photo' | 'video' | 'audio' | 'document'
export type MemoryStatus = 'draft' | 'published'

/** Kept in sync with services/crm/memories.ts's own copy — see that file's doc comment. */
export interface MemoryBlock {
  id: string
  type: 'text' | 'image'
  content?: string
  media_item_id?: string
}

export interface MemoryRow {
  id: string
  session_id: string
  anchor_message_id: string
  /** One-to-one photo-bookmark disambiguator — null for every non-photo memory. See services/crm/memories.ts's own copy for the full doc. */
  media_item_id?: string | null
  source_kind: MemorySourceKind
  title: string
  body: string
  /** Null/absent = legacy row, rendered from `body` alone forever (lazy-seed-on-first-edit). */
  body_blocks?: MemoryBlock[] | null
  status: MemoryStatus
  created_at: string
  updated_at: string
  /** The story this memory currently belongs to, if any — see services/crm/memories.ts's own copy for the full doc. null = never assigned; undefined on a freshly-created/renamed/revised row (those writes don't touch this). */
  storyId?: string | null
}

export interface UseMemoriesReturn {
  memories: MemoryRow[]
  /**
   * mediaItemId is the composite key's second component (see composeAnchorKey
   * below) — omit it for the ordinary whole-message bookmark (matches only
   * the memory whose own media_item_id is null); pass it for a per-photo
   * bookmark (PhotoUploadActions.tsx) so two photos on the same chat message
   * resolve to two independent memories instead of colliding on
   * anchor_message_id alone. Every method below takes the same optional
   * second parameter, for the same reason.
   */
  getByAnchor(anchorMessageId: string, mediaItemId?: string): MemoryRow | undefined
  /** True while a create call is actually in flight for this anchor(+photo) — the running pill. */
  isPending(anchorMessageId: string, mediaItemId?: string): boolean
  /**
   * The source kind to show on the running pill while pending — known
   * client-side even before the row exists. Null when not pending.
   */
  getPendingKind(anchorMessageId: string, mediaItemId?: string): MemorySourceKind | null
  /** True if this anchor(+photo)'s most recent create call failed — stays true until the next attempt. */
  hasError(anchorMessageId: string, mediaItemId?: string): boolean
  /** The classified reason this anchor(+photo)'s most recent create call failed, or null if it didn't. */
  getErrorType(anchorMessageId: string, mediaItemId?: string): ChatErrorType | null
  /**
   * Per-anchor(+photo) suppression flag for the manual bookmark, per the
   * handoff's state rules: never nag, never go dead — suppressed only while
   * a draft is open for *this specific anchor (and, for a photo bookmark,
   * this specific photo)* (streaming suppression is the caller's own
   * isStreaming, combined separately). Scoped per-anchor rather than
   * session-wide: one stale/open draft on another message — or another photo
   * on the SAME message — must never disable this one's bookmark (see the
   * Memories entry in System Docs/Known Gaps.md and handoff §6 rule #3).
   */
  hasOpenDraft(anchorMessageId: string, mediaItemId?: string): boolean
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
  /** mediaItemId, when passed, both scopes local pending/error state to this specific photo AND is sent to the server as media_item_id — routing the POST to createPhotoMemoryFromMedia instead of createMemoryFromAnchor (services/crm/memories.ts). */
  create(anchorMessageId: string, sourceKind: MemorySourceKind, mediaItemId?: string): Promise<void>
  keep(memory: MemoryRow): Promise<void>
  discard(memory: MemoryRow): Promise<void>
  /** Title-only correction — the inline edit affordance on MemoryCard/MemorySavedReceipt. */
  rename(memoryId: string, title: string): Promise<void>
  /**
   * Replaces the panel's block canvas (Memory Canvas V1). Unlike rename(),
   * the server derives `body` from `blocks` (reviseMemoryBlocks,
   * services/crm/memories.ts) — this reads the PATCH response and merges
   * the server's own body_blocks/body, rather than echoing the blocks
   * argument back into local state.
   */
  reviseBlocks(memoryId: string, blocks: MemoryBlock[]): Promise<void>
  /**
   * Assigns a memory to a story (MemoryCardView's "+" via StoryPicker) —
   * PATCH .../memories/[memoryId], action: 'assign_story'
   * (assignMemoryToStory, services/crm/story-containments.ts). Like
   * rename(), the client fully controls this field (it's the storyId the
   * member just clicked in the picker) — on success this echoes that value
   * into local state directly rather than reading anything back from the
   * response.
   */
  assignToStory(memoryId: string, storyId: string): Promise<void>
  /**
   * Detaches a memory from its current story, if any (StoryPicker's "Remove
   * from '[Story]'" item — remove-memory-from-story, 2026-08-14). PATCH
   * .../memories/[memoryId], action: 'remove_story' (removeMemoryFromStory,
   * services/crm/story-containments.ts) — no story_id needed, it just clears
   * whatever containment currently exists. Like assignToStory, echoes the
   * new value (null) into local state directly on success rather than
   * reading anything back from the response.
   */
  removeFromStory(memoryId: string): Promise<void>
}

/**
 * Classifies a failed create() response into a ChatErrorType, mirroring the
 * status-code-driven pattern useChatTurn.ts's own (private) classifyError
 * already uses for chat turns — there's no shared/exported classifier to
 * reuse (that one is tied to its own ChatTurnError class), so this is the
 * memory-create path's own. Only called when the caller has already
 * determined the response is a failure (`!res.ok || !data?.memory`).
 */
function classifyCreateFailure(res: Response, data: { memory?: unknown } | null): ChatErrorType {
  if (!res.ok) {
    if (res.status === 401) return 'account_required'
    if (res.status >= 500) return 'server_error'
    return 'unknown'
  }
  // res.ok but data.memory is missing/malformed — a 2xx contract mismatch.
  return 'invalid_response'
}

/**
 * Composite key for the local pendingAnchors/erroredAnchors Records —
 * `${anchorMessageId}:${mediaItemId ?? ''}`. A plain anchor_message_id alone
 * collides the instant a single chat message carries two photo uploads (a
 * real case — see MessageList.tsx's userMsg.uploads array): both photos'
 * Bookmark clicks would set/read the exact same pendingAnchors[msg.id] entry,
 * so the second bookmark's running pill would show as the first's, and a
 * failure on one would show as a failure on both. The empty-string suffix on
 * an omitted mediaItemId keeps every existing (non-photo) call site's key
 * stable — `composeAnchorKey('m1')` === `composeAnchorKey('m1', undefined)`
 * always, so this is purely additive for callers that never pass the second
 * argument.
 */
function composeAnchorKey(anchorMessageId: string, mediaItemId?: string): string {
  return `${anchorMessageId}:${mediaItemId ?? ''}`
}

/**
 * Matches a fetched MemoryRow against an (anchorMessageId, mediaItemId)
 * lookup — the array-side counterpart to composeAnchorKey above. A row with
 * no media_item_id (every non-photo memory, and every legacy row) only
 * matches when the lookup itself omits mediaItemId; a photo-bookmarked row
 * only matches the exact media_item_id it was created from. Without this,
 * a whole-message lookup (mediaItemId omitted) on a message that ALSO has
 * one or more photo bookmarks would ambiguously match whichever one came
 * first in the array.
 */
function matchesAnchor(memory: MemoryRow, anchorMessageId: string, mediaItemId?: string): boolean {
  if (memory.anchor_message_id !== anchorMessageId) return false
  return mediaItemId === undefined ? !memory.media_item_id : memory.media_item_id === mediaItemId
}

export function useMemories(sessionId: string | null): UseMemoriesReturn {
  const [memories, setMemories] = useState<MemoryRow[]>([])
  const [pendingAnchors, setPendingAnchors] = useState<Record<string, MemorySourceKind>>({})
  const [erroredAnchors, setErroredAnchors] = useState<Record<string, ChatErrorType>>({})
  // isLoaded is DERIVED — loadedForSessionId is the last sessionId this hook
  // finished resolving (successfully or not), and isLoaded is just whether
  // that matches the CURRENT sessionId. This used to be its own `useState`,
  // flipped inside the effect below (setIsLoaded(false) then, once the
  // fetch settles, setIsLoaded(true)) — correct in isolation, but it has a
  // one-commit blind spot whenever sessionId itself changes: React commits
  // the new sessionId to this hook's caller in the same render that a CHILD
  // component can newly mount and read this hook's (still-stale, from
  // BEFORE the change) isLoaded value — a stored isLoaded lags one effect
  // pass behind the sessionId that produced it, because "reset to false"
  // only happens inside an effect, which runs after commit, and a child's
  // own effect can run first (React flushes child effects before parent
  // effects). Concretely: ChatHero.tsx mounts this hook before any session
  // exists (sessionId=null), which sets isLoaded=true (correctly — nothing
  // to load yet). The instant a real session loads, sessionId AND
  // state.hasStarted flip together — MessageList mounts for the first time
  // in that exact commit and reads memories.isLoaded before this hook's own
  // sessionId-effect has run to reset it, seeing the STALE true from the
  // null-session case with an EMPTY memories array — exactly the race
  // save-memory-marker.test.tsx caught live (an auto-save fires against a
  // memory that already exists, because the "does it already exist" check
  // ran against an array that hadn't loaded yet). A derived comparison has
  // no such lag: the moment sessionId changes, `loadedForSessionId ===
  // sessionId` is false in the SAME render, synchronously, before any
  // effect — no child can ever observe a stale true.
  const [loadedForSessionId, setLoadedForSessionId] = useState<string | null>(null)
  const isLoaded = loadedForSessionId === sessionId
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  useEffect(() => {
    if (!sessionId) {
      setLoadedForSessionId(null)
      return
    }
    fetch(`/api/sessions/${sessionId}/memories`)
      .then(r => r.json())
      .then((data: { memories?: MemoryRow[] }) => {
        if (Array.isArray(data.memories)) setMemories(data.memories)
      })
      .catch(err => console.error('[useMemories] fetch failed:', err))
      // Marks this sessionId resolved on failure too — matches this hook's
      // existing fail-open posture elsewhere (log and carry on with
      // best-known state) rather than blocking every automatic trigger
      // forever on one network hiccup.
      .finally(() => setLoadedForSessionId(sessionId))
  }, [sessionId])

  const getByAnchor = useCallback(
    (anchorMessageId: string, mediaItemId?: string) => memories.find(m => matchesAnchor(m, anchorMessageId, mediaItemId)),
    [memories],
  )
  const isPending = useCallback(
    (anchorMessageId: string, mediaItemId?: string) => pendingAnchors[composeAnchorKey(anchorMessageId, mediaItemId)] !== undefined,
    [pendingAnchors],
  )
  const getPendingKind = useCallback(
    (anchorMessageId: string, mediaItemId?: string) => pendingAnchors[composeAnchorKey(anchorMessageId, mediaItemId)] ?? null,
    [pendingAnchors],
  )
  const hasError = useCallback(
    (anchorMessageId: string, mediaItemId?: string) => erroredAnchors[composeAnchorKey(anchorMessageId, mediaItemId)] !== undefined,
    [erroredAnchors],
  )
  const getErrorType = useCallback(
    (anchorMessageId: string, mediaItemId?: string) => erroredAnchors[composeAnchorKey(anchorMessageId, mediaItemId)] ?? null,
    [erroredAnchors],
  )
  const hasOpenDraft = useCallback(
    (anchorMessageId: string, mediaItemId?: string) =>
      memories.some(m => matchesAnchor(m, anchorMessageId, mediaItemId) && m.status === 'draft'),
    [memories],
  )

  const setPending = (key: string, kind: MemorySourceKind | null) =>
    setPendingAnchors(prev => (kind ? { ...prev, [key]: kind } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key))))

  const setAnchorError = (key: string, errorType: ChatErrorType | null) =>
    setErroredAnchors(prev =>
      errorType
        ? { ...prev, [key]: errorType }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)),
    )

  const create = useCallback(async (anchorMessageId: string, sourceKind: MemorySourceKind, mediaItemId?: string) => {
    const sid = sessionIdRef.current
    if (!sid) return
    const key = composeAnchorKey(anchorMessageId, mediaItemId)
    setAnchorError(key, null)
    setPending(key, sourceKind)
    try {
      const res = await fetch(`/api/sessions/${sid}/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchor_message_id: anchorMessageId,
          source_kind: sourceKind,
          ...(mediaItemId ? { media_item_id: mediaItemId } : {}),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.memory) {
        setAnchorError(key, classifyCreateFailure(res, data))
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
      setAnchorError(key, 'network')
    } finally {
      setPending(key, null)
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

  const reviseBlocks = useCallback(async (memoryId: string, blocks: MemoryBlock[]) => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      const res = await fetch(`/api/sessions/${sid}/memories/${memoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revise_blocks', blocks }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.memory) {
        console.error('[useMemories] reviseBlocks failed:', res.status)
        return
      }
      // Unlike rename() (title is a field the client fully controls), the
      // server derives `body` from `blocks` via its own flattening logic
      // (reviseMemoryBlocks, services/crm/memories.ts) — trusting the
      // client's own `blocks` argument for local state would leave `body`
      // stale, silently breaking the shared-state guarantee that a panel
      // edit shows up immediately in the transcript's MemoryCard/
      // MemorySavedReceipt (both render `memory.body`, not `body_blocks`).
      const memory = data.memory as MemoryRow
      setMemories(prev => prev.map(m => (m.id === memoryId ? { ...m, body_blocks: memory.body_blocks, body: memory.body } : m)))
    } catch (err) {
      console.error('[useMemories] reviseBlocks threw:', err)
    }
  }, [])

  const assignToStory = useCallback(async (memoryId: string, storyId: string) => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      const res = await fetch(`/api/sessions/${sid}/memories/${memoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign_story', story_id: storyId }),
      })
      if (!res.ok) {
        console.error('[useMemories] assignToStory failed:', res.status)
        return
      }
      setMemories(prev => prev.map(m => (m.id === memoryId ? { ...m, storyId } : m)))
    } catch (err) {
      console.error('[useMemories] assignToStory threw:', err)
    }
  }, [])

  const removeFromStory = useCallback(async (memoryId: string) => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      const res = await fetch(`/api/sessions/${sid}/memories/${memoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_story' }),
      })
      if (!res.ok) {
        console.error('[useMemories] removeFromStory failed:', res.status)
        return
      }
      setMemories(prev => prev.map(m => (m.id === memoryId ? { ...m, storyId: null } : m)))
    } catch (err) {
      console.error('[useMemories] removeFromStory threw:', err)
    }
  }, [])

  return {
    memories,
    getByAnchor,
    isPending,
    getPendingKind,
    hasError,
    getErrorType,
    hasOpenDraft,
    isLoaded,
    create,
    keep,
    discard,
    rename,
    reviseBlocks,
    assignToStory,
    removeFromStory,
  }
}
