import { getCurrentUser } from './providers/clerk/server'
import type { AuthUser } from './types'
import { logEvent, AuditAction } from '@/services/audit'

/**
 * Instrumented drop-in for getCurrentUser() — identical return value and
 * error behavior, plus a fire-and-forget audit_events row timing the
 * underlying Clerk currentUser() call (getCurrentUser() also does one
 * Supabase lookup for isPlatformAdmin, so this times that too — it's the
 * whole cost of "resolve who's calling," not just the Clerk leg in
 * isolation). Measurement only: no caching, no retry, no fallback — nothing
 * about the call itself changes. `path` is a caller-supplied static label
 * (the route/file it's called from), never request data, so metadata stays
 * PII-free. Added to accumulate real per-call-site latency data before any
 * fix or swap is attempted — see System Docs/Known Gaps.md.
 */
export async function getCurrentUserTimed(path: string): Promise<AuthUser | null> {
  const start = Date.now()
  let outcome: 'success' | 'failure' = 'success'
  try {
    return await getCurrentUser()
  } catch (err) {
    outcome = 'failure'
    throw err
  } finally {
    void logEvent({
      action: AuditAction.AUTH_CURRENT_USER_TIMING,
      outcome,
      metadata: { path, durationMs: Date.now() - start, source: 'clerk_call' },
    })
  }
}
