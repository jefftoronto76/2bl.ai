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
const mockResolveMemberId = vi.fn()
const mockLogEvent = vi.fn()

vi.mock('@/services/auth', () => ({
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
}))

vi.mock('@/services/crm/memories', () => ({
  listMemories: (...args: unknown[]) => mockListMemories(...args),
  deleteMemoriesForAnchors: (...args: unknown[]) => mockDeleteMemoriesForAnchors(...args),
  createMemoryFromAnchor: (...args: unknown[]) => mockCreateMemoryFromAnchor(...args),
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
