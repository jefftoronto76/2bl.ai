// Verifies updateSession's stop_requested_at write — the reliable,
// explicit-signal half of the server-side Stop fix (see CLAUDE.md's
// "Stop / interrupted-turn protocol"). No prior test coverage existed for
// this file; scoped to the new field plus enough of the existing "only
// write when supplied" behavior to guard against a regression there.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSelect = vi.fn()
const mockEqTenant = vi.fn((_col: string, _val: string) => ({ select: mockSelect }))
const mockEqId = vi.fn((_col: string, _val: string) => ({ eq: mockEqTenant }))
const mockUpdate = vi.fn((_update: Record<string, unknown>) => ({ eq: mockEqId }))
const mockFrom = vi.fn((_table: string) => ({ update: mockUpdate }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

import { updateSession } from './sessions'

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  mockFrom.mockClear()
  mockUpdate.mockClear()
  mockEqId.mockClear()
  mockEqTenant.mockClear()
  mockSelect.mockClear()
  mockSelect.mockResolvedValue({ data: [{ id: 'session-1' }], error: null })
})

describe('updateSession — stop_requested_at', () => {
  it('writes stop_requested_at (server clock) when stopRequested is true', async () => {
    const before = Date.now()
    await updateSession('tenant-1', 'session-1', { messages: undefined, visitorName: undefined, stopRequested: true })
    const after = Date.now()

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const written = mockUpdate.mock.calls[0][0] as { stop_requested_at?: string }
    expect(written.stop_requested_at).toBeDefined()
    const writtenMs = new Date(written.stop_requested_at as string).getTime()
    expect(writtenMs).toBeGreaterThanOrEqual(before)
    expect(writtenMs).toBeLessThanOrEqual(after)
  })

  it('omits stop_requested_at when stopRequested is absent or falsy', async () => {
    await updateSession('tenant-1', 'session-1', { messages: undefined, visitorName: undefined })
    expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('stop_requested_at')

    mockUpdate.mockClear()
    await updateSession('tenant-1', 'session-1', {
      messages: undefined,
      visitorName: undefined,
      stopRequested: false,
    })
    expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('stop_requested_at')
  })

  it('ignores a non-boolean stopRequested value rather than writing it verbatim', async () => {
    await updateSession('tenant-1', 'session-1', {
      messages: undefined,
      visitorName: undefined,
      stopRequested: 'yes',
    })
    expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('stop_requested_at')
  })

  it('scopes the update by both id and tenant_id', async () => {
    await updateSession('tenant-1', 'session-1', { messages: undefined, visitorName: undefined, stopRequested: true })
    expect(mockEqId).toHaveBeenCalledWith('id', 'session-1')
    expect(mockEqTenant).toHaveBeenCalledWith('tenant_id', 'tenant-1')
  })
})
