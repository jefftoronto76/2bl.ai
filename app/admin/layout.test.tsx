// Covers app/admin/layout.tsx's timing instrumentation (admin page-load
// timing, 2026-09, measurement only). Pins the wiring: one PII-free
// ADMIN_PAGE_LOAD_TIMING event per render — on the branding success path and
// the caught branding-failure path — and that wrapping the Promise.all
// members in timer.time() keeps them concurrent.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSyncUser = vi.fn()
const mockGetCurrentUserTimed = vi.fn()
const mockGetTenantName = vi.fn()
const mockGetTenantType = vi.fn()
const mockGetAuthContext = vi.fn()
const mockGetTenantBranding = vi.fn()
const mockLogEvent = vi.fn()

vi.mock('@mantine/core/styles.css', () => ({}))
vi.mock('@mantine/notifications/styles.css', () => ({}))
vi.mock('../(jefflougheed)/globals.css', () => ({}))
vi.mock('@/components/admin/theme/AdminThemeProvider', () => ({ AdminThemeProvider: () => null }))
vi.mock('@/components/admin/shell/UnifiedAdminShell', () => ({ UnifiedAdminShell: () => null }))
vi.mock('@/services/auth/admin-user-context', () => ({ AdminUserProvider: () => null }))
vi.mock('@/services/branding/font-registry', () => ({ ALL_FONTS: [] }))
vi.mock('@/services/auth', () => ({
  syncUser: (...args: unknown[]) => mockSyncUser(...args),
  getCurrentUserTimed: (...args: unknown[]) => mockGetCurrentUserTimed(...args),
  getTenantName: (...args: unknown[]) => mockGetTenantName(...args),
  getTenantType: (...args: unknown[]) => mockGetTenantType(...args),
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}))
vi.mock('@/services/branding/get-tenant-branding', () => ({
  getTenantBranding: (...args: unknown[]) => mockGetTenantBranding(...args),
}))
const mockAfter = vi.fn((task: () => unknown) => { void task() })
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => mockAfter(task),
}))
vi.mock('@/services/audit/audit', () => ({ logEvent: (...args: unknown[]) => mockLogEvent(...args) }))

import AdminLayout from './layout'

function timingEvents() {
  return mockLogEvent.mock.calls.map(c => c[0]).filter(e => e.action === 'admin.page_load_timing')
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockSyncUser.mockReset().mockResolvedValue('supabase-user-1')
  mockGetCurrentUserTimed.mockReset().mockResolvedValue({ isPlatformAdmin: false })
  mockGetTenantName.mockReset().mockResolvedValue('Heirloom')
  mockGetTenantType.mockReset().mockResolvedValue('tenant')
  mockGetAuthContext.mockReset().mockResolvedValue({ tenant_id: 'tenant-1' })
  mockGetTenantBranding.mockReset().mockResolvedValue({ use_db_branding: false, favicon_base_path: null })
  mockLogEvent.mockReset()
  mockAfter.mockClear()
})

describe('AdminLayout — timing instrumentation', () => {
  it('logs one event with every phase, tenant in the column, no PII in metadata', async () => {
    await AdminLayout({ children: null })

    const events = timingEvents()
    expect(events).toHaveLength(1)
    expect(events[0].metadata).toMatchObject({ path: 'app/admin/layout.tsx', method: 'GET', status: 200 })
    expect(Object.keys(events[0].metadata.phases).sort()).toEqual(
      ['authContext', 'branding', 'getCurrentUser', 'syncUser', 'tenantName', 'tenantType'],
    )
    expect(events[0].tenant_id).toBe('tenant-1')
    const serialized = JSON.stringify(events[0].metadata)
    for (const s of ['tenant-1', 'supabase-user-1', 'Heirloom']) expect(serialized).not.toContain(s)
    expect(mockAfter).toHaveBeenCalledTimes(1)
    // getCurrentUserTimed keeps its own path argument (its separate logging is untouched).
    expect(mockGetCurrentUserTimed).toHaveBeenCalledWith('app/admin/layout.tsx')
  })

  it('still logs one event when the branding fetch fails inside the caught try block', async () => {
    mockGetTenantBranding.mockRejectedValue(new Error('db down'))

    await AdminLayout({ children: null })

    const events = timingEvents()
    expect(events).toHaveLength(1)
    expect(events[0].metadata).toMatchObject({ status: 200 })
    expect(events[0].metadata.phases).toHaveProperty('branding')
    expect(events[0].tenant_id).toBe('tenant-1')
  })

  it('logs with a null tenant when getAuthContext fails inside the caught try block', async () => {
    mockGetAuthContext.mockRejectedValue(new Error('no auth'))

    await AdminLayout({ children: null })

    const events = timingEvents()
    expect(events).toHaveLength(1)
    expect(events[0].tenant_id).toBeNull()
    expect(events[0].metadata.phases).toHaveProperty('authContext')
    expect(events[0].metadata.phases).not.toHaveProperty('branding')
  })

  it('keeps the four Promise.all members concurrent — all start before any resolves', async () => {
    const resolvers: Array<() => void> = []
    const pending = <T,>(value: T) => new Promise<T>(r => resolvers.push(() => r(value)))
    mockSyncUser.mockImplementation(() => pending('supabase-user-1'))
    mockGetCurrentUserTimed.mockImplementation(() => pending({ isPlatformAdmin: false }))
    mockGetTenantName.mockImplementation(() => pending('Heirloom'))
    mockGetTenantType.mockImplementation(() => pending('tenant'))

    const render = AdminLayout({ children: null })
    await Promise.resolve()

    expect(mockSyncUser).toHaveBeenCalledTimes(1)
    expect(mockGetCurrentUserTimed).toHaveBeenCalledTimes(1)
    expect(mockGetTenantName).toHaveBeenCalledTimes(1)
    expect(mockGetTenantType).toHaveBeenCalledTimes(1)
    expect(resolvers).toHaveLength(4)

    resolvers.forEach(r => r())
    await render
    expect(timingEvents()).toHaveLength(1)
  })
})
