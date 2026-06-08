import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'
import { logEvent, AuditAction } from '@/services/audit'

interface RouteContext {
  params: Promise<{ key: string }>
}

export async function DELETE(req: Request, context: RouteContext) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[sage-parameters] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { key: rawKey } = await context.params
  const key = decodeURIComponent(rawKey)
  if (!key) {
    return Response.json({ error: 'Missing key' }, { status: 400 })
  }

  const supabase = getAdminClient()

  const { error } = await supabase
    .from('sage_parameters')
    .delete()
    .eq('tenant_id', authCtx.tenant_id)
    .eq('key', key)

  if (error) {
    console.error('[sage-parameters] delete failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  console.log('[sage-parameters] DELETE', { tenant_id: authCtx.tenant_id, key })

  void logEvent({
    action: AuditAction.SAGE_PARAMETER_DELETE,
    tenant_id: authCtx.tenant_id,
    actor_id: authCtx.owner_id,
    target_type: 'sage_parameter',
    target_id: key,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {},
  })

  return Response.json({ success: true })
}
