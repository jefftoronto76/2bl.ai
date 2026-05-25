// services/prompt/blocks.ts
//
// Block data-access for the prompt service. All Supabase reads/writes against
// the `blocks` table (and the `content` / `chat_sessions` rows that the
// create/duplicate flows touch) live here; the app/api/admin/blocks/* route
// handlers are thin consumers that own auth, request validation, and HTTP
// response mapping only. Behavior is identical to the prior inline route logic
// — same queries, same status codes, same log strings.

import { getAdminClient } from '@/services/auth/supabase-admin'

export interface AuthScope {
  owner_id: string
  tenant_id: string
}

// Success carries the row(s) to return; failure carries the HTTP status and
// message the route should surface (preserving the routes' exact responses).
export type BlocksResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

export interface BlockUpdate {
  status?: 'active' | 'disabled' | 'deleted'
  body?: string
  active?: boolean
  order?: number
}

export interface CreateBlockInput {
  type: string
  topic_id: string
  title: string
  body: string
  source_id?: string | null
  is_default?: boolean
  messages?: { role: string; content: string }[]
}

interface SourceBlock {
  title: string
  type: string
  topic_id: string
  body: string
}

/** GET /api/admin/blocks — active blocks for the tenant, ordered type→title. */
export async function listActiveBlocks(tenantId: string): Promise<BlocksResult<unknown>> {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('blocks')
    .select('id, title, type, body, is_default')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('type')
    .order('title')

  if (error) {
    console.error('[blocks] fetch failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data }
}

/** PATCH /api/admin/blocks/[id] — apply validated updates to one block. */
export async function updateBlock(
  scope: AuthScope,
  id: string,
  updates: BlockUpdate,
): Promise<BlocksResult<unknown>> {
  // Stamp updated_by on every real write. updated_at is auto-set by
  // the blocks_updated_at_trigger Postgres trigger — no client write.
  const payload: BlockUpdate & { updated_by?: string } = { ...updates }
  payload.updated_by = scope.owner_id

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('blocks')
    .update(payload)
    .eq('id', id)
    .eq('tenant_id', scope.tenant_id)
    .select('id, title, type, body, status, is_default, created_at')
    .single()

  if (error) {
    console.error('[blocks/patch] update failed:', error.message)
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data }
}

/**
 * POST /api/admin/blocks/save — create a block from the Composer draft.
 * Auto-creates a content row when no source_id is given, inserts the block,
 * back-links the content row, and persists the composer conversation to
 * chat_sessions. The back-link and chat_session writes log-but-don't-fail.
 */
export async function createBlock(
  scope: AuthScope,
  input: CreateBlockInput,
): Promise<BlocksResult<unknown>> {
  const { type, topic_id, title, body: blockBody, is_default, messages } = input
  let source_id = input.source_id

  const supabase = getAdminClient()

  // If no source content record was provided, create one from the block body
  if (!source_id) {
    const contentPayload = {
      owner_id: scope.owner_id,
      tenant_id: scope.tenant_id,
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
      return { ok: false, status: 500, error: 'Failed to create content record' }
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
      owner_id: scope.owner_id,
      tenant_id: scope.tenant_id,
      active: true,
      is_default: is_default ?? false,
      // Stamp updated_by on create for consistency with the PATCH route
      // (Step 3 of PR 2). updated_at is auto-set by the
      // blocks_updated_at_trigger Postgres trigger.
      updated_by: scope.owner_id,
    })
    .select()
    .single()

  if (blockError) {
    console.error('[blocks/save] insert failed:', blockError.message)
    return { ok: false, status: 500, error: blockError.message }
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
        tenant_id: scope.tenant_id,
        owner_id: scope.owner_id,
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

  return { ok: true, data: block }
}

/**
 * POST /api/admin/blocks/duplicate — duplicate an existing block.
 *
 * Copies title (with " (copy)" suffix), type, topic_id, body. New copy lands
 * at status='active', order=null, is_default=false. owner_id / tenant_id /
 * updated_by all come from the auth scope — never from the request body.
 * Cross-tenant attempts return 404 (over 403) to avoid leaking whether the ID
 * exists in another tenant. A new content row is created (type='wizard') and
 * back-linked, mirroring the auto-create-content path in createBlock.
 */
export async function duplicateBlock(
  scope: AuthScope,
  sourceId: string,
): Promise<BlocksResult<unknown>> {
  const supabase = getAdminClient()

  // 1. Look up the source block — tenant-scoped, exclude soft-deleted.
  console.log('[blocks/duplicate] source lookup:', { sourceId, tenant_id: scope.tenant_id })
  const { data: source, error: sourceError } = await supabase
    .from('blocks')
    .select('title, type, topic_id, body')
    .eq('id', sourceId)
    .eq('tenant_id', scope.tenant_id)
    .neq('status', 'deleted')
    .maybeSingle()

  if (sourceError) {
    console.error('[blocks/duplicate] source lookup failed:', sourceError.message)
    return { ok: false, status: 500, error: sourceError.message }
  }

  if (!source) {
    // 404 over 403 — don't leak whether the ID exists in another tenant.
    console.log('[blocks/duplicate] source not found or out of tenant:', { sourceId })
    return { ok: false, status: 404, error: 'Source block not found' }
  }

  const src = source as SourceBlock
  const newTitle = `${src.title} (copy)`

  // 2. Create a new content row for the copy (1-to-1 relation; can't
  //    share source.source_id because content.block_id is the
  //    back-reference and can only point at one block).
  const contentPayload = {
    owner_id: scope.owner_id,
    tenant_id: scope.tenant_id,
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
    return { ok: false, status: 500, error: 'Failed to create content record' }
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
      owner_id: scope.owner_id,
      tenant_id: scope.tenant_id,
      active: true,
      status: 'active',
      is_default: false,
      // Step 3/7 convention — stamp updated_by from the auth scope on every
      // write. updated_at is auto-set by the blocks_updated_at_trigger
      // Postgres trigger; no client write needed.
      updated_by: scope.owner_id,
    })
    .select()
    .single()

  if (blockError) {
    console.error('[blocks/duplicate] block insert failed:', blockError.message)
    return { ok: false, status: 500, error: blockError.message }
  }

  // 4. Back-link the content row to the new block.
  const { error: linkError } = await supabase
    .from('content')
    .update({ block_id: block.id })
    .eq('id', content.id)

  if (linkError) {
    // Block was saved — log but don't fail the request. Same posture
    // as createBlock.
    console.error('[blocks/duplicate] content back-link failed:', linkError.message)
  }

  console.log('[blocks/duplicate] success:', { newBlockId: block.id, sourceId })
  return { ok: true, data: block }
}
