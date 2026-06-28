import { getAuthContext } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

// GET /api/admin/prompt-sets/[id]/compiled  — NEW
// Returns the authoritative compiled output for ONE of the caller's prompt sets,
// for the "view compiled prompt" modal. It reads the stored compiled row — it does
// NOT reassemble blocks here (compilation is the compile pipeline's job).
//
// Shape: { content, version, updated_at } → lib/promptSet.ts → CompiledPrompt.
// If the set has never been compiled, returns empty content + null version (the
// modal renders an empty-state placeholder).

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt-sets/compiled] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('compiled_prompts')
    .select('content, version, updated_at')
    .eq('tenant_id', authCtx.tenant_id)
    .eq('prompt_set_id', id)
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
