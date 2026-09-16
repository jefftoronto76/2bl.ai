// services/chat/ui/v1/streamError.ts
//
// Maps the server's in-stream failure classification onto the client's
// ChatErrorType vocabulary. Extracted from useChatTurn's streamTurn so it is
// a pure function with no React and no fetch — the mapping is the part worth
// testing, and it was previously unreachable from a test.

import { parseStreamErrorCode } from '@/services/chat/server/stream-utils'
import type { StreamErrorCode } from '@/services/chat/server/stream-utils'
import type { ChatErrorType } from './types'

export interface StreamFailure {
  /** Drives UI copy and the persisted `chat_sessions.last_error_type`. */
  errorType: ChatErrorType
  /** The server's code, when it sent one. Diagnostic only — never persisted. */
  detail?: StreamErrorCode
}

/**
 * Classifies an in-stream `3:` error part.
 *
 * Only two codes earn a more specific `errorType` than `stream_interrupted`,
 * and both are values `updateSession` already accepts for
 * `last_error_type` (`services/crm/sessions.ts:102`) — so this can change
 * *which* existing value is recorded but can never introduce a new one, and
 * needs no schema change.
 *
 * Everything else deliberately keeps the previous behaviour:
 *   - `''` — a server that predates `describeStreamError`, still masking.
 *   - an unrecognised code — a newer server than this client.
 *   - `upstream_error` / `aborted` — no better home in `ChatErrorType`.
 *   - `unknown_tool` / `invalid_tool_arguments` — cannot occur until tools
 *     ship; when they do, the decision about what a visitor should see is a
 *     product one, not something to guess at here.
 */
export function classifyStreamFailure(message: string | null): StreamFailure {
  const detail = parseStreamErrorCode(message)
  if (detail === 'rate_limited') return { errorType: 'rate_limited', detail }
  if (detail === 'auth_error') return { errorType: 'auth_error', detail }
  return detail ? { errorType: 'stream_interrupted', detail } : { errorType: 'stream_interrupted' }
}
