// app/api/sessions/[id]/route.piiLogging.test.ts
//
// First test coverage for this route. D9 fix: PATCH's request-summary log
// line used to log the raw visitorName value alongside has_phone/has_email
// booleans for the sibling fields — inconsistent with itself. Covers only
// that log line; the route's write behavior is exercised via
// services/crm/sessions.test.ts, not duplicated here.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetTenantFromRequest = vi.fn()
vi.mock('@/services/auth', () => ({
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
}))

const mockUpdateSession = vi.fn()
vi.mock('@/services/crm/sessions', () => ({
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
  softDeleteSession: vi.fn(),
}))

import { PATCH } from './route'

const RAW_NAME = 'Priyasomethingdistinct'

function makeRequest(body: Record<string, unknown>): Request {
  return {
    json: async () => body,
    headers: { get: () => 'heirloom.example.com' },
  } as unknown as Request
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetTenantFromRequest.mockResolvedValue('tenant-1')
  mockUpdateSession.mockResolvedValue({ ok: true })
})

describe('PATCH /api/sessions/[id] — D9, no raw visitorName in console output', () => {
  it('never logs the raw visitorName, logging only has_visitor_name', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await PATCH(
      makeRequest({ messages: [], visitorName: RAW_NAME, phone: null, email: null }),
      { params: Promise.resolve({ id: 'session-1' }) },
    )

    const output = logSpy.mock.calls.map((args) => JSON.stringify(args)).join('\n')
    logSpy.mockRestore()

    expect(res.status).toBe(200)
    expect(output).not.toContain(RAW_NAME)
    expect(output).toContain('has_visitor_name')
    expect(output).toContain('true')
  })
})
