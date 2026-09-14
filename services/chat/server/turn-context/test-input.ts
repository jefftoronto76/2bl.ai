// Test-only fixture builder shared by the turn-context suites. Not a
// `.test.ts` file itself (so vitest doesn't collect it) and imported by
// nothing outside tests.

import type { TurnContextInput } from './types'

export function makeInput(overrides: Partial<TurnContextInput> = {}): TurnContextInput {
  return {
    tenantId: 'tenant-1',
    sessionId: null,
    memberId: null,
    messages: [{ role: 'user', content: 'Hi' }],
    mode: null,
    mediaItems: null,
    correlationId: null,
    isFirstTurn: true,
    turnIndex: 0,
    ...overrides,
  }
}
