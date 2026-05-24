import { describe, it, expect } from 'vitest'
import { normalizeHost, resolveTenantIdFromHost } from './resolve-tenant-from-host'

const JEFF = 'e07334a0-2afd-4544-898b-edb124d2dd33'
const HEIRLOOM = '20767f1d-1148-4e43-ab73-f6da88f0ac56'

const CANDIDATES = [
  { tenant_id: JEFF, domain: 'jefflougheed.ca' },
  { tenant_id: HEIRLOOM, domain: 'heirloom.jefflougheed.ca' },
]

describe('normalizeHost', () => {
  it('lowercases and strips the port', () => {
    expect(normalizeHost('JEFFLOUGHEED.CA:443')).toBe('jefflougheed.ca')
  })

  it('strips a single leading www.', () => {
    expect(normalizeHost('www.jefflougheed.ca')).toBe('jefflougheed.ca')
  })

  it('does NOT collapse subdomains to the root', () => {
    expect(normalizeHost('heirloom.jefflougheed.ca')).toBe('heirloom.jefflougheed.ca')
  })

  it('returns null for empty/missing hosts', () => {
    expect(normalizeHost(null)).toBeNull()
    expect(normalizeHost(undefined)).toBeNull()
    expect(normalizeHost('')).toBeNull()
    expect(normalizeHost(':3000')).toBeNull()
  })
})

describe('resolveTenantIdFromHost', () => {
  it('resolves the root domain to the Jeff tenant', () => {
    expect(resolveTenantIdFromHost('jefflougheed.ca', CANDIDATES)).toBe(JEFF)
  })

  it('resolves the subdomain to the Heirloom tenant (the regression case)', () => {
    expect(resolveTenantIdFromHost('heirloom.jefflougheed.ca', CANDIDATES)).toBe(HEIRLOOM)
  })

  it('normalizes host before matching (port, case, www)', () => {
    expect(resolveTenantIdFromHost('JEFFLOUGHEED.CA:443', CANDIDATES)).toBe(JEFF)
    expect(resolveTenantIdFromHost('www.jefflougheed.ca', CANDIDATES)).toBe(JEFF)
  })

  it('never collapses a subdomain onto the root tenant', () => {
    // The whole bug: heirloom must NOT resolve to the jefflougheed.ca tenant.
    expect(resolveTenantIdFromHost('heirloom.jefflougheed.ca', CANDIDATES)).not.toBe(JEFF)
  })

  it('returns null for preview / dev / unknown hosts (caller falls back)', () => {
    expect(resolveTenantIdFromHost('abc123.vercel.app', CANDIDATES)).toBeNull()
    expect(resolveTenantIdFromHost('localhost:3000', CANDIDATES)).toBeNull()
    expect(resolveTenantIdFromHost('example.com', CANDIDATES)).toBeNull()
  })

  it('returns null for empty host or empty candidates', () => {
    expect(resolveTenantIdFromHost(null, CANDIDATES)).toBeNull()
    expect(resolveTenantIdFromHost('jefflougheed.ca', [])).toBeNull()
  })

  it('ignores candidates with a null domain', () => {
    const candidates = [{ tenant_id: 'x', domain: null }, ...CANDIDATES]
    expect(resolveTenantIdFromHost('jefflougheed.ca', candidates)).toBe(JEFF)
  })
})
