import 'server-only'
import { getAdminClient } from '@/services/auth/supabase-admin'
import type { PromptSet, PromptSetStatus } from './promptSets'

/**
 * Fetch the tenant's prompt sets for the Blocks picker. The page scopes the
 * blocks query by the active set's id (blocks.prompt_set_id is a UUID FK →
 * prompt_sets.id). Each set also carries its prompt_type_id (informational;
 * not used for the blocks filter). Returns [] when no rows exist (picker
 * hides) or on any Supabase error (fails open).
 *
 * Reads from prompt_sets_with_compile_meta (not the raw prompt_sets table) so
 * lastCompiledAt/compiledVersion — derived from compiled_prompts, never stored
 * on prompt_sets — come along in the same query the tenant-Settings screen
 * already uses (see app/api/admin/prompt-sets/route.ts). No new column, no
 * N+1: same view, a wider select.
 */
export async function getPromptSets(tenantId: string): Promise<PromptSet[]> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('prompt_sets_with_compile_meta')
    .select('id, label, version, status, prompt_type_id, last_compiled_at, compiled_version')
    .eq('tenant_id', tenantId)
    .order('label', { ascending: true })

  if (error || !data) return []

  // status ordering isn't lexical (a plain `.order('status')` would put 'retired'
  // ahead of 'live' — 'r' > 'l' alphabetically), so live/draft/retired priority is
  // applied here rather than in the query.
  const STATUS_RANK: Record<string, number> = { live: 0, draft: 1, retired: 2 }

  return data
    .map((row) => ({
      id: row.id as string,
      promptTypeId: (row.prompt_type_id as string | null) ?? null,
      label: row.label as string,
      version: (row.version as number | null) ?? 0,
      status: ((row.status as string | null) ?? 'draft') as PromptSetStatus,
      lastCompiledAt: (row.last_compiled_at as string | null) ?? null,
      compiledVersion: (row.compiled_version as number | null) ?? null,
    }))
    .sort((a, b) => (STATUS_RANK[a.status] ?? 1) - (STATUS_RANK[b.status] ?? 1))
}
