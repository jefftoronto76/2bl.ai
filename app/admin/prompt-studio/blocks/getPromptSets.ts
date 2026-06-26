import 'server-only'
import { getAdminClient } from '@/services/auth/supabase-admin'
import type { PromptSet, PromptSetStatus } from './promptSets'

/**
 * Fetch the tenant's prompt sets (the real prompt_sets table) for the Blocks
 * picker. The page scopes the blocks query by the active set's id
 * (blocks.prompt_set_id is a UUID FK → prompt_sets.id). Each set also carries
 * its prompt_type_id (informational; not used for the blocks filter). Returns []
 * when no rows exist (picker hides) or on any Supabase error (fails open).
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
