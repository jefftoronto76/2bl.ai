import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isAdminRoute = createRouteMatcher(['/admin(.*)'])

const SBL_HOSTS = new Set(['2bl.ai', 'www.2bl.ai'])

export default clerkMiddleware(async (auth, req) => {
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

  if ((isSblHost || isSblPath) && !isPlatformPath) {
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-sbl', '1')

    if (isSblHost && !isSblPath) {
      const url = req.nextUrl.clone()
      url.pathname = pathname === '/' ? '/secondbrainlabs' : `/secondbrainlabs${pathname}`
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
    }

    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // ─── Clerk auth (unchanged) ───
  if (isAdminRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
