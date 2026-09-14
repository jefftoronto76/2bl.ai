// Covers the VALID_STATUSES/PROTECTED_STATUSES widening for 'pending' —
// see services/auth/claim-membership.ts (the GateView self-service path),
// which writes members.status = 'pending' via a route this file otherwise
// never touched. No prior test file existed for this route; this one is
// scoped to the status-set change, not a full route audit.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuditAction } from '@/services/audit/types'

const mockGetCurrentUser = vi.fn()
const mockGetTenantFromRequest = vi.fn()
const mockLogEvent = vi.fn()

vi.mock('@/services/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
}))

vi.mock('@/services/audit', () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  AuditAction,
}))

const mockFetchMemberships = vi.fn()
const mockActorLookup = vi.fn()
const mockBulkUpdate = vi.fn()

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({
    from(table: string) {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: (...args: unknown[]) => mockActorLookup(...args),
            }),
          }),
        }
      }
      // members
      return {
        select: () => ({
          in: (...args: unknown[]) => mockFetchMemberships(...args),
        }),
        update(payload: unknown) {
          return {
            in: (...args: unknown[]) => mockBulkUpdate(payload, ...args),
          }
        },
      }
    },
  }),
}))

import { PATCH } from './route'

function patchRequest(body: unknown) {
  return new Request('https://example.com/api/platform/members/status', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mockGetCurrentUser.mockReset()
  mockGetTenantFromRequest.mockReset()
  mockLogEvent.mockReset()
  mockFetchMemberships.mockReset()
  mockActorLookup.mockReset()
  mockBulkUpdate.mockReset()

  mockGetCurrentUser.mockResolvedValue({ providerUserId: 'clerk-admin', isPlatformAdmin: true })
  mockGetTenantFromRequest.mockResolvedValue('platform-tenant-1')
  mockActorLookup.mockResolvedValue({ data: { id: 'actor-uuid-1' }, error: null })
})

describe('PATCH /api/platform/members/status — pending', () => {
  it('accepts "pending" as a valid target status instead of rejecting it as invalid', async () => {
    mockFetchMemberships.mockResolvedValue({
      data: [{ id: 'member-1', user_id: 'user-1', tenant_id: 'tenant-1', status: 'active' }],
      error: null,
    })
    mockBulkUpdate.mockResolvedValue({ error: null })

    const res = await PATCH(patchRequest({ user_ids: ['user-1'], status: 'pending' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.updated).toBe(1)

    const [payload] = mockBulkUpdate.mock.calls[0] as [Record<string, unknown>]
    expect(payload.status).toBe('pending')
  })

  it('accepts a membership whose current status is "pending" as an eligible source row', async () => {
    mockFetchMemberships.mockResolvedValue({
      data: [{ id: 'member-2', user_id: 'user-2', tenant_id: 'tenant-1', status: 'pending' }],
      error: null,
    })
    mockBulkUpdate.mockResolvedValue({ error: null })

    const res = await PATCH(patchRequest({ user_ids: ['user-2'], status: 'active' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.updated).toBe(1)
  })

  it('still rejects a genuinely invalid status, unaffected by the widened set', async () => {
    const res = await PATCH(patchRequest({ user_ids: ['user-1'], status: 'not_a_real_status' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('not_a_real_status')
    expect(mockFetchMemberships).not.toHaveBeenCalled()
  })

  it('does not protect "pending" the way "deleted" is protected — a pending row moving to "deleted" is eligible', async () => {
    mockFetchMemberships.mockResolvedValue({
      data: [{ id: 'member-3', user_id: 'user-3', tenant_id: 'tenant-1', status: 'pending' }],
      error: null,
    })
    mockBulkUpdate.mockResolvedValue({ error: null })

    const res = await PATCH(patchRequest({ user_ids: ['user-3'], status: 'deleted' }))
    const body = await res.json()

    expect(body.updated).toBe(1)
  })

  it('logs MEMBER_STATUS_UPDATED with the correct before/after when moving into "pending"', async () => {
    mockFetchMemberships.mockResolvedValue({
      data: [{ id: 'member-4', user_id: 'user-4', tenant_id: 'tenant-1', status: 'invited' }],
      error: null,
    })
    mockBulkUpdate.mockResolvedValue({ error: null })

    await PATCH(patchRequest({ user_ids: ['user-4'], status: 'pending' }))

    expect(mockLogEvent).toHaveBeenCalledOnce()
    const [arg] = mockLogEvent.mock.calls[0] as [Record<string, unknown>]
    expect(arg.action).toBe(AuditAction.MEMBER_STATUS_UPDATED)
    expect(arg.changes).toEqual({ before: { status: 'invited' }, after: { status: 'pending' } })
  })
})
