// services/auth/supabase-admin.test.ts
//
// Gate 3: getAdminClient now sets x-identity-source (and, when known,
// x-correlation-id) as request headers on the created Supabase client, so
// the Studio-deployed identity audit trigger can read them off
// current_setting('request.headers', true) and attribute the resulting
// audit_events row.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const createClientMock = vi.fn((_url: string, _key: string, _opts?: unknown) => ({}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, opts?: unknown) => createClientMock(url, key, opts),
}))

import { getAdminClient } from './supabase-admin'

beforeEach(() => {
  createClientMock.mockClear()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
})

describe('getAdminClient', () => {
  it('defaults to source "unattributed" when called with no arguments', () => {
    getAdminClient()

    const [, , opts] = createClientMock.mock.calls[0] as [string, string, { global: { headers: Record<string, string> } }]
    expect(opts.global.headers).toEqual({ 'x-identity-source': 'unattributed' })
  })

  it('sets x-identity-source to the given source', () => {
    getAdminClient('clerk_webhook')

    const [, , opts] = createClientMock.mock.calls[0] as [string, string, { global: { headers: Record<string, string> } }]
    expect(opts.global.headers['x-identity-source']).toBe('clerk_webhook')
  })

  it('also sets x-correlation-id when a correlationId is supplied', () => {
    getAdminClient('api_members_sync', { correlationId: 'corr-1' })

    const [, , opts] = createClientMock.mock.calls[0] as [string, string, { global: { headers: Record<string, string> } }]
    expect(opts.global.headers).toEqual({ 'x-identity-source': 'api_members_sync', 'x-correlation-id': 'corr-1' })
  })

  it('omits x-correlation-id when correlationId is null/undefined', () => {
    getAdminClient('sync_user', { correlationId: null })

    const [, , opts] = createClientMock.mock.calls[0] as [string, string, { global: { headers: Record<string, string> } }]
    expect(opts.global.headers).not.toHaveProperty('x-correlation-id')
  })

  it('still passes through the real URL and service-role key', () => {
    getAdminClient('sync_member')

    const [url, key] = createClientMock.mock.calls[0] as [string, string]
    expect(url).toBe('https://example.supabase.co')
    expect(key).toBe('service-role-key')
  })
})
