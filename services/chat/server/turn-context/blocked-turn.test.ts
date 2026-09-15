// The account-status rule's action: a fixed reply before any model call,
// sourced from the editable 'blocked' slot with a built-in fallback, recorded
// like every other turn, in the exact wire format the client already reads.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CompiledPromptForSlot } from '@/services/prompt/select'
import type { TurnContextRequest } from './types'

vi.mock('@/services/auth/supabase-admin', () => ({ getAdminClient: () => ({}) }))

const mockLogEvent = vi.fn()
vi.mock('@/services/audit', () => ({ logEvent: (...a: unknown[]) => mockLogEvent(...a) }))

const mockSelectCompiledPrompt = vi.fn<(t: string | null, k: string) => Promise<CompiledPromptForSlot | null>>()
vi.mock('@/services/prompt/select', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/prompt/select')>()
  return { ...actual, selectCompiledPrompt: (t: string | null, k: string) => mockSelectCompiledPrompt(t, k) }
})

import { resolveBlockedTurn, blockedTurnResponse, BLOCKED_TURN_FALLBACK_TEXT } from './blocked-turn'
import { readDataStream } from '../stream-utils'

function request(overrides: Partial<TurnContextRequest> = {}): TurnContextRequest {
  return {
    tenantId: 'tenant-1',
    sessionId: 'session-1',
    memberId: 'member-1',
    memberStatus: 'active',
    messages: [{ role: 'user', content: 'Hi' }],
    mode: null,
    mediaItems: null,
    correlationId: 'corr-1',
    ...overrides,
  }
}

beforeEach(() => {
  mockLogEvent.mockReset()
  mockSelectCompiledPrompt.mockReset().mockResolvedValue(null)
})

describe('resolveBlockedTurn', () => {
  it('returns null for an active member — no slot read, no audit row', async () => {
    expect(await resolveBlockedTurn(request({ memberStatus: 'active' }))).toBeNull()
    expect(mockSelectCompiledPrompt).not.toHaveBeenCalled()
    expect(mockLogEvent).not.toHaveBeenCalled()
  })

  it('returns null for an anonymous visitor — baseline unchanged', async () => {
    expect(await resolveBlockedTurn(request({ memberId: null, memberStatus: null }))).toBeNull()
    expect(mockSelectCompiledPrompt).not.toHaveBeenCalled()
  })

  it.each(['invited', 'waitlist', 'pending'])('returns null for a %s member', async status => {
    expect(await resolveBlockedTurn(request({ memberStatus: status }))).toBeNull()
  })

  it.each(['suspended', 'deleted'])('blocks a %s member with the editable slot copy when the slot is live, and records it', async status => {
    mockSelectCompiledPrompt.mockResolvedValue({
      content: "<identity>\nYou can't chat right now. Create a new account or contact support.\n</identity>",
      compiledPromptId: 'cp-blocked', version: 2, promptTypeId: 'pt-blocked', slotKey: 'blocked',
    })

    const blocked = await resolveBlockedTurn(request({ memberStatus: status }))

    expect(blocked).toEqual({
      text: "You can't chat right now. Create a new account or contact support.",
      selection: { slotKey: 'blocked', ruleId: 'account-status', compiledPromptId: 'cp-blocked', version: 2, fallback: false },
    })
    expect(mockSelectCompiledPrompt).toHaveBeenCalledWith('tenant-1', 'blocked')

    expect(mockLogEvent).toHaveBeenCalledTimes(1)
    const event = mockLogEvent.mock.calls[0][0]
    expect(event).toMatchObject({
      action: 'chat.turn_context_resolved', outcome: 'success', tenant_id: 'tenant-1',
      target_type: 'chat_session', target_id: 'session-1', correlation_id: 'corr-1', actor_type: 'user',
    })
    expect(event.metadata).toMatchObject({
      blocked: true, modelCalled: false, shadow: false,
      selection: { slotKey: 'blocked', ruleId: 'account-status', compiledPromptId: 'cp-blocked' },
      injections: [],
    })
    // Never the reply text, never a status word that would distinguish suspended from deleted.
    const serialized = JSON.stringify(event.metadata)
    expect(serialized).not.toContain("You can't chat")
    expect(serialized).not.toContain(status)
  })

  it('still blocks when the slot has no live compiled prompt yet — with the fallback copy, marked fallback', async () => {
    mockSelectCompiledPrompt.mockResolvedValue(null)
    const blocked = await resolveBlockedTurn(request({ memberStatus: 'suspended' }))
    expect(blocked).toEqual({
      text: BLOCKED_TURN_FALLBACK_TEXT,
      selection: { slotKey: 'blocked', ruleId: 'account-status', compiledPromptId: null, version: null, fallback: true },
    })
    expect(mockLogEvent.mock.calls[0][0].metadata.selection.fallback).toBe(true)
  })

  it('still blocks when the slot read throws — the block is the rule\'s decision, not the read\'s', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSelectCompiledPrompt.mockRejectedValue(new Error('db down'))
    const blocked = await resolveBlockedTurn(request({ memberStatus: 'deleted' }))
    expect(blocked?.text).toBe(BLOCKED_TURN_FALLBACK_TEXT)
    expect(blocked?.selection.fallback).toBe(true)
    spy.mockRestore()
  })

  it('falls back when the compiled content is empty after stripping section tags', async () => {
    mockSelectCompiledPrompt.mockResolvedValue({ content: '<identity>\n\n</identity>', compiledPromptId: 'cp', version: 1, promptTypeId: 'pt', slotKey: 'blocked' })
    const blocked = await resolveBlockedTurn(request({ memberStatus: 'suspended' }))
    expect(blocked?.text).toBe(BLOCKED_TURN_FALLBACK_TEXT)
  })

  it('the audit logger throwing does not unblock the member', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockLogEvent.mockImplementation(() => { throw new Error('audit down') })
    const blocked = await resolveBlockedTurn(request({ memberStatus: 'suspended' }))
    expect(blocked?.text).toBe(BLOCKED_TURN_FALLBACK_TEXT)
    spy.mockRestore()
  })

  it('the fallback copy invites a new account or support and never names a status', () => {
    expect(BLOCKED_TURN_FALLBACK_TEXT).toMatch(/new account/i)
    expect(BLOCKED_TURN_FALLBACK_TEXT).toMatch(/contact support/i)
    expect(BLOCKED_TURN_FALLBACK_TEXT).not.toMatch(/suspend|delet/i)
  })
})

describe('blockedTurnResponse', () => {
  it('is a 200 AI SDK data-stream Response the existing client reader turns back into the text', async () => {
    const response = blockedTurnResponse('Hello, blocked person.')
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('X-Vercel-AI-Data-Stream')).toBe('v1')

    const chunks: string[] = []
    const text = await readDataStream(response, acc => chunks.push(acc))
    expect(text).toBe('Hello, blocked person.')
    expect(chunks.at(-1)).toBe('Hello, blocked person.')
  })

  it('escapes newlines and quotes correctly in the text part', async () => {
    const response = blockedTurnResponse('Line "one"\nLine two')
    expect(await readDataStream(response, () => {})).toBe('Line "one"\nLine two')
  })

  it('carries a finish part after the text part', async () => {
    const body = await blockedTurnResponse('x').text()
    expect(body.split('\n').filter(Boolean)).toEqual(['0:"x"', 'd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}'])
  })
})
