import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'

interface SourceBlock {
  title: string
  type: string
  topic_id: string
  body: string
}

/**
 * POST /api/admin/blocks/duplicate
 *
 * Duplicates an existing block. Body: { source_id: string }.
 *
 * Copies title (with " (copy)" suffix), type, topic_id, body. New copy
 * lands at status='active', order=null, is_default=false. owner_id /
 * tenant_id / updated_by all come from authCtx — never from the
 * request body. Cross-tenant attempts return 404 (over 403) to avoid
 * leaking whether the ID exists in another tenant.
 *
 * A new content row is created (type='wizard') for the copy and
 * back-linked via content.block_id, mirroring the auto-create-content
 * path in POST /api/admin/blocks/save.
 *
 * Response shape matches POST /save — returns the new block row via
 * .select() so the Step 17 UI handler can push it directly into
 * local state.
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

  const supabase = getAdminClient()

  // 1. Look up the source block — tenant-scoped, exclude soft-deleted.
  console.log('[blocks/duplicate] source lookup:', { sourceId, tenant_id: authCtx.tenant_id })
  const { data: source, error: sourceError } = await supabase
    .from('blocks')
    .select('title, type, topic_id, body')
    .eq('id', sourceId)
    .eq('tenant_id', authCtx.tenant_id)
    .neq('status', 'deleted')
    .maybeSingle()

  if (sourceError) {
    console.error('[blocks/duplicate] source lookup failed:', sourceError.message)
    return Response.json({ error: sourceError.message }, { status: 500 })
  }

  if (!source) {
    // 404 over 403 — don't leak whether the ID exists in another tenant.
    console.log('[blocks/duplicate] source not found or out of tenant:', { sourceId })
    return Response.json({ error: 'Source block not found' }, { status: 404 })
  }

  const src = source as SourceBlock
  const newTitle = `${src.title} (copy)`

  // 2. Create a new content row for the copy (1-to-1 relation; can't
  //    share source.source_id because content.block_id is the
  //    back-reference and can only point at one block).
  const contentPayload = {
    owner_id: authCtx.owner_id,
    tenant_id: authCtx.tenant_id,
    type: 'wizard',
    name: newTitle,
    raw: src.body,
  }
  console.log('[blocks/duplicate] content insert dispatch:', { name: newTitle })

  const { data: content, error: contentError } = await supabase
    .from('content')
    .insert(contentPayload)
    .select('id')
    .single()

  if (contentError) {
    console.error('[blocks/duplicate] content insert failed:', contentError.message)
    return Response.json({ error: 'Failed to create content record' }, { status: 500 })
  }

  // 3. Insert the new block.
  console.log('[blocks/duplicate] block insert dispatch:', {
    sourceId,
    type: src.type,
    topic_id: src.topic_id,
    titleLength: newTitle.length,
  })
  const { data: block, error: blockError } = await supabase
    .from('blocks')
    .insert({
      type: src.type,
      topic_id: src.topic_id,
      title: newTitle,
      body: src.body,
      source_id: content.id,
      owner_id: authCtx.owner_id,
      tenant_id: authCtx.tenant_id,
      active: true,
      status: 'active',
      is_default: false,
      // Step 3/7 convention — stamp updated_by from authCtx on every
      // write. updated_at is auto-set by the blocks_updated_at_trigger
      // Postgres trigger; no client write needed.
      updated_by: authCtx.owner_id,
    })
    .select()
    .single()

  if (blockError) {
    console.error('[blocks/duplicate] block insert failed:', blockError.message)
    return Response.json({ error: blockError.message }, { status: 500 })
  }

  // 4. Back-link the content row to the new block.
  const { error: linkError } = await supabase
    .from('content')
    .update({ block_id: block.id })
    .eq('id', content.id)

  if (linkError) {
    // Block was saved — log but don't fail the request. Same posture
    // as POST /save.
    console.error('[blocks/duplicate] content back-link failed:', linkError.message)
  }

  console.log('[blocks/duplicate] success:', { newBlockId: block.id, sourceId })
  return Response.json(block)
}
