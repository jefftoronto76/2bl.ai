// Verifies streamChat's server-side stop detection: since req.signal isn't
// reliably propagated on this deployment (confirmed live — the client
// correctly recorded Stop, but the server kept generating anyway), the
// reliable mechanism is polling chat_sessions.stop_requested_at (written by
// useChatTurn.ts's stop() via an ordinary PATCH /api/sessions/[id]) and
// comparing it against this turn's own start time. req.signal stays wired as
// a zero-cost bonus fast path. Either trigger writes
// chat_sessions.server_abort_confirmed_at — the DB-checkable proof this
// actually ran. See System Docs/Utilities/Chat UI.md's "Stop / interrupted-turn protocol".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ModelConfig } from './types'

const mockConfirmThen = vi.fn((cb: (arg: { error: null }) => void) => {
  cb({ error: null })
  return Promise.resolve()
})
const mockConfirmEqTenant = vi.fn(() => ({ then: mockConfirmThen }))
const mockConfirmEqId = vi.fn(() => ({ eq: mockConfirmEqTenant }))
const mockUpdate = vi.fn(() => ({ eq: mockConfirmEqId }))

const mockMaybeSingle = vi.fn(async () => ({ data: null as { stop_requested_at: string | null } | null }))
const mockSelectEqTenant = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockSelectEqId = vi.fn(() => ({ eq: mockSelectEqTenant }))
const mockSelect = vi.fn(() => ({ eq: mockSelectEqId }))

const mockFrom = vi.fn(() => ({ update: mockUpdate, select: mockSelect }))

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
const mockGetMemberContext = vi.fn(
  async (
    _sessionId: string | null,
    _tenantId: string | null,
    _memberId: string | null | undefined,
    _isFirstTurn: boolean,
  ) => null as string | null,
)
vi.mock('./member-context', () => ({
  getMemberContext: (
    sessionId: string | null,
    tenantId: string | null,
    memberId: string | null | undefined,
    isFirstTurn: boolean,
  ) => mockGetMemberContext(sessionId, tenantId, memberId, isFirstTurn),
}))
vi.mock('./media-context', () => ({
  resolveMediaContext: vi.fn(async () => ''),
  stripMediaMarkers: vi.fn((messages: unknown) => messages),
}))
vi.mock('@/services/crm/session', () => ({
  handleSessionFinish: vi.fn(async () => undefined),
}))

const mockLogEvent = vi.fn(async (_input: unknown) => undefined)
vi.mock('@/services/audit', () => ({
  logEvent: (input: unknown) => mockLogEvent(input),
}))

type CacheUsage = { cacheCreationInputTokens: number | null; cacheReadInputTokens: number | null }

// A stand-in for streamText/runChatStream that behaves like the real thing
// with respect to abortSignal: rejects with an AbortError the instant the
// signal fires, and otherwise stays pending until the test resolves it via
// resolveRunChatStream (simulating an in-progress generation) or never
// resolves at all for tests that only care about the abort path.
let resolveRunChatStream: ((value: Response) => void) | null = null
let runChatStreamOnFinish:
  | ((args: { text: string; usage: null; cacheUsage?: CacheUsage | null }) => Promise<void>)
  | null = null
const mockRunChatStream = vi.fn(
  (opts: {
    cachedSystem?: string
    system: string
    abortSignal?: AbortSignal
    onFinish?: typeof runChatStreamOnFinish
  }) => {
    runChatStreamOnFinish = opts.onFinish ?? null
    return new Promise<Response>((resolve, reject) => {
      resolveRunChatStream = resolve
      opts.abortSignal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      })
    })
  },
)
vi.mock('./stream', () => ({
  runChatStream: (opts: Parameters<typeof mockRunChatStream>[0]) => mockRunChatStream(opts),
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
  vi.useFakeTimers()
  mockFrom.mockClear()
  mockUpdate.mockClear()
  mockConfirmEqId.mockClear()
  mockConfirmEqTenant.mockClear()
  mockConfirmThen.mockClear()
  mockSelect.mockClear()
  mockSelectEqId.mockClear()
  mockSelectEqTenant.mockClear()
  mockMaybeSingle.mockClear()
  mockMaybeSingle.mockResolvedValue({ data: null })
  mockRunChatStream.mockClear()
  mockGetMemberContext.mockClear()
  mockLogEvent.mockClear()
  resolveRunChatStream = null
  runChatStreamOnFinish = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('streamChat — server-side stop detection', () => {
  it('aborts and confirms when the poll finds stop_requested_at newer than turn start', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const responsePromise = streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
    })

    // Stop clicked 300ms into this turn.
    vi.setSystemTime(new Date('2026-01-01T00:00:00.300Z'))
    mockMaybeSingle.mockResolvedValue({ data: { stop_requested_at: '2026-01-01T00:00:00.300Z' } })

    await vi.advanceTimersByTimeAsync(500) // first poll tick
    const response = await responsePromise

    expect(response.status).toBe(499)
    expect(mockSelectEqId).toHaveBeenCalledWith('id', 'session-1')
    expect(mockSelectEqTenant).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ server_abort_confirmed_at: expect.any(String) }),
    )
    expect(mockConfirmEqId).toHaveBeenCalledWith('id', 'session-1')
    expect(mockConfirmEqTenant).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })

  it('does not abort on a stale stop_requested_at left over from an earlier, already-finished turn', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:10:00.000Z'))
    // This session was stopped once already, 10 minutes before this new turn began.
    mockMaybeSingle.mockResolvedValue({ data: { stop_requested_at: '2026-01-01T00:00:00.000Z' } })

    streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
    })

    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(500)

    expect(mockMaybeSingle).toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('stops polling once the stream finishes normally', async () => {
    const responsePromise = streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
    })
    await vi.advanceTimersByTimeAsync(0) // let streamChat reach runChatStream

    resolveRunChatStream?.(new Response('ok'))
    await responsePromise
    await runChatStreamOnFinish?.({ text: 'a complete reply', usage: null })

    const callsAtFinish = mockMaybeSingle.mock.calls.length
    await vi.advanceTimersByTimeAsync(2000) // several more poll intervals, if it were still running
    expect(mockMaybeSingle.mock.calls.length).toBe(callsAtFinish)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('does not poll when there is no session to attribute the stop to', async () => {
    const responsePromise = streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: null,
    })
    await vi.advanceTimersByTimeAsync(2000)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise

    expect(mockSelect).not.toHaveBeenCalled()
  })

  it('still confirms via req.signal as a bonus fast path, and stops the poll once it fires', async () => {
    const controller = new AbortController()
    const responsePromise = streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
      signal: controller.signal,
    })
    await vi.advanceTimersByTimeAsync(0)

    controller.abort()
    await Promise.resolve()
    await Promise.resolve()
    const response = await responsePromise

    expect(response.status).toBe(499)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ server_abort_confirmed_at: expect.any(String) }),
    )

    const pollCallsAtAbort = mockMaybeSingle.mock.calls.length
    await vi.advanceTimersByTimeAsync(2000)
    expect(mockMaybeSingle.mock.calls.length).toBe(pollCallsAtAbort)
  })
})

describe('streamChat — isFirstTurn computation for MEMBER CONTEXT', () => {
  it('passes isFirstTurn=true when req.messages has no prior assistant turn', async () => {
    const responsePromise = streamChat({
      messages: [{ role: 'user', content: 'Hi' }],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
      memberId: 'member-1',
    })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise

    expect(mockGetMemberContext).toHaveBeenCalledWith('session-1', 'tenant-1', 'member-1', true)
  })

  it('passes isFirstTurn=false when req.messages already has a non-empty assistant turn', async () => {
    const responsePromise = streamChat({
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello! How can I help?' },
        { role: 'user', content: 'Tell me more' },
      ],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
      memberId: 'member-1',
    })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise

    expect(mockGetMemberContext).toHaveBeenCalledWith('session-1', 'tenant-1', 'member-1', false)
  })

  it('still passes isFirstTurn=true when the only prior assistant turn is an empty failed-attempt placeholder', async () => {
    const responsePromise = streamChat({
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: '' },
        { role: 'user', content: 'Hi' },
      ],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
      memberId: 'member-1',
    })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise

    expect(mockGetMemberContext).toHaveBeenCalledWith('session-1', 'tenant-1', 'member-1', true)
  })
})

// Verifies streamChat splits the system prompt into a tenant-static,
// cacheable prefix (basePrompt + bookingSection) and per-turn content that
// must not be cached (memberContext/mediaContext/questionMode) — the
// restructure prompt caching depends on. A regression here (e.g. folding
// dynamic content back into cachedSystem) would silently defeat caching for
// every visitor with member context or attached media, with no error.
describe('streamChat — cachedSystem / system split for prompt caching', () => {
  it('sends only the base prompt as cachedSystem, and an empty system, when there is no booking/member/media content', async () => {
    const responsePromise = streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
    })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise

    expect(mockRunChatStream).toHaveBeenCalledWith(
      expect.objectContaining({ cachedSystem: 'system prompt', system: '' }),
    )
  })

  it('keeps memberContext out of cachedSystem, in system instead', async () => {
    mockGetMemberContext.mockResolvedValueOnce('visitor has booked before')
    const responsePromise = streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
      memberId: 'member-1',
    })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise

    expect(mockRunChatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        cachedSystem: 'system prompt',
        system: 'MEMBER CONTEXT:\nvisitor has booked before',
      }),
    )
  })

  it('keeps question-mode context out of cachedSystem, in system instead', async () => {
    const responsePromise = streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
      mode: 'question',
    })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise

    expect(mockRunChatStream).toHaveBeenCalledWith(
      expect.objectContaining({ cachedSystem: 'system prompt', system: 'question mode context' }),
    )
  })
})

describe('streamChat — cache-usage audit logging', () => {
  it('logs CHAT_PROMPT_CACHE_USAGE with the reported token counts when cacheUsage is present', async () => {
    const responsePromise = streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
    })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise
    await runChatStreamOnFinish?.({
      text: 'a complete reply',
      usage: null,
      cacheUsage: { cacheCreationInputTokens: 8000, cacheReadInputTokens: 0 },
    })

    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'chat.prompt_cache_usage',
        tenant_id: 'tenant-1',
        target_id: 'session-1',
        metadata: expect.objectContaining({
          cacheCreationInputTokens: 8000,
          cacheReadInputTokens: 0,
        }),
      }),
    )
  })

  it('does not log CHAT_PROMPT_CACHE_USAGE when cacheUsage is null (e.g. mocked/no provider metadata)', async () => {
    const responsePromise = streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
    })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise
    await runChatStreamOnFinish?.({ text: 'a complete reply', usage: null, cacheUsage: null })

    expect(mockLogEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'chat.prompt_cache_usage' }),
    )
  })

  it('does not log CHAT_PROMPT_CACHE_USAGE when there is no session to attribute it to', async () => {
    const responsePromise = streamChat({
      messages: [],
      tenant: { tenantId: 'tenant-1' },
      sessionId: null,
    })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise
    await runChatStreamOnFinish?.({
      text: 'a complete reply',
      usage: null,
      cacheUsage: { cacheCreationInputTokens: 8000, cacheReadInputTokens: 0 },
    })

    expect(mockLogEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'chat.prompt_cache_usage' }),
    )
  })
})
