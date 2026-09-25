// Covers app/admin/layout.tsx's timing instrumentation (admin page-load
// timing, 2026-09) and its two-stage data loading (auth dedupe, 2026-09).
// Pins the wiring: one PII-free ADMIN_PAGE_LOAD_TIMING event per render — on
// the branding success path and the caught failure paths — getAuthContext()
// resolved exactly once per render, and each stage's members concurrent.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

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
import { UnifiedAdminShell } from '@/components/admin/shell/UnifiedAdminShell'

function timingEvents() {
  return mockLogEvent.mock.calls.map(c => c[0]).filter(e => e.action === 'admin.page_load_timing')
}

type ShellProps = { tenantName: string; isPlatformAdmin: boolean }

// Walks the returned element tree (components are mocked, so nothing renders)
// to read the props the layout hands UnifiedAdminShell — i.e. what's displayed.
function findShellProps(node: ReactNode): ShellProps | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findShellProps(child)
      if (found) return found
    }
    return null
  }
  if (!isValidElement(node)) return null
  const el = node as ReactElement<ShellProps & { children?: ReactNode }>
  if (el.type === UnifiedAdminShell) return el.props
  return findShellProps(el.props.children)
}

// Lets every already-settled promise continuation run.
const flush = () => new Promise(r => setTimeout(r, 0))

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

  it('still logs one event when the branding fetch fails', async () => {
    mockGetTenantBranding.mockRejectedValue(new Error('db down'))

    const tree = await AdminLayout({ children: null })

    const events = timingEvents()
    expect(events).toHaveLength(1)
    expect(events[0].metadata).toMatchObject({ status: 200 })
    expect(events[0].metadata.phases).toHaveProperty('branding')
    expect(events[0].tenant_id).toBe('tenant-1')
    // A branding failure doesn't take the tenant name down with it.
    expect(findShellProps(tree)?.tenantName).toBe('Heirloom')
  })

  it('logs with a null tenant when getAuthContext fails, and skips every tenant-scoped lookup', async () => {
    mockGetAuthContext.mockRejectedValue(new Error('no auth'))

    const tree = await AdminLayout({ children: null })

    const events = timingEvents()
    expect(events).toHaveLength(1)
    expect(events[0].tenant_id).toBeNull()
    expect(events[0].metadata.phases).toHaveProperty('authContext')
    for (const phase of ['branding', 'tenantName', 'tenantType']) {
      expect(events[0].metadata.phases).not.toHaveProperty(phase)
    }
    expect(mockGetTenantName).not.toHaveBeenCalled()
    expect(mockGetTenantType).not.toHaveBeenCalled()
    expect(mockGetTenantBranding).not.toHaveBeenCalled()
    // Same fallback the shell showed before when name resolution failed.
    expect(findShellProps(tree)).toEqual(expect.objectContaining({ tenantName: 'Natural Resource', isPlatformAdmin: false }))
  })
})

describe('AdminLayout — auth resolved once, two concurrent stages', () => {
  it('calls getAuthContext exactly once per render and hands its tenant_id to every tenant lookup', async () => {
    await AdminLayout({ children: null })

    expect(mockGetAuthContext).toHaveBeenCalledTimes(1)
    expect(mockGetTenantName).toHaveBeenCalledTimes(1)
    expect(mockGetTenantName).toHaveBeenCalledWith('tenant-1')
    expect(mockGetTenantType).toHaveBeenCalledTimes(1)
    expect(mockGetTenantType).toHaveBeenCalledWith('tenant-1')
    expect(mockGetTenantBranding).toHaveBeenCalledTimes(1)
    expect(mockGetTenantBranding).toHaveBeenCalledWith('tenant-1', 'admin')
  })

  it('stage 1 (syncUser, getCurrentUser, authContext) starts concurrently; stage 2 waits for it, then runs concurrently', async () => {
    const stage1: Array<() => void> = []
    const stage2: Array<() => void> = []
    const pending = <T,>(bucket: Array<() => void>, value: T) =>
      new Promise<T>(r => bucket.push(() => r(value)))
    mockSyncUser.mockImplementation(() => pending(stage1, 'supabase-user-1'))
    mockGetCurrentUserTimed.mockImplementation(() => pending(stage1, { isPlatformAdmin: false }))
    mockGetAuthContext.mockImplementation(() => pending(stage1, { tenant_id: 'tenant-1' }))
    mockGetTenantName.mockImplementation(() => pending(stage2, 'Heirloom'))
    mockGetTenantType.mockImplementation(() => pending(stage2, 'tenant'))
    mockGetTenantBranding.mockImplementation(() => pending(stage2, { use_db_branding: false, favicon_base_path: null }))

    const render = AdminLayout({ children: null })
    await flush()

    // All of stage 1 is in flight at once — syncUser/getCurrentUser don't wait on auth.
    expect(mockSyncUser).toHaveBeenCalledTimes(1)
    expect(mockGetCurrentUserTimed).toHaveBeenCalledTimes(1)
    expect(mockGetAuthContext).toHaveBeenCalledTimes(1)
    expect(stage1).toHaveLength(3)
    expect(stage2).toHaveLength(0)

    // Auth alone resolving doesn't start stage 2 while the rest of stage 1 is pending.
    stage1[2]()
    await flush()
    expect(stage2).toHaveLength(0)

    stage1[0]()
    stage1[1]()
    await flush()

    // All of stage 2 is in flight at once, none resolved yet.
    expect(mockGetTenantName).toHaveBeenCalledTimes(1)
    expect(mockGetTenantType).toHaveBeenCalledTimes(1)
    expect(mockGetTenantBranding).toHaveBeenCalledTimes(1)
    expect(stage2).toHaveLength(3)

    stage2.forEach(r => r())
    await render
    expect(timingEvents()).toHaveLength(1)
    expect(mockGetAuthContext).toHaveBeenCalledTimes(1)
  })
})

describe('AdminLayout — displayed output unchanged', () => {
  it('passes the resolved tenant name to the shell', async () => {
    const tree = await AdminLayout({ children: null })
    expect(findShellProps(tree)).toEqual(expect.objectContaining({ tenantName: 'Heirloom', isPlatformAdmin: false }))
  })

  it('falls back to "Natural Resource" when the name lookup returns null', async () => {
    mockGetTenantName.mockResolvedValue(null)
    const tree = await AdminLayout({ children: null })
    expect(findShellProps(tree)?.tenantName).toBe('Natural Resource')
  })

  it('shows platform admin only for a platform admin on a platform-type tenant', async () => {
    mockGetCurrentUserTimed.mockResolvedValue({ isPlatformAdmin: true })
    mockGetTenantType.mockResolvedValue('platform')
    expect(findShellProps(await AdminLayout({ children: null }))?.isPlatformAdmin).toBe(true)

    mockGetTenantType.mockResolvedValue('tenant')
    expect(findShellProps(await AdminLayout({ children: null }))?.isPlatformAdmin).toBe(false)

    mockGetCurrentUserTimed.mockResolvedValue({ isPlatformAdmin: false })
    mockGetTenantType.mockResolvedValue('platform')
    expect(findShellProps(await AdminLayout({ children: null }))?.isPlatformAdmin).toBe(false)
  })
})
