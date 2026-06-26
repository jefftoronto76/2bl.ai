import { getAuthContext } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent, AuditAction } from '@/services/audit'
import { type BasePromptSet, type PromptSet, type PromptSetStatus } from '@/lib/promptSet'

const SELECT_COLUMNS =
  'id, tenant_id, label, description, status, is_composer_prompt, is_default, prompt_type_id, version, created_at, updated_at'

// GET also returns the derived compile metadata (view columns). Must be a single
// string literal (not concatenated) — the untyped Supabase client returns
// GenericStringError[] when the select arg widens to `string`.
const SELECT_COLUMNS_WITH_META =
  'id, tenant_id, label, description, status, is_composer_prompt, is_default, prompt_type_id, version, created_at, updated_at, block_count, last_compiled_at, compiled_version'

const VALID_STATUS: readonly PromptSetStatus[] = ['live', 'draft']

function isStatus(value: unknown): value is PromptSetStatus {
  return typeof value === 'string' && (VALID_STATUS as readonly string[]).includes(value)
}

export async function GET() {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt-sets] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('prompt_sets_with_compile_meta')
    .select(SELECT_COLUMNS_WITH_META)
    .eq('tenant_id', authCtx.tenant_id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[prompt-sets] fetch failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const promptSets: PromptSet[] = data ?? []
  console.log('[prompt-sets] GET', { tenant_id: authCtx.tenant_id, count: promptSets.length })

  return Response.json(promptSets)
}

export async function PATCH(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt-sets] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    id?: unknown
    label?: unknown
    description?: unknown
    status?: unknown
    prompt_type_id?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (body.id !== undefined && typeof body.id !== 'string') {
    return Response.json({ error: 'Invalid id' }, { status: 400 })
  }
  if (typeof body.label !== 'string' || body.label.trim().length === 0) {
    return Response.json({ error: 'Label is required' }, { status: 400 })
  }
  if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
    return Response.json({ error: 'Invalid description' }, { status: 400 })
  }
  if (!isStatus(body.status)) {
    return Response.json(
      { error: `Invalid status (expected one of: ${VALID_STATUS.join(', ')})` },
      { status: 400 },
    )
  }
  if (
    body.prompt_type_id !== undefined &&
    body.prompt_type_id !== null &&
    typeof body.prompt_type_id !== 'string'
  ) {
    return Response.json({ error: 'Invalid prompt_type_id' }, { status: 400 })
  }

  const id: string | undefined = typeof body.id === 'string' ? body.id : undefined
  const label = body.label.trim()
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const status: PromptSetStatus = body.status
  // A type can be assigned at creation regardless of status (kept for drafts too);
  // it stays *required* only when the set is live.
  const promptTypeId: string | null =
    typeof body.prompt_type_id === 'string' && body.prompt_type_id.length > 0
      ? body.prompt_type_id
      : null

  if (status === 'live' && !promptTypeId) {
    return Response.json({ error: 'A live set must be assigned a prompt type' }, { status: 400 })
  }

  const supabase = getAdminClient()

  // Defense-in-depth: a non-null prompt_type_id must be assigned to this tenant.
  // prompt_types.tenant_id was dropped — assignments now live in prompt_type_tenants.
  if (promptTypeId) {
    const { data: assignment, error: typeErr } = await supabase
      .from('prompt_type_tenants')
      .select('prompt_type_id')
      .eq('prompt_type_id', promptTypeId)
      .eq('tenant_id', authCtx.tenant_id)
      .maybeSingle()
    if (typeErr) {
      console.error('[prompt-sets] prompt_type lookup failed:', typeErr.message)
      return Response.json({ error: typeErr.message }, { status: 500 })
    }
    if (!assignment) {
      return Response.json({ error: 'Prompt type not found for this tenant' }, { status: 400 })
    }
  }

  // version / is_composer_prompt / is_default / timestamps are server-owned and never written here.
  if (id) {
    // Update — scoped by tenant so a foreign-tenant id never matches.
    const { data, error } = await supabase
      .from('prompt_sets')
      .update({ label, description, status, prompt_type_id: promptTypeId })
      .eq('id', id)
      .eq('tenant_id', authCtx.tenant_id)
      .select(SELECT_COLUMNS)
      .maybeSingle()

    if (error) {
      console.error('[prompt-sets] update failed:', error.message)
      return Response.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return Response.json({ error: 'Prompt set not found' }, { status: 404 })
    }

    const promptSet: BasePromptSet = data
    console.log('[prompt-sets] PATCH update', { id: promptSet.id, status: promptSet.status })
    void logEvent({
      action: AuditAction.PROMPT_SET_UPSERT,
      tenant_id: authCtx.tenant_id,
      actor_id: authCtx.owner_id,
      target_type: 'prompt_set',
      target_id: promptSet.id,
      correlation_id: req.headers.get('x-correlation-id'),
      metadata: { status: promptSet.status, has_prompt_type: Boolean(promptSet.prompt_type_id) },
    })
    return Response.json(promptSet)
  }

  // Insert — version (1), is_composer_prompt (false) and is_default (false) come from DB column defaults.
  const { data, error } = await supabase
    .from('prompt_sets')
    .insert({ tenant_id: authCtx.tenant_id, label, description, status, prompt_type_id: promptTypeId })
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    console.error('[prompt-sets] insert failed:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const promptSet: BasePromptSet = data
  console.log('[prompt-sets] PATCH insert', { id: promptSet.id, status: promptSet.status })
  void logEvent({
    action: AuditAction.PROMPT_SET_UPSERT,
    tenant_id: authCtx.tenant_id,
    actor_id: authCtx.owner_id,
    target_type: 'prompt_set',
    target_id: promptSet.id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: { status: promptSet.status, has_prompt_type: Boolean(promptSet.prompt_type_id), created: true },
  })
  return Response.json(promptSet)
}
