// Covers getTenantName / getTenantType's optional tenantId parameter
// (admin layout auth dedupe, 2026-09). With a tenantId the caller has already
// resolved auth, so the helper must NOT run getAuthContext() again — that
// duplicate chain is the latency this change removes. Without one, the
// helper self-resolves exactly as before (app/(platform)/layout.tsx relies on
// this). Both keep the never-throws / null-on-failure contract.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getAuthContextMock, maybeSingleMock, fromMock, selectMock, eqMock } = vi.hoisted(() => {
  const maybeSingleMock = vi.fn()
  const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
  const selectMock = vi.fn(() => ({ eq: eqMock }))
  const fromMock = vi.fn(() => ({ select: selectMock }))
  return { getAuthContextMock: vi.fn(), maybeSingleMock, fromMock, selectMock, eqMock }
})

vi.mock('./get-auth-context', () => ({ getAuthContext: getAuthContextMock }))
vi.mock('./supabase-admin', () => ({ getAdminClient: () => ({ from: fromMock }) }))

import { getTenantName } from './get-tenant-name'
import { getTenantType } from './get-tenant-type'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getAuthContextMock.mockReset().mockResolvedValue({ owner_id: 'user-1', tenant_id: 'ctx-tenant' })
  maybeSingleMock.mockReset()
  fromMock.mockClear()
  selectMock.mockClear()
  eqMock.mockClear()
})

const cases = [
  { label: 'getTenantName', fn: getTenantName, column: 'name', value: 'Heirloom' },
  { label: 'getTenantType', fn: getTenantType, column: 'type', value: 'platform' },
] as const

describe.each(cases)('$label', ({ fn, column, value }) => {
  it('skips getAuthContext and queries the given tenantId when one is passed', async () => {
    maybeSingleMock.mockResolvedValue({ data: { [column]: value }, error: null })

    await expect(fn('given-tenant')).resolves.toBe(value)

    expect(getAuthContextMock).not.toHaveBeenCalled()
    expect(fromMock).toHaveBeenCalledWith('tenants')
    expect(selectMock).toHaveBeenCalledWith(column)
    expect(eqMock).toHaveBeenCalledWith('id', 'given-tenant')
  })

  it('self-resolves via getAuthContext exactly once when no tenantId is passed', async () => {
    maybeSingleMock.mockResolvedValue({ data: { [column]: value }, error: null })

    await expect(fn()).resolves.toBe(value)

    expect(getAuthContextMock).toHaveBeenCalledTimes(1)
    expect(eqMock).toHaveBeenCalledWith('id', 'ctx-tenant')
  })

  it('returns null when the tenants lookup errors', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'db down' } })
    await expect(fn('given-tenant')).resolves.toBeNull()
  })

  it('returns null when the tenant row has no value', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null })
    await expect(fn('given-tenant')).resolves.toBeNull()
  })

  it('returns null (never throws) when self-resolution fails', async () => {
    getAuthContextMock.mockRejectedValue(new Error('Unauthorized'))
    await expect(fn()).resolves.toBeNull()
    expect(fromMock).not.toHaveBeenCalled()
  })
})
