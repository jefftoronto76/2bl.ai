import { getAuthContext } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

// GET /api/admin/prompt-sets/[id]/compiled  — NEW
// Returns the authoritative compiled output for ONE of the caller's prompt sets,
// for the "view compiled prompt" modal. It reads the stored compiled row — it does
// NOT reassemble blocks here (compilation is the compile pipeline's job).
//
// Shape: { content, version, updated_at } → shared/promptSet.ts → CompiledPrompt.
// If the set has never been compiled, returns empty content + null version (the
// modal renders an empty-state placeholder).
//
// NOTE (open question, see prompt-schema-design.md): `master_prompt` is being
// migrated from one-row-per-tenant → one-row-per-prompt_set. This route assumes the
// per-set shape (`prompt_set_id`). If your data is still per-tenant, drop the
// `.eq('prompt_set_id', id)` filter and key on tenant only.

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt-sets/compiled] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('master_prompt') // a.k.a. compiled_prompts
    .select('content, version, updated_at')
    .eq('tenant_id', authCtx.tenant_id)
    .eq('prompt_set_id', params.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[prompt-sets/compiled] fetch failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    content: data?.content ?? '',
    version: data?.version ?? null,
    updated_at: data?.updated_at ?? null,
  })
}
