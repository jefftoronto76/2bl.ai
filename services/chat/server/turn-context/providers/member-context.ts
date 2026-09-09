// Tier 2 — MEMBER CONTEXT: identity lines + (first turn only) the marker
// emission instruction. Wraps getMemberContext unchanged and adds the
// "MEMBER CONTEXT:\n" header that streamChat has always added at the call
// site, so the assembled prompt is byte-identical.
//
// trust is `system` in Phase 1 deliberately: the block mixes system-authored
// identity lines with the operator-authored `primer`, and wrapping the whole
// block would change the prompt text. Phase 3b splits primer out as an
// `operator` sub-block once the shadow run has proven parity.

import { getMemberContext } from '../../member-context'
import type { ContextProvider } from '../types'

export const MEMBER_CONTEXT_HEADER = 'MEMBER CONTEXT:\n'

export const memberContextProvider: ContextProvider = {
  id: 'member-context',
  order: 20,
  priority: 20,
  freshness: 'turn',
  trust: 'system',
  pii: 'identity',
  // Same gate as streamChat: `(sessionId || memberId)`. getMemberContext
  // additionally requires a tenant and returns null without one.
  appliesTo: input => input.sessionId !== null || input.memberId !== null,
  async resolve(input) {
    const text = await getMemberContext(input.sessionId, input.tenantId, input.memberId, input.isFirstTurn)
    if (!text) return null
    return {
      body: `${MEMBER_CONTEXT_HEADER}${text}`,
      // Content-free: whether the first-turn marker instruction was part of
      // the block. Field-level presence/hash reporting needs getMemberContext
      // to return structured data — Phase 3b, alongside the primer split.
      meta: { firstTurnMarkerInstruction: input.isFirstTurn },
    }
  },
}
