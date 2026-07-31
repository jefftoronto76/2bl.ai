// services/crm/memory-errors.ts
//
// Classification for a failed archivist call (services/chat/server/memory-archivist.ts) —
// the "live failure signal" half of the paired error-handling mechanism in
// CLAUDE.md's Memories section (durable log via services/audit + this classified
// type for what the visitor sees in the moment). Deliberately NOT the same
// union as ChatErrorType (services/chat/ui/v1/types.ts): three of that type's
// six members don't apply to this call (stream_interrupted — not streamed to
// the client; user_stopped — not cancellable in v1; auth_error — not a
// user-auth-gated call), and this call has one real, named failure mode that
// type has no equivalent for (malformed_response — the model responded, but
// no valid {title, passage} could be parsed out of it).
//
// Pure module — no React, no DB client — so it is safe to import from both
// the server route that classifies a failure and any client code that maps
// the classification to copy.

export type MemoryErrorType = 'network' | 'rate_limited' | 'malformed_response' | 'unknown'

export const VALID_MEMORY_ERROR_TYPES: readonly MemoryErrorType[] = [
  'network',
  'rate_limited',
  'malformed_response',
  'unknown',
]

export function isValidMemoryErrorType(value: unknown): value is MemoryErrorType {
  return typeof value === 'string' && (VALID_MEMORY_ERROR_TYPES as readonly string[]).includes(value)
}
