// services/chat/ui/v1/message.ts
//
// Canonical UIMessage construction, timestamp normalization, and adapters
// (Phase 0 — the contract foundation).
//
// Pure module: no React, no DOM, no store dependency — so it is server-safe
// (admin transcript renderer, route persistence) and trivially unit-testable.
// It is the single place the three message shapes in the codebase reconcile:
//
//   - jefflougheed SageMessage  (timestamp: number)
//   - Heirloom Message          (timestamp: Date)
//   - persisted PersistedMessage / DB jsonb (timestamp: ISO string or number)
//
// All collapse onto UIMessage (timestamp: epoch milliseconds). The wire shape
// sent to /api/sage stays the leaner ChatMessage ({ role, content }); see
// toChatMessage / toChatMessages below.
//
// Phase 0 is contract-only: nothing here is wired into the existing stores or
// components yet. The Zustand store, the Heirloom reducer, and chatPersistence
// keep their current shapes until Phase 1 adopts these helpers.

import type { ChatMessage, ChatRole } from '@/services/chat/server/types'
import type { UIMessage } from './types'

/** Roles a UIMessage may carry — the source of truth is server ChatRole. */
const VALID_ROLES: readonly ChatRole[] = ['user', 'assistant']

function isValidRole(value: unknown): value is ChatRole {
  return typeof value === 'string' && (VALID_ROLES as readonly string[]).includes(value)
}

/** True for a string that is purely digits (a bare epoch-ms value as text). */
function isDigits(value: string): boolean {
  return value.length > 0 && /^\d+$/.test(value)
}

/**
 * Coerce any timestamp representation the codebase produces — epoch
 * milliseconds (number), a Date, or a string (ISO 8601, or a bare epoch-ms
 * string) — into canonical epoch milliseconds.
 *
 * Falls back to `Date.now()` for missing or unparseable input so a revived
 * message always carries a finite, orderable timestamp rather than the 1970
 * epoch artifact a `0` fallback would produce. Deterministic for every real
 * input shape; the now() fallback is reached only by genuinely malformed data.
 */
export function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Date.now()
  }
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : Date.now()
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    // A bare epoch-ms string (e.g. "1716854400000") — Date.parse would reject it.
    if (isDigits(trimmed)) {
      const n = Number(trimmed)
      return Number.isFinite(n) ? n : Date.now()
    }
    const parsed = Date.parse(trimmed)
    return Number.isNaN(parsed) ? Date.now() : parsed
  }
  return Date.now()
}

/**
 * Construct a canonical UIMessage. The default `id`/`timestamp` make this the
 * one constructor both stores will use in Phase 1, so id/timestamp generation
 * stops being duplicated per surface. Overrides exist for revival and tests.
 */
export function createUIMessage(
  role: ChatRole,
  content: string,
  overrides?: Partial<Pick<UIMessage, 'id' | 'timestamp'>>,
): UIMessage {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    role,
    content,
    timestamp: overrides?.timestamp ?? Date.now(),
  }
}

/**
 * Revive an unknown persisted/wire object (DB jsonb row, localStorage entry,
 * legacy SageMessage/Message) into a canonical UIMessage. Tolerant by design —
 * this is the back-compat read path for the mixed-shape data already in
 * `chat_sessions.messages` (jefflougheed numbers, Heirloom ISO strings) and in
 * Heirloom localStorage. Missing/invalid fields are coerced to safe defaults:
 * a fresh id, an empty string body, and `role` defaulting to 'assistant' only
 * when absent/invalid.
 */
export function reviveUIMessage(raw: unknown): UIMessage {
  const obj = (raw ?? {}) as Record<string, unknown>
  return {
    id: typeof obj.id === 'string' && obj.id.length > 0 ? obj.id : crypto.randomUUID(),
    role: isValidRole(obj.role) ? obj.role : 'assistant',
    content: typeof obj.content === 'string' ? obj.content : '',
    timestamp: normalizeTimestamp(obj.timestamp),
  }
}

/** Revive an array of unknown persisted/wire objects into UIMessages. */
export function reviveUIMessages(raw: unknown): UIMessage[] {
  return Array.isArray(raw) ? raw.map(reviveUIMessage) : []
}

/**
 * Narrow a UIMessage to the wire shape `/api/sage` accepts. `id`/`timestamp`
 * are UI/persistence concerns the model never sees — this strips them.
 */
export function toChatMessage(message: UIMessage): ChatMessage {
  return { role: message.role, content: message.content }
}

/** Narrow an array of UIMessages to wire ChatMessages. */
export function toChatMessages(messages: UIMessage[]): ChatMessage[] {
  return messages.map(toChatMessage)
}
