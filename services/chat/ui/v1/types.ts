// services/chat/ui/v1/types.ts
//
// Type contracts for the v1 chat engine UI layer: the marker registry and the
// useChatTurn hook. Types only — no runtime code, no React. The marker
// registry is the generalized successor to parseBookingCards: the AI emits
// structured markers (e.g. [BOOKING: ...]) and the engine detects, parses, and
// dispatches them to registered handlers. The useChatTurn contract is
// store-agnostic — it operates through injected accessors so a Zustand store
// (jefflougheed) and a useReducer context (Heirloom) can share one
// implementation.

import type { ChatMessage, ChatMode } from '@/services/chat/server/types'

// ── Marker contract ───────────────────────────────────────────────────────

/** Known structured markers the AI may emit in an assistant message. */
export type MarkerType = 'BOOKING' | 'NAME' | 'EMAIL' | 'ARTIFACT' | 'CONTACT'

/** A single marker extracted from an assistant message. */
export interface ParsedMarker {
  type: MarkerType
  /** Pipe-delimited field values, trimmed, in declaration order. */
  fields: string[]
  /** The original matched substring, for round-tripping / diagnostics. */
  raw: string
}

/** Result of parsing an assistant message into prose + extracted markers. */
export interface MarkerParseResult {
  prose: string
  markers: ParsedMarker[]
}

// ── Dispatch surface ────────────────────────────────────────────────────────

/**
 * Where a marker's effect is applied:
 * - `'client'`  — render-time only (e.g. BOOKING → a card).
 * - `'server'`  — persisted server-side in onFinish (e.g. NAME → visitor_name).
 * - `'both'`    — stripped client-side for display AND persisted server-side
 *                 (e.g. EMAIL → DB write + a client confirmation surface).
 */
export type MarkerDispatch = 'client' | 'server' | 'both'

// ── Registration ──────────────────────────────────────────────────────────

/** Static definition registered for one marker type. */
export interface MarkerDefinition {
  type: MarkerType
  /** Matches the marker and captures its fields. */
  pattern: RegExp
  /** Expected number of pipe-delimited fields. */
  fieldCount: number
  dispatch: MarkerDispatch
}

/**
 * The marker registry. Implementations hold the registered definitions, parse
 * assistant content into prose + markers, and expose the registered set.
 */
export interface MarkerRegistry {
  register(def: MarkerDefinition): void
  parse(content: string): MarkerParseResult
  getDefinitions(): MarkerDefinition[]
}

// ── Engine hook (useChatTurn) ───────────────────────────────────────────────

/**
 * Injected state accessors the engine reads/writes through. Keeping the engine
 * store-agnostic lets jefflougheed (Zustand) and Heirloom (useReducer context)
 * share one turn implementation, and lets jefflougheed's Hero + overlay drive a
 * single shared conversation rather than two.
 */
export interface ChatEngineAccessors {
  getMessages(): ChatMessage[]
  addMessage(msg: ChatMessage): void
  updateLastMessage(content: string): void
  setStreaming(val: boolean): void
  setSessionId(id: string): void
  getSessionId(): string | null
  /** Optional — only the surfaces that support arrival modes implement this. */
  getMode?(): ChatMode
}

/** Options passed into the useChatTurn hook. */
export interface UseChatTurnOptions {
  accessors: ChatEngineAccessors
  tenantId?: string
}

/** Public surface returned by the useChatTurn hook. */
export interface UseChatTurnReturn {
  send(input: string): Promise<void>
  retry(): Promise<void>
  isStreaming: boolean
  isError: boolean
}
