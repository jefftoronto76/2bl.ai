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
const mockHandleSessionFinish = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined)
vi.mock('@/services/crm/session', () => ({
  handleSessionFinish: (...args: unknown[]) => mockHandleSessionFinish(...args),
}))

// Traffic Cop Phase 2 shadow. Default: resolves immediately. Individual
// tests swap in a never-settling or rejecting promise.
type ShadowParams = import('./turn-context/shadow').ShadowTurnParams
const mockRunShadowTurn = vi.fn<(p: ShadowParams) => Promise<unknown>>(async () => ({ ok: true }))
vi.mock('./turn-context/shadow', () => ({
  runShadowTurn: (p: ShadowParams) => mockRunShadowTurn(p),
}))

// A stand-in for streamText/runChatStream that behaves like the real thing
// with respect to abortSignal: rejects with an AbortError the instant the
// signal fires, and otherwise stays pending until the test resolves it via
// resolveRunChatStream (simulating an in-progress generation) or never
// resolves at all for tests that only care about the abort path.
let resolveRunChatStream: ((value: Response) => void) | null = null
let runChatStreamOnFinish: ((args: { text: string; usage: null }) => Promise<void>) | null = null
const mockRunChatStream = vi.fn((opts: { abortSignal?: AbortSignal; onFinish?: typeof runChatStreamOnFinish }) => {
  runChatStreamOnFinish = opts.onFinish ?? null
  return new Promise<Response>((resolve, reject) => {
    resolveRunChatStream = resolve
    opts.abortSignal?.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    })
  })
})
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
  mockHandleSessionFinish.mockClear()
  mockRunShadowTurn.mockReset().mockResolvedValue({ ok: true })
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

describe('streamChat — Traffic Cop Phase 2 shadow run', () => {
  const mockRunChatStreamSystem = () =>
    (mockRunChatStream.mock.calls[0][0] as unknown as { system: string }).system

  it('the model still receives the legacy assembly, and the shadow receives that exact string plus the raw segment inputs', async () => {
    mockGetMemberContext.mockResolvedValue("Member's name is Sarah.")
    const responsePromise = streamChat({
      messages: [{ role: 'user', content: 'Hi' }],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
      memberId: 'member-1',
      memberStatus: 'active',
      mode: 'question',
    })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise

    const legacy = "system prompt\n\nMEMBER CONTEXT:\nMember's name is Sarah.\n\nquestion mode context"
    expect(mockRunChatStreamSystem()).toBe(legacy)

    expect(mockRunShadowTurn).toHaveBeenCalledTimes(1)
    const params = mockRunShadowTurn.mock.calls[0][0]
    expect(params.legacySystem).toBe(legacy)
    expect(params.legacyInputs).toEqual({
      basePrompt: 'system prompt',
      bookingSection: '',
      memberContext: "Member's name is Sarah.",
      sessionContext: null,
      mediaContext: '',
      questionMode: true,
    })
    expect(params.request).toEqual({
      tenantId: 'tenant-1',
      sessionId: 'session-1',
      memberId: 'member-1',
      memberStatus: 'active',
      messages: [{ role: 'user', content: 'Hi' }],
      mode: 'question',
      mediaItems: null,
      correlationId: null,
    })
    expect(params.ctx).toEqual({ tenantId: 'tenant-1', sessionId: 'session-1', memberId: 'member-1', correlationId: null })
  })

  it('a shadow that never settles does not delay the Response', async () => {
    mockRunShadowTurn.mockImplementation(() => new Promise(() => {}))
    const responsePromise = streamChat({
      messages: [{ role: 'user', content: 'Hi' }],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(mockRunShadowTurn).toHaveBeenCalledTimes(1)
    resolveRunChatStream?.(new Response('ok'))

    const response = await responsePromise
    expect(response.status).toBe(200)
  })

  it('a shadow that rejects (contract violation) affects neither the Response nor onFinish', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRunShadowTurn.mockRejectedValue(new Error('shadow bug'))
    const responsePromise = streamChat({
      messages: [{ role: 'user', content: 'Hi' }],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
    })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    const response = await responsePromise
    expect(response.status).toBe(200)

    await expect(runChatStreamOnFinish?.({ text: 'reply', usage: null })).resolves.toBeUndefined()
    expect(mockHandleSessionFinish).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('onFinish persists the session first, then settles the shadow', async () => {
    let releaseShadow: (v: unknown) => void = () => {}
    mockRunShadowTurn.mockImplementation(() => new Promise(r => { releaseShadow = r }))
    const responsePromise = streamChat({
      messages: [{ role: 'user', content: 'Hi' }],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
    })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise

    let finished = false
    const onFinishPromise = runChatStreamOnFinish?.({ text: 'reply', usage: null })?.then(() => { finished = true })
    await Promise.resolve(); await Promise.resolve()
    expect(mockHandleSessionFinish).toHaveBeenCalledTimes(1)
    expect(finished).toBe(false) // still waiting on the shadow — after persistence, not before

    releaseShadow({ ok: true })
    await onFinishPromise
    expect(finished).toBe(true)
  })

  it('still settles the shadow in onFinish when there is no tenant (no session persistence)', async () => {
    let releaseShadow: (v: unknown) => void = () => {}
    mockRunShadowTurn.mockImplementation(() => new Promise(r => { releaseShadow = r }))
    const responsePromise = streamChat({ messages: [], tenant: { tenantId: null }, sessionId: null })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise

    let finished = false
    const onFinishPromise = runChatStreamOnFinish?.({ text: 'reply', usage: null })?.then(() => { finished = true })
    await Promise.resolve(); await Promise.resolve()
    expect(mockHandleSessionFinish).not.toHaveBeenCalled()
    expect(finished).toBe(false)
    releaseShadow({ ok: true })
    await onFinishPromise
    expect(finished).toBe(true)
  })

  it('is invoked exactly once per turn, after the real assembly, with the same isFirstTurn-relevant messages', async () => {
    const responsePromise = streamChat({
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'More' },
      ],
      tenant: { tenantId: 'tenant-1' },
      sessionId: 'session-1',
      memberId: 'member-1',
    })
    await vi.advanceTimersByTimeAsync(0)
    resolveRunChatStream?.(new Response('ok'))
    await responsePromise
    expect(mockRunShadowTurn).toHaveBeenCalledTimes(1)
    expect(mockRunShadowTurn.mock.calls[0][0].request.messages).toHaveLength(3)
    // The shadow call is made with the assembled string in hand — i.e. after the legacy assembly.
    expect(mockRunShadowTurn.mock.calls[0][0].legacySystem).toBe(mockRunChatStreamSystem())
  })
})
