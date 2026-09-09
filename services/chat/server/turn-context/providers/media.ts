// Tier 4 — attached media (ATTACHED MEDIA / ATTACHMENT FAILED /
// ATTACHMENT IN PROGRESS). Wraps resolveMediaContext unchanged, including
// the CHAT_MEDIA_CONTEXT_RESOLVED audit event it writes from inside itself.
// The gate mirrors the resolver's own early return exactly, so the
// decision record says "not-applicable" rather than "empty" for the
// overwhelmingly common no-attachment turn.

import { resolveMediaContext } from '../../media-context'
import type { ContextProvider } from '../types'

export const mediaProvider: ContextProvider = {
  id: 'media',
  order: 40,
  priority: 40,
  freshness: 'turn',
  trust: 'system',
  pii: 'none',
  appliesTo: input =>
    input.mediaItems !== null &&
    input.mediaItems.length > 0 &&
    input.tenantId !== null &&
    input.memberId !== null,
  resolve: input => resolveMediaContext(input.mediaItems, input.tenantId, input.memberId),
}
