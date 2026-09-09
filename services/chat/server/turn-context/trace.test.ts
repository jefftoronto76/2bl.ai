import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuditAction } from '@/services/audit/types'
import type { ResolvedTurnPrompt } from './types'

const mockLogEvent = vi.fn()
vi.mock('@/services/audit', () => ({ logEvent: (...args: unknown[]) => mockLogEvent(...args) }))

import { recordTurnContext, buildTurnContextMetadata } from './trace'

// Fixture values that must never appear in the record.
const PII = { name: 'Sarah Chen', email: 'sarah@example.com', phone: '+15551234567', primer: 'Her dog is Biscuit' }

const resolved: ResolvedTurnPrompt = {
  system: `BASE\n\nMEMBER CONTEXT:\nMember's name is ${PII.name}. Email: ${PII.email}. Phone: ${PII.phone}. ${PII.primer}`,
  selection: { slotKey: 'base', ruleId: 'default-slot', compiledPromptId: 'cp-1', version: 23, fallback: false },
  injections: [
    { id: 'base-prompt', order: 0, priority: 0, status: 'injected', estTokens: 2, ms: 3, meta: { compiledPromptId: 'cp-1', version: 23, fallback: false } },
    { id: 'booking', order: 10, priority: 10, status: 'skipped', reason: 'empty', estTokens: 0, ms: 2 },
    { id: 'member-context', order: 20, priority: 20, status: 'injected', estTokens: 30, ms: 9, meta: { firstTurnMarkerInstruction: true } },
    { id: 'media', order: 40, priority: 40, status: 'skipped', reason: 'not-applicable', estTokens: 0, ms: 0 },
  ],
  budget: { capTokens: 2000, enforce: false, usedTokens: 32, budgetedTokens: 30, overCap: false, droppedIds: [] },
  isFirstTurn: true,
  turnIndex: 0,
}

beforeEach(() => mockLogEvent.mockClear())

describe('recordTurnContext', () => {
  it('writes one CHAT_TURN_CONTEXT_RESOLVED event targeting the session, with the correlation id', () => {
    recordTurnContext(resolved, { tenantId: 't', sessionId: 's', memberId: 'm', correlationId: 'corr-1', shadow: false })
    expect(mockLogEvent).toHaveBeenCalledTimes(1)
    expect(mockLogEvent.mock.calls[0][0]).toMatchObject({
      action: AuditAction.CHAT_TURN_CONTEXT_RESOLVED,
      tenant_id: 't',
      actor_type: 'user',
      target_type: 'chat_session',
      target_id: 's',
      correlation_id: 'corr-1',
      outcome: 'success',
    })
    expect(AuditAction.CHAT_TURN_CONTEXT_RESOLVED).toBe('chat.turn_context_resolved')
  })

  it('marks anonymous turns as anonymous', () => {
    recordTurnContext(resolved, { tenantId: 't', sessionId: null, memberId: null, correlationId: null, shadow: false })
    expect(mockLogEvent.mock.calls[0][0]).toMatchObject({ actor_type: 'anonymous', target_id: null })
  })

  it('carries selection, every injection decision, the budget, and the shadow/parity flags', () => {
    const metadata = buildTurnContextMetadata(resolved, { shadow: true, parity: false })
    expect(metadata).toMatchObject({
      selection: { slotKey: 'base', ruleId: 'default-slot', compiledPromptId: 'cp-1', version: 23 },
      budget: { usedTokens: 32, overCap: false },
      isFirstTurn: true,
      turnIndex: 0,
      systemLength: resolved.system.length,
      shadow: true,
      parity: false,
    })
    expect((metadata.injections as unknown[]).length).toBe(4)
  })

  it('omits parity when not supplied', () => {
    expect(buildTurnContextMetadata(resolved, { shadow: false })).not.toHaveProperty('parity')
  })

  it('never includes block text or raw identity values — only ids, statuses, counts, timings', () => {
    recordTurnContext(resolved, { tenantId: 't', sessionId: 's', memberId: 'm', correlationId: null, shadow: false })
    const serialized = JSON.stringify(mockLogEvent.mock.calls[0][0].metadata)
    for (const value of Object.values(PII)) expect(serialized).not.toContain(value)
    expect(serialized).not.toContain('MEMBER CONTEXT')
    expect(serialized).not.toContain(resolved.system)
  })
})
