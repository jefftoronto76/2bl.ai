import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

// GET /api/platform/prompt-types?tenant_id=<id> — NEW
// Prompt types for a SPECIFIC tenant, for the platform "Tenant Prompts" Add-New/Edit card
// (the Type select is per-tenant). Platform-admin only. Mirrors /api/admin/prompt-types but
// takes the tenant from the query instead of the session.

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const tenantId = new URL(req.url).searchParams.get('tenant_id')
  if (!tenantId) return Response.json({ error: 'tenant_id is required' }, { status: 400 })

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('prompt_types')
    .select('id, key, name, description, sort_order')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) {
    console.error('[platform/prompt-types] fetch failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json(data ?? [])
}
