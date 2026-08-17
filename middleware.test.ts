// Preview tenant resolution on PAGE requests.
//
// The "Preview tenant header for API routes" block forwards x-preview-tenant
// only when isApiPath is true, so before this the page render itself could not
// resolve a tenant on a *.vercel.app host: those never match tenants.domain,
// so getTenantFromRequest fell through to PREVIEW_TENANT_ID and returned null
// when unset. app/heirloom/page.tsx then skipped its member lookup entirely
// and isAdmin (plus members.role) silently resolved false for everyone —
// while the API-driven parts of the very same page resolved fine.
//
// The last test here is the load-bearing one: the fix must NOT be implemented
// by widening that API block, because it ends in an early
// `return NextResponse.next(...)` that would short-circuit page requests ahead
// of auth.protect() on /admin.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockProtect = vi.fn()

vi.mock('@/services/auth/middleware', () => ({
  // Unwrap the handler so it can be invoked directly as (auth, req).
  createAuthMiddleware: (handler: unknown) => handler,
  createRouteMatcher: (patterns: string[]) => (req: NextRequest) =>
    patterns.some((p) => req.nextUrl.pathname.startsWith(p.replace('(.*)', ''))),
}))

import middleware from './middleware'

type Handler = (auth: { protect: () => void }, req: NextRequest) => Promise<Response>
const run = (req: NextRequest) => (middleware as unknown as Handler)({ protect: mockProtect }, req)

/**
 * Reads a header that middleware forwarded onto the *request* (as opposed to
 * the response). NextResponse encodes those as x-middleware-request-<name>.
 */
function forwardedHeader(res: Response, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`)
}

const PREVIEW_HOST = '2blai-git-somebranch-jefftoronto76s-projects.vercel.app'

/**
 * Cookies are set through the NextRequest cookies API rather than a `cookie`
 * request header — happy-dom's Headers implementation drops that header as a
 * forbidden header name, which would silently leave the cookie unset (and, in
 * the /admin case below, make the guard pass for the wrong reason).
 */
function pageRequest(url: string, cookies?: Record<string, string>): NextRequest {
  const req = new NextRequest(`https://${PREVIEW_HOST}${url}`, {
    headers: { host: PREVIEW_HOST },
  })
  for (const [name, value] of Object.entries(cookies ?? {})) {
    req.cookies.set(name, value)
  }
  return req
}

beforeEach(() => {
  mockProtect.mockReset()
  vi.stubEnv('VERCEL_ENV', 'preview')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('middleware — preview tenant header on page requests', () => {
  it('forwards x-preview-tenant on a ?preview=heirloom page request', async () => {
    const res = await run(pageRequest('/?preview=heirloom'))
    expect(forwardedHeader(res, 'x-preview-tenant')).toBe('heirloom')
  })

  it('still tags the brand alongside the preview tenant', async () => {
    const res = await run(pageRequest('/?preview=heirloom'))
    expect(forwardedHeader(res, 'x-heirloom')).toBe('1')
  })

  it.each([
    ['legacy', 'legacy'],
    ['sbl', 'sbl'],
    ['second-brain-labs', 'second-brain-labs'],
    ['jefflougheed', 'jefflougheed'],
    ['jeff-lougheed', 'jeff-lougheed'],
  ])('forwards x-preview-tenant for ?preview=%s', async (param, expected) => {
    const res = await run(pageRequest(`/?preview=${param}`))
    expect(forwardedHeader(res, 'x-preview-tenant')).toBe(expected)
  })

  it('forwards x-preview-tenant on a direct /heirloom page request', async () => {
    // The ?preview= param survives rewrites, so an already-rewritten path
    // still carries it — this is the shape a server-rendered navigation takes.
    const res = await run(pageRequest('/heirloom?preview=heirloom'))
    expect(forwardedHeader(res, 'x-preview-tenant')).toBe('heirloom')
  })

  it('leaves API requests on the existing cookie-driven path', async () => {
    const res = await run(pageRequest('/api/sessions', { 'hl-preview': 'heirloom' }))
    expect(forwardedHeader(res, 'x-preview-tenant')).toBe('heirloom')
  })

  it('sets no preview tenant in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const res = await run(pageRequest('/?preview=heirloom'))
    expect(forwardedHeader(res, 'x-preview-tenant')).toBeNull()
  })

  it('sets no preview tenant when no ?preview= param is present', async () => {
    const res = await run(pageRequest('/heirloom'))
    expect(forwardedHeader(res, 'x-preview-tenant')).toBeNull()
  })

  it('still runs auth.protect() on /admin carrying an hl-preview cookie', async () => {
    // The regression this guards: implementing the fix by dropping the
    // isApiPath guard on the API block would return early here, skipping
    // auth.protect() entirely and leaving /admin unauthenticated on preview.
    await run(pageRequest('/admin', { 'hl-preview': 'heirloom' }))
    expect(mockProtect).toHaveBeenCalledTimes(1)
  })
})
