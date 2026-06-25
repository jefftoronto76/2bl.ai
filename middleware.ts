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
  const isSblPath = pathname === '/secondbrainlabs' || pathname.startsWith('/secondbrainlabs/')

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
  const isHeirloomHost = HEIRLOOM_HOSTS.has(host)
  const isHeirloomPath = pathname === '/heirloom' || pathname.startsWith('/heirloom/')

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
  const isLegacyHost = LEGACY_HOSTS.has(host)
  const isLegacyPath = pathname === '/legacy' || pathname.startsWith('/legacy/')

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
