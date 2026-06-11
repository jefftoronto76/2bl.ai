// Clerk middleware adapter — the only place that may import Clerk's middleware
// primitives. The repo-root middleware.ts imports createAuthMiddleware /
// createRouteMatcher from @/services/auth/middleware (an edge-safe leaf that
// resolves here) and keeps its handler body and literal matcher unchanged.
//
// createAuthMiddleware is a typed passthrough: clerkMiddleware remains the
// outermost wrapper at runtime, so the Clerk handshake / dev-browser /
// verification-callback flows are untouched.

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import type { NextRequest } from 'next/server'

/**
 * The slice of the provider's middleware `auth` param the handler may use.
 * `protect()` redirects unauthenticated browser requests to sign-in (404s/401s
 * for non-navigation requests), exactly like Clerk's `auth.protect()`.
 */
export interface AuthMiddlewareAuth {
  protect: () => Promise<unknown>
}

export type AuthMiddlewareHandler = (
  auth: AuthMiddlewareAuth,
  req: NextRequest,
) => Response | Promise<Response>

export function createAuthMiddleware(handler: AuthMiddlewareHandler) {
  return clerkMiddleware(async (auth, req) => handler(auth, req))
}

// Neutral re-export — byte-identical semantics to Clerk's createRouteMatcher.
export { createRouteMatcher }
