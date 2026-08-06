// Covers POST /api/sessions' media chat_id backfill: an attachment uploaded
// before this session existed (the first message of a brand-new
// conversation always uploads before this route runs — see
// services/chat/ui/v1/useChatTurn.ts's send()) has a media_items row with
// chat_id: null. When the client includes those ids as `mediaItemIds` in the
// POST body, this route backfills chat_id in the same request that creates
// the session — closing the gap where such an item could never be found by
// any of the chat_id-filtered client mechanisms (Realtime, catch-up, poll)
// and stayed stuck "processing" forever. Existing callers that never send a
// body (jefflougheed, and every Heirloom turn without pending attachments)
// must be completely unaffected — that's the first describe block below.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetTenantFromRequest = vi.fn()
const mockGetCurrentUserId = vi.fn()
const mockSyncUser = vi.fn()
const mockCreateSession = vi.fn()
const mockResolveMemberId = vi.fn()
const mockBackfillMediaChatId = vi.fn()
const mockLogMediaEvent = vi.fn()
const mockIsMediaAuditEnabled = vi.fn()
const mockLogEvent = vi.fn()

vi.mock('@/services/auth', () => ({
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
  syncUser: (...args: unknown[]) => mockSyncUser(...args),
}))

vi.mock('@/services/crm/sessions', () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  listSessions: vi.fn(),
}))

vi.mock('@/services/crm', () => ({
  resolveMemberId: (...args: unknown[]) => mockResolveMemberId(...args),
}))

vi.mock('@/services/media', () => ({
  backfillMediaChatId: (...args: unknown[]) => mockBackfillMediaChatId(...args),
  logMediaEvent: (...args: unknown[]) => mockLogMediaEvent(...args),
  isMediaAuditEnabled: (...args: unknown[]) => mockIsMediaAuditEnabled(...args),
}))

vi.mock('@/services/audit', () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  AuditAction: {
    SESSION_CREATE: 'session.create',
    MEDIA_CHAT_ID_BACKFILLED: 'media.chat_id_backfilled',
    MEDIA_CHAT_ID_BACKFILL_FAILED: 'media.chat_id_backfill_failed',
  },
}))

import { POST } from './route'

function makeRequest(body?: unknown, headers: Record<string, string> = {}): Request {
  return {
    headers: { get: (key: string) => headers[key] ?? null },
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input')
      return body
    },
  } as unknown as Request
}

beforeEach(() => {
  mockGetTenantFromRequest.mockReset().mockResolvedValue('tenant-1')
  mockGetCurrentUserId.mockReset().mockResolvedValue('user-1')
  mockSyncUser.mockReset().mockResolvedValue('user-1')
  mockCreateSession.mockReset().mockResolvedValue({ ok: true, data: { id: 'sess-new' } })
  mockResolveMemberId.mockReset().mockResolvedValue('member-1')
  mockBackfillMediaChatId.mockReset().mockResolvedValue({ updatedIds: [] })
  mockLogMediaEvent.mockReset().mockResolvedValue(undefined)
  mockIsMediaAuditEnabled.mockReset().mockReturnValue(true)
  mockLogEvent.mockReset().mockResolvedValue(undefined)
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    '11111111-1111-4111-8111-111111111111' as `${string}-${string}-${string}-${string}-${string}`,
  )
})

describe('POST /api/sessions — existing behavior, unaffected by the backfill addition', () => {
  it('creates a session and returns its id when no body is sent at all (jefflougheed, and every pre-existing Heirloom caller)', async () => {
    const res = await POST(makeRequest(undefined))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: 'sess-new' })
    expect(mockBackfillMediaChatId).not.toHaveBeenCalled()
    expect(mockResolveMemberId).not.toHaveBeenCalled()
  })

  it('creates a session and skips the backfill when the body has no mediaItemIds', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(200)
    expect(mockBackfillMediaChatId).not.toHaveBeenCalled()
  })

  it('still returns 400 when no tenant resolves', async () => {
    mockGetTenantFromRequest.mockResolvedValue(null)
    const res = await POST(makeRequest(undefined))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/sessions — media chat_id backfill', () => {
  it('backfills every id and logs one MEDIA_CHAT_ID_BACKFILLED event per id on a full match', async () => {
    mockBackfillMediaChatId.mockResolvedValue({ updatedIds: ['media-a', 'media-b'] })

    const res = await POST(makeRequest({ mediaItemIds: ['media-a', 'media-b'] }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: 'sess-new' })
    expect(mockResolveMemberId).toHaveBeenCalledWith('tenant-1', null)
    expect(mockBackfillMediaChatId).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      memberId: 'member-1',
      chatId: 'sess-new',
      mediaItemIds: ['media-a', 'media-b'],
    })
    const backfilledCalls = mockLogMediaEvent.mock.calls.filter(
      ([arg]) => arg.action === 'media.chat_id_backfilled',
    )
    expect(backfilledCalls).toHaveLength(2)
    expect(backfilledCalls.map(([arg]) => arg.media_item_id).sort()).toEqual(['media-a', 'media-b'])
    expect(mockLogMediaEvent.mock.calls.some(([arg]) => arg.action === 'media.chat_id_backfill_failed')).toBe(
      false,
    )
  })

  it('logs MEDIA_CHAT_ID_BACKFILL_FAILED for ids that did not match (already set, wrong owner, or not found) without failing the request', async () => {
    mockBackfillMediaChatId.mockResolvedValue({ updatedIds: ['media-a'] })

    const res = await POST(makeRequest({ mediaItemIds: ['media-a', 'media-b'] }))

    expect(res.status).toBe(200)
    const failedCalls = mockLogMediaEvent.mock.calls.filter(
      ([arg]) => arg.action === 'media.chat_id_backfill_failed',
    )
    expect(failedCalls).toHaveLength(1)
    expect(failedCalls[0][0].media_item_id).toBe('media-b')
  })

  it('still returns the created session id, and logs a failure event per requested id, when backfillMediaChatId throws', async () => {
    mockBackfillMediaChatId.mockRejectedValue(new Error('db unavailable'))

    const res = await POST(makeRequest({ mediaItemIds: ['media-a', 'media-b'] }))

    // The whole point: a backfill failure must never take down session
    // creation — the conversation still needs to start.
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: 'sess-new' })

    const failedCalls = mockLogMediaEvent.mock.calls.filter(
      ([arg]) => arg.action === 'media.chat_id_backfill_failed',
    )
    expect(failedCalls).toHaveLength(2)
    expect(failedCalls.map(([arg]) => arg.media_item_id).sort()).toEqual(['media-a', 'media-b'])
    expect(failedCalls.every(([arg]) => arg.metadata.error === 'db unavailable')).toBe(true)
  })

  it('skips the backfill without throwing when no member can be resolved server-side', async () => {
    mockResolveMemberId.mockResolvedValue(null)

    const res = await POST(makeRequest({ mediaItemIds: ['media-a'] }))

    expect(res.status).toBe(200)
    expect(mockBackfillMediaChatId).not.toHaveBeenCalled()
    expect(mockLogMediaEvent).not.toHaveBeenCalled()
  })

  it('ignores non-string entries in mediaItemIds rather than passing them through', async () => {
    mockBackfillMediaChatId.mockResolvedValue({ updatedIds: ['media-a'] })

    await POST(makeRequest({ mediaItemIds: ['media-a', 42, null, { id: 'media-b' }] }))

    expect(mockBackfillMediaChatId).toHaveBeenCalledWith(
      expect.objectContaining({ mediaItemIds: ['media-a'] }),
    )
  })

  it('never lets a backfill audit-logging failure affect the response', async () => {
    mockBackfillMediaChatId.mockResolvedValue({ updatedIds: ['media-a'] })
    mockLogMediaEvent.mockRejectedValue(new Error('audit db down'))

    const res = await POST(makeRequest({ mediaItemIds: ['media-a'] }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: 'sess-new' })
  })

  it('never lets resolveMemberId throwing (contrary to its own doc contract) affect the response', async () => {
    mockResolveMemberId.mockRejectedValue(new Error('unexpected auth failure'))

    const res = await POST(makeRequest({ mediaItemIds: ['media-a'] }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: 'sess-new' })
    expect(mockBackfillMediaChatId).not.toHaveBeenCalled()
  })
})
