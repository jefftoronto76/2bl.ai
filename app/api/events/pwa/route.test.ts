import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { AuditAction } from '@/services/audit/types'

// Hoist mocks so factories can reference them
const { logEventMock, getSessionMock, getTenantFromRequestMock } = vi.hoisted(() => ({
  logEventMock: vi.fn(),
  getSessionMock: vi.fn(),
  getTenantFromRequestMock: vi.fn(),
}))

vi.mock('@/services/audit/audit', () => ({ logEvent: logEventMock }))
vi.mock('@/services/auth', () => ({
  getSession: getSessionMock,
  getTenantFromRequest: getTenantFromRequestMock,
}))

import { POST } from './route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/events/pwa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  logEventMock.mockReset()
  getSessionMock.mockResolvedValue(null)            // anonymous by default
  getTenantFromRequestMock.mockResolvedValue(null)  // no tenant by default
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/events/pwa', () => {
  describe('validation', () => {
    it('missing action → 400', async () => {
      const res = await POST(makeReq({}))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json).toMatchObject({ error: 'valid action required' })
    })

    it('unknown action → 400', async () => {
      const res = await POST(makeReq({ action: 'pwa.made_up' }))
      expect(res.status).toBe(400)
    })

    it('empty action string → 400', async () => {
      const res = await POST(makeReq({ action: '' }))
      expect(res.status).toBe(400)
    })
  })

  describe('valid actions', () => {
    const VALID_ACTIONS = [
      AuditAction.PWA_SW_REGISTERED,
      AuditAction.PWA_INSTALL_PROMPTED,
      AuditAction.PWA_INSTALLED,
      AuditAction.PWA_PUSH_PROMPTED,
      AuditAction.PWA_PUSH_GRANTED,
      AuditAction.PWA_PUSH_DENIED,
      AuditAction.PWA_SUBSCRIPTION_CREATED,
    ]

    it.each(VALID_ACTIONS)('%s → 200 { ok: true }', async (action) => {
      const res = await POST(makeReq({ action }))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toMatchObject({ ok: true })
    })

    it('valid action → logEvent called once', async () => {
      await POST(makeReq({ action: AuditAction.PWA_INSTALL_PROMPTED }))
      // logEvent is fire-and-forget (void); it's still called synchronously
      expect(logEventMock).toHaveBeenCalledOnce()
    })

    it('metadata forwarded to logEvent', async () => {
      await POST(makeReq({
        action: AuditAction.PWA_INSTALL_PROMPTED,
        metadata: { platform: 'android' },
      }))
      expect(logEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { platform: 'android' } }),
      )
    })

    it('missing metadata → empty object forwarded', async () => {
      await POST(makeReq({ action: AuditAction.PWA_INSTALLED }))
      expect(logEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: {} }),
      )
    })
  })

  describe('actor_type resolution', () => {
    it('anonymous session → actor_type: anonymous', async () => {
      getSessionMock.mockResolvedValue(null)
      await POST(makeReq({ action: AuditAction.PWA_INSTALLED }))
      expect(logEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ actor_type: 'anonymous' }),
      )
    })

    it('signed-in session → actor_type: user', async () => {
      getSessionMock.mockResolvedValue({ providerUserId: 'user_abc123' })
      await POST(makeReq({ action: AuditAction.PWA_INSTALLED }))
      expect(logEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actor_type: 'user',
          clerk_user_id: 'user_abc123',
        }),
      )
    })
  })

  describe('product_id and tenant_id', () => {
    it('always stamps product_id: heirloom', async () => {
      await POST(makeReq({ action: AuditAction.PWA_SW_REGISTERED }))
      expect(logEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ product_id: 'heirloom' }),
      )
    })

    it('tenant_id forwarded from getTenantFromRequest', async () => {
      getTenantFromRequestMock.mockResolvedValue('tenant-xyz')
      await POST(makeReq({ action: AuditAction.PWA_SW_REGISTERED }))
      expect(logEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'tenant-xyz' }),
      )
    })
  })

  describe('request headers forwarded', () => {
    it('x-forwarded-for passed as ip_address', async () => {
      const req = makeReq(
        { action: AuditAction.PWA_INSTALLED },
        { 'x-forwarded-for': '1.2.3.4' },
      )
      await POST(req)
      expect(logEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ ip_address: '1.2.3.4' }),
      )
    })

    it('x-correlation-id passed as correlation_id', async () => {
      const req = makeReq(
        { action: AuditAction.PWA_INSTALLED },
        { 'x-correlation-id': 'corr-uuid-123' },
      )
      await POST(req)
      expect(logEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ correlation_id: 'corr-uuid-123' }),
      )
    })
  })

  describe('error handling', () => {
    it('logEvent throwing → still returns 200 (fire-and-forget is void)', async () => {
      // logEvent is called with void, so its rejection does NOT propagate to the handler
      logEventMock.mockRejectedValue(new Error('DB down'))
      const res = await POST(makeReq({ action: AuditAction.PWA_INSTALLED }))
      // The route catches only errors from req.json() / Promise.all — logEvent is void
      // so a rejection in logEvent is an unhandled promise (not caught by the route try/catch)
      // The route should still respond 200
      expect(res.status).toBe(200)
    })

    it('req.json() throws (malformed body) → 500', async () => {
      const req = new NextRequest('http://localhost/api/events/pwa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
      const res = await POST(req)
      expect(res.status).toBe(500)
      const json = await res.json()
      expect(json).toMatchObject({ ok: false })
    })
  })
})
