// Auth Golden Rule: middleware consumes the boundary's edge-safe entry point
// (@/services/auth/middleware), never the provider directly. NOTE: this file
// sits outside next lint's default directories, so the no-restricted-imports
// rule does not police it — keep it provider-free by review.
import { createAuthMiddleware, createRouteMatcher } from '@/services/auth/middleware'
import { NextResponse } from 'next/server'

const isAdminRoute = createRouteMatcher(['/admin(.*)'])

const SBL_HOSTS = new Set(['2bl.ai', 'www.2bl.ai'])
const HEIRLOOM_HOSTS = new Set(['heirloom.2bl.ai'])
const LEGACY_HOSTS = new Set(['legacy.2bl.ai'])

export default createAuthMiddleware(async (auth, req) => {
  // ─── Correlation ID ───
  // Generated once per request at the edge; propagated on every response path so
  // API routes and audit log writes can stitch events from the same request together.
  const correlationId = crypto.randomUUID()

  // ─── Domain-based routing (runs above Clerk auth) ───
  // 2bl.ai / www.2bl.ai serve the Second Brain Labs storefront. We rewrite to the
  // /secondbrainlabs segment and tag the request with x-sbl so the root layout drops
  // the inkwell palette. Direct hits to /secondbrainlabs get the same tag.
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0]
  const { pathname } = req.nextUrl
  const isSblHost = SBL_HOSTS.has(host)
  const isHeirloomHost = HEIRLOOM_HOSTS.has(host)
  const isLegacyHost = LEGACY_HOSTS.has(host)
  const isSblPath = pathname === '/secondbrainlabs' || pathname.startsWith('/secondbrainlabs/')
  const isHeirloomPath = pathname === '/heirloom' || pathname.startsWith('/heirloom/')
  const isLegacyPath = pathname === '/legacy' || pathname.startsWith('/legacy/')

  // /platform is the 2BL platform admin. It lives at the root (not under
  // /secondbrainlabs) and uses the Mantine admin (inkwell) palette, so it must
  // skip the SBL block even on the 2bl.ai host — otherwise it would be rewritten
  // to /secondbrainlabs/platform (404) and tagged x-sbl (wrong palette).
  const isPlatformPath =
    pathname === '/platform' ||
    pathname.startsWith('/platform/') ||
    pathname.startsWith('/api/platform/')

  // /admin is the shared, host-driven admin surface. It must never be rewritten
  // under a product segment — every product host (SBL, Heirloom) passes /admin
  // through to the root /admin route, which resolves the tenant from the host.
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/')

  // API routes must never be rewritten under a product segment — they live at the
  // app root and resolve the tenant from the host header. Without this guard,
  // 2bl.ai/api/admin/appearance rewrites to /secondbrainlabs/api/admin/appearance
  // (404), causing all admin settings fetches to fail on the SBL host.
  const isApiPath = pathname === '/api' || pathname.startsWith('/api/')

  // ─── Preview tenant routing (non-production only) ───
  // Allows switching storefronts on Vercel preview hosts (*.vercel.app) via
  // ?preview=<tenant> so each product can be tested from a single preview URL
  // without needing a matching domain. The ?preview= param is preserved in the
  // rewritten URL automatically (req.nextUrl.clone() keeps all search params)
  // so it persists across server-rendered navigations.
  // Guards mirror the existing host blocks: API, admin, and platform paths pass through.
  if (process.env.VERCEL_ENV !== 'production' && !isApiPath && !isAdminPath && !isPlatformPath) {
    const previewTenant = req.nextUrl.searchParams.get('preview')

    if (previewTenant === 'heirloom') {
      const requestHeaders = new Headers(req.headers)
      requestHeaders.set('x-heirloom', '1')
      requestHeaders.set('x-correlation-id', correlationId)
      const url = req.nextUrl.clone()
      if (!isHeirloomPath) {
        url.pathname = pathname === '/' ? '/heirloom' : `/heirloom${pathname}`
      }
      const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } })
      res.cookies.set('hl-preview', 'heirloom', { path: '/', sameSite: 'lax', maxAge: 3600 })
      return res
    }

    if (previewTenant === 'legacy') {
      const requestHeaders = new Headers(req.headers)
      requestHeaders.set('x-legacy', '1')
      requestHeaders.set('x-correlation-id', correlationId)
      const url = req.nextUrl.clone()
      if (!isLegacyPath) {
        url.pathname = pathname === '/' ? '/legacy' : `/legacy${pathname}`
      }
      const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } })
      res.cookies.set('hl-preview', 'legacy', { path: '/', sameSite: 'lax', maxAge: 3600 })
      return res
    }

    if (previewTenant === 'sbl') {
      const requestHeaders = new Headers(req.headers)
      requestHeaders.set('x-sbl', '1')
      requestHeaders.set('x-correlation-id', correlationId)
      const url = req.nextUrl.clone()
      if (!isSblPath) {
        url.pathname = pathname === '/' ? '/secondbrainlabs' : `/secondbrainlabs${pathname}`
      }
      const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } })
      res.cookies.set('hl-preview', 'sbl', { path: '/', sameSite: 'lax', maxAge: 3600 })
      return res
    }

    if (previewTenant === 'jefflougheed') {
      // No rewrite or brand header — root layout's default (data-brand="jefflougheed")
      // applies when no brand header is set.
      const requestHeaders = new Headers(req.headers)
      requestHeaders.set('x-correlation-id', correlationId)
      const res = NextResponse.next({ request: { headers: requestHeaders } })
      res.cookies.set('hl-preview', 'jefflougheed', { path: '/', sameSite: 'lax', maxAge: 3600 })
      return res
    }

    if (previewTenant === 'jeff-lougheed') {
      // No rewrite or brand header — jefflougheed.ca is the fallthrough default.
      const requestHeaders = new Headers(req.headers)
      requestHeaders.set('x-correlation-id', correlationId)
      const res = NextResponse.next({ request: { headers: requestHeaders } })
      res.cookies.set('hl-preview', 'jeff-lougheed', { path: '/', sameSite: 'lax', maxAge: 3600 })
      return res
    }
    // Unknown ?preview= value — fall through to normal host-based routing.
  }

  // ─── Preview tenant header for API routes (non-production only) ───
  // Page requests with ?preview=<tenant> set the hl-preview cookie above.
  // API calls from those pages don't carry ?preview= in their URL, so we read
  // the cookie here and forward it as x-preview-tenant so that
  // getTenantFromRequest can resolve the correct tenant by slug.
  if (process.env.VERCEL_ENV !== 'production' && isApiPath) {
    const previewValue = req.cookies.get('hl-preview')?.value
    if (previewValue) {
      const requestHeaders = new Headers(req.headers)
      requestHeaders.set('x-preview-tenant', previewValue)
      requestHeaders.set('x-correlation-id', correlationId)
      return NextResponse.next({ request: { headers: requestHeaders } })
    }
  }

  if ((isSblHost || isSblPath) && !isPlatformPath && !isAdminPath && !isApiPath) {
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-sbl', '1')
    requestHeaders.set('x-correlation-id', correlationId)

    if (isSblHost && !isSblPath) {
      const url = req.nextUrl.clone()
      url.pathname = pathname === '/' ? '/secondbrainlabs' : `/secondbrainlabs${pathname}`
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
    }

    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // ─── Heirloom storefront routing ───
  // heirloom.2bl.ai serves the Heirloom product storefront. Rewrite to the
  // /heirloom segment and tag with x-heirloom so the root layout drops the
  // inkwell palette. Disjoint from the SBL host/path above, so the SBL rewrite
  // never catches Heirloom. Direct hits to /heirloom (e.g. preview URLs) get
  // the same tag without a rewrite.

  if ((isHeirloomHost || isHeirloomPath) && !isApiPath && !isAdminPath) {
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-heirloom', '1')
    requestHeaders.set('x-correlation-id', correlationId)

    if (isHeirloomHost && !isHeirloomPath) {
      const url = req.nextUrl.clone()
      url.pathname = pathname === '/' ? '/heirloom' : `/heirloom${pathname}`
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
    }

    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // ─── Legacy storefront routing ───
  // legacy.2bl.ai serves the Legacy product storefront. Rewrite to the
  // /legacy segment and tag with x-legacy so the root layout drops the
  // inkwell palette. Direct hits to /legacy (e.g. preview URLs) get
  // the same tag without a rewrite.

  if ((isLegacyHost || isLegacyPath) && !isApiPath && !isAdminPath) {
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-legacy', '1')
    requestHeaders.set('x-correlation-id', correlationId)

    if (isLegacyHost && !isLegacyPath) {
      const url = req.nextUrl.clone()
      url.pathname = pathname === '/' ? '/legacy' : `/legacy${pathname}`
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
    }

    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // ─── Auth protection (provider-backed via the boundary; unchanged) ───
  if (isAdminRoute(req)) {
    await auth.protect()
  }

  // ─── Admin palette tag ───
  // The shared /admin surface is a light UI (white Mantine surfaces). Tag it
  // with x-admin so the root layout drops the inkwell dark palette — otherwise
  // the inkwell text tokens render near-white text on the white admin surfaces.
  // Same request-header pattern as x-sbl / x-heirloom above.
  if (isAdminPath) {
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-admin', '1')
    requestHeaders.set('x-correlation-id', correlationId)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // ─── Fallthrough (jefflougheed.ca, /api/*, public routes) ───
  // No domain rewrite needed; propagate correlation ID for audit logging.
  const passthroughHeaders = new Headers(req.headers)
  passthroughHeaders.set('x-correlation-id', correlationId)
  return NextResponse.next({ request: { headers: passthroughHeaders } })
})

// The matcher MUST stay a literal array in this file — Next.js statically
// analyzes middleware config and cannot evaluate an imported constant.
export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Clerk internal routes (handshake, verification callbacks)
    '/__clerk/(.*)',
  ],
}
