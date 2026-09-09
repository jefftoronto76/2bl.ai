// Tier 0 — the tenant's compiled system prompt. Always first, never dropped.
//
// Phase 1 wraps the same "highest-version live row per tenant" read
// streamChat uses today (getSystemPromptRecord shares getSystemPrompt's
// query). Phase 4 swaps this for the slot-aware read that honours
// select-prompt.ts's decision; until then the slot is recorded but not yet
// acted on.

import { getSystemPromptRecord } from '@/services/prompt/compiler'
import type { ContextProvider } from '../types'

export const basePromptProvider: ContextProvider = {
  id: 'base-prompt',
  order: 0,
  priority: 0,
  freshness: 'turn',
  trust: 'system',
  pii: 'none',
  budgetExempt: true,
  appliesTo: () => true,
  async resolve(input) {
    const record = await getSystemPromptRecord(input.tenantId)
    return {
      body: record.content,
      meta: {
        compiledPromptId: record.compiledPromptId,
        version: record.version,
        fallback: record.fallback,
        ...(record.fallbackReason ? { fallbackReason: record.fallbackReason } : {}),
      },
    }
  },
}
