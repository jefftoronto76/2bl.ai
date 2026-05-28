import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'
import { getCurrentUserId } from '@/services/auth/get-current-user-id'
import { createSession, listSessions } from '@/services/crm/sessions'

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

  const result = await createSession(tenantId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ id: result.data.id })
}
