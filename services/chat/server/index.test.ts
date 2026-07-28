// Verifies streamChat's server-side abort confirmation write: the instant
// the inbound request's AbortSignal fires, chat_sessions.server_abort_confirmed_at
// should be written via getAdminClient — this is the DB-level proof that the
// server-side abort handler actually ran, checkable without log access. See
// CLAUDE.md's "Stop / interrupted-turn protocol" section.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelConfig } from './types'

const mockThen = vi.fn((cb: (arg: { error: null }) => void) => {
  cb({ error: null })
  return Promise.resolve()
})
const mockEqTenant = vi.fn(() => ({ then: mockThen }))
const mockEqId = vi.fn(() => ({ eq: mockEqTenant }))
const mockUpdate = vi.fn(() => ({ eq: mockEqId }))
const mockFrom = vi.fn(() => ({ update: mockUpdate }))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({ from: mockFrom }),
}))

vi.mock('./prompt', () => ({
  getSystemPrompt: vi.fn(async () => 'system prompt'),
  QUESTION_MODE_CONTEXT: 'question mode context',
}))
vi.mock('./booking', () => ({
  getBookingCardSection: vi.fn(async () => ''),
}))
vi.mock('./member-context', () => ({
  getMemberPrimer: vi.fn(async () => null),
}))
vi.mock('./media-context', () => ({
  resolveMediaContext: vi.fn(async () => ''),
  stripMediaMarkers: vi.fn((messages: unknown) => messages),
}))
vi.mock('@/services/crm/session', () => ({
  handleSessionFinish: vi.fn(async () => undefined),
}))

const mockRunChatStream = vi.fn(async (_opts: unknown) => new Response('ok'))
vi.mock('./stream', () => ({
  runChatStream: (opts: unknown) => mockRunChatStream(opts),
  resolveModelConfig: vi.fn(async () => ({
    provider: 'anthropic',
    chatModel: 'claude-sonnet-4-6',
    fallbackModel: 'gpt-4o',
    maxTokens: 1000,
    rateLimitRequestsPerHour: 100,
  }) satisfies ModelConfig),
}))

import { streamChat } from './index'

beforeEach(() => {
  mockFrom.mockClear()
  mockUpdate.mockClear()
  mockEqId.mockClear()
  mockEqTenant.mockClear()
  mockThen.mockClear()
  mockRunChatStream.mockClear()
})

describe('streamChat — server-side abort confirmation', () => {
  it('writes server_abort_confirmed_at scoped by session and tenant when the signal aborts', async () => {
    const controller = new AbortController()
    const responsePromise = streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
      signal: controller.signal,
    })

    controller.abort()
    // Let the abort-listener's fire-and-forget microtask run.
    await Promise.resolve()
    await Promise.resolve()
    await responsePromise

    expect(mockFrom).toHaveBeenCalledWith('chat_sessions')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ server_abort_confirmed_at: expect.any(String) }),
    )
    expect(mockEqId).toHaveBeenCalledWith('id', 'session-1')
    expect(mockEqTenant).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })

  it('does not write anything when the signal never aborts', async () => {
    const controller = new AbortController()
    await streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
      signal: controller.signal,
    })

    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('does not attempt the write when there is no session to attribute it to', async () => {
    const controller = new AbortController()
    const responsePromise = streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: null,
      signal: controller.signal,
    })

    controller.abort()
    await Promise.resolve()
    await Promise.resolve()
    await responsePromise

    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('registers the listener before any awaited work, so an immediate abort is still caught', async () => {
    const controller = new AbortController()
    // Abort synchronously, before streamChat has had a chance to await
    // anything (getSystemPrompt/resolveModelConfig/etc.) — the listener must
    // already be armed at this point.
    const responsePromise = streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
      signal: controller.signal,
    })
    controller.abort()
    await Promise.resolve()
    await Promise.resolve()
    await responsePromise

    expect(mockFrom).toHaveBeenCalledWith('chat_sessions')
  })
})
