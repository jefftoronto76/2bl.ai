import { getCurrentUser } from '@/services/auth'
import { findUserByEmail, addTenantMembership } from '@/services/platform/members'
import { logEvent, AuditAction } from '@/services/audit'
import { getTenantFromRequest } from '@/services/auth/get-tenant-from-request'

// GET /api/platform/members?email=...  — find a user by email
// POST /api/platform/members            — add a user to a tenant (role=admin)
//
// Both gates require isPlatformAdmin. Data-access and business logic live in
// services/platform/members; this route owns auth, parsing, and response mapping.

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.isPlatformAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email') ?? ''
  if (!email.trim()) {
    return Response.json({ error: 'email query param is required' }, { status: 400 })
  }

  const result = await findUserByEmail(email)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json({ user: result.data })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.isPlatformAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { userId?: unknown; tenantId?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''
  if (!userId || !tenantId) {
    return Response.json({ error: 'userId and tenantId are required' }, { status: 400 })
  }

  const result = await addTenantMembership(userId, tenantId)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  void logEvent({
    action: AuditAction.MEMBER_PROMOTE,
    tenant_id: await getTenantFromRequest(req),
    actor_type: 'user',
    clerk_user_id: user.providerUserId,
    target_type: 'user',
    target_id: userId,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: { tenantId },
  })

  return Response.json(result.data)
}
