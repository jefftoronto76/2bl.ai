import 'server-only'
import { getAdminClient } from '@/services/auth/supabase-admin'
import type { PromptSet, PromptSetStatus } from './promptSets'

/**
 * Fetch the tenant's prompt sets (the real prompt_sets table) for the Blocks
 * picker. Each set carries its prompt_type_id (UUID → prompt_types.id), which
 * the page uses to scope the blocks query (blocks.prompt_set_key is the same
 * UUID FK). Returns [] when no rows exist (picker hides) or on any Supabase
 * error (fails open).
 */
export async function getPromptSets(tenantId: string): Promise<PromptSet[]> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('prompt_sets')
    .select('id, label, version, status, prompt_type_id')
    .eq('tenant_id', tenantId)
    .order('status', { ascending: false }) // 'live' sorts before 'draft'
    .order('label', { ascending: true })

  if (error || !data) return []

  return data.map((row) => ({
    id: row.id as string,
    promptTypeId: (row.prompt_type_id as string | null) ?? null,
    label: row.label as string,
    version: (row.version as number | null) ?? 0,
    status: ((row.status as string | null) ?? 'draft') as PromptSetStatus,
  }))
}
