import { getAuthContext, getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { duplicateBlock } from '@/services/prompt/blocks'
import { resolveTenantForPromptSet } from '@/services/prompt'

/**
 * POST /api/admin/blocks/duplicate
 *
 * Duplicates an existing block. Body: { source_id: string }. The data-access
 * (lookup, content + block insert, back-link) lives in
 * services/prompt/blocks.ts → duplicateBlock; this route owns auth, request
 * validation, and response mapping only.
 */
export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[blocks/duplicate] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { source_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const sourceId = body.source_id
  if (typeof sourceId !== 'string' || sourceId.trim() === '') {
    return Response.json({ error: 'source_id is required' }, { status: 400 })
  }

  // Resolve which prompt_set the SOURCE block belongs to (unscoped by
  // tenant — see resolveTenantForPromptSet). A miss just means an
  // ordinary/unknown block; duplicateBlock's own tenant-scoped lookup still
  // 404s normally in that case.
  const { data: sourceRow } = await getAdminClient()
    .from('blocks')
    .select('prompt_set_id')
    .eq('id', sourceId)
    .maybeSingle()

  const user = await getCurrentUser()
  const tenantResult = await resolveTenantForPromptSet(
    (sourceRow?.prompt_set_id as string | null) ?? null,
    authCtx,
    user?.isPlatformAdmin === true,
  )
  if (!tenantResult.ok) {
    return Response.json({ error: tenantResult.error }, { status: tenantResult.status })
  }
  const scope = { owner_id: authCtx.owner_id, tenant_id: tenantResult.tenantId }

  const result = await duplicateBlock(scope, sourceId)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json(result.data)
}
