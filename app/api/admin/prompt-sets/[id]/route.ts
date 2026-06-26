import { getAuthContext } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent, AuditAction } from '@/services/audit'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt-sets] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return Response.json({ error: 'Missing id' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('prompt_sets')
    .delete()
    .eq('id', id)
    .eq('tenant_id', authCtx.tenant_id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[prompt-sets] delete failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return Response.json({ error: 'Prompt set not found' }, { status: 404 })
  }

  console.log('[prompt-sets] DELETE', { id, tenant_id: authCtx.tenant_id })
  void logEvent({
    action: AuditAction.PROMPT_SET_DELETE,
    tenant_id: authCtx.tenant_id,
    actor_id: authCtx.owner_id,
    target_type: 'prompt_set',
    target_id: id,
    correlation_id: req.headers.get('x-correlation-id'),
  })

  return Response.json({ ok: true })
}
