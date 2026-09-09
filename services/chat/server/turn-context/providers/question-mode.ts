// Tier 1 (priority) / last (order) — the ?mode=question arrival context.
// A static constant; no I/O. Order 50 keeps it at the end of the prompt,
// where streamChat has always placed it; priority 15 says it is an
// operational instruction, not the first thing to sacrifice under budget.

import { QUESTION_MODE_CONTEXT } from '@/services/prompt/compiler'
import type { ContextProvider } from '../types'

export const questionModeProvider: ContextProvider = {
  id: 'question-mode',
  order: 50,
  priority: 15,
  freshness: 'static',
  trust: 'system',
  pii: 'none',
  appliesTo: input => input.mode === 'question',
  resolve: async () => QUESTION_MODE_CONTEXT,
}
