import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

// Cross-tenant superset of prompt sets for the Platform Settings → Master Prompt
// picker. Platform-admin only (defense-in-depth — the (platform) layout already
// gates the page). Each option carries its tenant name for the cross-tenant list.

interface MasterPromptOption {
  id: string
  label: string
  tenantId: string
  tenantName: string
  status: 'live' | 'draft'
  version?: number
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.isPlatformAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getAdminClient()
  const [setsRes, tenantsRes] = await Promise.all([
    supabase.from('prompt_sets').select('id, label, status, version, tenant_id'),
    supabase.from('tenants').select('id, name'),
  ])

  if (setsRes.error) {
    console.error('[platform/prompt-sets] fetch failed:', setsRes.error.message)
    return Response.json({ error: setsRes.error.message }, { status: 500 })
  }

  const nameById = new Map((tenantsRes.data ?? []).map((t) => [t.id as string, t.name as string]))

  const options: MasterPromptOption[] = (setsRes.data ?? []).map((s) => ({
    id: s.id as string,
    label: s.label as string,
    tenantId: s.tenant_id as string,
    tenantName: nameById.get(s.tenant_id as string) ?? 'Unknown tenant',
    status: ((s.status as string | null) ?? 'draft') as 'live' | 'draft',
    version: (s.version as number | null) ?? undefined,
  }))

  // Group by tenant, then label, so the cross-tenant list reads predictably.
  options.sort((a, b) => a.tenantName.localeCompare(b.tenantName) || a.label.localeCompare(b.label))

  console.log('[platform/prompt-sets] GET', { count: options.length })
  return Response.json(options)
}
