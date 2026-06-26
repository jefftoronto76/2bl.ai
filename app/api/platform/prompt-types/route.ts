import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

// GET /api/platform/prompt-types?tenant_id=<id> — NEW
// Prompt types for a SPECIFIC tenant, for the platform "Tenant Prompts" Add-New/Edit card
// (the Type select is per-tenant). Platform-admin only. Mirrors /api/admin/prompt-types but
// takes the tenant from the query instead of the session.
//
// prompt_types.tenant_id was dropped — a tenant's types are resolved through the
// prompt_type_tenants assignment join (inner join + filter on the assignment's tenant_id),
// exactly as the admin route does.

interface PromptType {
  id: string
  key: string
  name: string
  description: string | null
  sort_order: number | null
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const tenantId = new URL(req.url).searchParams.get('tenant_id')
  if (!tenantId) return Response.json({ error: 'tenant_id is required' }, { status: 400 })

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('prompt_types')
    .select('id, key, name, description, sort_order, prompt_type_tenants!inner(tenant_id)')
    .eq('prompt_type_tenants.tenant_id', tenantId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (error) {
    console.error('[platform/prompt-types] fetch failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Strip the embedded assignment rows — callers only need the type definition.
  const promptTypes: PromptType[] = (data ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    sort_order: r.sort_order,
  }))
  console.log('[platform/prompt-types] GET', { tenant_id: tenantId, count: promptTypes.length })
  return Response.json(promptTypes)
}
