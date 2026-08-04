import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

// DELETE /api/platform/prompt-sets/[id] — NEW
// Cross-tenant delete for Platform Settings → Tenant Prompts. Platform-admin only.
// (The tenant surface deletes via /api/admin/prompt-sets/[id], session-scoped; this is
// the platform equivalent that can remove any tenant's set. Gate + audit. See handover §6.)

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getAdminClient()
  const { error } = await supabase.from('prompt_sets').delete().eq('id', params.id)
  if (error) {
    console.error('[platform/prompt-sets] delete failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ ok: true })
}
