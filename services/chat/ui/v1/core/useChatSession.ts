'use client'

// services/chat/ui/v1/core/useChatSession.ts
//
// The shared chat-session core (Phase 1). Owns one conversation instance and
// the single turn engine that drives it, exposing a store-backed ChatSession
// value. Store resolution selects the binding mode:
//
//   - SINGLETON (instanceKey provided): the store is resolved from the
//     client-only registry, so every binding with the same key shares one
//     conversation. This is the jefflougheed Hero + Overlay invariant — both
//     surfaces read from and write to the same session (see
//     docs/chat-ui-v2-design.md §2).
//   - ISOLATED (no instanceKey): a ref-local store, created once and dying with
//     the consumer. This is the Heirloom pattern.
//
// Canonical topology: exactly ONE ChatSessionProvider per conversation calls
// this hook, and surfaces consume the value via useChatSessionContext. That
// gives ONE useChatTurn engine per session, so error + retry are inherently
// shared across every surface — wherever the member is, retry works (confirmed
// decision). The registry is the convergence safety net if two providers ever
// share a key. UIMessage (Phase 0) is canonical throughout.
//
// This phase is core-only: nothing is wired to either tenant yet.

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useChatTurn } from '../useChatTurn'
import type { ChatEngineAccessors, ChatErrorType, UIMessage } from '../types'
import type { ChatMode, MediaAttachmentInput } from '@/services/chat/server/types'
import { createUIMessage, reviveUIMessages } from '../message'
import { createChatSessionStore, type ChatSessionStore, type HydrateInput } from './store'
import { getSingletonStore } from './store-registry'
import {
  bufferThread,
  clearDraft,
  findMostRecentThread,
  toPersistedMessages,
  type PersistenceNamespace,
} from '../persistence'

/** Drops the empty streaming-assistant placeholder — it is never buffered. */
function nonEmptyMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((m) => !(m.role === 'assistant' && m.content === ''))
}

/**
 * How often the in-flight assistant reply is buffered WHILE streaming (not
 * just at turn boundaries) — enables recovering a partial reply on a
 * mid-stream reload rather than only the user's message. 1s balances recovery
 * granularity against IndexedDB write frequency for a multi-second reply.
 */
const STREAM_BUFFER_INTERVAL_MS = 1000

export interface ChatSessionConfig {
  /**
   * Provided → singleton mode: the conversation is shared via the registry
   * across every binding with this key. Omitted → isolated mode: a private
   * store scoped to this hook instance.
   */
  instanceKey?: string
  /**
   * Optional accessor for a pre-auth invited member's Supabase members.id.
   * When provided, it is threaded into every /api/sage request as `member_id`
   * so getMemberContext can look up the member directly without needing
   * chat_sessions.user_id. Only relevant for Heirloom invite-holder paths.
   */
  getMemberId?: () => string | null
  /**
   * Optional accessor for the raw invite token of a pre-auth invited member.
   * Sent to /api/sage as `invite_token` so the route can re-validate it and
   * derive a trustworthy memberId server-side.
   */
  getInviteToken?: () => string | null
  /**
   * Optional accessor for media items associated with the current session.
   * When provided, resolveMediaContext fetches derived_content for ready items
   * and injects an ATTACHED MEDIA section into the system prompt.
   */
  getMediaItems?: () => MediaAttachmentInput[]
  /**
   * Enables IndexedDB persistence for this session when provided: turn-
   * boundary buffering, a pagehide/visibility flush, and unconditional
   * mount-time rehydration — no signed-in/anonymous gate, for either product.
   * Omit to opt out of persistence entirely (the default for any caller that
   * hasn't been migrated onto it yet).
   */
  persistNamespace?: PersistenceNamespace
}

/** The session value every surface consumes (via context). */
export interface ChatSession {
  messages: UIMessage[]
  sessionId: string | null
  isStreaming: boolean
  /** Classified reason the most recent turn failed, or null when it succeeded. */
  errorType: ChatErrorType | null
  mode: ChatMode
  send(input: string): Promise<void>
  /** Send without rendering the user message — see useChatTurn.sendHidden. */
  sendHidden(content: string): Promise<void>
  retry(): Promise<void>
  /** Aborts the in-flight turn, keeping whatever content already streamed in. */
  stop(): void
  /** Re-generates one assistant message — see useChatTurn.ts `regenerate`. */
  regenerate(messageId: string): Promise<void>
  /** Switches the displayed `versions` entry for a message — see useChatTurn.ts. */
  setActiveVersion(messageId: string, versionIdx: number): void
  /** Edits + re-delivers a user message, truncating everything after it — see useChatTurn.ts. */
  editMessage(messageId: string, text: string): Promise<void>
  /** Re-delivers a user message unchanged, truncating everything after it — see useChatTurn.ts. */
  resendMessage(messageId: string): Promise<void>
  setMode(mode: ChatMode): void
  /** Replace messages + sessionId (localStorage rehydrate / DB recovery). */
  hydrate(input: HydrateInput): void
  /** Clear the conversation (messages, sessionId, isStreaming, errorType). */
  reset(): void
}

export function useChatSession(config: ChatSessionConfig = {}): ChatSession {
  const { instanceKey, getMemberId, getInviteToken, getMediaItems, persistNamespace } = config

  // Resolve the backing store. Singleton mode uses the client registry; on the
  // server (where a client component still renders for initial HTML) we never
  // touch the registry — a throwaway ref-local store renders the empty state,
  // and the client picks up the real shared store on first client render.
  // Isolated mode always uses the ref-local store. The resolved store is stable
  // across renders in every case, so useSyncExternalStore never resubscribes.
  const localStoreRef = useRef<ChatSessionStore | null>(null)
  const ensureLocal = (): ChatSessionStore => {
    if (!localStoreRef.current) localStoreRef.current = createChatSessionStore()
    return localStoreRef.current
  }
  const store: ChatSessionStore =
    instanceKey && typeof window !== 'undefined' ? getSingletonStore(instanceKey) : ensureLocal()

  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)

  // Accessors read LIVE store state via getState() (not the render snapshot) so
  // the engine always sees the latest messages/session — matching the proven
  // useSageStore.getState() pattern. Construction of canonical UIMessages
  // (id + timestamp) lives here, so it stops being duplicated per surface.
  const accessors = useMemo<ChatEngineAccessors>(
    () => ({
      getMessages: () => store.getState().messages,
      addMessage: (msg) =>
        store.setState({
          messages: [...store.getState().messages, createUIMessage(msg.role, msg.content)],
        }),
      updateLastMessage: (content) => {
        const messages = store.getState().messages.slice()
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') {
            messages[i] = { ...messages[i], content }
            break
          }
        }
        store.setState({ messages })
      },
      patchMessageById: (id, patch) => {
        const messages = store.getState().messages.slice()
        const idx = messages.findIndex((m) => m.id === id)
        if (idx === -1) return
        messages[idx] = { ...messages[idx], ...patch }
        store.setState({ messages })
      },
      removeMessageById: (id) => {
        store.setState({ messages: store.getState().messages.filter((m) => m.id !== id) })
      },
      truncateAfter: (id) => {
        const messages = store.getState().messages
        const idx = messages.findIndex((m) => m.id === id)
        if (idx === -1) return
        store.setState({ messages: messages.slice(0, idx + 1) })
      },
      setStreaming: (val) => store.setState({ isStreaming: val }),
      setSessionId: (id) => store.setState({ sessionId: id }),
      getSessionId: () => store.getState().sessionId,
      getMode: () => store.getState().mode,
      getMemberId,
      getInviteToken,
      getMediaItems,
    }),
    [store, getMemberId, getInviteToken, getMediaItems],
  )

  const turn = useChatTurn({ accessors })

  // Mirror the engine's errorType into the shared store so it is observable
  // through the store snapshot AND clearable by reset(). isStreaming already
  // flows engine→store (via the setStreaming accessor); this makes errorType
  // symmetric. The guard avoids redundant writes (and the re-render they cause).
  // Without this bridge, reset() would clear store.errorType while the surface
  // kept reading the engine's stale errorType.
  useEffect(() => {
    if (store.getState().errorType !== turn.errorType) {
      store.setState({ errorType: turn.errorType })
    }
  }, [turn.errorType, store])

  const setMode = useCallback((mode: ChatMode) => store.setState({ mode }), [store])

  // Primed on every hydrate() call so the session-id-transition persistence
  // effect below never mistakes a restored session id for a freshly-created
  // one — which would needlessly clearDraft + re-buffer, bumping updatedAt
  // and breaking most-recent-wins recovery. Harmless when persistence is
  // disabled (persistNamespace undefined): the ref just goes unread.
  const prevSessionIdRef = useRef<string | null>(state.sessionId)
  const hydrate = useCallback(
    (input: HydrateInput) => {
      prevSessionIdRef.current = input.sessionId
      store.hydrate(input)
    },
    [store],
  )
  const reset = useCallback(() => store.reset(), [store])

  // ── IndexedDB persistence (opt-in via persistNamespace) ───────────────────
  // Identical policy for both products: turn-boundary buffering, a
  // pagehide/visibility flush, and unconditional mount-time rehydration (no
  // signed-in/anonymous gate — best experience always). One effect set here
  // serves every surface, since exactly one useChatSession() call backs a
  // conversation regardless of how many surfaces read it via context.

  // Buffer on TURN BOUNDARIES only — keyed on isStreaming, never on messages,
  // so there is no per-token IndexedDB thrash. Fires on turn start (the user
  // message is present → recoverable if the reply is interrupted) and turn
  // finish (final assistant content). hydrate() does not touch isStreaming,
  // so restoring a thread never triggers a write here.
  useEffect(() => {
    if (!persistNamespace) return
    const messages = nonEmptyMessages(store.getState().messages)
    void bufferThread(persistNamespace, toPersistedMessages(messages), store.getState().sessionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistNamespace, state.isStreaming, store])

  // Buffer WHILE STREAMING, at a fixed interval — not just at the turn
  // boundaries above. Reuses the exact same buffer call; this only adds a
  // timing trigger for the gap between turn start and turn finish, so a
  // mid-stream reload recovers whatever content arrived, not just the user's
  // message. The interval only ever runs while state.isStreaming is true, so
  // it starts/stops with the turn automatically (React clears it on effect
  // cleanup — turn finish, unmount, or persistNamespace/store changing).
  useEffect(() => {
    if (!persistNamespace || !state.isStreaming) return
    const interval = setInterval(() => {
      const messages = nonEmptyMessages(store.getState().messages)
      void bufferThread(persistNamespace, toPersistedMessages(messages), store.getState().sessionId)
    }, STREAM_BUFFER_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [persistNamespace, state.isStreaming, store])

  // When a real session id arrives mid-turn (engine lazy-create), drop the
  // orphan draft slot and re-buffer under the session id. Guarded by a
  // prev-value compare so it fires only on an actual null→id transition — not
  // on every render, and not when hydrate() restored the id (hydrate primes
  // prevSessionIdRef to match, above).
  useEffect(() => {
    if (!persistNamespace) return
    if (state.sessionId === prevSessionIdRef.current) return
    prevSessionIdRef.current = state.sessionId
    if (state.sessionId) {
      void clearDraft(persistNamespace)
      const messages = nonEmptyMessages(store.getState().messages)
      void bufferThread(persistNamespace, toPersistedMessages(messages), state.sessionId)
    }
  }, [persistNamespace, state.sessionId, store])

  // Unconditional mount-time rehydration — no signed-in/anonymous gate, for
  // either product. Runs once per session instance (hasHydratedRef), so a
  // later mid-session hydrate() call is never retro-triggered by this.
  const hasHydratedRef = useRef(false)
  useEffect(() => {
    if (!persistNamespace || hasHydratedRef.current) return
    hasHydratedRef.current = true
    void (async () => {
      const thread = await findMostRecentThread(persistNamespace)
      if (!thread || thread.messages.length === 0) return
      hydrate({ messages: reviveUIMessages(thread.messages), sessionId: thread.sessionId })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistNamespace])

  // On page hide/exit: flush the live transcript so the last turn is captured
  // even if the visitor never returns.
  useEffect(() => {
    if (!persistNamespace) return
    const flush = () => {
      const messages = nonEmptyMessages(store.getState().messages)
      void bufferThread(persistNamespace, toPersistedMessages(messages), store.getState().sessionId)
    }
    const onPageHide = () => flush()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [persistNamespace, store])

  // All conversation state is read from the shared store so every surface under
  // the provider observes the same values (and reset()/hydrate() are visible to
  // all). send/retry come from the single engine instance.
  return {
    messages: state.messages,
    sessionId: state.sessionId,
    isStreaming: state.isStreaming,
    errorType: state.errorType,
    mode: state.mode,
    send: turn.send,
    sendHidden: turn.sendHidden,
    retry: turn.retry,
    stop: turn.stop,
    regenerate: turn.regenerate,
    setActiveVersion: turn.setActiveVersion,
    editMessage: turn.editMessage,
    resendMessage: turn.resendMessage,
    setMode,
    hydrate,
    reset,
  }
}
