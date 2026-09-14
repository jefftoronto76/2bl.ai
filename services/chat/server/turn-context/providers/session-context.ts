// Tier 3 — session-attached context (today: the story a chat was started
// in). Wraps getSessionContext unchanged, including its per-row
// context_frequency gate ('once' | 'every_turn').
//
// trust is `system` here even though the story text is participant-authored:
// getSessionContext already emits the delineated, escaped <session_context>
// block itself, and wrapping it again would double-delineate. Phase 6 can
// move that wrapping out of the resolver and into the runner by flipping
// this to `participant` — a one-line change, and the reason the runner
// owns delineation at all.

import { getSessionContext } from '../../session-context'
import type { ContextProvider } from '../types'

export const sessionContextProvider: ContextProvider = {
  id: 'session-context',
  order: 30,
  priority: 30,
  freshness: 'session',
  trust: 'system',
  pii: 'none',
  appliesTo: input => input.sessionId !== null && input.tenantId !== null,
  resolve: input => getSessionContext(input.sessionId, input.tenantId, input.isFirstTurn),
}
