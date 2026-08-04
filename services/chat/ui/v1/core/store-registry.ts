// services/chat/ui/v1/core/store-registry.ts
//
// Module-level singleton registry of conversation stores, keyed by instanceKey
// (Phase 1). This is the mechanism that lets multiple UI surfaces share ONE
// conversation: every binding that resolves the same key gets the same store —
// the jefflougheed Hero + Overlay shared-conversation invariant (see
// Design Handovers/chat-ui-v2-design.md §2).
//
// CLIENT-ONLY by contract. On the server, module scope is per-process and
// shared across every request, so storing per-visitor conversation state here
// would leak one visitor's chat into another's. getSingletonStore therefore
// throws if called during SSR; callers (useChatSession) fall back to an
// isolated, throwaway store on the server and only touch the registry once on
// the client. Isolated mode never touches this module at all.

import { createChatSessionStore, type ChatSessionStore } from './store'

/**
 * Keyed singleton stores. Lives at module scope so it persists across renders
 * and across separate provider trees on the same client document — the
 * convergence safety net behind singleton mode. Never seeded on the server
 * (see isServer guard below).
 */
const registry = new Map<string, ChatSessionStore>()

function isServer(): boolean {
  return typeof window === 'undefined'
}

/**
 * Resolve the shared store for `instanceKey`, creating it on first access.
 * Same key in, same store out — for the life of the client document.
 *
 * Throws on the server: the registry must never hold state across requests.
 */
export function getSingletonStore(instanceKey: string): ChatSessionStore {
  if (isServer()) {
    throw new Error(
      '[chat/ui] getSingletonStore is client-only and must not run during SSR. ' +
        'useChatSession falls back to an isolated store on the server.',
    )
  }
  let store = registry.get(instanceKey)
  if (!store) {
    store = createChatSessionStore()
    registry.set(instanceKey, store)
  }
  return store
}

/** True when a store has already been registered for `instanceKey`. */
export function hasSingletonStore(instanceKey: string): boolean {
  return registry.has(instanceKey)
}

/** Test seam: drop one keyed singleton so tests start from a clean registry. */
export function __resetSingletonStore(instanceKey: string): void {
  registry.delete(instanceKey)
}

/** Test seam: clear the entire registry between tests. */
export function __clearSingletonRegistry(): void {
  registry.clear()
}
