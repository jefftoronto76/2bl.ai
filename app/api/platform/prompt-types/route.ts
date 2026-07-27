import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

// GET /api/platform/prompt-types?tenant_id=<id>
// Prompt types for a SPECIFIC tenant, for the platform "Tenant Prompts" Add-New/Edit card
// (the Type select is per-tenant). Platform-admin only. Mirrors /api/admin/prompt-types's
// broadened query (PR #221): a tenant's list is types assigned to it via
// prompt_type_tenants, merged with platform-shared types (is_platform = true) —
// two plain queries deduped by id, rather than one query mixing an embedded-relation
// filter with a base-table filter via `.or()`.

interface PromptType {
  id: string
  key: string
  name: string
  description: string | null
  sort_order: number | null
}

function sortPromptTypes(types: PromptType[]): PromptType[] {
  return [...types].sort((a, b) => {
    const aOrder = a.sort_order ?? Number.POSITIVE_INFINITY
    const bOrder = b.sort_order ?? Number.POSITIVE_INFINITY
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.name.localeCompare(b.name)
  })
}

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const tenantId = new URL(req.url).searchParams.get('tenant_id')
  if (!tenantId) return Response.json({ error: 'tenant_id is required' }, { status: 400 })

  const supabase = getAdminClient()

  const [assignedResult, platformResult] = await Promise.all([
    supabase
      .from('prompt_types')
      .select('id, key, name, description, sort_order, prompt_type_tenants!inner(tenant_id)')
      .eq('prompt_type_tenants.tenant_id', tenantId),
    supabase
      .from('prompt_types')
      .select('id, key, name, description, sort_order')
      .eq('is_platform', true),
  ])

  if (assignedResult.error) {
    console.error('[platform/prompt-types] assigned fetch failed:', assignedResult.error.message)
    return Response.json({ error: assignedResult.error.message }, { status: 500 })
  }
  if (platformResult.error) {
    console.error('[platform/prompt-types] platform fetch failed:', platformResult.error.message)
    return Response.json({ error: platformResult.error.message }, { status: 500 })
  }

  // Strip the embedded assignment rows — callers only need the type definition.
  // A type assigned to this tenant AND platform-shared appears once (deduped by id).
  const byId = new Map<string, PromptType>()
  for (const r of assignedResult.data ?? []) {
    byId.set(r.id, { id: r.id, key: r.key, name: r.name, description: r.description, sort_order: r.sort_order })
  }
  for (const r of platformResult.data ?? []) {
    byId.set(r.id, { id: r.id, key: r.key, name: r.name, description: r.description, sort_order: r.sort_order })
  }

  const promptTypes = sortPromptTypes([...byId.values()])
  console.log('[platform/prompt-types] GET', { tenant_id: tenantId, count: promptTypes.length })
  return Response.json(promptTypes)
}
