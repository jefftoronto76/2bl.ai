// services/chat/ui/v1/core/store.ts
//
// The conversation state container for the v2 shared session (Phase 1).
//
// Holds ONLY the conversation slice that every surface must share —
// messages, sessionId, streaming flag, error flag, and request-affecting
// mode. Shell/presentation state (isExpanded, composer focus ref, etc.) is
// deliberately NOT here; that is a shell concern (see Design Handovers/chat-ui-v2-design.md
// §6 Risk 4). The store is a pure, framework-agnostic value container — no
// React — so it is unit-testable in isolation and SSR-neutral.
//
// Backed by zustand/vanilla (already a dependency; the store this generalizes,
// src/lib/store.ts, uses zustand) per CLAUDE.md "API Before Build". The exposed
// ChatSessionStore is a deliberately minimal subset of zustand's StoreApi
// (getState / setState(partial) / subscribe) so consumers — and
// useSyncExternalStore — bind to a stable, intentional surface rather than the
// full library API.

import { createStore } from 'zustand/vanilla'
import type { ChatMode } from '@/services/chat/server/types'
import type { ChatErrorType, UIMessage } from '../types'

/** The shared conversation slice. UIMessage (Phase 0) is canonical throughout. */
export interface ChatSessionState {
  messages: UIMessage[]
  sessionId: string | null
  isStreaming: boolean
  /** Classified reason the most recent turn failed, or null when it succeeded. */
  errorType: ChatErrorType | null
  /** Request-affecting arrival context (e.g. question mode); null by default. */
  mode: ChatMode
}

/** Input to hydrate() — the conversation slice restored from a buffer/DB. */
export interface HydrateInput {
  messages: UIMessage[]
  sessionId: string | null
}

/**
 * Minimal store contract. A subset of zustand's StoreApi — `setState` takes a
 * partial object only (read-then-write is done in the accessors, so functional
 * updates are not part of the surface), and `subscribe` takes a zero-arg
 * listener so it plugs straight into `useSyncExternalStore`. `hydrate`/`reset`
 * are the two higher-level conversation operations (added for Heirloom's
 * localStorage/DB recovery and New Chat).
 */
export interface ChatSessionStore {
  getState(): ChatSessionState
  setState(partial: Partial<ChatSessionState>): void
  subscribe(listener: () => void): () => void
  /** Replace messages + sessionId wholesale (localStorage rehydrate / DB recovery). */
  hydrate(input: HydrateInput): void
  /**
   * Clear the conversation slice — messages, sessionId, isStreaming, errorType.
   * Leaves `mode` untouched (request context, not conversation content).
   */
  reset(): void
}

/** The empty conversation every fresh store starts from. */
export function initialChatSessionState(): ChatSessionState {
  return {
    messages: [],
    sessionId: null,
    isStreaming: false,
    errorType: null,
    mode: null,
  }
}

/**
 * Create a fresh, independent conversation store. Each call is fully isolated —
 * sharing is the registry's job (store-registry.ts), never this factory's.
 *
 * Wraps a zustand/vanilla store and adds hydrate/reset. zustand's getState/
 * setState/subscribe are standalone closures (no `this`), so referencing them
 * directly keeps the exposed surface stable for useSyncExternalStore.
 */
export function createChatSessionStore(): ChatSessionStore {
  const store = createStore<ChatSessionState>()(() => initialChatSessionState())
  return {
    getState: store.getState,
    setState: store.setState,
    subscribe: store.subscribe,
    hydrate: ({ messages, sessionId }) => store.setState({ messages, sessionId }),
    reset: () =>
      store.setState({ messages: [], sessionId: null, isStreaming: false, errorType: null }),
  }
}
