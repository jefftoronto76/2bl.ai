import 'server-only'
import { getAdminClient } from '@/services/auth/supabase-admin'
import type { PromptSet } from './promptSets'

/**
 * Fetch all prompt types for the tenant and derive version/status from
 * master_prompt. Returns [] when no prompt_types rows exist (picker hides).
 * Fails open — any Supabase error returns [].
 */
export async function getPromptSets(tenantId: string): Promise<PromptSet[]> {
  const supabase = getAdminClient()

  const { data: types, error: typesError } = await supabase
    .from('prompt_types')
    .select('id, key, name, sort_order')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  if (typesError || !types || types.length === 0) return []

  const { data: prompts } = await supabase
    .from('master_prompt')
    .select('prompt_type_key, version')
    .eq('tenant_id', tenantId)
    .order('version', { ascending: false })

  // Build highest-version map: key → version
  const versionByKey: Record<string, number> = {}
  for (const p of prompts ?? []) {
    if (p.prompt_type_key && !(p.prompt_type_key in versionByKey)) {
      versionByKey[p.prompt_type_key] = p.version
    }
  }

  return types.map((t) => {
    const version = versionByKey[t.key] ?? 0
    return {
      id: t.id,
      key: t.key,
      label: t.name,
      version,
      status: version > 0 ? 'Live' : 'Draft',
    }
  })
}
