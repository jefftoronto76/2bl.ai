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
// components yet. The Zustand store, the Heirloom reducer, and the persistence
// buffer keep their current shapes until Phase 1 adopts these helpers.

import type { ChatMessage, ChatRole } from '@/services/chat/server/types'
import type { ChatErrorType, UIMessage } from './types'

/** Roles a UIMessage may carry — the source of truth is server ChatRole. */
const VALID_ROLES: readonly ChatRole[] = ['user', 'assistant']

const VALID_ERROR_TYPES: readonly ChatErrorType[] = [
  'network',
  'rate_limited',
  'stream_interrupted',
  'auth_error',
  'unknown',
  'user_stopped',
]

const VALID_STATUSES: readonly NonNullable<UIMessage['status']>[] = ['sending', 'sent', 'failed']

function isValidRole(value: unknown): value is ChatRole {
  return typeof value === 'string' && (VALID_ROLES as readonly string[]).includes(value)
}

function isValidErrorType(value: unknown): value is ChatErrorType {
  return typeof value === 'string' && (VALID_ERROR_TYPES as readonly string[]).includes(value)
}

function isValidStatus(value: unknown): value is NonNullable<UIMessage['status']> {
  return typeof value === 'string' && (VALID_STATUSES as readonly string[]).includes(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string')
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
 * Revive an unknown persisted/wire object (DB jsonb row, IndexedDB buffer
 * entry, legacy SageMessage/Message) into a canonical UIMessage. Tolerant by
 * design — this is the back-compat read path for the mixed-shape data already
 * in `chat_sessions.messages` (jefflougheed numbers, Heirloom ISO strings) and
 * in the IndexedDB thread buffer (services/chat/ui/v1/persistence.ts).
 * Missing/invalid fields are coerced to safe defaults: a fresh id, an empty
 * string body, and `role` defaulting to 'assistant' only when absent/invalid.
 *
 * `status`/`stopped`/`versions`/`versionIdx`/`edited` are optional UI-state
 * fields — carried through only when present and well-formed, otherwise left
 * absent (equivalent to their "never happened" defaults). Without this, a
 * page reload or the admin transcript view silently loses a Stopped badge
 * (and the regenerate carousel) even though the DB row still has the field —
 * see useChatTurn.ts's `finishAbortedTurn` for where `stopped` is written.
 *
 * Also reconciles one piece of async state: a revived message still carrying
 * `status: 'sending'` means the tab closed mid-delivery — there is no
 * in-flight request left to resume, so it reads back as 'failed' rather than
 * showing an eternal "Sending…" spinner. `stopped`/`versions`/`versionIdx`/
 * `edited` are historical display metadata, not in-flight indicators, so they
 * revive as-is.
 */
export function reviveUIMessage(raw: unknown): UIMessage {
  const obj = (raw ?? {}) as Record<string, unknown>
  const revivedStatus = isValidStatus(obj.status) ? obj.status : undefined
  return {
    id: typeof obj.id === 'string' && obj.id.length > 0 ? obj.id : crypto.randomUUID(),
    role: isValidRole(obj.role) ? obj.role : 'assistant',
    content: typeof obj.content === 'string' ? obj.content : '',
    timestamp: normalizeTimestamp(obj.timestamp),
    error_type: isValidErrorType(obj.error_type) ? obj.error_type : null,
    ...(revivedStatus !== undefined ? { status: revivedStatus === 'sending' ? 'failed' : revivedStatus } : {}),
    ...(typeof obj.stopped === 'boolean' ? { stopped: obj.stopped } : {}),
    ...(isStringArray(obj.versions) ? { versions: obj.versions } : {}),
    ...(typeof obj.versionIdx === 'number' && Number.isFinite(obj.versionIdx) ? { versionIdx: obj.versionIdx } : {}),
    ...(typeof obj.edited === 'boolean' ? { edited: obj.edited } : {}),
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

/**
 * Stands in for a stopped assistant turn's own content in the model-facing
 * array — never the visitor-facing UI, never persisted. Keeps the turn's
 * role slot present (so alternation holds) without replaying the visitor's
 * own cut-off words back as if they were a complete, satisfying reply.
 */
const STOPPED_PLACEHOLDER = '[Response interrupted.]'

/** A message a stopped turn's partial text is folded into as continuation context. */
function buildContinuationContext(partialReply: string, nextUserText: string): string {
  return (
    '[SYSTEM: Your previous reply was interrupted before it finished. Here is the ' +
    'partial text you had already generated — continue naturally from where it left ' +
    "off, taking the user's message below into account rather than starting over. " +
    "Don't repeat or quote this note back — just continue the reply.]\n" +
    `Partial reply: "${partialReply}"\n\n${nextUserText}`
  )
}

/**
 * Narrow messages to the wire `ChatMessage[]` sent to `/api/sage`. A
 * `stopped: true` assistant turn's role slot is kept in place — never
 * dropped — but its content is replaced with `STOPPED_PLACEHOLDER`; the
 * verbatim partial text is instead folded into the user message that
 * follows it, as continuation context.
 *
 * Protocol note (Sonnet 4.6+): an interrupted/partial assistant reply must
 * never be resent to the model as if it were a finished turn — the model has
 * no signal it was cut short and will "continue" as though it already said
 * something complete. That's why the partial text moves to the *next user*
 * turn instead of staying as the assistant's own message.
 *
 * Why the assistant turn is kept (not dropped): dropping it entirely would
 * leave two consecutive `user`-role entries — the message that prompted the
 * now-stopped reply, immediately followed by the next user turn — which
 * breaks the strict user/assistant alternation the Anthropic Messages API
 * requires. (An earlier version of this function did drop it; every send
 * following a stop-with-content would have sent malformed history. Fixed
 * 2026-07-28, see System Docs/Utilities/Chat UI.md's Stop / interrupted-turn protocol section.)
 * Swapping in a neutral placeholder keeps the role slot — and therefore
 * alternation — intact without replaying the visitor's own words as if the
 * reply had finished.
 *
 * Wire-only transform: the caller's own message list — what's rendered and
 * what's persisted to `chat_sessions.messages` — is never read from mutated
 * or written to here. Neither `STOPPED_PLACEHOLDER` nor the `[SYSTEM: ...]`
 * tag this produces exists anywhere but this function's return value (the
 * `/api/sage` POST body); neither is ever passed to a store accessor, so
 * neither can be displayed or persisted.
 */
export function toModelMessages(
  messages: Array<{ role: ChatRole; content: string; stopped?: boolean }>,
): ChatMessage[] {
  const out: ChatMessage[] = []
  let pendingPartial: string | null = null
  for (const m of messages) {
    if (m.role === 'assistant' && m.stopped) {
      pendingPartial = m.content
      out.push({ role: 'assistant', content: STOPPED_PLACEHOLDER })
      continue
    }
    if (m.role === 'user' && pendingPartial !== null) {
      // An empty partial (Stop hit before any content streamed back) has
      // nothing to continue from — pass the user turn through unchanged
      // rather than wrapping a "here's the partial reply: ''" note that
      // would only confuse the model. Non-empty partials still fold as usual.
      out.push({
        role: 'user',
        content: pendingPartial === '' ? m.content : buildContinuationContext(pendingPartial, m.content),
      })
      pendingPartial = null
      continue
    }
    out.push({ role: m.role, content: m.content })
  }
  return out
}
