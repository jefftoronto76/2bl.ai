import { getAuthContext } from '@/services/auth'
import { listInvites, createInvite } from '@/services/invites'
import { logEvent, AuditAction } from '@/services/audit'

export async function GET() {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[invites] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await listInvites(authCtx.tenant_id)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  console.log('[invites] GET', { tenant_id: authCtx.tenant_id, count: result.data.length })
  return Response.json(result.data)
}

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[invites] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { email?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // empty body is fine — email is optional
  }

  const email =
    typeof body.email === 'string' && body.email.trim().length > 0
      ? body.email.trim()
      : null

  const result = await createInvite(authCtx.tenant_id, authCtx.owner_id, email)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  console.log('[invites] POST created', { id: result.data.id, email: result.data.email })

  void logEvent({
    action: AuditAction.INVITE_CREATE,
    tenant_id: authCtx.tenant_id,
    actor_id: authCtx.owner_id,
    target_type: 'invite',
    target_id: result.data.id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: { has_email: Boolean(email) },
  })

  return Response.json(result.data, { status: 201 })
}
