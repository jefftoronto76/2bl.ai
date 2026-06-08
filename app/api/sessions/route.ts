import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'
import { getCurrentUserId } from '@/services/auth/get-current-user-id'
import { syncUser } from '@/services/auth/sync-user'
import { createSession, listSessions } from '@/services/crm/sessions'
import { logEvent, AuditAction } from '@/services/audit'

/**
 * GET /api/sessions — the signed-in user's sessions for this tenant, newest
 * first. Anonymous requests (no Clerk session) or unresolvable tenants return
 * an empty list rather than an error, so client rendering stays resilient and
 * anonymous visitors transparently get no DB recovery.
 */
export async function GET(req: Request) {
  const tenantId = await getTenantFromRequest(req)
  const userId = tenantId ? await getCurrentUserId() : null
  if (!tenantId || !userId) {
    return NextResponse.json({ sessions: [] })
  }

  const result = await listSessions(tenantId, userId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ sessions: result.data })
}

export async function POST(req: Request) {
  console.log('[sessions/route] POST called')

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    console.error('[sessions/route] tenant resolution failed for host:', req.headers.get('host'))
    return NextResponse.json(
      { error: 'Unable to resolve tenant for this domain' },
      { status: 400 },
    )
  }

  // Link the session to the signed-in user when there is one. syncUser upserts
  // the Clerk user into `users` (on clerk_id) and returns their id — no
  // tenant_users membership, since Heirloom visitors are end-customers, not
  // admins. Anonymous visitors get null and an unlinked session (unchanged).
  const userId = await syncUser()

  const result = await createSession(tenantId, userId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.SESSION_CREATE,
    tenant_id: tenantId,
    actor_id: userId,
    actor_type: userId ? 'user' : 'anonymous',
    target_type: 'session',
    target_id: result.data.id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {},
  })

  return NextResponse.json({ id: result.data.id })
}
