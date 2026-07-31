// components/shells/membership/memory/memoryErrorCopy.ts
//
// On-brand copy for each classified MemoryErrorType (services/crm/memory-errors.ts)
// — the live-failure-signal half of the paired error-handling mechanism (see
// CLAUDE.md's Memories section, and components/chat/errorCopy.ts for the
// sibling pattern this mirrors for the main chat turn). Heirloom-only, same
// as the card itself — not shared with components/chat/.

import type { MemoryErrorType } from '@/services/crm/memory-errors'

export const MEMORY_ERROR_COPY: Record<MemoryErrorType, string> = {
  network: "Couldn't reach the connection just now — tap the bookmark to try again.",
  rate_limited: "Things are a little busy right now — tap the bookmark to try again in a moment.",
  malformed_response: "Couldn't quite finish writing that up — tap the bookmark to try again.",
  unknown: "Something went wrong gathering that memory — tap the bookmark to try again.",
}
