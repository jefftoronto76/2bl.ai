import { getAuthContext, requirePlatformAdmin } from '@/services/auth'
import { getAdminClient } from '@/services/auth/supabase-admin'

interface PromptType {
  id: string
  key: string
  name: string
  description: string | null
  sort_order: number | null
}

function sortPromptTypes(types: PromptType[]): PromptType[] {
  return [...types].sort((a, b) => {
    const aOrder = a.sort_order ?? Number.POSITIVE_INFINITY
    const bOrder = b.sort_order ?? Number.POSITIVE_INFINITY
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.name.localeCompare(b.name)
  })
}

/**
 * Slugify a free-text name into a prompt_types.key:
 * lowercase, non-alphanumerics collapsed to a single underscore,
 * leading/trailing underscores trimmed. Mirrors the sage_parameters
 * key convention.
 */
function slugifyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export async function GET() {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt-types] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()

  // A tenant's dropdown shows two things, merged: (1) types explicitly assigned to
  // this tenant via prompt_type_tenants, and (2) platform-shared types (is_platform
  // = true), visible to every tenant regardless of assignment. Two plain queries +
  // an in-process dedupe by id, rather than one query trying to OR a base-table
  // column against an embedded-relation filter — PostgREST's embedded-resource `or`
  // semantics don't reliably combine with a base-table condition like is_platform.
  const [assignedResult, platformResult, platformUser] = await Promise.all([
    supabase
      .from('prompt_types')
      .select('id, key, name, description, sort_order, prompt_type_tenants!inner(tenant_id)')
      .eq('prompt_type_tenants.tenant_id', authCtx.tenant_id),
    supabase
      .from('prompt_types')
      .select('id, key, name, description, sort_order')
      .eq('is_platform', true),
    requirePlatformAdmin(),
  ])

  if (assignedResult.error) {
    console.error('[prompt-types] assigned fetch failed:', assignedResult.error.message)
    return Response.json({ error: assignedResult.error.message }, { status: 500 })
  }
  if (platformResult.error) {
    console.error('[prompt-types] platform fetch failed:', platformResult.error.message)
    return Response.json({ error: platformResult.error.message }, { status: 500 })
  }

  // Strip the embedded assignment rows — callers only need the type definition.
  // A type assigned to this tenant AND platform-shared appears once (deduped by id).
  const byId = new Map<string, PromptType>()
  for (const r of assignedResult.data ?? []) {
    byId.set(r.id, { id: r.id, key: r.key, name: r.name, description: r.description, sort_order: r.sort_order })
  }
  for (const r of platformResult.data ?? []) {
    byId.set(r.id, { id: r.id, key: r.key, name: r.name, description: r.description, sort_order: r.sort_order })
  }

  const promptTypes = sortPromptTypes([...byId.values()])
  const canMakePlatform = platformUser !== null
  console.log('[prompt-types] GET', { tenant_id: authCtx.tenant_id, count: promptTypes.length, canMakePlatform })

  return Response.json({ types: promptTypes, canMakePlatform })
}

export async function POST(req: Request) {
  let authCtx: { owner_id: string; tenant_id: string }
  try {
    authCtx = await getAuthContext()
  } catch (err) {
    console.error('[prompt-types] auth failed:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { name?: unknown; make_platform?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return Response.json({ error: 'Missing or invalid name' }, { status: 400 })
  }

  const name = body.name.trim()
  const key = slugifyKey(name)
  if (key.length === 0) {
    return Response.json({ error: 'Name must contain at least one alphanumeric character' }, { status: 400 })
  }

  // make_platform is only ever honored for a platform admin — re-checked server-side
  // via the session, never trusted from the client-sent flag alone.
  const platformUser = await requirePlatformAdmin()
  const wantsPlatform = body.make_platform === true && platformUser !== null

  const supabase = getAdminClient()

  // A prompt type is a shared definition (prompt_types) assigned to tenants via
  // prompt_type_tenants. Find-or-create the definition by key (keys are NOT unique —
  // take the first existing row), then assign it to this tenant.
  const { data: existing, error: lookupErr } = await supabase
    .from('prompt_types')
    .select('id, key, name, description, sort_order, is_platform')
    .eq('key', key)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (lookupErr) {
    console.error('[prompt-types] lookup failed:', lookupErr.message)
    return Response.json({ error: lookupErr.message }, { status: 500 })
  }

  let promptType: PromptType
  if (existing) {
    promptType = { id: existing.id, key: existing.key, name: existing.name, description: existing.description, sort_order: existing.sort_order }
    // Promote a found-by-key type to platform-wide when requested and authorized —
    // "created/found" both go through the same is_platform gate.
    if (wantsPlatform && !existing.is_platform) {
      const { data: updated, error: updateErr } = await supabase
        .from('prompt_types')
        .update({ is_platform: true })
        .eq('id', existing.id)
        .select('id, key, name, description, sort_order')
        .single()
      if (updateErr) {
        console.error('[prompt-types] is_platform promote failed:', updateErr.message)
      } else {
        promptType = updated
      }
    }
  } else {
    const now = new Date().toISOString()
    const { data: created, error: insertErr } = await supabase
      .from('prompt_types')
      .insert({ key, name, created_at: now, updated_at: now, is_platform: wantsPlatform })
      .select('id, key, name, description, sort_order')
      .single()
    if (insertErr) {
      console.error('[prompt-types] insert failed:', insertErr.message)
      return Response.json({ error: insertErr.message }, { status: 500 })
    }
    promptType = created
  }

  // Assign the definition to this tenant. The unique constraint on
  // prompt_type_tenants (prompt_type_id, tenant_id) turns a re-assign into a 409.
  const { error: assignErr } = await supabase
    .from('prompt_type_tenants')
    .insert({ prompt_type_id: promptType.id, tenant_id: authCtx.tenant_id })

  if (assignErr) {
    // 23505 = unique_violation on (prompt_type_id, tenant_id) → already assigned here
    if (assignErr.code === '23505') {
      return Response.json({ error: 'A prompt type with that name already exists' }, { status: 409 })
    }
    // Supabase has no client-side transactions, so the create + assign are two writes.
    // A non-409 assignment failure after we just created the definition would leave an
    // orphaned prompt_types row (no tenant ever points at it). Roll it back so the two
    // writes succeed or fail together. Only when WE created it — a reused shared
    // definition belongs to other tenants and must not be deleted.
    if (!existing) {
      const { error: cleanupErr } = await supabase.from('prompt_types').delete().eq('id', promptType.id)
      if (cleanupErr) {
        console.error('[prompt-types] orphan cleanup failed:', cleanupErr.message)
      }
    }
    console.error('[prompt-types] assignment failed:', assignErr.message)
    return Response.json({ error: assignErr.message }, { status: 500 })
  }

  console.log('[prompt-types] POST', { tenant_id: authCtx.tenant_id, key: promptType.key, reused: Boolean(existing) })

  return Response.json(promptType, { status: 201 })
}
