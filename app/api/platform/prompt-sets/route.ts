import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'
import { logEvent, AuditAction } from '@/services/audit'
import { SBL_TENANT_ID } from '@/services/tenant'

// GET /api/platform/prompt-sets  — EXTENDED (was: lightweight MasterPromptOption[])
//
// Was a thin list for the Master Prompt picker (id/label/tenant/status/version).
// Now also returns the full row + derived compile metadata so Platform Settings →
// Tenant Prompts can render the same enriched cards the tenant page shows.
//
// Reads from the `prompt_sets_with_compile_meta` VIEW (db/0002_…sql) so block_count /
// last_compiled_at / compiled_version come from ONE query (no N+1). Platform-admin only.
//
// Back-compat: the Master Prompt picker (MasterPromptPicker.tsx + the platform
// Settings page) reads camelCase `tenantId` / `tenantName` (plus label/status/version).
// We emit those aliases ADDITIVELY alongside the snake_case row so the picker keeps
// working untouched while Tenant Prompts consumes `tenant_name` / the derived fields.

interface PlatformPromptSet {
  id: string
  tenant_id: string
  tenant_name: string
  label: string
  description: string | null
  status: 'live' | 'draft' | 'retired'
  is_composer_prompt: boolean
  is_default: boolean
  prompt_type_id: string | null
  version: number
  created_at: string
  updated_at: string
  block_count: number
  last_compiled_at: string | null
  compiled_version: number | null
  // Additive aliases for the Master Prompt picker (camelCase back-compat):
  tenantId: string
  tenantName: string
}

// Must be a single string literal (not concatenated) — the untyped Supabase client
// returns GenericStringError[] when the select arg widens to `string`.
const SELECT_COLUMNS =
  'id, tenant_id, label, description, status, is_composer_prompt, is_default, prompt_type_id, version, created_at, updated_at, block_count, last_compiled_at, compiled_version'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getAdminClient()
  const [setsRes, tenantsRes] = await Promise.all([
    supabase.from('prompt_sets_with_compile_meta').select(SELECT_COLUMNS),
    supabase.from('tenants').select('id, name'),
  ])

  if (setsRes.error) {
    console.error('[platform/prompt-sets] fetch failed:', setsRes.error.message)
    return Response.json({ error: setsRes.error.message }, { status: 500 })
  }

  const nameById = new Map((tenantsRes.data ?? []).map((t) => [t.id as string, t.name as string]))

  const rows: PlatformPromptSet[] = (setsRes.data ?? []).map((s) => {
    const tenantId = s.tenant_id as string
    const tenantName = nameById.get(tenantId) ?? 'Unknown tenant'
    return {
      ...(s as Omit<PlatformPromptSet, 'tenant_name' | 'tenantId' | 'tenantName'>),
      tenant_name: tenantName,
      tenantId,
      tenantName,
    }
  })

  // Group-friendly order: tenant, then label.
  rows.sort((a, b) => a.tenant_name.localeCompare(b.tenant_name) || a.label.localeCompare(b.label))

  console.log('[platform/prompt-sets] GET', { count: rows.length })
  return Response.json(rows)
}

// PATCH /api/platform/prompt-sets — cross-tenant upsert for Tenant Prompts.
// Platform-admin only. With an id → update (any tenant); without → insert (tenant_id
// required). ⚠️ CROSS-TENANT WRITE via the service-role client, gated only by
// isPlatformAdmin — confirm RLS + audit before prod (handover §6).
//
// Server-owned, NEVER written here: version / is_composer_prompt / is_default /
// timestamps / the derived compile metadata. Only label / description / status /
// prompt_type_id (and tenant_id on insert) are client-supplied.
const VALID_STATUS = ['live', 'draft', 'retired'] as const
type PatchStatus = (typeof VALID_STATUS)[number]
const isStatus = (v: unknown): v is PatchStatus => typeof v === 'string' && (VALID_STATUS as readonly string[]).includes(v)

export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isPlatformAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  let body: {
    id?: unknown
    tenant_id?: unknown
    label?: unknown
    description?: unknown
    status?: unknown
    prompt_type_id?: unknown
    is_composer_prompt?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : undefined

  // is_composer_prompt: only ever settable at creation, and only ever true —
  // there's no supported way to un-flag a composer set through this route.
  if (body.is_composer_prompt !== undefined) {
    if (id) {
      return Response.json({ error: 'is_composer_prompt cannot be changed on an existing prompt set' }, { status: 400 })
    }
    if (body.is_composer_prompt !== true) {
      return Response.json({ error: 'is_composer_prompt must be true when provided' }, { status: 400 })
    }
  }
  const isComposerPrompt = !id && body.is_composer_prompt === true

  if (typeof body.label !== 'string' || body.label.trim().length === 0) {
    return Response.json({ error: 'Label is required' }, { status: 400 })
  }
  if (!isStatus(body.status)) {
    return Response.json({ error: `Invalid status (expected one of: ${VALID_STATUS.join(', ')})` }, { status: 400 })
  }
  const label = body.label.trim()
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  // A composer set is always created as a draft — activation only ever
  // happens through Compile & Publish, never at creation.
  const status: PatchStatus = isComposerPrompt ? 'draft' : body.status
  // A type can be assigned regardless of status (kept for drafts too); required only when live.
  // Composer sets may carry a type like any other set — is_composer_prompt is
  // purely a category flag, unrelated to which prompt type a set is wired to.
  const promptTypeId: string | null =
    typeof body.prompt_type_id === 'string' && body.prompt_type_id.length > 0 ? body.prompt_type_id : null
  if (status === 'live' && !promptTypeId) {
    return Response.json({ error: 'A live set must be assigned a prompt type' }, { status: 400 })
  }

  const supabase = getAdminClient()

  // Resolve the owning tenant: existing row's tenant on update, explicit
  // tenant_id on insert — except a composer-family insert, which always
  // belongs to the platform (SBL) tenant regardless of what the client sends
  // (the create modal has no Tenant field to begin with).
  let tenantId: string
  if (id) {
    const { data: existing, error } = await supabase.from('prompt_sets').select('tenant_id').eq('id', id).maybeSingle()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    if (!existing) return Response.json({ error: 'Prompt set not found' }, { status: 404 })
    tenantId = existing.tenant_id as string
  } else if (isComposerPrompt) {
    tenantId = SBL_TENANT_ID
  } else {
    if (typeof body.tenant_id !== 'string' || !body.tenant_id) {
      return Response.json({ error: 'tenant_id is required to create a prompt set' }, { status: 400 })
    }
    tenantId = body.tenant_id
  }

  // A non-null prompt_type_id must be assigned to the owning tenant.
  // prompt_types.tenant_id was dropped — assignments live in prompt_type_tenants.
  if (promptTypeId) {
    const { data: assignment, error: typeErr } = await supabase
      .from('prompt_type_tenants')
      .select('prompt_type_id')
      .eq('prompt_type_id', promptTypeId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (typeErr) return Response.json({ error: typeErr.message }, { status: 500 })
    if (!assignment) return Response.json({ error: 'Prompt type not found for that tenant' }, { status: 400 })
  }

  // version / is_default / timestamps are server-owned — never written. is_composer_prompt
  // is likewise server-owned on UPDATE, but IS written on INSERT when the caller asked for it
  // (validated above: creation-only, and only ever true).
  const writeId = id
    ? await supabase.from('prompt_sets').update({ label, description, status, prompt_type_id: promptTypeId }).eq('id', id).select('id').maybeSingle()
    : await supabase
        .from('prompt_sets')
        .insert({
          tenant_id: tenantId,
          label,
          description,
          status,
          prompt_type_id: promptTypeId,
          ...(isComposerPrompt ? { is_composer_prompt: true } : {}),
        })
        .select('id')
        .single()

  if (writeId.error) {
    console.error('[platform/prompt-sets] upsert failed:', writeId.error.message)
    return Response.json({ error: writeId.error.message }, { status: 500 })
  }
  if (!writeId.data) {
    return Response.json({ error: 'Prompt set not found' }, { status: 404 })
  }

  // Re-read the enriched row (compile meta) + tenant name for the response.
  const savedId = (writeId.data as { id: string }).id
  const [rowRes, tenantRes] = await Promise.all([
    supabase.from('prompt_sets_with_compile_meta').select(SELECT_COLUMNS).eq('id', savedId).single(),
    supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
  ])
  if (rowRes.error) return Response.json({ error: rowRes.error.message }, { status: 500 })

  const tenantName = (tenantRes.data?.name as string) ?? 'Unknown tenant'
  const result: PlatformPromptSet = {
    ...(rowRes.data as Omit<PlatformPromptSet, 'tenant_name' | 'tenantId' | 'tenantName'>),
    tenant_name: tenantName,
    tenantId,
    tenantName,
  }

  console.log('[platform/prompt-sets] PATCH', { id: result.id, tenant_id: tenantId, created: !id })
  void logEvent({
    action: AuditAction.PROMPT_SET_UPSERT,
    tenant_id: tenantId,
    actor_id: null,
    actor_type: 'user',
    clerk_user_id: user.providerUserId,
    target_type: 'prompt_set',
    target_id: result.id,
    correlation_id: req.headers.get('x-correlation-id'),
    metadata: {
      status: result.status,
      has_prompt_type: Boolean(result.prompt_type_id),
      created: !id,
      cross_tenant: true,
      is_composer_prompt: isComposerPrompt,
    },
  })
  return Response.json(result)
}
