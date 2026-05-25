import { getAdminClient } from '@/services/auth/supabase-admin'
import { getAuthContext } from '@/services/auth/get-auth-context'

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[blocks/save] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    type: string
    topic_id: string
    title: string
    body: string
    source_id?: string | null
    is_default?: boolean
    messages?: { role: string; content: string }[]
  }

  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { type, topic_id, title, body: blockBody, is_default, messages } = body
  let { source_id } = body

  if (!type || !topic_id || !title || !blockBody) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = getAdminClient()

  // If no source content record was provided, create one from the block body
  if (!source_id) {
    const contentPayload = {
      owner_id: authCtx.owner_id,
      tenant_id: authCtx.tenant_id,
      type: 'wizard',
      name: title || 'Untitled block',
      raw: blockBody,
    }
    console.log('[blocks/save] auto-creating content record:', contentPayload)

    const { data: content, error: contentCreateError } = await supabase
      .from('content')
      .insert(contentPayload)
      .select('id')
      .single()

    if (contentCreateError) {
      console.error('[blocks/save] content create failed:', contentCreateError.message)
      return Response.json({ error: 'Failed to create content record' }, { status: 500 })
    }

    source_id = content.id
  }

  // Insert the block
  const { data: block, error: blockError } = await supabase
    .from('blocks')
    .insert({
      type,
      topic_id,
      title,
      body: blockBody,
      source_id,
      owner_id: authCtx.owner_id,
      tenant_id: authCtx.tenant_id,
      active: true,
      is_default: is_default ?? false,
      // Stamp updated_by on create for consistency with the PATCH route
      // (Step 3 of PR 2). updated_at is auto-set by the
      // blocks_updated_at_trigger Postgres trigger.
      updated_by: authCtx.owner_id,
    })
    .select()
    .single()

  if (blockError) {
    console.error('[blocks/save] insert failed:', blockError.message)
    return Response.json({ error: blockError.message }, { status: 500 })
  }

  // Link content record back to the block
  const { error: contentError } = await supabase
    .from('content')
    .update({ block_id: block.id })
    .eq('id', source_id)

  if (contentError) {
    console.error('[blocks/save] content update failed:', contentError.message)
    // Block was saved — log but don't fail the request
  }

  // Save the composer conversation to chat_sessions
  if (messages && messages.length > 0) {
    const { error: sessionError } = await supabase
      .from('chat_sessions')
      .insert({
        tenant_id: authCtx.tenant_id,
        owner_id: authCtx.owner_id,
        messages,
        session_type: 'composer',
        session_subtype: 'block',
        block_id: block.id,
        status: 'completed',
      })

    if (sessionError) {
      console.error('[blocks/save] chat_session insert failed:', sessionError.message)
      // Block was saved — log but don't fail the request
    }
  }

  return Response.json(block)
}
