// services/auth/middleware — the EDGE entry point of the auth boundary.
//
// Edge-safe leaf: imports ONLY the provider middleware adapter — never the
// index barrel, whose helpers pull next/headers and the service-role Supabase
// client into the import graph (incompatible with the middleware edge bundle).
//
// NOTE for the repo-root middleware.ts: `export const config = { matcher }`
// must stay a LITERAL array there — Next.js statically analyzes middleware
// config and cannot evaluate an imported constant.

export {
  createAuthMiddleware,
  createRouteMatcher,
  type AuthMiddlewareAuth,
  type AuthMiddlewareHandler,
} from './providers/clerk/middleware'
