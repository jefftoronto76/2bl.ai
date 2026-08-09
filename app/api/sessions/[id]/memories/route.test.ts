// Covers the audit-logging pass (Task 4): every previously-silent POST
// validation failure — tenant resolution, malformed body, missing
// anchor_message_id, invalid source_kind — now logs AuditAction.MEMORY_CREATED
// with outcome: 'failure' and a distinct metadata.error_detail, mirroring the
// media route tests' mocking pattern (app/api/media/upload-url/route.test.ts).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuditAction } from '@/services/audit/types'

const mockGetTenantFromRequest = vi.fn()
const mockListMemories = vi.fn()
const mockDeleteMemoriesForAnchors = vi.fn()
const mockCreateMemoryFromAnchor = vi.fn()
const mockCreatePhotoMemoryFromMedia = vi.fn()
const mockResolveMemberId = vi.fn()
const mockLogEvent = vi.fn()

vi.mock('@/services/auth', () => ({
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
}))

vi.mock('@/services/crm/memories', () => ({
  listMemories: (...args: unknown[]) => mockListMemories(...args),
  deleteMemoriesForAnchors: (...args: unknown[]) => mockDeleteMemoriesForAnchors(...args),
  createMemoryFromAnchor: (...args: unknown[]) => mockCreateMemoryFromAnchor(...args),
  createPhotoMemoryFromMedia: (...args: unknown[]) => mockCreatePhotoMemoryFromMedia(...args),
}))

vi.mock('@/services/crm/feedback', () => ({
  resolveMemberId: (...args: unknown[]) => mockResolveMemberId(...args),
}))

vi.mock('@/services/audit', () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
}))

import { POST } from './route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(body: unknown): Request {
  return {
    headers: { get: () => 'example.heirloom.app' },
    json: async () => {
      if (body === '__throw__') throw new Error('invalid json')
      return body
    },
  } as unknown as Request
}

beforeEach(() => {
  mockGetTenantFromRequest.mockReset().mockResolvedValue('tenant-1')
  mockListMemories.mockReset()
  mockDeleteMemoriesForAnchors.mockReset()
  mockCreateMemoryFromAnchor.mockReset().mockResolvedValue({
    ok: true,
    data: { id: 'mem-1', session_id: 's1', anchor_message_id: 'm1', source_kind: 'conversation', title: 't', body: 'b', status: 'draft', created_at: 'now', updated_at: 'now' },
  })
  mockCreatePhotoMemoryFromMedia.mockReset().mockResolvedValue({
    ok: true,
    data: { id: 'mem-2', session_id: 's1', anchor_message_id: 'm1', media_item_id: 'media-1', source_kind: 'photo', title: 't', body: 'b', status: 'draft', created_at: 'now', updated_at: 'now' },
  })
  mockResolveMemberId.mockReset().mockResolvedValue('member-1')
  mockLogEvent.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/sessions/[id]/memories — validation failures log MEMORY_CREATED', () => {
  it('logs tenant_resolution_failed and returns 400 when no tenant resolves', async () => {
    mockGetTenantFromRequest.mockResolvedValue(null)

    const res = await POST(makeRequest({ anchor_message_id: 'm1', source_kind: 'conversation' }), makeParams('s1'))

    expect(res.status).toBe(400)
    expect(mockCreateMemoryFromAnchor).not.toHaveBeenCalled()
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_CREATED,
        outcome: 'failure',
        metadata: expect.objectContaining({ error_detail: 'tenant_resolution_failed' }),
      }),
    )
  })

  it('logs invalid_request_body and returns 400 when the body is not valid JSON', async () => {
    const res = await POST(makeRequest('__throw__'), makeParams('s1'))

    expect(res.status).toBe(400)
    expect(mockCreateMemoryFromAnchor).not.toHaveBeenCalled()
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_CREATED,
        tenant_id: 'tenant-1',
        outcome: 'failure',
        metadata: expect.objectContaining({ error_detail: 'invalid_request_body' }),
      }),
    )
  })

  it('logs missing_anchor_message_id and returns 400 when anchor_message_id is absent', async () => {
    const res = await POST(makeRequest({ source_kind: 'conversation' }), makeParams('s1'))

    expect(res.status).toBe(400)
    expect(mockCreateMemoryFromAnchor).not.toHaveBeenCalled()
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_CREATED,
        tenant_id: 'tenant-1',
        outcome: 'failure',
        metadata: expect.objectContaining({ error_detail: 'missing_anchor_message_id' }),
      }),
    )
  })

  it('logs invalid_source_kind and returns 400 when source_kind is not one of the valid kinds', async () => {
    const res = await POST(makeRequest({ anchor_message_id: 'm1', source_kind: 'bogus' }), makeParams('s1'))

    expect(res.status).toBe(400)
    expect(mockCreateMemoryFromAnchor).not.toHaveBeenCalled()
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_CREATED,
        tenant_id: 'tenant-1',
        outcome: 'failure',
        metadata: expect.objectContaining({ error_detail: 'invalid_source_kind' }),
      }),
    )
  })

  it('does not log any failure on the success path', async () => {
    const res = await POST(makeRequest({ anchor_message_id: 'm1', source_kind: 'conversation' }), makeParams('s1'))

    expect(res.status).toBe(200)
    expect(mockCreateMemoryFromAnchor).toHaveBeenCalledWith('tenant-1', {
      sessionId: 's1',
      anchorMessageId: 'm1',
      memberId: 'member-1',
      sourceKind: 'conversation',
    })
    expect(mockLogEvent).not.toHaveBeenCalled()
  })

  it('propagates the 401 account-required rejection from createMemoryFromAnchor unchanged', async () => {
    mockCreateMemoryFromAnchor.mockResolvedValue({ ok: false, status: 401, error: 'An account is required to save memories.' })

    const res = await POST(makeRequest({ anchor_message_id: 'm1', source_kind: 'conversation' }), makeParams('s1'))

    expect(res.status).toBe(401)
    const bodyJson = await res.json()
    expect(bodyJson.error).toBe('An account is required to save memories.')
  })
})

// Regression coverage for the photo-bookmark extension (2026-08-08): an
// optional media_item_id in the body routes to createPhotoMemoryFromMedia
// instead of createMemoryFromAnchor. The pre-existing "does not log any
// failure on the success path" test above (no media_item_id in its body) is
// itself the byte-for-byte-unchanged regression proof for the existing
// behavior — every assertion in it (200 status, exact createMemoryFromAnchor
// call args, no log call) still passes unmodified now that media_item_id
// support has been added, since createPhotoMemoryFromMedia is never reached
// when the field is absent.
describe('POST /api/sessions/[id]/memories — media_item_id routes to createPhotoMemoryFromMedia', () => {
  it('routes to createPhotoMemoryFromMedia (not createMemoryFromAnchor) when media_item_id is present', async () => {
    const res = await POST(
      makeRequest({ anchor_message_id: 'm1', source_kind: 'photo', media_item_id: 'media-1' }),
      makeParams('s1'),
    )

    expect(res.status).toBe(200)
    expect(mockCreatePhotoMemoryFromMedia).toHaveBeenCalledWith('tenant-1', {
      sessionId: 's1',
      anchorMessageId: 'm1',
      mediaItemId: 'media-1',
      memberId: 'member-1',
    })
    expect(mockCreateMemoryFromAnchor).not.toHaveBeenCalled()
    const bodyJson = await res.json()
    expect(bodyJson.memory.id).toBe('mem-2')
  })

  it('does NOT call createPhotoMemoryFromMedia when media_item_id is absent — existing behavior unchanged', async () => {
    const res = await POST(makeRequest({ anchor_message_id: 'm1', source_kind: 'conversation' }), makeParams('s1'))

    expect(res.status).toBe(200)
    expect(mockCreatePhotoMemoryFromMedia).not.toHaveBeenCalled()
    expect(mockCreateMemoryFromAnchor).toHaveBeenCalledWith('tenant-1', {
      sessionId: 's1',
      anchorMessageId: 'm1',
      memberId: 'member-1',
      sourceKind: 'conversation',
    })
  })

  it('rejects a non-string, non-empty media_item_id with 400 and logs invalid_media_item_id, without calling either creation path', async () => {
    const res = await POST(
      makeRequest({ anchor_message_id: 'm1', source_kind: 'photo', media_item_id: '' }),
      makeParams('s1'),
    )

    expect(res.status).toBe(400)
    expect(mockCreatePhotoMemoryFromMedia).not.toHaveBeenCalled()
    expect(mockCreateMemoryFromAnchor).not.toHaveBeenCalled()
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEMORY_CREATED,
        outcome: 'failure',
        metadata: expect.objectContaining({ error_detail: 'invalid_media_item_id' }),
      }),
    )
  })

  it('propagates the 409 "still processing" rejection from createPhotoMemoryFromMedia unchanged', async () => {
    mockCreatePhotoMemoryFromMedia.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'This photo is still being processed — try again in a moment.',
    })

    const res = await POST(
      makeRequest({ anchor_message_id: 'm1', source_kind: 'photo', media_item_id: 'media-1' }),
      makeParams('s1'),
    )

    expect(res.status).toBe(409)
    const bodyJson = await res.json()
    expect(bodyJson.error).toBe('This photo is still being processed — try again in a moment.')
  })
})
