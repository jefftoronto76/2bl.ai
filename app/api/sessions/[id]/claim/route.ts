import { NextResponse } from 'next/server'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'
import { ensureClerkUser } from '@/services/auth/ensure-clerk-user'
import { claimSession } from '@/services/crm/sessions'

/**
 * POST /api/sessions/[id]/claim — after an inline phone/OTP sign-up, link the
 * current (anonymous) session to the now-signed-in user. The user is resolved
 * server-side from the active Clerk session via ensureClerkUser (upsert into
 * `users`, no tenant_users membership), so the client never supplies a user_id
 * (no IDOR). No Clerk session → 401; the caller treats any failure as graceful
 * (the contact is already persisted, the session stays anonymous).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const tenantId = await getTenantFromRequest(req)
  if (!tenantId) {
    return NextResponse.json({ error: 'Unable to resolve tenant for this domain' }, { status: 400 })
  }

  const userId = await ensureClerkUser()
  if (!userId) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const result = await claimSession(tenantId, id, userId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
