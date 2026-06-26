import { getCurrentUser } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

// /api/platform/prompt-sets — cross-tenant prompt sets for Platform Settings → Tenant
// Prompts. Platform-admin only. GET lists every set (full row + derived compile metadata,
// from the prompt_sets_with_compile_meta VIEW); PATCH upserts cross-tenant.
//
// ⚠️ CROSS-TENANT WRITES: unlike /api/admin/prompt-sets (session-tenant scoped), an insert
// here carries an explicit tenant_id and an update can touch any tenant's row. Gate hard on
// isPlatformAdmin and audit. Confirm this is the intended platform capability (handover §6).
//
// Back-compat: the Master Prompt picker reads id/label/tenant_name/status/version — all still
// present, so it keeps working against the richer payload.

type PromptSetStatus = 'live' | 'draft'

interface PlatformPromptSet {
  id: string
  tenant_id: string
  tenant_name: string
  label: string
  description: string | null
  status: PromptSetStatus
  is_composer_prompt: boolean
  is_default: boolean
  prompt_type_id: string | null
  version: number
  created_at: string
  updated_at: string
  block_count: number
  last_compiled_at: string | null
  compiled_version: number | null
}

const VIEW_COLUMNS =
  'id, tenant_id, label, description, status, is_composer_prompt, is_default, prompt_type_id, version, ' +
  'created_at, updated_at, block_count, last_compiled_at, compiled_version'

const VALID_STATUS: readonly PromptSetStatus[] = ['live', 'draft']
const isStatus = (v: unknown): v is PromptSetStatus =>
  typeof v === 'string' && (VALID_STATUS as readonly string[]).includes(v)

async function requirePlatformAdmin() {
  const user = await getCurrentUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  if (!user.isPlatformAdmin) return { error: 'Forbidden', status: 403 as const }
  return { user }
}

export async function GET() {
  const gate = await requirePlatformAdmin()
  if ('error' in gate) return Response.json({ error: gate.error }, { status: gate.status })

  const supabase = getAdminClient()
  const [setsRes, tenantsRes] = await Promise.all([
    supabase.from('prompt_sets_with_compile_meta').select(VIEW_COLUMNS),
    supabase.from('tenants').select('id, name'),
  ])
  if (setsRes.error) {
    console.error('[platform/prompt-sets] fetch failed:', setsRes.error.message)
    return Response.json({ error: setsRes.error.message }, { status: 500 })
  }
  const nameById = new Map((tenantsRes.data ?? []).map((t) => [t.id as string, t.name as string]))
  const rows: PlatformPromptSet[] = (setsRes.data ?? []).map((s) => ({
    ...(s as Omit<PlatformPromptSet, 'tenant_name'>),
    tenant_name: nameById.get(s.tenant_id as string) ?? 'Unknown tenant',
  }))
  rows.sort((a, b) => a.tenant_name.localeCompare(b.tenant_name) || a.label.localeCompare(b.label))
  return Response.json(rows)
}

// PATCH — upsert. With an id → update (any tenant). Without → insert (tenant_id required).
// version / is_composer_prompt / is_default / timestamps / compile-meta are server-owned.
export async function PATCH(req: Request) {
  const gate = await requirePlatformAdmin()
  if ('error' in gate) return Response.json({ error: gate.error }, { status: gate.status })

  let body: {
    id?: unknown
    tenant_id?: unknown
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

  const id = typeof body.id === 'string' ? body.id : undefined
  if (typeof body.label !== 'string' || body.label.trim().length === 0) {
    return Response.json({ error: 'Label is required' }, { status: 400 })
  }
  if (!isStatus(body.status)) {
    return Response.json({ error: `Invalid status (expected one of: ${VALID_STATUS.join(', ')})` }, { status: 400 })
  }
  const label = body.label.trim()
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const status: PromptSetStatus = body.status
  const promptTypeId: string | null =
    typeof body.prompt_type_id === 'string' && body.prompt_type_id.length > 0 ? body.prompt_type_id : null
  if (status === 'live' && !promptTypeId) {
    return Response.json({ error: 'A live set must be assigned a prompt type' }, { status: 400 })
  }

  const supabase = getAdminClient()

  // Resolve the owning tenant: existing row's tenant on update, explicit tenant_id on insert.
  let tenantId: string
  if (id) {
    const { data: existing, error } = await supabase.from('prompt_sets').select('tenant_id').eq('id', id).maybeSingle()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    if (!existing) return Response.json({ error: 'Prompt set not found' }, { status: 404 })
    tenantId = existing.tenant_id as string
  } else {
    if (typeof body.tenant_id !== 'string' || !body.tenant_id) {
      return Response.json({ error: 'tenant_id is required to create a prompt set' }, { status: 400 })
    }
    tenantId = body.tenant_id
  }

  // A non-null prompt_type_id must belong to the owning tenant.
  if (promptTypeId) {
    const { data: typeRow, error: typeErr } = await supabase
      .from('prompt_types')
      .select('id')
      .eq('id', promptTypeId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (typeErr) return Response.json({ error: typeErr.message }, { status: 500 })
    if (!typeRow) return Response.json({ error: 'Prompt type not found for that tenant' }, { status: 400 })
  }

  const writeId = id
    ? (await supabase.from('prompt_sets').update({ label, description, status, prompt_type_id: promptTypeId }).eq('id', id).select('id').maybeSingle())
    : (await supabase.from('prompt_sets').insert({ tenant_id: tenantId, label, description, status, prompt_type_id: promptTypeId }).select('id').single())

  if (writeId.error) {
    console.error('[platform/prompt-sets] upsert failed:', writeId.error.message)
    return Response.json({ error: writeId.error.message }, { status: 500 })
  }

  // Re-read the enriched row (compile meta) + tenant name for the response.
  const savedId = (writeId.data as { id: string }).id
  const [rowRes, tenantRes] = await Promise.all([
    supabase.from('prompt_sets_with_compile_meta').select(VIEW_COLUMNS).eq('id', savedId).single(),
    supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
  ])
  if (rowRes.error) return Response.json({ error: rowRes.error.message }, { status: 500 })

  const result: PlatformPromptSet = {
    ...(rowRes.data as Omit<PlatformPromptSet, 'tenant_name'>),
    tenant_name: (tenantRes.data?.name as string) ?? 'Unknown tenant',
  }
  console.log('[platform/prompt-sets] PATCH', { id: result.id, tenant_id: tenantId, created: !id })
  return Response.json(result)
}
