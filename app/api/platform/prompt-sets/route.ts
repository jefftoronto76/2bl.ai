import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

// GET /api/platform/prompt-sets  — EXTENDED (was: lightweight MasterPromptOption[])
//
// Was a thin list for the Master Prompt picker (id/label/tenant/status/version).
// Now also returns the full row + derived compile metadata so Platform Settings →
// Tenant Prompts can render the same enriched cards the tenant page shows.
//
// Reads from the `prompt_sets_with_compile_meta` VIEW (db/0002_…sql) so block_count /
// last_compiled_at / compiled_version come from ONE query (no N+1). Platform-admin only.
//
// Back-compat: the Master Prompt picker (MasterPromptPicker.tsx + the platform
// Settings page) reads camelCase `tenantId` / `tenantName` (plus label/status/version).
// We emit those aliases ADDITIVELY alongside the snake_case row so the picker keeps
// working untouched while Tenant Prompts consumes `tenant_name` / the derived fields.

interface PlatformPromptSet {
  id: string
  tenant_id: string
  tenant_name: string
  label: string
  description: string | null
  status: 'live' | 'draft'
  is_composer_prompt: boolean
  is_default: boolean
  prompt_type_id: string | null
  version: number
  created_at: string
  updated_at: string
  block_count: number
  last_compiled_at: string | null
  compiled_version: number | null
  // Additive aliases for the Master Prompt picker (camelCase back-compat):
  tenantId: string
  tenantName: string
}

// Must be a single string literal (not concatenated) — the untyped Supabase client
// returns GenericStringError[] when the select arg widens to `string`.
const SELECT_COLUMNS =
  'id, tenant_id, label, description, status, is_composer_prompt, is_default, prompt_type_id, version, created_at, updated_at, block_count, last_compiled_at, compiled_version'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getAdminClient()
  const [setsRes, tenantsRes] = await Promise.all([
    supabase.from('prompt_sets_with_compile_meta').select(SELECT_COLUMNS),
    supabase.from('tenants').select('id, name'),
  ])

  if (setsRes.error) {
    console.error('[platform/prompt-sets] fetch failed:', setsRes.error.message)
    return Response.json({ error: setsRes.error.message }, { status: 500 })
  }

  const nameById = new Map((tenantsRes.data ?? []).map((t) => [t.id as string, t.name as string]))

  const rows: PlatformPromptSet[] = (setsRes.data ?? []).map((s) => {
    const tenantId = s.tenant_id as string
    const tenantName = nameById.get(tenantId) ?? 'Unknown tenant'
    return {
      ...(s as Omit<PlatformPromptSet, 'tenant_name' | 'tenantId' | 'tenantName'>),
      tenant_name: tenantName,
      tenantId,
      tenantName,
    }
  })

  // Group-friendly order: tenant, then label.
  rows.sort((a, b) => a.tenant_name.localeCompare(b.tenant_name) || a.label.localeCompare(b.label))

  console.log('[platform/prompt-sets] GET', { count: rows.length })
  return Response.json(rows)
}
