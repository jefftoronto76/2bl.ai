import { getAuthContext } from '@/services/auth/get-auth-context'
import { deleteInvite } from '@/services/invites'
import { logEvent, AuditAction } from '@/services/audit'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function DELETE(req: Request, context: RouteContext) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[invites] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  if (!id) {
    return Response.json({ error: 'Missing id' }, { status: 400 })
  }

  const result = await deleteInvite(id, authCtx.tenant_id)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  console.log('[invites] DELETE', { id, tenant_id: authCtx.tenant_id })

  void logEvent({
    action: AuditAction.INVITE_DELETE,
    tenant_id: authCtx.tenant_id,
    actor_id: authCtx.owner_id,
    target_type: 'invite',
    target_id: id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {},
  })

  return Response.json({ success: true })
}
