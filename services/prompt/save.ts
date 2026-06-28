// services/prompt/save.ts
//
// Manual compiled-prompt save for the prompt service (legacy save path). Archives
// the current version to compiled_prompts_history, then writes the new content +
// safety-check result with an incremented version. Moved verbatim from the
// inline app/api/admin/prompt/save route body; the route is now a thin handler.

import { getAdminClient } from '@/services/auth/supabase-admin'

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; status: number; error: string }

/**
 * Persist a manually-edited compiled prompt for a tenant. Returns the new
 * version, or an error with the HTTP status the route should surface. Behavior
 * is identical to the prior inline route logic.
 */
export async function saveCompiledPrompt(
  tenantId: string,
  prompt: string,
  checkResult: unknown,
): Promise<SaveResult> {
  const supabase = getAdminClient()
  const now = new Date().toISOString()

  console.log('[prompt/save] fetching existing compiled_prompts for tenant_id:', tenantId)
  const { data: existing } = await supabase
    .from('compiled_prompts')
    .select('id, version, content, safety_check_result')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle()

  if (existing) {
    console.log('[prompt/save] found existing version:', existing.version, 'id:', existing.id)

    // Archive current version to history before overwriting
    const { error: historyError } = await supabase
      .from('compiled_prompts_history')
      .insert({
        prompt_id: existing.id,
        tenant_id: tenantId,
        content: existing.content,
        version: existing.version,
      })

    if (historyError) {
      console.error('[prompt/save] history insert FAILED — code:', historyError.code, '| message:', historyError.message, '| details:', historyError.details, '| hint:', historyError.hint)
    } else {
      console.log('[prompt/save] history insert succeeded for version:', existing.version)
    }

    const newVersion = existing.version + 1
    const { error } = await supabase
      .from('compiled_prompts')
      .update({
        content: prompt,
        version: newVersion,
        updated_at: now,
        last_safety_check: now,
        safety_check_result: checkResult ?? null,
      })
      .eq('id', existing.id)
      .eq('tenant_id', tenantId)

    if (error) {
      console.error('[prompt/save] update error:', error)
      return { ok: false, status: 500, error: error.message }
    }
    console.log('[prompt/save] updated compiled_prompts to version:', newVersion)
    return { ok: true, version: newVersion }
  } else {
    console.log('[prompt/save] no existing row for tenant — inserting version 1')
    const { error } = await supabase
      .from('compiled_prompts')
      .insert({
        tenant_id: tenantId,
        content: prompt,
        version: 1,
        updated_at: now,
        last_safety_check: now,
        safety_check_result: checkResult ?? null,
      })

    if (error) {
      console.error('[prompt/save] insert error:', error)
      return { ok: false, status: 500, error: error.message }
    }
    return { ok: true, version: 1 }
  }
}
