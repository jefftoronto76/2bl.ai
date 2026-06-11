// Tests for the preview/dev tenant fallback in getTenantFromRequest.
// The production guard matters most: a domain match always wins, and the
// fallback is dead when VERCEL_ENV === 'production' even if the env var is
// (mis)configured there.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const inMock = vi.fn()
vi.mock('./supabase-admin', () => ({
  getAdminClient: () => ({
    from: () => ({ select: () => ({ in: inMock }) }),
  }),
}))

import { getTenantFromRequest } from './get-tenant-from-request'

function reqWithHost(host: string | null): Request {
  // Can't use `new Request(...)` — undici treats Host as a forbidden header
  // and strips it. A minimal headers.get stub is all getTenantFromRequest reads.
  return { headers: { get: (k: string) => (k.toLowerCase() === 'host' ? host : null) } } as unknown as Request
}

const HEIRLOOM_ID = '20767f1d-1148-4e43-ab73-f6da88f0ac56'

beforeEach(() => {
  inMock.mockReset()
  delete process.env.PREVIEW_TENANT_ID
  delete process.env.VERCEL_ENV
})

afterEach(() => {
  delete process.env.PREVIEW_TENANT_ID
  delete process.env.VERCEL_ENV
})

describe('getTenantFromRequest — PREVIEW_TENANT_ID fallback', () => {
  it('unmatched preview host falls back when the var is set outside production', async () => {
    process.env.PREVIEW_TENANT_ID = HEIRLOOM_ID
    process.env.VERCEL_ENV = 'preview'
    inMock.mockResolvedValue({ data: [], error: null })
    const id = await getTenantFromRequest(reqWithHost('2blai-git-branch-team.vercel.app'))
    expect(id).toBe(HEIRLOOM_ID)
  })

  it('localhost (no resolvable host) falls back without a DB call', async () => {
    process.env.PREVIEW_TENANT_ID = HEIRLOOM_ID
    const id = await getTenantFromRequest(reqWithHost('localhost:3000'))
    expect(id).toBe(HEIRLOOM_ID)
    expect(inMock).not.toHaveBeenCalled()
  })

  it('is DEAD in production even when the var is misconfigured there', async () => {
    process.env.PREVIEW_TENANT_ID = HEIRLOOM_ID
    process.env.VERCEL_ENV = 'production'
    inMock.mockResolvedValue({ data: [], error: null })
    const id = await getTenantFromRequest(reqWithHost('unknown-host.example.com'))
    expect(id).toBeNull()
  })

  it('a real tenants.domain match always wins over the fallback', async () => {
    process.env.PREVIEW_TENANT_ID = 'fallback-id-should-not-win'
    process.env.VERCEL_ENV = 'preview'
    inMock.mockResolvedValue({ data: [{ id: 'real-tenant', domain: 'heirloom.2bl.ai' }], error: null })
    const id = await getTenantFromRequest(reqWithHost('heirloom.2bl.ai'))
    expect(id).toBe('real-tenant')
  })

  it('without the var, unmatched hosts still return null (unchanged behavior)', async () => {
    inMock.mockResolvedValue({ data: [], error: null })
    const id = await getTenantFromRequest(reqWithHost('2blai-git-branch-team.vercel.app'))
    expect(id).toBeNull()
  })
})
