// Covers app/(platform)/layout.tsx's auth dedupe (2026-09, same pattern as
// app/admin/layout.tsx, PR #498): getAuthContext() resolved exactly once per
// render, its tenant_id handed to every tenant lookup, and the gate
// (redirects) and displayed output unchanged.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

const mockGetCurrentUserTimed = vi.fn()
const mockGetTenantName = vi.fn()
const mockGetTenantType = vi.fn()
const mockGetAuthContext = vi.fn()
const mockGetTenantBranding = vi.fn()
const mockRedirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) })

vi.mock('@mantine/core/styles.css', () => ({}))
vi.mock('@mantine/notifications/styles.css', () => ({}))
vi.mock('../(jefflougheed)/globals.css', () => ({}))
vi.mock('@/components/admin/theme/AdminThemeProvider', () => ({ AdminThemeProvider: () => null }))
vi.mock('@/components/admin/shell/UnifiedAdminShell', () => ({ UnifiedAdminShell: () => null }))
vi.mock('@/services/branding/font-registry', () => ({ ALL_FONTS: [] }))
vi.mock('@/services/auth', () => ({
  getCurrentUserTimed: (...args: unknown[]) => mockGetCurrentUserTimed(...args),
  getTenantName: (...args: unknown[]) => mockGetTenantName(...args),
  getTenantType: (...args: unknown[]) => mockGetTenantType(...args),
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
}))
vi.mock('@/services/branding/get-tenant-branding', () => ({
  getTenantBranding: (...args: unknown[]) => mockGetTenantBranding(...args),
}))
vi.mock('next/navigation', () => ({ redirect: (url: string) => mockRedirect(url) }))

import PlatformLayout from './layout'
import { UnifiedAdminShell } from '@/components/admin/shell/UnifiedAdminShell'
import { AdminThemeProvider } from '@/components/admin/theme/AdminThemeProvider'

type ShellProps = { tenantName: string; isPlatformAdmin: boolean }
type ThemeProps = { branding: unknown; tenantId: string | undefined }

// Walks the returned element tree (components are mocked, so nothing renders)
// to read the props the layout hands a given component — i.e. what's displayed.
function findProps<P>(node: ReactNode, type: unknown): P | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProps<P>(child, type)
      if (found) return found
    }
    return null
  }
  if (!isValidElement(node)) return null
  const el = node as ReactElement<P & { children?: ReactNode }>
  if (el.type === type) return el.props
  return findProps<P>(el.props.children, type)
}
const shellProps = (tree: ReactNode) => findProps<ShellProps>(tree, UnifiedAdminShell)
const themeProps = (tree: ReactNode) => findProps<ThemeProps>(tree, AdminThemeProvider)

// Lets every already-settled promise continuation run.
const flush = () => new Promise(r => setTimeout(r, 0))

const BRANDING = { font_primary: null, font_secondary: null, font_mono: null, accent: '#000' }

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetCurrentUserTimed.mockReset().mockResolvedValue({ isPlatformAdmin: true })
  mockGetTenantName.mockReset().mockResolvedValue('Second Brain Labs')
  mockGetTenantType.mockReset().mockResolvedValue('platform')
  mockGetAuthContext.mockReset().mockResolvedValue({ tenant_id: 'tenant-1' })
  mockGetTenantBranding.mockReset().mockResolvedValue(BRANDING)
  mockRedirect.mockClear()
})

describe('PlatformLayout — auth resolved once', () => {
  it('calls getAuthContext exactly once per render and hands its tenant_id to every tenant lookup', async () => {
    await PlatformLayout({ children: null })

    expect(mockGetAuthContext).toHaveBeenCalledTimes(1)
    expect(mockGetTenantName).toHaveBeenCalledTimes(1)
    expect(mockGetTenantName).toHaveBeenCalledWith('tenant-1')
    expect(mockGetTenantType).toHaveBeenCalledTimes(1)
    expect(mockGetTenantType).toHaveBeenCalledWith('tenant-1')
    expect(mockGetTenantBranding).toHaveBeenCalledTimes(1)
    expect(mockGetTenantBranding).toHaveBeenCalledWith('tenant-1', 'admin')
    expect(mockGetCurrentUserTimed).toHaveBeenCalledWith('app/(platform)/layout.tsx')
  })

  it('runs tenant name, type and branding concurrently once auth resolves', async () => {
    const pending: Array<() => void> = []
    const hold = <T,>(value: T) => new Promise<T>(r => pending.push(() => r(value)))
    mockGetTenantName.mockImplementation(() => hold('Second Brain Labs'))
    mockGetTenantType.mockImplementation(() => hold('platform'))
    mockGetTenantBranding.mockImplementation(() => hold(BRANDING))

    const render = PlatformLayout({ children: null })
    await flush()

    expect(pending).toHaveLength(3)
    pending.forEach(r => r())
    await render
    expect(mockGetAuthContext).toHaveBeenCalledTimes(1)
  })

  it('skips every tenant-scoped lookup when getAuthContext fails, and still renders the fallbacks', async () => {
    mockGetAuthContext.mockRejectedValue(new Error('no auth'))

    const tree = await PlatformLayout({ children: null })

    expect(mockGetAuthContext).toHaveBeenCalledTimes(1)
    expect(mockGetTenantName).not.toHaveBeenCalled()
    expect(mockGetTenantType).not.toHaveBeenCalled()
    expect(mockGetTenantBranding).not.toHaveBeenCalled()
    expect(shellProps(tree)).toEqual(expect.objectContaining({ tenantName: 'Natural Resource', isPlatformAdmin: false }))
    expect(themeProps(tree)).toEqual(expect.objectContaining({ branding: null, tenantId: undefined }))
  })

  it('a branding failure does not take the tenant name or type down with it', async () => {
    mockGetTenantBranding.mockRejectedValue(new Error('db down'))

    const tree = await PlatformLayout({ children: null })

    expect(shellProps(tree)).toEqual(expect.objectContaining({ tenantName: 'Second Brain Labs', isPlatformAdmin: true }))
    expect(themeProps(tree)).toEqual(expect.objectContaining({ branding: null, tenantId: 'tenant-1' }))
  })
})

describe('PlatformLayout — gate unchanged', () => {
  it('redirects signed-out users to the branded sign-in before any tenant work', async () => {
    mockGetCurrentUserTimed.mockResolvedValue(null)

    await expect(PlatformLayout({ children: null })).rejects.toThrow('REDIRECT:/secondbrainlabs/sign-in')
    expect(mockGetAuthContext).not.toHaveBeenCalled()
    expect(mockGetTenantName).not.toHaveBeenCalled()
    expect(mockGetTenantType).not.toHaveBeenCalled()
  })

  it('redirects non-platform-admins to /admin before any tenant work', async () => {
    mockGetCurrentUserTimed.mockResolvedValue({ isPlatformAdmin: false })

    await expect(PlatformLayout({ children: null })).rejects.toThrow('REDIRECT:/admin')
    expect(mockGetAuthContext).not.toHaveBeenCalled()
  })
})

describe('PlatformLayout — displayed output unchanged', () => {
  it('passes the resolved tenant name, branding and tenant id through', async () => {
    const tree = await PlatformLayout({ children: null })
    expect(shellProps(tree)).toEqual(expect.objectContaining({ tenantName: 'Second Brain Labs', isPlatformAdmin: true }))
    expect(themeProps(tree)).toEqual(expect.objectContaining({ branding: BRANDING, tenantId: 'tenant-1' }))
  })

  it('falls back to "Natural Resource" when the name lookup returns null', async () => {
    mockGetTenantName.mockResolvedValue(null)
    const tree = await PlatformLayout({ children: null })
    expect(shellProps(tree)?.tenantName).toBe('Natural Resource')
  })

  it('shows platform admin only when the active tenant is platform-type', async () => {
    mockGetTenantType.mockResolvedValue('tenant')
    expect(shellProps(await PlatformLayout({ children: null }))?.isPlatformAdmin).toBe(false)

    mockGetTenantType.mockResolvedValue(null)
    expect(shellProps(await PlatformLayout({ children: null }))?.isPlatformAdmin).toBe(false)
  })
})
