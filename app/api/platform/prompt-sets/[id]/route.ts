import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent, AuditAction } from '@/services/audit'

// DELETE /api/platform/prompt-sets/[id] — NEW
// Cross-tenant delete for Platform Settings → Tenant Prompts. Platform-admin only.
// (The tenant surface deletes via /api/admin/prompt-sets/[id], session-scoped; this is
// the platform equivalent that can remove any tenant's set. ⚠️ service-role write,
// gated only by isPlatformAdmin — confirm RLS before prod. See handover §6.)

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  const supabase = getAdminClient()
  // Delete and read back the owning tenant for the audit row (404 if it didn't exist).
  const { data, error } = await supabase.from('prompt_sets').delete().eq('id', id).select('id, tenant_id').maybeSingle()
  if (error) {
    console.error('[platform/prompt-sets] delete failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return Response.json({ error: 'Prompt set not found' }, { status: 404 })
  }

  console.log('[platform/prompt-sets] DELETE', { id, tenant_id: data.tenant_id })
  void logEvent({
    action: AuditAction.PROMPT_SET_DELETE,
    tenant_id: data.tenant_id as string,
    actor_id: null,
    actor_type: 'user',
    clerk_user_id: user.providerUserId,
    target_type: 'prompt_set',
    target_id: id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: { cross_tenant: true },
  })

  return Response.json({ ok: true })
}
